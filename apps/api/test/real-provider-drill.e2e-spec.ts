import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { LLM_PROVIDER } from './../src/ai/llm-provider';
import { OpenAiCompatibleProvider } from './../src/ai/openai-compatible.provider';
import { PrismaService } from './../src/prisma/prisma.service';
import { resetDatabase } from './support/test-database';
import { createUserWithCookie } from './support/users';

describe('real provider failure drill with recorded HTTP responses (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cookie: string;
  let conversationId: string;
  let authorized = false;
  let calls = 0;
  const previousFetch = global.fetch;
  const logs: unknown[] = [];
  let logSpy: jest.SpyInstance;

  beforeAll(async () => {
    global.fetch = (_url, init) => {
      calls++;
      expect((init?.headers as Record<string, string>).authorization).toBe(
        'Bearer invalid-key-fixture',
      );
      if (!authorized)
        return Promise.resolve(
          new Response('vendor says key invalid: private detail', {
            status: 401,
          }),
        );
      return Promise.resolve(
        new Response(
          readFileSync(
            join(__dirname, 'fixtures', 'openai-chat-success.json'),
            'utf8',
          ),
          { status: 200 },
        ),
      );
    };
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((message: unknown) => {
        logs.push(message);
      });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LLM_PROVIDER)
      .useValue(
        new OpenAiCompatibleProvider(
          'https://provider.example/v1',
          'invalid-key-fixture',
          'test-model',
        ),
      )
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    authorized = false;
    calls = 0;
    logs.length = 0;
    const user = await createUserWithCookie(app, 'sara');
    cookie = user.cookie;
    conversationId = (
      await prisma.conversation.create({ data: { userId: user.id } })
    ).id;
    const doc = await prisma.document.create({
      data: {
        uploadedBy: user.id,
        originalName: 'invoice.pdf',
        fileType: 'pdf',
        extractedText: 'Invoices are paid within thirty days.',
        status: 'COMPLETED',
      },
    });
    await prisma.documentChunk.create({
      data: {
        documentId: doc.id,
        chunkIndex: 0,
        content: 'Invoices are paid within thirty days.',
      },
    });
  });

  afterAll(async () => {
    global.fetch = previousFetch;
    logSpy.mockRestore();
    await app.close();
  });

  const send = () =>
    request(app.getHttpServer())
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Cookie', cookie)
      .send({ content: 'When are invoices paid?' });

  it('maps an invalid key to 503, preserves the question, and succeeds after recovery without leaking content', async () => {
    const failed = await send().expect(503);
    expect((failed.body as { code: string }).code).toBe('AI_UNAVAILABLE');
    expect(calls).toBe(1);
    expect(
      (await prisma.message.findMany({ where: { conversationId } })).map(
        (m) => m.role,
      ),
    ).toEqual(['user']);
    authorized = true;
    const recovered = await send().expect(201);
    expect(
      (recovered.body as { message: { content: string } }).message.content,
    ).toContain('[S1]');
    expect(
      (await prisma.message.findMany({ where: { conversationId } })).map(
        (m) => m.role,
      ),
    ).toEqual(['user', 'user', 'assistant']);
    expect(logs).toContainEqual({
      event: 'llm_usage',
      retryCount: 0,
      inputTokens: 120,
      outputTokens: 20,
    });
    expect(JSON.stringify({ body: failed.body as unknown, logs })).not.toMatch(
      /invalid-key-fixture|private detail|When are invoices paid|Invoices are paid within thirty days/,
    );
  });
});
