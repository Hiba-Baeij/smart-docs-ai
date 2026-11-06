import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type {
  ApiError,
  ConversationPage,
  DocumentPage,
} from '@smartdocs/contracts';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { AppError } from './../src/common/errors/app-error';
import { SendMessageService } from './../src/conversations/send-message.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { resetDatabase } from './support/test-database';
import { TestUser, createUserWithCookie } from './support/users';

const bodyOf = (response: { body: unknown }) => response.body as ApiError;

/**
 * The ownership matrix of docs/architecture/security-model.md section 5, as data. Sara is the
 * attacker, Omar the victim, and every row uses the victim's REAL ids, so a missing filter shows
 * up as leaked data and not as an empty result that happens to pass.
 */
describe('Ownership matrix (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let sara: TestUser;
  let omar: TestUser;
  let omarDocument: string;
  let omarConversation: string;
  let saraDocument: string;
  let saraConversation: string;

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

    const documentFor = async (owner: TestUser, name: string) => {
      const document = await prisma.document.create({
        data: {
          originalName: name,
          fileType: 'pdf',
          extractedText: `${name} secret text`,
          status: 'COMPLETED',
          uploadedBy: owner.id,
        },
      });
      await prisma.documentChunk.createMany({
        data: [
          {
            documentId: document.id,
            chunkIndex: 0,
            content: `${name} chunk 0`,
          },
          {
            documentId: document.id,
            chunkIndex: 1,
            content: `${name} chunk 1`,
          },
        ],
      });
      return document.id;
    };
    const conversationFor = async (owner: TestUser, title: string) => {
      const conversation = await prisma.conversation.create({
        data: { userId: owner.id, title },
      });
      await prisma.message.createMany({
        data: [
          {
            conversationId: conversation.id,
            role: 'user',
            content: `${title} question`,
          },
          {
            conversationId: conversation.id,
            role: 'assistant',
            content: `${title} answer`,
          },
        ],
      });
      return conversation.id;
    };

    omarDocument = await documentFor(omar, 'omar-doc');
    saraDocument = await documentFor(sara, 'sara-doc');
    omarConversation = await conversationFor(omar, 'omar-chat');
    saraConversation = await conversationFor(sara, 'sara-chat');
  });

  afterAll(async () => {
    await app.close();
  });

  /** Everything that belongs to the victim, to compare before and after an attack. */
  const victimSnapshot = async () => ({
    documents: await prisma.document.count({ where: { uploadedBy: omar.id } }),
    chunks: await prisma.documentChunk.count({
      where: { documentId: omarDocument },
    }),
    conversations: await prisma.conversation.count({
      where: { userId: omar.id },
    }),
    messages: await prisma.message.count({
      where: { conversationId: omarConversation },
    }),
    title: (
      await prisma.conversation.findUnique({ where: { id: omarConversation } })
    )?.title,
  });

  const call = (
    method: 'get' | 'post' | 'delete',
    url: string,
    cookie?: string,
  ) => {
    const req = request(app.getHttpServer())[method](url);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  describe("another user's id, with a valid session", () => {
    const foreignIdRows: {
      row: string;
      method: 'get' | 'delete';
      url: () => string;
      code: string;
    }[] = [
      {
        row: 'GET /documents/:id',
        method: 'get',
        url: () => `/api/documents/${omarDocument}`,
        code: 'DOCUMENT_NOT_FOUND',
      },
      {
        row: 'DELETE /documents/:id',
        method: 'delete',
        url: () => `/api/documents/${omarDocument}`,
        code: 'DOCUMENT_NOT_FOUND',
      },
      {
        row: 'GET /conversations/:id/messages',
        method: 'get',
        url: () => `/api/conversations/${omarConversation}/messages`,
        code: 'CONVERSATION_NOT_FOUND',
      },
      {
        row: 'DELETE /conversations/:id',
        method: 'delete',
        url: () => `/api/conversations/${omarConversation}`,
        code: 'CONVERSATION_NOT_FOUND',
      },
    ];

    it.each(foreignIdRows)(
      '$row is 404 $code, leaks nothing, and changes nothing of the victim',
      async ({ method, url, code }) => {
        const before = await victimSnapshot();

        const response = await call(method, url(), sara.cookie).expect(404);

        expect(bodyOf(response).code).toBe(code);
        expect(JSON.stringify(response.body)).not.toMatch(/omar/);
        expect(await victimSnapshot()).toEqual(before);
      },
    );

    it('POST /conversations/:id/messages is 404 and creates no message row', async () => {
      const before = await victimSnapshot();

      const response = await call(
        'post',
        `/api/conversations/${omarConversation}/messages`,
        sara.cookie,
      )
        .send({ content: 'let me in' })
        .expect(404);
      expect(bodyOf(response).code).toBe('CONVERSATION_NOT_FOUND');
      const thrown = await app
        .get(SendMessageService)
        .execute({
          userId: sara.id,
          conversationId: omarConversation,
          content: 'let me in',
        })
        .catch((error: unknown) => error as AppError);

      expect(thrown).toBeInstanceOf(AppError);
      expect((thrown as AppError).code).toBe('CONVERSATION_NOT_FOUND');
      expect(await victimSnapshot()).toEqual(before);
      expect(
        await prisma.message.count({ where: { content: 'let me in' } }),
      ).toBe(0);
    });

    it('a missing id is the same 404 as a foreign one, so the two cannot be told apart', async () => {
      const missing = '00000000-0000-7000-8000-000000000000';
      const strip = (r: { body: unknown }) => {
        const { requestId, timestamp, path, ...rest } = bodyOf(r);
        void requestId;
        void timestamp;
        void path;
        return rest;
      };

      for (const [foreign, absent] of [
        [`/api/documents/${omarDocument}`, `/api/documents/${missing}`],
        [
          `/api/conversations/${omarConversation}/messages`,
          `/api/conversations/${missing}/messages`,
        ],
      ]) {
        const a = await call('get', foreign, sara.cookie).expect(404);
        const b = await call('get', absent, sara.cookie).expect(404);

        expect(strip(a)).toEqual(strip(b));
      }
    });
  });

  describe("lists show only the caller's rows", () => {
    it('GET /documents', async () => {
      const response = await call('get', '/api/documents', sara.cookie).expect(
        200,
      );
      const page = response.body as DocumentPage;

      expect(page.items.map((d) => d.id)).toEqual([saraDocument]);
      expect(page.total).toBe(1);
    });

    it('GET /conversations', async () => {
      const response = await call(
        'get',
        '/api/conversations',
        sara.cookie,
      ).expect(200);
      const page = response.body as ConversationPage;

      expect(page.items.map((c) => c.id)).toEqual([saraConversation]);
      expect(page.total).toBe(1);
    });

    it.each(['/api/documents', '/api/conversations'])(
      '%s ignores an X-User-Id header and a cookie value that is not a token',
      async (url) => {
        const withHeader = await call('get', url, sara.cookie)
          .set('X-User-Id', omar.id)
          .expect(200);

        const items = (
          withHeader.body as { items: { id: string }[] }
        ).items.map((i) => i.id);
        expect(items).not.toContain(omarDocument);
        expect(items).not.toContain(omarConversation);
      },
    );
  });

  describe('a userId from the client is rejected, not ignored', () => {
    it.each([
      [
        'POST /conversations body',
        'post',
        '/api/conversations',
        { userId: 'x' },
      ],
      [
        "POST /conversations body (the victim's id)",
        'post',
        '/api/conversations',
        { title: 't', userId: 'omar' },
      ],
    ] as const)('%s is 422', async (_label, method, url, body) => {
      const response = await call(method, url, sara.cookie)
        .send(body)
        .expect(422);

      expect(bodyOf(response).code).toBe('VALIDATION_FAILED');
      expect(await prisma.conversation.count({ where: { title: 't' } })).toBe(
        0,
      );
    });

    it.each([
      '/api/documents',
      '/api/conversations',
      `/api/conversations/${'x'}/messages`,
    ])('GET %s?userId=... is 422', async (url) => {
      const response = await call(
        'get',
        `${url}?userId=someone-else`,
        sara.cookie,
      ).expect(422);

      expect(bodyOf(response).code).toBe('VALIDATION_FAILED');
    });
  });

  describe('no session, or one that is not valid, is 401 everywhere', () => {
    const endpoints = (): {
      name: string;
      method: 'get' | 'post' | 'delete';
      url: string;
    }[] => [
      {
        name: 'POST /documents/upload',
        method: 'post',
        url: '/api/documents/upload',
      },
      { name: 'GET /documents', method: 'get', url: '/api/documents' },
      {
        name: 'GET /documents/:id',
        method: 'get',
        url: `/api/documents/${omarDocument}`,
      },
      {
        name: 'DELETE /documents/:id',
        method: 'delete',
        url: `/api/documents/${omarDocument}`,
      },
      {
        name: 'POST /conversations',
        method: 'post',
        url: '/api/conversations',
      },
      { name: 'GET /conversations', method: 'get', url: '/api/conversations' },
      {
        name: 'GET /conversations/:id/messages',
        method: 'get',
        url: `/api/conversations/${omarConversation}/messages`,
      },
      {
        name: 'DELETE /conversations/:id',
        method: 'delete',
        url: `/api/conversations/${omarConversation}`,
      },
      { name: 'GET /auth/me', method: 'get', url: '/api/auth/me' },
    ];

    const badSessions = async (): Promise<[string, string | undefined][]> => {
      const jwt = app.get(JwtService);
      return [
        ['no cookie at all', undefined],
        ['a value that is not a token', 'sid=not-a-token'],
        [
          'a token for the victim signed with another secret',
          `sid=${await new JwtService({ secret: 'another-secret-of-32-or-more-characters-x' }).signAsync({ sub: omar.id })}`,
        ],
        [
          'a correctly signed token that has expired',
          `sid=${await jwt.signAsync({ sub: omar.id }, { expiresIn: -10 })}`,
        ],
        [
          'an unsigned token (alg none) for the victim',
          `sid=${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: omar.id })).toString('base64url')}.`,
        ],
      ];
    };

    it('every endpoint, every kind of bad session', async () => {
      const before = await victimSnapshot();

      for (const endpoint of endpoints()) {
        for (const [label, cookie] of await badSessions()) {
          const response = await call(endpoint.method, endpoint.url, cookie);

          expect([endpoint.name, label, response.status]).toEqual([
            endpoint.name,
            label,
            401,
          ]);
          expect(bodyOf(response).code).toBe('AUTH_REQUIRED');
        }
      }
      expect(await victimSnapshot()).toEqual(before);
    });
  });

  describe('after all of it', () => {
    it('the owner can still read and use everything', async () => {
      await call('get', `/api/documents/${omarDocument}`, omar.cookie).expect(
        200,
      );
      await call(
        'get',
        `/api/conversations/${omarConversation}/messages`,
        omar.cookie,
      ).expect(200);
    });
  });
});
