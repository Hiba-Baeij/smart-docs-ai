import { TestingModule } from '@nestjs/testing';
import { PrismaService } from './../src/prisma/prisma.service';
import { createPrismaTestModule } from './support/prisma-test-module';
import { resetDatabase } from './support/test-database';

/**
 * Constraints are asserted by trying to break them (persistence guide §8). Prisma reports a
 * unique violation as error code P2002.
 */
describe('Schema constraints (e2e)', () => {
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

  async function createDocument(userId: string) {
    return prisma.document.create({
      data: {
        originalName: 'sample.pdf',
        fileType: 'pdf',
        extractedText: 'sample text',
        status: 'COMPLETED',
        uploadedBy: userId,
      },
    });
  }

  async function setUp() {
    const user = await prisma.user.create({
      data: {
        name: 'Test User',
        email: 'a@example.com',
        passwordHash: 'not-a-real-hash',
      },
    });
    return { user, document: await createDocument(user.id) };
  }

  it('rejects a second chunk with the same (documentId, chunkIndex)', async () => {
    const { document } = await setUp();
    await prisma.documentChunk.create({
      data: { documentId: document.id, chunkIndex: 0, content: 'first' },
    });

    await expect(
      prisma.documentChunk.create({
        data: { documentId: document.id, chunkIndex: 0, content: 'second' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    expect(
      await prisma.documentChunk.count({ where: { documentId: document.id } }),
    ).toBe(1);
  });

  it('allows the same chunkIndex in a different document', async () => {
    const { user, document } = await setUp();
    const other = await createDocument(user.id);

    await prisma.documentChunk.create({
      data: {
        documentId: document.id,
        chunkIndex: 0,
        content: 'in document 1',
      },
    });
    await prisma.documentChunk.create({
      data: { documentId: other.id, chunkIndex: 0, content: 'in document 2' },
    });

    expect(await prisma.documentChunk.count()).toBe(2);
  });

  it('writes nothing when one chunk in a batch breaks the constraint', async () => {
    const { document } = await setUp();

    await expect(
      prisma.documentChunk.createMany({
        data: [
          { documentId: document.id, chunkIndex: 0, content: 'a' },
          { documentId: document.id, chunkIndex: 1, content: 'b' },
          { documentId: document.id, chunkIndex: 1, content: 'duplicate' },
        ],
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    expect(
      await prisma.documentChunk.count({ where: { documentId: document.id } }),
    ).toBe(0);
  });
});
