import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type {
  ApiError,
  DocumentDetail,
  DocumentPage,
} from '@smartdocs/contracts';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { hashPassword } from './../src/auth/password';
import { PrismaService } from './../src/prisma/prisma.service';
import { resetDatabase } from './support/test-database';

const bodyOf = (response: { body: unknown }) => response.body as ApiError;
const pageOf = (response: { body: unknown }) => response.body as DocumentPage;
const detailOf = (response: { body: unknown }) =>
  response.body as DocumentDetail;

type SeedChunk = { content: string; pageNumber?: number; sheetName?: string };
type SeedDocument = {
  name?: string;
  status?: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  errorCode?: string;
  text?: string;
  createdAt?: Date;
  chunks?: SeedChunk[];
};

/** Listing, opening and deleting documents, and above all whose documents they are. */
describe('GET and DELETE /api/documents (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const users = {
    sara: { id: '', cookie: '' },
    omar: { id: '', cookie: '' },
  };
  let statements: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    (
      prisma as unknown as {
        $on: (event: 'query', listener: (e: { query: string }) => void) => void;
      }
    ).$on('query', (event) => statements.push(event.query));
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

  async function seed(
    owner: 'sara' | 'omar',
    {
      name = 'doc.pdf',
      status = 'COMPLETED',
      errorCode,
      text = 'extracted text',
      createdAt,
      chunks = [],
    }: SeedDocument = {},
  ) {
    const document = await prisma.document.create({
      data: {
        originalName: name,
        fileType: 'pdf',
        extractedText: text,
        status,
        errorCode: errorCode ?? null,
        uploadedBy: users[owner].id,
        ...(createdAt ? { createdAt } : {}),
      },
    });
    await prisma.documentChunk.createMany({
      data: chunks.map((chunk, chunkIndex) => ({
        documentId: document.id,
        chunkIndex,
        content: chunk.content,
        pageNumber: chunk.pageNumber ?? null,
        sheetName: chunk.sheetName ?? null,
      })),
    });
    return document;
  }

  const as = (who: 'sara' | 'omar') => ({
    get: (url: string) =>
      request(app.getHttpServer()).get(url).set('Cookie', users[who].cookie),
    delete: (url: string) =>
      request(app.getHttpServer()).delete(url).set('Cookie', users[who].cookie),
  });

  describe('every route needs a session', () => {
    it.each([
      ['GET', '/api/documents'],
      ['GET', '/api/documents/some-id'],
      ['DELETE', '/api/documents/some-id'],
    ])('%s %s is 401 without one', async (method, url) => {
      const call = request(app.getHttpServer());
      const response = await (method === 'GET'
        ? call.get(url)
        : call.delete(url));

      expect(response.status).toBe(401);
      expect(bodyOf(response).code).toBe('AUTH_REQUIRED');
    });
  });

  describe('GET /api/documents', () => {
    it('shows each user only their own documents', async () => {
      await seed('sara', { name: 'sara-1.pdf' });
      await seed('sara', { name: 'sara-2.pdf' });
      await seed('omar', { name: 'omar-1.pdf' });

      const forOmar = pageOf(
        await as('omar').get('/api/documents').expect(200),
      );
      const forSara = pageOf(
        await as('sara').get('/api/documents').expect(200),
      );

      expect(forOmar.items.map((d) => d.originalName)).toEqual(['omar-1.pdf']);
      expect(forOmar.total).toBe(1);
      expect(forSara.total).toBe(2);
    });

    it('is an empty page, not an error, for a user with no documents', async () => {
      await seed('sara');

      const response = await as('omar').get('/api/documents').expect(200);

      expect(response.body).toEqual({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      });
    });

    it('lists newest first', async () => {
      await seed('sara', { name: 'old', createdAt: new Date('2026-01-01') });
      await seed('sara', { name: 'new', createdAt: new Date('2026-06-01') });
      await seed('sara', { name: 'middle', createdAt: new Date('2026-03-01') });

      const page = pageOf(await as('sara').get('/api/documents').expect(200));

      expect(page.items.map((d) => d.originalName)).toEqual([
        'new',
        'middle',
        'old',
      ]);
    });

    it('pages without gaps or overlaps, and reports the total', async () => {
      for (let i = 0; i < 25; i++) {
        await seed('sara', {
          name: `d${i}`,
          createdAt: new Date(2026, 0, 1, 0, i),
        });
      }

      const pages = [
        pageOf(
          await as('sara').get('/api/documents?page=1&pageSize=10').expect(200),
        ),
        pageOf(
          await as('sara').get('/api/documents?page=2&pageSize=10').expect(200),
        ),
        pageOf(
          await as('sara').get('/api/documents?page=3&pageSize=10').expect(200),
        ),
      ];

      expect(pages.map((p) => p.items.length)).toEqual([10, 10, 5]);
      expect(pages.every((p) => p.total === 25)).toBe(true);
      const ids = pages.flatMap((p) => p.items.map((d) => d.id));
      expect(new Set(ids).size).toBe(25);
    });

    it('a page past the end is empty, with the page echoed', async () => {
      await seed('sara');

      const page = pageOf(
        await as('sara').get('/api/documents?page=9&pageSize=10').expect(200),
      );

      expect(page).toMatchObject({
        items: [],
        page: 9,
        pageSize: 10,
        total: 1,
      });
    });

    it('filters by status', async () => {
      await seed('sara', { name: 'ok', status: 'COMPLETED' });
      await seed('sara', {
        name: 'bad',
        status: 'FAILED',
        errorCode: 'EMPTY_EXTRACTION',
      });
      await seed('sara', { name: 'stuck', status: 'PROCESSING' });

      const failed = pageOf(
        await as('sara').get('/api/documents?status=FAILED').expect(200),
      );

      expect(failed.items.map((d) => d.originalName)).toEqual(['bad']);
      expect(failed.items[0].errorCode).toBe('EMPTY_EXTRACTION');
      expect(failed.total).toBe(1);
    });

    it('reports the chunk count of each document, zero included', async () => {
      await seed('sara', {
        name: 'none',
        status: 'FAILED',
        errorCode: 'EMPTY_EXTRACTION',
      });
      await seed('sara', {
        name: 'five',
        chunks: Array.from({ length: 5 }, (_, i) => ({ content: `c${i}` })),
      });

      const page = pageOf(await as('sara').get('/api/documents').expect(200));
      const counts = Object.fromEntries(
        page.items.map((d) => [d.originalName, d.chunkCount]),
      );

      expect(counts).toEqual({ none: 0, five: 5 });
    });

    it('uses the same number of statements for 3 documents as for 20: no N+1', async () => {
      const countSelects = async () => {
        statements = [];
        await as('sara').get('/api/documents?pageSize=50').expect(200);
        return statements.filter((query) => query.trim().startsWith('SELECT'))
          .length;
      };
      for (let i = 0; i < 3; i++) {
        await seed('sara', { chunks: [{ content: 'a' }, { content: 'b' }] });
      }
      const withThree = await countSelects();
      for (let i = 0; i < 17; i++) {
        await seed('sara', { chunks: [{ content: 'a' }, { content: 'b' }] });
      }
      const withTwenty = await countSelects();

      expect(withThree).toBeGreaterThan(0);
      expect(withTwenty).toBe(withThree);
    });

    it('exposes neither the owner nor the text', async () => {
      await seed('sara');

      const page = pageOf(await as('sara').get('/api/documents').expect(200));

      expect(Object.keys(page.items[0]).sort()).toEqual([
        'chunkCount',
        'createdAt',
        'errorCode',
        'fileType',
        'id',
        'originalName',
        'status',
      ]);
    });

    it.each([
      ['page=0'],
      ['page=abc'],
      ['page=1.5'],
      ['pageSize=0'],
      ['pageSize=101'],
      ['status=DONE'],
      ['userId=someone-else'],
    ])('rejects ?%s with 422 VALIDATION_FAILED', async (query) => {
      const response = await as('sara')
        .get(`/api/documents?${query}`)
        .expect(422);

      expect(bodyOf(response).code).toBe('VALIDATION_FAILED');
    });
  });

  describe('GET /api/documents/:id', () => {
    it('returns the document with its text and a preview of each chunk, in order', async () => {
      const document = await seed('sara', {
        name: 'handbook.pdf',
        text: 'the full extracted text',
        chunks: [
          { content: 'First chunk', pageNumber: 1 },
          { content: 'Second chunk', pageNumber: 2 },
          { content: 'Row chunk', sheetName: 'Q3 Budget' },
        ],
      });

      const detail = detailOf(
        await as('sara').get(`/api/documents/${document.id}`).expect(200),
      );

      expect(detail).toMatchObject({
        id: document.id,
        originalName: 'handbook.pdf',
        status: 'COMPLETED',
        chunkCount: 3,
        extractedText: 'the full extracted text',
      });
      expect(detail.chunks).toEqual([
        {
          chunkIndex: 0,
          pageNumber: 1,
          sheetName: null,
          preview: 'First chunk',
        },
        {
          chunkIndex: 1,
          pageNumber: 2,
          sheetName: null,
          preview: 'Second chunk',
        },
        {
          chunkIndex: 2,
          pageNumber: null,
          sheetName: 'Q3 Budget',
          preview: 'Row chunk',
        },
      ]);
    });

    it('cuts each preview at 200 characters, counting characters and not bytes', async () => {
      const document = await seed('sara', {
        chunks: [{ content: 'ب'.repeat(500) }, { content: 'x'.repeat(500) }],
      });

      const detail = detailOf(
        await as('sara').get(`/api/documents/${document.id}`).expect(200),
      );

      expect(detail.chunks.map((chunk) => chunk.preview.length)).toEqual([
        200, 200,
      ]);
      expect(detail.chunks[0].preview).toBe('ب'.repeat(200));
    });

    it('shows a failed document with its code and nothing else to read', async () => {
      const document = await seed('sara', {
        status: 'FAILED',
        errorCode: 'EMPTY_EXTRACTION',
        text: '',
      });

      const detail = detailOf(
        await as('sara').get(`/api/documents/${document.id}`).expect(200),
      );

      expect(detail).toMatchObject({
        status: 'FAILED',
        errorCode: 'EMPTY_EXTRACTION',
        extractedText: '',
        chunks: [],
        chunkCount: 0,
      });
    });

    it("is 404 for another user's document, the same 404 as for one that does not exist", async () => {
      const foreign = await seed('omar', { text: 'omar secret' });

      const foreignResponse = await as('sara')
        .get(`/api/documents/${foreign.id}`)
        .expect(404);
      const missingResponse = await as('sara')
        .get('/api/documents/00000000-0000-7000-8000-000000000000')
        .expect(404);
      const malformedResponse = await as('sara')
        .get('/api/documents/not-an-id')
        .expect(404);

      const shape = (response: { body: unknown }) => {
        const { requestId, timestamp, path, ...rest } = bodyOf(response);
        void requestId;
        void timestamp;
        void path;
        return rest;
      };
      expect(bodyOf(foreignResponse).code).toBe('DOCUMENT_NOT_FOUND');
      expect(shape(foreignResponse)).toEqual(shape(missingResponse));
      expect(shape(foreignResponse)).toEqual(shape(malformedResponse));
      expect(JSON.stringify(foreignResponse.body)).not.toContain('omar secret');
    });
  });

  describe('DELETE /api/documents/:id', () => {
    it('is 204 with an empty body, and the document and its chunks are gone', async () => {
      const document = await seed('sara', {
        chunks: [{ content: 'a' }, { content: 'b' }, { content: 'c' }],
      });

      const response = await as('sara')
        .delete(`/api/documents/${document.id}`)
        .expect(204);

      expect(response.text).toBe('');
      expect(await prisma.document.count()).toBe(0);
      expect(await prisma.documentChunk.count()).toBe(0);
      await as('sara').get(`/api/documents/${document.id}`).expect(404);
    });

    it('leaves every other document and its chunks alone', async () => {
      const doomed = await seed('sara', { chunks: [{ content: 'a' }] });
      const kept = await seed('sara', {
        chunks: [{ content: 'b' }, { content: 'c' }],
      });
      const others = await seed('omar', { chunks: [{ content: 'd' }] });

      await as('sara').delete(`/api/documents/${doomed.id}`).expect(204);

      const remaining = await prisma.document.findMany({
        select: { id: true },
      });
      expect(remaining.map((d) => d.id).sort()).toEqual(
        [kept.id, others.id].sort(),
      );
      expect(await prisma.documentChunk.count()).toBe(3);
    });

    it("cannot delete another user's document: 404, and it is still there with its chunks", async () => {
      const foreign = await seed('omar', {
        chunks: [{ content: 'a' }, { content: 'b' }],
      });

      const response = await as('sara')
        .delete(`/api/documents/${foreign.id}`)
        .expect(404);

      expect(bodyOf(response).code).toBe('DOCUMENT_NOT_FOUND');
      expect(await prisma.document.count()).toBe(1);
      expect(await prisma.documentChunk.count()).toBe(2);
      await as('omar').get(`/api/documents/${foreign.id}`).expect(200);
    });

    it('a second delete of the same document is 404, not a crash', async () => {
      const document = await seed('sara');
      await as('sara').delete(`/api/documents/${document.id}`).expect(204);

      const response = await as('sara')
        .delete(`/api/documents/${document.id}`)
        .expect(404);

      expect(bodyOf(response).code).toBe('DOCUMENT_NOT_FOUND');
    });

    it.each(['PROCESSING', 'FAILED'] as const)(
      'deletes a %s document too: it is the way out of a stuck one',
      async (status) => {
        const document = await seed('sara', { status });

        await as('sara').delete(`/api/documents/${document.id}`).expect(204);

        expect(await prisma.document.count()).toBe(0);
      },
    );
  });
});
