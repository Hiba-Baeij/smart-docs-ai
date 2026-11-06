import './support/chunking-small-env';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { ApiError, DocumentSummary } from '@smartdocs/contracts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { hashPassword } from './../src/auth/password';
import {
  CHUNK_DOCUMENT,
  ChunkDocument,
} from './../src/chunking/chunk-document.token';
import { chunkDocument } from './../src/chunking/chunker';
import { PrismaService } from './../src/prisma/prisma.service';
import { resetDatabase } from './support/test-database';

const bodyOf = (response: { body: unknown }) => response.body as ApiError;
const summaryOf = (response: { body: unknown }) =>
  response.body as DocumentSummary;
const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name));

/**
 * What the upload writes to DocumentChunk, and the rule that ties it to the status: chunks exist
 * exactly when the document is COMPLETED (ADR-006). Chunks here are about ten words, from
 * support/chunking-small-env.ts.
 */
describe('chunks written by the upload (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cookie: string;
  let chunker: ChunkDocument;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CHUNK_DOCUMENT)
      .useValue((...args: Parameters<ChunkDocument>) => chunker(...args))
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    chunker = chunkDocument;
    await resetDatabase(prisma);
    const user = await prisma.user.create({
      data: {
        name: 'Sara Ahmed',
        email: 'sara@example.com',
        passwordHash: await hashPassword('correct horse battery'),
      },
    });
    cookie = `sid=${await app.get(JwtService).signAsync({ sub: user.id })}`;
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS fail_completion ON "Document"',
    );
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_completion()');
  });

  afterAll(async () => {
    await app.close();
  });

  const upload = (content: Buffer, filename: string) =>
    request(app.getHttpServer())
      .post('/api/documents/upload')
      .set('Cookie', cookie)
      .attach('file', content, filename);

  const chunksOf = (documentId: string) =>
    prisma.documentChunk.findMany({
      where: { documentId },
      orderBy: { chunkIndex: 'asc' },
    });

  describe('a COMPLETED document has its chunks', () => {
    it('a PDF: one chunk per page here, numbered from 0, each citing its page', async () => {
      const response = await upload(
        fixture('text-3-pages.pdf'),
        'terms.pdf',
      ).expect(201);

      const chunks = await chunksOf(summaryOf(response).id);
      expect(summaryOf(response).chunkCount).toBe(3);
      expect(chunks.map((c) => c.chunkIndex)).toEqual([0, 1, 2]);
      expect(chunks.map((c) => c.pageNumber)).toEqual([1, 2, 3]);
      expect(chunks.map((c) => c.sheetName)).toEqual([null, null, null]);
      expect(chunks[0].content).toBe('Page one covers the refund policy.');
      expect(chunks[1].content).toBe(
        'refund policy.\n\nPage two covers the shipping times.',
      );
    });

    it('a workbook: chunks belong to one sheet each and start with its name', async () => {
      const response = await upload(
        fixture('budget.xlsx'),
        'budget.xlsx',
      ).expect(201);

      const chunks = await chunksOf(summaryOf(response).id);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(new Set(chunks.map((c) => c.sheetName))).toEqual(
        new Set(['Q3 Budget', 'Deadlines']),
      );
      for (const chunk of chunks) {
        expect(chunk.content.startsWith(`Sheet: ${chunk.sheetName}\n`)).toBe(
          true,
        );
        expect(chunk.pageNumber).toBeNull();
      }
    });

    it('a Word document: a chunk after a heading carries the heading path', async () => {
      const response = await upload(
        fixture('headings.docx'),
        'terms.docx',
      ).expect(201);

      const chunks = await chunksOf(summaryOf(response).id);
      expect(
        chunks.some((c) =>
          c.content.startsWith('Terms of Service > Payment terms — '),
        ),
      ).toBe(true);
    });

    it('reports a chunkCount equal to the rows stored', async () => {
      const response = await upload(
        fixture('budget.xlsx'),
        'budget.xlsx',
      ).expect(201);

      expect(summaryOf(response).chunkCount).toBe(
        await prisma.documentChunk.count({
          where: { documentId: summaryOf(response).id },
        }),
      );
    });
  });

  describe('a failed upload leaves no chunks', () => {
    it('whatever the reason, and the invariant holds over every document', async () => {
      await upload(fixture('text-3-pages.pdf'), 'ok.pdf').expect(201);
      await upload(fixture('scanned.pdf'), 'scan.pdf').expect(422);
      await upload(
        Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(200, 7)]),
        'broken.pdf',
      ).expect(422);
      chunker = () => [];
      await upload(fixture('text-3-pages.pdf'), 'nochunks.pdf').expect(422);

      const documents = await prisma.document.findMany({
        include: { _count: { select: { chunks: true } } },
      });

      expect(documents).toHaveLength(4);
      for (const document of documents) {
        // COMPLETED exactly when there are chunks.
        expect(document.status === 'COMPLETED').toBe(
          document._count.chunks > 0,
        );
      }
    });
  });

  describe('the chunks and COMPLETED are one transaction', () => {
    it('a chunker that numbers wrongly is stopped by the unique constraint: 500, FAILED/INTERNAL, no chunks, no text', async () => {
      chunker = () => [
        { chunkIndex: 0, content: 'first', pageNumber: null, sheetName: null },
        { chunkIndex: 0, content: 'second', pageNumber: null, sheetName: null },
      ];

      const response = await upload(
        fixture('text-3-pages.pdf'),
        'buggy.pdf',
      ).expect(500);

      expect(bodyOf(response).code).toBe('INTERNAL');
      const [row] = await prisma.document.findMany();
      expect(row).toMatchObject({
        status: 'FAILED',
        errorCode: 'INTERNAL',
        extractedText: '',
      });
      expect(await prisma.documentChunk.count()).toBe(0);
    });

    it('when COMPLETED cannot be written after the chunks were, the chunks are rolled back too', async () => {
      // A trigger makes the final UPDATE fail AFTER the chunk insert succeeded, which is the
      // case a missing transaction would get wrong: chunks present, document not COMPLETED.
      await prisma.$executeRawUnsafe(`
        CREATE FUNCTION fail_completion() RETURNS trigger AS $$
        BEGIN
          IF NEW.status = 'COMPLETED' THEN
            RAISE EXCEPTION 'completion refused for the test';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql`);
      await prisma.$executeRawUnsafe(
        'CREATE TRIGGER fail_completion BEFORE UPDATE ON "Document" FOR EACH ROW EXECUTE FUNCTION fail_completion()',
      );

      const response = await upload(
        fixture('text-3-pages.pdf'),
        'rolled-back.pdf',
      ).expect(500);

      expect(bodyOf(response).code).toBe('INTERNAL');
      expect(await prisma.documentChunk.count()).toBe(0);
      expect(await prisma.document.findMany()).toMatchObject([
        { status: 'FAILED', errorCode: 'INTERNAL', extractedText: '' },
      ]);
    });
  });
});
