import { TestingModule } from '@nestjs/testing';
import { PrismaService } from './../src/prisma/prisma.service';
import { createPrismaTestModule } from './support/prisma-test-module';
import { resetDatabase } from './support/test-database';

/**
 * Cascade behaviour is asserted, not assumed from schema syntax (ADR-003, persistence guide §8).
 */
describe('Schema cascade rules (e2e)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ moduleRef, prisma } = await createPrismaTestModule());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  const createUser = (email: string) =>
    prisma.user.create({
      data: { name: 'Test User', email, passwordHash: 'not-a-real-hash' },
    });

  async function createDocumentWithChunks(userId: string, chunkCount: number) {
    const document = await prisma.document.create({
      data: {
        originalName: 'sample.pdf',
        fileType: 'pdf',
        extractedText: 'sample text',
        status: 'COMPLETED',
        uploadedBy: userId,
      },
    });
    await prisma.documentChunk.createMany({
      data: Array.from({ length: chunkCount }, (_, chunkIndex) => ({
        documentId: document.id,
        chunkIndex,
        content: `chunk ${chunkIndex}`,
      })),
    });
    return document;
  }

  async function createConversationWithMessages(
    userId: string,
    messageCount: number,
  ) {
    const conversation = await prisma.conversation.create({
      data: { userId, title: 'A conversation' },
    });
    await prisma.message.createMany({
      data: Array.from({ length: messageCount }, (_, index) => ({
        conversationId: conversation.id,
        role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
        content: `message ${index}`,
      })),
    });
    return conversation;
  }

  it('deleting a document deletes its chunks and only its chunks', async () => {
    const user = await createUser('a@example.com');
    const doomed = await createDocumentWithChunks(user.id, 3);
    const survivor = await createDocumentWithChunks(user.id, 2);

    await prisma.document.delete({ where: { id: doomed.id } });

    expect(
      await prisma.documentChunk.count({ where: { documentId: doomed.id } }),
    ).toBe(0);
    expect(
      await prisma.documentChunk.count({ where: { documentId: survivor.id } }),
    ).toBe(2);
  });

  it('deleting a conversation deletes its messages and only its messages', async () => {
    const user = await createUser('a@example.com');
    const doomed = await createConversationWithMessages(user.id, 4);
    const survivor = await createConversationWithMessages(user.id, 2);

    await prisma.conversation.delete({ where: { id: doomed.id } });

    expect(
      await prisma.message.count({ where: { conversationId: doomed.id } }),
    ).toBe(0);
    expect(
      await prisma.message.count({ where: { conversationId: survivor.id } }),
    ).toBe(2);
  });

  it('deleting a user deletes everything they own and nothing of another user', async () => {
    const leaving = await createUser('leaving@example.com');
    const staying = await createUser('staying@example.com');
    await createDocumentWithChunks(leaving.id, 3);
    await createConversationWithMessages(leaving.id, 2);
    const stayingDocument = await createDocumentWithChunks(staying.id, 2);
    const stayingConversation = await createConversationWithMessages(
      staying.id,
      1,
    );

    await prisma.user.delete({ where: { id: leaving.id } });

    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.document.count()).toBe(1);
    expect(await prisma.documentChunk.count()).toBe(2);
    expect(await prisma.conversation.count()).toBe(1);
    expect(await prisma.message.count()).toBe(1);
    expect(
      await prisma.document.count({ where: { id: stayingDocument.id } }),
    ).toBe(1);
    expect(
      await prisma.conversation.count({
        where: { id: stayingConversation.id },
      }),
    ).toBe(1);
  });

  it('keeps a conversation and its citation after the cited document is deleted', async () => {
    const user = await createUser('a@example.com');
    const document = await createDocumentWithChunks(user.id, 2);
    const conversation = await prisma.conversation.create({
      data: { userId: user.id, title: 'Cites a document' },
    });
    const sources = [
      {
        documentId: document.id,
        documentName: 'sample.pdf',
        chunkIndex: 0,
        pageNumber: 1,
        sheetName: null,
      },
    ];
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: 'An answer with a citation.',
        sources,
      },
    });

    await prisma.document.delete({ where: { id: document.id } });

    // The content is gone...
    expect(
      await prisma.documentChunk.count({ where: { documentId: document.id } }),
    ).toBe(0);
    // ...but the conversation, the message and the stored citation remain.
    expect(
      await prisma.conversation.count({ where: { id: conversation.id } }),
    ).toBe(1);
    const message = await prisma.message.findFirstOrThrow({
      where: { conversationId: conversation.id },
    });
    expect(message.sources).toEqual(sources);
  });
});
