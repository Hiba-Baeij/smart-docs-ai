import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type {
  ApiError,
  ConversationPage,
  ConversationSummary,
  MessagePage,
} from '@smartdocs/contracts';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import { resetDatabase } from './support/test-database';
import { TestUser, createUserWithCookie } from './support/users';

const bodyOf = (response: { body: unknown }) => response.body as ApiError;
const conversationOf = (response: { body: unknown }) =>
  response.body as ConversationSummary;
const listOf = (response: { body: unknown }) =>
  response.body as ConversationPage;
const messagesOf = (response: { body: unknown }) =>
  response.body as MessagePage;

/** Creating, listing, reading and deleting conversations over HTTP. */
describe('/api/conversations (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let sara: TestUser;
  let omar: TestUser;

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
    sara = await createUserWithCookie(app, 'sara');
    omar = await createUserWithCookie(app, 'omar');
  });

  afterAll(async () => {
    await app.close();
  });

  const as = (who: TestUser) => ({
    get: (url: string) =>
      request(app.getHttpServer()).get(url).set('Cookie', who.cookie),
    post: (url: string) =>
      request(app.getHttpServer()).post(url).set('Cookie', who.cookie),
    delete: (url: string) =>
      request(app.getHttpServer()).delete(url).set('Cookie', who.cookie),
  });

  const seedConversation = (
    owner: TestUser,
    over: { title?: string; updatedAt?: Date } = {},
  ) =>
    prisma.conversation.create({
      data: {
        userId: owner.id,
        title: over.title ?? '',
        ...(over.updatedAt ? { updatedAt: over.updatedAt } : {}),
      },
    });

  const seedMessages = async (
    conversationId: string,
    rows: {
      role: 'user' | 'assistant';
      content: string;
      sources?: object[];
      at: Date;
    }[],
  ) => {
    for (const row of rows) {
      await prisma.message.create({
        data: {
          conversationId,
          role: row.role,
          content: row.content,
          ...(row.sources ? { sources: row.sources } : {}),
          createdAt: row.at,
        },
      });
    }
  };

  describe('POST /api/conversations', () => {
    it('creates a conversation with no title, which stays empty until the first question', async () => {
      const response = await as(sara)
        .post('/api/conversations')
        .send({})
        .expect(201);

      expect(conversationOf(response)).toMatchObject({ title: '' });
      expect(Object.keys(response.body as object).sort()).toEqual([
        'createdAt',
        'id',
        'title',
        'updatedAt',
      ]);
      const [row] = await prisma.conversation.findMany();
      expect(row.userId).toBe(sara.id);
    });

    it('keeps a title the person gave, trimmed', async () => {
      const response = await as(sara)
        .post('/api/conversations')
        .send({ title: '  Contract questions  ' })
        .expect(201);

      expect(conversationOf(response).title).toBe('Contract questions');
    });

    it('accepts a body-less request', async () => {
      await as(sara).post('/api/conversations').expect(201);
    });

    it.each([
      ['a title over 200 characters', { title: 'x'.repeat(201) }],
      ['a title that is not text', { title: 42 }],
      [
        'a userId, which is never read from the client',
        { userId: 'someone-else' },
      ],
      [
        'a userId next to a valid title',
        { title: 'ok', userId: 'someone-else' },
      ],
    ])('rejects %s with 422 and creates nothing', async (_label, body) => {
      const response = await as(sara)
        .post('/api/conversations')
        .send(body)
        .expect(422);

      expect(bodyOf(response).code).toBe('VALIDATION_FAILED');
      expect(await prisma.conversation.count()).toBe(0);
    });
  });

  describe('GET /api/conversations', () => {
    it("lists only the caller's conversations", async () => {
      await seedConversation(sara, { title: 'sara-1' });
      await seedConversation(sara, { title: 'sara-2' });
      await seedConversation(omar, { title: 'omar-1' });

      const forSara = listOf(
        await as(sara).get('/api/conversations').expect(200),
      );
      const forOmar = listOf(
        await as(omar).get('/api/conversations').expect(200),
      );

      expect(forSara.items.map((c) => c.title).sort()).toEqual([
        'sara-1',
        'sara-2',
      ]);
      expect(forSara.total).toBe(2);
      expect(forOmar.items.map((c) => c.title)).toEqual(['omar-1']);
    });

    it('is an empty page for someone with no conversations', async () => {
      await seedConversation(sara);

      const response = await as(omar).get('/api/conversations').expect(200);

      expect(response.body).toEqual({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      });
    });

    it('puts the most recently active conversation first', async () => {
      await seedConversation(sara, {
        title: 'old',
        updatedAt: new Date('2026-01-01'),
      });
      await seedConversation(sara, {
        title: 'new',
        updatedAt: new Date('2026-06-01'),
      });
      await seedConversation(sara, {
        title: 'middle',
        updatedAt: new Date('2026-03-01'),
      });

      const page = listOf(await as(sara).get('/api/conversations').expect(200));

      expect(page.items.map((c) => c.title)).toEqual(['new', 'middle', 'old']);
    });

    it('pages without gaps or overlaps', async () => {
      for (let i = 0; i < 25; i++) {
        await seedConversation(sara, {
          title: `c${i}`,
          updatedAt: new Date(2026, 0, 1, 0, i),
        });
      }

      const pages = [
        listOf(
          await as(sara)
            .get('/api/conversations?page=1&pageSize=10')
            .expect(200),
        ),
        listOf(
          await as(sara)
            .get('/api/conversations?page=2&pageSize=10')
            .expect(200),
        ),
        listOf(
          await as(sara)
            .get('/api/conversations?page=3&pageSize=10')
            .expect(200),
        ),
      ];

      expect(pages.map((p) => p.items.length)).toEqual([10, 10, 5]);
      expect(new Set(pages.flatMap((p) => p.items.map((c) => c.id))).size).toBe(
        25,
      );
    });

    it.each([
      ['page=0'],
      ['pageSize=101'],
      ['page=abc'],
      ['userId=someone-else'],
    ])('rejects ?%s with 422', async (query) => {
      const response = await as(sara)
        .get(`/api/conversations?${query}`)
        .expect(422);

      expect(bodyOf(response).code).toBe('VALIDATION_FAILED');
    });
  });

  describe('GET /api/conversations/:id/messages', () => {
    it('returns the messages oldest first, with sources as an array always', async () => {
      const conversation = await seedConversation(sara);
      // Inserted out of order on purpose: the order is by time, not by insertion.
      await seedMessages(conversation.id, [
        {
          role: 'assistant',
          content: 'answer',
          sources: [
            {
              documentId: 'd',
              documentName: 'a.pdf',
              chunkIndex: 0,
              pageNumber: 2,
              sheetName: null,
            },
          ],
          at: new Date('2026-01-01T10:00:02Z'),
        },
        {
          role: 'user',
          content: 'question',
          at: new Date('2026-01-01T10:00:01Z'),
        },
      ]);

      const page = messagesOf(
        await as(sara)
          .get(`/api/conversations/${conversation.id}/messages`)
          .expect(200),
      );

      expect(page.items.map((m) => m.role)).toEqual(['user', 'assistant']);
      expect(page.items[0].sources).toEqual([]);
      expect(page.items[1].sources).toEqual([
        {
          documentId: 'd',
          documentName: 'a.pdf',
          chunkIndex: 0,
          pageNumber: 2,
          sheetName: null,
        },
      ]);
      expect(page.total).toBe(2);
      expect(page.pageSize).toBe(50);
    });

    it('pages the messages, oldest first, and reports the total', async () => {
      const conversation = await seedConversation(sara);
      await seedMessages(
        conversation.id,
        Array.from({ length: 7 }, (_, i) => ({
          role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
          content: `m${i}`,
          at: new Date(2026, 0, 1, 0, 0, i),
        })),
      );

      const second = messagesOf(
        await as(sara)
          .get(
            `/api/conversations/${conversation.id}/messages?page=2&pageSize=3`,
          )
          .expect(200),
      );

      expect(second.items.map((m) => m.content)).toEqual(['m3', 'm4', 'm5']);
      expect(second.total).toBe(7);
    });

    it('is an empty page for a conversation with no messages yet', async () => {
      const conversation = await seedConversation(sara);

      const page = messagesOf(
        await as(sara)
          .get(`/api/conversations/${conversation.id}/messages`)
          .expect(200),
      );

      expect(page).toMatchObject({ items: [], total: 0 });
    });

    it("is 404 for another user's conversation, the same 404 as for one that does not exist, and leaks nothing", async () => {
      const foreign = await seedConversation(omar);
      await seedMessages(foreign.id, [
        { role: 'user', content: 'omar secret question', at: new Date() },
      ]);

      const foreignResponse = await as(sara)
        .get(`/api/conversations/${foreign.id}/messages`)
        .expect(404);
      const missingResponse = await as(sara)
        .get('/api/conversations/00000000-0000-7000-8000-000000000000/messages')
        .expect(404);
      const malformedResponse = await as(sara)
        .get('/api/conversations/not-an-id/messages')
        .expect(404);

      const shape = (response: { body: unknown }) => {
        const { requestId, timestamp, path, ...rest } = bodyOf(response);
        void requestId;
        void timestamp;
        void path;
        return rest;
      };
      expect(bodyOf(foreignResponse).code).toBe('CONVERSATION_NOT_FOUND');
      expect(shape(foreignResponse)).toEqual(shape(missingResponse));
      expect(shape(foreignResponse)).toEqual(shape(malformedResponse));
      expect(JSON.stringify(foreignResponse.body)).not.toContain('omar secret');
    });
  });

  describe('DELETE /api/conversations/:id', () => {
    it('is 204 with an empty body, and the conversation and its messages are gone', async () => {
      const conversation = await seedConversation(sara);
      await seedMessages(conversation.id, [
        { role: 'user', content: 'q', at: new Date('2026-01-01T00:00:01Z') },
        {
          role: 'assistant',
          content: 'a',
          at: new Date('2026-01-01T00:00:02Z'),
        },
      ]);

      const response = await as(sara)
        .delete(`/api/conversations/${conversation.id}`)
        .expect(204);

      expect(response.text).toBe('');
      expect(await prisma.conversation.count()).toBe(0);
      expect(await prisma.message.count()).toBe(0);
    });

    it('leaves every other conversation and its messages alone', async () => {
      const doomed = await seedConversation(sara);
      const kept = await seedConversation(sara);
      const others = await seedConversation(omar);
      for (const c of [doomed, kept, others]) {
        await seedMessages(c.id, [
          { role: 'user', content: 'q', at: new Date() },
        ]);
      }

      await as(sara).delete(`/api/conversations/${doomed.id}`).expect(204);

      expect(
        (await prisma.conversation.findMany()).map((c) => c.id).sort(),
      ).toEqual([kept.id, others.id].sort());
      expect(await prisma.message.count()).toBe(2);
    });

    it("cannot delete another user's conversation: 404, and it is still there with its messages", async () => {
      const foreign = await seedConversation(omar);
      await seedMessages(foreign.id, [
        { role: 'user', content: 'q', at: new Date() },
      ]);

      const response = await as(sara)
        .delete(`/api/conversations/${foreign.id}`)
        .expect(404);

      expect(bodyOf(response).code).toBe('CONVERSATION_NOT_FOUND');
      expect(await prisma.conversation.count()).toBe(1);
      expect(await prisma.message.count()).toBe(1);
    });

    it('a second delete of the same conversation is 404, not a crash', async () => {
      const conversation = await seedConversation(sara);
      await as(sara)
        .delete(`/api/conversations/${conversation.id}`)
        .expect(204);

      const response = await as(sara)
        .delete(`/api/conversations/${conversation.id}`)
        .expect(404);

      expect(bodyOf(response).code).toBe('CONVERSATION_NOT_FOUND');
    });
  });

  describe('POST /api/conversations/:id/messages', () => {
    it('persists an exact fallback and no source when retrieval finds nothing', async () => {
      const conversation = await seedConversation(sara);

      const response = await as(sara)
        .post(`/api/conversations/${conversation.id}/messages`)
        .send({ content: 'What is the company tax rate?' })
        .expect(201);

      expect(
        (response.body as { message: { content: string; sources: object[] } })
          .message,
      ).toMatchObject({
        content: 'ليس لدي معلومات كافية للإجابة عن سؤالك.',
        sources: [],
      });
      expect(
        (
          await prisma.message.findMany({
            where: { conversationId: conversation.id },
          })
        ).map((m) => m.role),
      ).toEqual(['user', 'assistant']);
    });

    it('returns and persists a source snapshot even after its document is deleted', async () => {
      const conversation = await seedConversation(sara);
      const document = await prisma.document.create({
        data: {
          uploadedBy: sara.id,
          originalName: 'handbook.pdf',
          fileType: 'pdf',
          extractedText: 'Invoices are paid within thirty days.',
          status: 'COMPLETED',
        },
      });
      await prisma.documentChunk.create({
        data: {
          documentId: document.id,
          chunkIndex: 0,
          pageNumber: 3,
          content: 'Invoices are paid within thirty days.',
        },
      });

      const response = await as(sara)
        .post(`/api/conversations/${conversation.id}/messages`)
        .send({ content: 'When are invoices paid?' })
        .expect(201);
      const answer = (
        response.body as {
          message: { content: string; sources: { documentId: string }[] };
        }
      ).message;
      expect(answer.content).toContain('[S1]');
      expect(answer.sources[0].documentId).toBe(document.id);
      await prisma.document.delete({ where: { id: document.id } });
      const history = messagesOf(
        await as(sara)
          .get(`/api/conversations/${conversation.id}/messages`)
          .expect(200),
      );
      expect(history.items[1].sources).toEqual(answer.sources);
    });

    it('refuses a topically related chunk that lacks the requested fact', async () => {
      const conversation = await seedConversation(sara);
      const document = await prisma.document.create({
        data: {
          uploadedBy: sara.id,
          originalName: 'invoices.pdf',
          fileType: 'pdf',
          extractedText: 'Invoices are paid within thirty days.',
          status: 'COMPLETED',
        },
      });
      await prisma.documentChunk.create({
        data: {
          documentId: document.id,
          chunkIndex: 0,
          content: 'Invoices are paid within thirty days.',
        },
      });
      const response = await as(sara)
        .post(`/api/conversations/${conversation.id}/messages`)
        .send({ content: 'What is the invoice tax rate?' })
        .expect(201);
      expect(
        (response.body as { message: { content: string; sources: object[] } })
          .message,
      ).toMatchObject({
        content: 'ليس لدي معلومات كافية للإجابة عن سؤالك.',
        sources: [],
      });
    });

    it.each([
      ['empty text', { content: '  ' }],
      ['too long', { content: 'x'.repeat(4001) }],
      ['client supplied owner', { content: 'hello', userId: 'other' }],
    ])('rejects %s before persisting a message', async (_label, body) => {
      const conversation = await seedConversation(sara);
      const response = await as(sara)
        .post(`/api/conversations/${conversation.id}/messages`)
        .send(body)
        .expect(422);
      expect(bodyOf(response).code).toBe('VALIDATION_FAILED');
      expect(await prisma.message.count()).toBe(0);
    });

    it('a foreign conversation is 404 without adding a question', async () => {
      const foreign = await seedConversation(omar);
      const response = await as(sara)
        .post(`/api/conversations/${foreign.id}/messages`)
        .send({ content: 'Private?' })
        .expect(404);
      expect(bodyOf(response).code).toBe('CONVERSATION_NOT_FOUND');
      expect(await prisma.message.count()).toBe(0);
    });
  });
});
