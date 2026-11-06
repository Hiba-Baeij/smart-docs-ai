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
import { PrismaService } from './../src/prisma/prisma.service';
import { resetDatabase } from './support/test-database';

const bodyOf = (response: { body: unknown }) => response.body as ApiError;
const summaryOf = (response: { body: unknown }) =>
  response.body as DocumentSummary;
const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name));

/** The real application, the real extractors and the real database; only the clock is not faked. */
describe('POST /api/documents/upload, processing real files (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cookie: string;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    const user = await prisma.user.create({
      data: {
        name: 'Sara Ahmed',
        email: 'sara@example.com',
        passwordHash: await hashPassword('correct horse battery'),
      },
    });
    userId = user.id;
    cookie = `sid=${await app.get(JwtService).signAsync({ sub: userId })}`;
  });

  afterAll(async () => {
    await app.close();
  });

  const upload = (content: Buffer, filename: string, contentType?: string) =>
    request(app.getHttpServer())
      .post('/api/documents/upload')
      .set('Cookie', cookie)
      .attach('file', content, { filename, contentType });

  /** Every failed upload must leave zero chunks (ADR-006). */
  const chunkCount = () => prisma.documentChunk.count();

  describe('a genuine file of each type is COMPLETED with its text stored', () => {
    it('pdf', async () => {
      const response = await upload(
        fixture('text-3-pages.pdf'),
        'terms.pdf',
      ).expect(201);

      expect(summaryOf(response)).toMatchObject({
        originalName: 'terms.pdf',
        fileType: 'pdf',
        status: 'COMPLETED',
        errorCode: null,
        chunkCount: 1,
      });
      const row = await prisma.document.findUniqueOrThrow({
        where: { id: summaryOf(response).id },
      });
      expect(row.uploadedBy).toBe(userId);
      expect(row.extractedText).toBe(
        [
          'Page one covers the refund policy.',
          'Page two covers the shipping times.',
          'Page three covers the warranty terms.\nPage three also has a second line.',
        ].join('\n\n'),
      );
    });

    it('docx', async () => {
      const response = await upload(
        fixture('headings.docx'),
        'terms.docx',
      ).expect(201);

      const row = await prisma.document.findUniqueOrThrow({
        where: { id: summaryOf(response).id },
      });
      expect(summaryOf(response)).toMatchObject({
        fileType: 'docx',
        status: 'COMPLETED',
      });
      expect(row.extractedText.startsWith('# Terms of Service\n\n')).toBe(true);
    });

    it('xlsx', async () => {
      const response = await upload(
        fixture('budget.xlsx'),
        'budget.xlsx',
      ).expect(201);

      const row = await prisma.document.findUniqueOrThrow({
        where: { id: summaryOf(response).id },
      });
      expect(summaryOf(response)).toMatchObject({
        fileType: 'xlsx',
        status: 'COMPLETED',
      });
      expect(row.extractedText).toContain(
        'Sheet: Q3 Budget\nCategory: Travel | Planned: 12000',
      );
    });
  });

  describe('a file that cannot be turned into text is FAILED with its code and no chunks', () => {
    it('a scanned PDF: 422 EMPTY_EXTRACTION, and the message names scanned PDFs', async () => {
      const response = await upload(fixture('scanned.pdf'), 'scan.pdf').expect(
        422,
      );

      expect(bodyOf(response).code).toBe('EMPTY_EXTRACTION');
      expect(bodyOf(response).message).toMatch(/scanned PDF/);
      const [row] = await prisma.document.findMany();
      expect(row).toMatchObject({
        status: 'FAILED',
        errorCode: 'EMPTY_EXTRACTION',
        extractedText: '',
        fileType: 'pdf',
      });
      expect(await chunkCount()).toBe(0);
    });

    it('a PDF with a valid header but a broken body: 422 EXTRACTION_FAILED, without the parser message', async () => {
      const broken = Buffer.concat([
        Buffer.from('%PDF-1.4\n'),
        Buffer.alloc(200, 7),
      ]);

      const response = await upload(broken, 'broken.pdf').expect(422);

      expect(bodyOf(response).code).toBe('EXTRACTION_FAILED');
      expect(bodyOf(response).message).toBe(
        'The file could not be read. It may be corrupted or protected.',
      );
      const [row] = await prisma.document.findMany();
      expect(row).toMatchObject({
        status: 'FAILED',
        errorCode: 'EXTRACTION_FAILED',
      });
      expect(await chunkCount()).toBe(0);
    });
  });

  describe('a rejected file creates no row at all', () => {
    it('an empty file is 422 VALIDATION_FAILED', async () => {
      const response = await upload(Buffer.alloc(0), 'empty.pdf').expect(422);

      expect(bodyOf(response).code).toBe('VALIDATION_FAILED');
      expect(await prisma.document.count()).toBe(0);
    });

    it('text renamed to .pdf is 415 at the content check', async () => {
      const response = await upload(
        Buffer.from('just some text'),
        'renamed.txt.pdf',
      ).expect(415);

      expect(bodyOf(response).code).toBe('UNSUPPORTED_FILE_TYPE');
      expect(bodyOf(response).message).toBe(
        'The file content is not a valid PDF file.',
      );
      expect(await prisma.document.count()).toBe(0);
    });

    it('a PDF sent as text/plain is 415 at the MIME check', async () => {
      const response = await upload(
        fixture('text-3-pages.pdf'),
        'terms.pdf',
        'text/plain',
      ).expect(415);

      expect(bodyOf(response).message).toMatch(/content type/);
      expect(await prisma.document.count()).toBe(0);
    });

    it('a DOCX renamed .xlsx is 415', async () => {
      await upload(fixture('headings.docx'), 'terms.xlsx').expect(415);

      expect(await prisma.document.count()).toBe(0);
    });
  });

  describe('details of the stored row', () => {
    it('keeps an Arabic file name exactly', async () => {
      const response = await upload(
        fixture('text-3-pages.pdf'),
        'تقرير المبيعات.pdf',
      ).expect(201);

      expect(summaryOf(response).originalName).toBe('تقرير المبيعات.pdf');
    });

    it('stores the file name without control characters', async () => {
      const response = await upload(
        fixture('text-3-pages.pdf'),
        'rep\tort.pdf',
      ).expect(201);

      expect(summaryOf(response).originalName).toBe('report.pdf');
    });

    it('the same file twice is two independent documents', async () => {
      const first = await upload(fixture('text-3-pages.pdf'), 'a.pdf').expect(
        201,
      );
      const second = await upload(fixture('text-3-pages.pdf'), 'a.pdf').expect(
        201,
      );

      expect(summaryOf(first).id).not.toBe(summaryOf(second).id);
      expect(await prisma.document.count()).toBe(2);
    });

    it('never exposes the owner or the text in the response', async () => {
      const response = await upload(
        fixture('text-3-pages.pdf'),
        'a.pdf',
      ).expect(201);

      expect(Object.keys(response.body as object).sort()).toEqual([
        'chunkCount',
        'createdAt',
        'errorCode',
        'fileType',
        'id',
        'originalName',
        'status',
      ]);
    });
  });
});
