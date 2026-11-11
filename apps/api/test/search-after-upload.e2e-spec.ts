import './support/chunking-small-env';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { MockEmbeddingProvider } from './../src/ai/mock-embedding.provider';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { hashPassword } from './../src/auth/password';
import { PrismaService } from './../src/prisma/prisma.service';
import { ChunkSearchService } from './../src/search/chunk-search.service';
import { SearchModule } from './../src/search/search.module';
import { resetDatabase } from './support/test-database';

const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name));

/**
 * The whole write-to-read path, with no shortcuts: a real file is uploaded, extracted and
 * chunked by the application, and the question is answered from what that stored. Chunks are
 * about ten words, from support/chunking-small-env.ts, so each fixture becomes several chunks.
 */
describe('searching what an upload stored (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let search: ChunkSearchService;
  const users: Record<'sara' | 'omar', { id: string; cookie: string }> = {
    sara: { id: '', cookie: '' },
    omar: { id: '', cookie: '' },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, SearchModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    search = app.get(ChunkSearchService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    for (const name of ['sara', 'omar'] as const) {
      const user = await prisma.user.create({
        data: {
          name,
          email: `${name}@example.com`,
          passwordHash: await hashPassword('correct horse battery'),
        },
      });
      users[name] = {
        id: user.id,
        cookie: `sid=${await app.get(JwtService).signAsync({ sub: user.id })}`,
      };
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const upload = (who: 'sara' | 'omar', file: string) =>
    request(app.getHttpServer())
      .post('/api/documents/upload')
      .set('Cookie', users[who].cookie)
      .attach('file', fixture(file), file)
      .expect(201);

  const ask = (who: 'sara' | 'omar', question: string) =>
    search.search({ userId: users[who].id, question, limit: 6 });

  it('a PDF: a known term returns the page it is on, in the top 6', async () => {
    await upload('sara', 'text-3-pages.pdf');

    const hits = await ask('sara', 'When are the shipping times?');

    expect(hits[0].content).toContain('Page two covers the shipping times.');
    expect(hits[0].pageNumber).toBe(2);
    expect(hits[0].documentName).toBe('text-3-pages.pdf');
  });

  it('a workbook: a known term returns the row chunk with its sheet and header', async () => {
    await upload('sara', 'budget.xlsx');

    const hits = await ask('sara', 'What is the planned budget for Software?');

    expect(hits[0].sheetName).toBe('Q3 Budget');
    expect(hits[0].content).toContain('Category: Software | Planned: 3000');
  });

  it('a Word document: a known term returns the chunk, with its heading path', async () => {
    await upload('sara', 'headings.docx');

    const hits = await ask(
      'sara',
      'How long do customers have to pay invoices?',
    );

    expect(
      hits[0].content.startsWith('Terms of Service > Payment terms — '),
    ).toBe(true);
    expect(hits[0].content).toContain('Invoices are due within');
  });

  it('never returns what another user uploaded, even the identical file', async () => {
    await upload('omar', 'text-3-pages.pdf');
    await upload('sara', 'text-3-pages.pdf');

    const forSara = await ask('sara', 'shipping times');
    const documents = await prisma.document.findMany({
      where: { uploadedBy: users.sara.id },
    });

    expect(forSara.length).toBeGreaterThan(0);
    expect(forSara.every((hit) => hit.documentId === documents[0].id)).toBe(
      true,
    );
  });

  it('does not return the chunks of an upload that failed', async () => {
    await request(app.getHttpServer())
      .post('/api/documents/upload')
      .set('Cookie', users.sara.cookie)
      .attach('file', fixture('scanned.pdf'), 'scan.pdf')
      .expect(422);

    expect(await ask('sara', 'refund policy')).toEqual([]);
  });

  describe('semantic retrieval (ADR-018, mock embeddings)', () => {
    const embeddedChunks = async (userId: string) =>
      prisma.$queryRaw<{ total: number; embedded: number }[]>`
        SELECT count(*)::int AS total, count(c.embedding)::int AS embedded
          FROM "DocumentChunk" c JOIN "Document" d ON d.id = c."documentId"
         WHERE d."uploadedBy" = ${userId}`;

    it('stores an embedding for every chunk of an upload', async () => {
      await upload('sara', 'text-3-pages.pdf');

      const [{ total, embedded }] = await embeddedChunks(users.sara.id);
      expect(total).toBeGreaterThan(1);
      expect(embedded).toBe(total);
    });

    it('vector search returns the closest chunk, only from the caller', async () => {
      await upload('omar', 'text-3-pages.pdf');
      await upload('sara', 'headings.docx');
      const [vector] = await new MockEmbeddingProvider().embed([
        'shipping times page',
      ]);

      const forSara = await search.searchByVector({
        userId: users.sara.id,
        vector,
        limit: 6,
        maxDistance: 2,
      });
      const forOmar = await search.searchByVector({
        userId: users.omar.id,
        vector,
        limit: 6,
        maxDistance: 0.9,
      });

      expect(forOmar[0].content).toContain('shipping times');
      expect(forOmar[0].score).toBeGreaterThan(forOmar.at(-1)!.score - 1e-9);
      const saraDocs = await prisma.document.findMany({
        where: { uploadedBy: users.sara.id },
      });
      expect(forSara.every((hit) => hit.documentId === saraDocs[0].id)).toBe(
        true,
      );
    });
  });
});
