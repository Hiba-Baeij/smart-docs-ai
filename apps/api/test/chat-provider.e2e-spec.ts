import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { LLM_PROVIDER, type GenerateInput } from './../src/ai/llm-provider';
import { INSUFFICIENT_EVIDENCE_ANSWER } from './../src/ai/evidence-policy';
import { MockLlmProvider } from './../src/ai/mock-llm.provider';
import { AppError } from './../src/common/errors/app-error';
import { PrismaService } from './../src/prisma/prisma.service';
import { SendMessageService } from './../src/conversations/send-message.service';
import { RagAnswerStep } from './../src/conversations/rag-answer.step';
import { ConfigService } from '@nestjs/config';
import { resetDatabase } from './support/test-database';

describe('provider branches through persisted chat (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let send: SendMessageService;
  let userId: string;
  let conversationId: string;
  let mode: 'no_evidence' | 'timeout' | 'error' | 'answer';
  let calls: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LLM_PROVIDER)
      .useValue({
        generate: (input: GenerateInput) => {
          calls += 1;
          return new MockLlmProvider(mode).generate(input);
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    send = app.get(SendMessageService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    const user = await prisma.user.create({
      data: { name: 'Sara', email: 'sara@example.com', passwordHash: 'test' },
    });
    userId = user.id;
    conversationId = (await prisma.conversation.create({ data: { userId } }))
      .id;
    mode = 'answer';
    calls = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  const addEvidence = async () => {
    const doc = await prisma.document.create({
      data: {
        uploadedBy: userId,
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
  };

  it('zero candidates saves the fallback without contacting the provider', async () => {
    mode = 'error';
    const result = await send.execute({
      userId,
      conversationId,
      content: 'How much tax?',
    });
    expect(result.message).toMatchObject({
      content: INSUFFICIENT_EVIDENCE_ANSWER,
      sources: [],
    });
    expect(calls).toBe(0);
  });

  it('failure drill: an answerable document still falls back when retrieval loses it', async () => {
    await addEvidence();
    const missingRetriever = { retrieve: () => Promise.resolve([]) };
    const step = new RagAnswerStep(
      missingRetriever,
      new MockLlmProvider(),
      prisma,
      app.get(ConfigService),
    );
    const result = await step.answer({
      userId,
      conversationId,
      question: 'When are invoices paid?',
    });
    expect(result).toEqual({
      content: INSUFFICIENT_EVIDENCE_ANSWER,
      sources: [],
    });
  });

  it('a sentinel saves the byte-exact fallback with no citations', async () => {
    await addEvidence();
    mode = 'no_evidence';
    const result = await send.execute({
      userId,
      conversationId,
      content: 'When are invoices paid?',
    });
    expect(result.message).toMatchObject({
      content: INSUFFICIENT_EVIDENCE_ANSWER,
      sources: [],
    });
    const stored = await prisma.message.findFirstOrThrow({
      where: { conversationId, role: 'assistant' },
    });
    expect(stored.content).toBe(INSUFFICIENT_EVIDENCE_ANSWER);
    expect(stored.sources).toEqual([]);
  });

  it.each([
    ['timeout', 'AI_TIMEOUT'],
    ['error', 'AI_UNAVAILABLE'],
  ] as const)(
    '%s preserves the question and never fabricates an assistant row',
    async (behavior, code) => {
      await addEvidence();
      mode = behavior;
      await expect(
        send.execute({
          userId,
          conversationId,
          content: 'When are invoices paid?',
        }),
      ).rejects.toMatchObject({ code } satisfies Partial<AppError>);
      expect(
        (await prisma.message.findMany({ where: { conversationId } })).map(
          (row) => row.role,
        ),
      ).toEqual(['user']);
      expect(calls).toBe(behavior === 'timeout' ? 2 : 1);
    },
  );

  it('returns 504 AI_TIMEOUT over HTTP and keeps the question', async () => {
    await addEvidence();
    mode = 'timeout';
    const cookie = `sid=${await app.get(JwtService).signAsync({ sub: userId })}`;
    const response = await request(app.getHttpServer())
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Cookie', cookie)
      .send({ content: 'When are invoices paid?' })
      .expect(504);
    expect((response.body as { code: string }).code).toBe('AI_TIMEOUT');
    expect(
      (await prisma.message.findMany({ where: { conversationId } })).map(
        (row) => row.role,
      ),
    ).toEqual(['user']);
  });
});
