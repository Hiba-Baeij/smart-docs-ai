import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import {
  ANSWER_STEP,
  Answer,
  AnswerInput,
  UnimplementedAnswerStep,
} from './../src/conversations/answer-step';
import { TITLE_MAX_CHARACTERS } from './../src/conversations/conversation-title';
import { ConversationsService } from './../src/conversations/conversations.service';
import {
  MESSAGE_MAX_CHARACTERS,
  SendMessageService,
} from './../src/conversations/send-message.service';
import { AppError } from './../src/common/errors/app-error';
import { PrismaService } from './../src/prisma/prisma.service';
import { resetDatabase } from './support/test-database';
import { TestUser, createUserWithCookie } from './support/users';

/**
 * The write side of chat, below the HTTP layer (the route arrives in Phase 8): what is saved, in
 * which order, and what survives when the answer step fails.
 */
describe('SendMessageService (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let send: SendMessageService;
  let conversations: ConversationsService;
  let sara: TestUser;
  let omar: TestUser;
  let behavior: (input: AnswerInput) => Promise<Answer>;
  let steps: AnswerInput[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ANSWER_STEP)
      .useValue({
        answer: (input: AnswerInput) => {
          steps.push(input);
          return behavior(input);
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    send = app.get(SendMessageService);
    conversations = app.get(ConversationsService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    sara = await createUserWithCookie(app, 'sara');
    omar = await createUserWithCookie(app, 'omar');
    steps = [];
    behavior = () => Promise.resolve({ content: 'an answer', sources: [] });
  });

  afterAll(async () => {
    await app.close();
  });

  const newConversation = (owner: TestUser, title = '') =>
    prisma.conversation.create({ data: { userId: owner.id, title } });

  const messagesOf = (conversationId: string) =>
    prisma.message.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

  const rejection = async (promise: Promise<unknown>): Promise<unknown> => {
    try {
      await promise;
    } catch (error) {
      return error;
    }
    throw new Error('expected a rejection');
  };

  describe('the order of the two writes', () => {
    it('saves the question BEFORE the answer step runs', async () => {
      const conversation = await newConversation(sara);
      let seenDuringAnswer: { role: string; content: string }[] = [];
      behavior = async () => {
        seenDuringAnswer = (await messagesOf(conversation.id)).map((m) => ({
          role: m.role,
          content: m.content,
        }));
        return { content: 'late answer', sources: [] };
      };

      await send.execute({
        userId: sara.id,
        conversationId: conversation.id,
        content: 'What is the notice period?',
      });

      expect(seenDuringAnswer).toEqual([
        { role: 'user', content: 'What is the notice period?' },
      ]);
    });

    it('saves the answer after it, with its sources, and returns both messages', async () => {
      const conversation = await newConversation(sara);
      const sources = [
        {
          documentId: 'd1',
          documentName: 'contract.pdf',
          chunkIndex: 3,
          pageNumber: 4,
          sheetName: null,
        },
      ];
      behavior = () => Promise.resolve({ content: 'Thirty days.', sources });

      const result = await send.execute({
        userId: sara.id,
        conversationId: conversation.id,
        content: 'What is the notice period?',
      });

      expect(result.userMessage).toMatchObject({
        role: 'user',
        content: 'What is the notice period?',
        sources: [],
      });
      expect(result.message).toMatchObject({
        role: 'assistant',
        content: 'Thirty days.',
        sources,
      });
      const stored = await messagesOf(conversation.id);
      expect(stored.map((m) => m.role)).toEqual(['user', 'assistant']);
      expect(stored[1].sources).toEqual(sources);
    });

    it('hands the step the caller, the conversation and the trimmed question', async () => {
      const conversation = await newConversation(sara);

      await send.execute({
        userId: sara.id,
        conversationId: conversation.id,
        content: '  hello  ',
      });

      expect(steps).toEqual([
        { userId: sara.id, conversationId: conversation.id, question: 'hello' },
      ]);
    });
  });

  describe('when the answer step fails', () => {
    it('keeps the question, saves no answer, and passes the error on unchanged', async () => {
      const conversation = await newConversation(sara);
      const failure = new Error('provider down');
      behavior = () => Promise.reject(failure);

      const thrown = await rejection(
        send.execute({
          userId: sara.id,
          conversationId: conversation.id,
          content: 'Will this survive?',
        }),
      );

      expect(thrown).toBe(failure);
      const stored = await messagesOf(conversation.id);
      expect(stored.map((m) => [m.role, m.content])).toEqual([
        ['user', 'Will this survive?'],
      ]);
    });

    it('still titles and moves the conversation: the question was really asked', async () => {
      const conversation = await newConversation(sara);
      behavior = () => Promise.reject(new Error('provider down'));

      await rejection(
        send.execute({
          userId: sara.id,
          conversationId: conversation.id,
          content: 'Will this survive?',
        }),
      );

      const after = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversation.id },
      });
      expect(after.title).toBe('Will this survive?');
      expect(after.updatedAt.getTime()).toBeGreaterThan(
        conversation.updatedAt.getTime(),
      );
    });

    it('moves a conversation that already has a title: the touch is explicit, not a side effect of the title', async () => {
      const conversation = await prisma.conversation.create({
        data: {
          userId: sara.id,
          title: 'Has a title',
          updatedAt: new Date('2026-01-01'),
        },
      });
      behavior = () => Promise.reject(new Error('provider down'));

      await rejection(
        send.execute({
          userId: sara.id,
          conversationId: conversation.id,
          content: 'another question',
        }),
      );

      const after = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversation.id },
      });
      expect(after.title).toBe('Has a title');
      expect(after.updatedAt.getTime()).toBeGreaterThan(
        new Date('2026-01-01').getTime(),
      );
    });

    it('with the answer step that is wired until Phase 8, never makes up an assistant message', async () => {
      const unimplemented = new SendMessageService(
        prisma,
        new UnimplementedAnswerStep(),
      );
      const conversation = await newConversation(sara);

      const thrown = await rejection(
        unimplemented.execute({
          userId: sara.id,
          conversationId: conversation.id,
          content: 'Anyone there?',
        }),
      );

      expect(thrown).toBeInstanceOf(Error);
      expect((await messagesOf(conversation.id)).map((m) => m.role)).toEqual([
        'user',
      ]);
    });

    it('a retry after a failure adds a second question; nothing is deduplicated or lost', async () => {
      const conversation = await newConversation(sara);
      behavior = () => Promise.reject(new Error('down'));
      await rejection(
        send.execute({
          userId: sara.id,
          conversationId: conversation.id,
          content: 'again',
        }),
      );
      behavior = () =>
        Promise.resolve({ content: 'now it works', sources: [] });

      await send.execute({
        userId: sara.id,
        conversationId: conversation.id,
        content: 'again',
      });

      expect((await messagesOf(conversation.id)).map((m) => m.role)).toEqual([
        'user',
        'user',
        'assistant',
      ]);
    });
  });

  describe('the question is validated before anything is written', () => {
    it.each([
      ['empty', ''],
      ['only whitespace', '  \n\t '],
      ['not text', 42 as unknown as string],
      ['over 4000 characters', 'x'.repeat(MESSAGE_MAX_CHARACTERS + 1)],
    ])(
      'rejects a question that is %s: 422, no row, the step never runs',
      async (_label, content) => {
        const conversation = await newConversation(sara);

        const thrown = (await rejection(
          send.execute({
            userId: sara.id,
            conversationId: conversation.id,
            content,
          }),
        )) as AppError;

        expect(thrown).toBeInstanceOf(AppError);
        expect(thrown.code).toBe('VALIDATION_FAILED');
        expect(thrown.details).toHaveProperty('content');
        expect(await prisma.message.count()).toBe(0);
        expect(steps).toEqual([]);
      },
    );

    it('accepts exactly 4000 characters, counted as characters and not as UTF-16 units', async () => {
      const conversation = await newConversation(sara);
      const emoji = '👋'.repeat(MESSAGE_MAX_CHARACTERS); // 8000 UTF-16 units, 4000 characters

      await send.execute({
        userId: sara.id,
        conversationId: conversation.id,
        content: emoji,
      });

      expect((await messagesOf(conversation.id))[0].content).toBe(emoji);
    });

    it('does not count the whitespace around the question', async () => {
      const conversation = await newConversation(sara);

      await send.execute({
        userId: sara.id,
        conversationId: conversation.id,
        content: `  ${'x'.repeat(MESSAGE_MAX_CHARACTERS)}  `,
      });

      expect(await prisma.message.count({ where: { role: 'user' } })).toBe(1);
    });
  });

  describe("another user's conversation (the failure drill)", () => {
    it('is 404 and creates no message row, no touch, and never reaches the answer step', async () => {
      const foreign = await newConversation(omar, 'omar private');

      const thrown = (await rejection(
        send.execute({
          userId: sara.id,
          conversationId: foreign.id,
          content: 'let me in',
        }),
      )) as AppError;

      expect(thrown.code).toBe('CONVERSATION_NOT_FOUND');
      expect(await prisma.message.count()).toBe(0);
      expect(steps).toEqual([]);
      const untouched = await prisma.conversation.findUniqueOrThrow({
        where: { id: foreign.id },
      });
      expect(untouched.title).toBe('omar private');
      expect(untouched.updatedAt.getTime()).toBe(foreign.updatedAt.getTime());
    });

    it('is the same 404 for a conversation that does not exist', async () => {
      const thrown = (await rejection(
        send.execute({
          userId: sara.id,
          conversationId: '00000000-0000-7000-8000-000000000000',
          content: 'hi',
        }),
      )) as AppError;

      expect(thrown.code).toBe('CONVERSATION_NOT_FOUND');
    });
  });

  describe('the title', () => {
    it('is the first question, shortened, when the conversation has none', async () => {
      const conversation = await newConversation(sara);
      const question = `${'long question '.repeat(10)}end`;

      await send.execute({
        userId: sara.id,
        conversationId: conversation.id,
        content: question,
      });

      const after = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversation.id },
      });
      expect(Array.from(after.title).length).toBeLessThanOrEqual(
        TITLE_MAX_CHARACTERS + 1,
      );
      expect(after.title.endsWith('…')).toBe(true);
      expect(question.startsWith(after.title.slice(0, 20))).toBe(true);
    });

    it('is set once: a second question does not change it', async () => {
      const conversation = await newConversation(sara);
      await send.execute({
        userId: sara.id,
        conversationId: conversation.id,
        content: 'first question',
      });

      await send.execute({
        userId: sara.id,
        conversationId: conversation.id,
        content: 'second question',
      });

      const after = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversation.id },
      });
      expect(after.title).toBe('first question');
    });

    it('is never replaced when the person gave one', async () => {
      const conversation = await newConversation(sara, 'My own title');

      await send.execute({
        userId: sara.id,
        conversationId: conversation.id,
        content: 'a question',
      });

      const after = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversation.id },
      });
      expect(after.title).toBe('My own title');
    });
  });

  describe('updatedAt and the order of the list', () => {
    it('moves a conversation to the top when a message is added to it', async () => {
      const older = await prisma.conversation.create({
        data: {
          userId: sara.id,
          title: 'older',
          updatedAt: new Date('2026-01-01'),
        },
      });
      await prisma.conversation.create({
        data: {
          userId: sara.id,
          title: 'newer',
          updatedAt: new Date('2026-06-01'),
        },
      });
      const before = await conversations.list(sara.id, {
        page: 1,
        pageSize: 20,
      });
      expect(before.items.map((c) => c.title)).toEqual(['newer', 'older']);

      await send.execute({
        userId: sara.id,
        conversationId: older.id,
        content: 'bump',
      });

      const after = await conversations.list(sara.id, {
        page: 1,
        pageSize: 20,
      });
      expect(after.items[0].id).toBe(older.id);
    });

    it('is touched again when the answer is saved', async () => {
      const conversation = await newConversation(sara);
      let afterQuestion = new Date(0);
      behavior = async () => {
        afterQuestion = (
          await prisma.conversation.findUniqueOrThrow({
            where: { id: conversation.id },
          })
        ).updatedAt;
        await new Promise((resolve) => setTimeout(resolve, 15));
        return { content: 'a', sources: [] };
      };

      await send.execute({
        userId: sara.id,
        conversationId: conversation.id,
        content: 'q',
      });

      const final = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversation.id },
      });
      expect(final.updatedAt.getTime()).toBeGreaterThan(
        afterQuestion.getTime(),
      );
    });
  });

  describe('a conversation deleted while its answer is being produced', () => {
    it('is a 404, and no assistant message is left behind', async () => {
      const conversation = await newConversation(sara);
      behavior = async () => {
        await conversations.remove(sara.id, conversation.id);
        return { content: 'too late', sources: [] };
      };

      const thrown = (await rejection(
        send.execute({
          userId: sara.id,
          conversationId: conversation.id,
          content: 'q',
        }),
      )) as AppError;

      expect(thrown.code).toBe('CONVERSATION_NOT_FOUND');
      expect(await prisma.message.count()).toBe(0);
    });
  });
});
