import { TestingModule } from '@nestjs/testing';
import { ChunkSearchService } from './../src/search/chunk-search.service';
import {
  CHUNK_RETRIEVER,
  type ChunkRetriever,
} from './../src/search/chunk-retriever';
import { SearchModule } from './../src/search/search.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { createPrismaTestModule } from './support/prisma-test-module';
import { resetDatabase } from './support/test-database';

/**
 * Retrieval is the one query that reads other people's data by design, so the tests are about
 * what must never come back as much as what must.
 */
describe('ChunkSearchService (e2e)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let search: ChunkSearchService;
  let retriever: ChunkRetriever;
  let sara: string;
  let omar: string;

  beforeAll(async () => {
    ({ moduleRef, prisma } = await createPrismaTestModule([SearchModule]));
    search = moduleRef.get(ChunkSearchService);
    retriever = moduleRef.get(CHUNK_RETRIEVER);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    sara = (await createUser('sara@example.com')).id;
    omar = (await createUser('omar@example.com')).id;
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  const createUser = (email: string) =>
    prisma.user.create({
      data: { name: email, email, passwordHash: 'not-a-real-hash' },
    });

  async function addDocument(
    userId: string,
    name: string,
    chunks: { content: string; pageNumber?: number; sheetName?: string }[],
    status: 'COMPLETED' | 'FAILED' | 'PROCESSING' = 'COMPLETED',
    createdAt?: Date,
  ) {
    const document = await prisma.document.create({
      data: {
        originalName: name,
        fileType: 'pdf',
        extractedText: 'text',
        status,
        uploadedBy: userId,
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

  const ask = (userId: string, question: string, limit = 6) =>
    search.search({ userId, question, limit });

  describe('a question about a known term', () => {
    it('returns the chunk that holds it, first, with its citation fields', async () => {
      const document = await addDocument(sara, 'handbook.pdf', [
        { content: 'Office hours are nine to five.', pageNumber: 1 },
        {
          content: 'Invoices are paid within thirty days of receipt.',
          pageNumber: 4,
        },
        { content: 'The cafeteria opens at noon.', pageNumber: 5 },
      ]);

      const hits = await ask(sara, 'When are invoices paid?');

      expect(hits).toHaveLength(1);
      expect(hits[0]).toMatchObject({
        documentId: document.id,
        documentName: 'handbook.pdf',
        chunkIndex: 1,
        pageNumber: 4,
        sheetName: null,
        content: 'Invoices are paid within thirty days of receipt.',
      });
      expect(hits[0].score).toBeGreaterThan(0);
    });

    it('finds Arabic text however the word is spelled: hamza, article, diacritics', async () => {
      await addDocument(sara, 'سياسة.pdf', [
        { content: 'تُسدَّد الفواتير خلال ثلاثين يوماً.' },
        { content: 'يعمل أحمد في الشركة.' },
        { content: 'لا علاقة لهذا النص بالسؤال.' },
      ]);

      const invoices = await ask(sara, 'متى يجب سداد الفواتير؟');
      const ahmad = await ask(sara, 'أين يعمل احمد؟');

      expect(invoices.map((hit) => hit.chunkIndex)).toEqual([0]);
      expect(ahmad.map((hit) => hit.chunkIndex)).toEqual([1]);
    });

    it('KNOWN LIMIT: a bare word does not match the same word with the article (a stemmer quirk)', async () => {
      // The arabic stemmer strips the article (الفواتير becomes فواتير) but also a leading ف, so the
      // bare فواتير becomes واتير and no longer matches. If this starts to fail after a PostgreSQL
      // upgrade, the stemmer changed and ADR-004 should be re-measured.
      await addDocument(sara, 'a.pdf', [
        { content: 'تُسدَّد الفواتير شهرياً.' },
      ]);

      expect(await ask(sara, 'فواتير')).toEqual([]);
      expect(await ask(sara, 'الفواتير')).toHaveLength(1);
    });

    it('finds a chunk with a verbose question: stop words do not have to match', async () => {
      await addDocument(sara, 'a.pdf', [
        { content: 'Passwords must be changed every ninety days.' },
      ]);

      const hits = await ask(
        sara,
        'Could you please tell me how often the passwords must be changed?',
      );

      expect(hits).toHaveLength(1);
    });

    it('ranks the chunk that matches more of the question higher', async () => {
      await addDocument(sara, 'a.pdf', [
        { content: 'Travel is booked in economy class.' },
        { content: 'Travel expenses are reimbursed with receipts.' },
        {
          content:
            'Travel expenses need approval, and receipts must be original.',
        },
      ]);

      const hits = await ask(sara, 'travel expenses receipts approval');

      expect(hits[0].chunkIndex).toBe(2);
      expect(hits.map((hit) => hit.chunkIndex)).toEqual([2, 1, 0]);
    });

    it('breaks a tie by recency: the newer document first', async () => {
      const text = [{ content: 'Warranty lasts twelve months.' }];
      const older = await addDocument(
        sara,
        'old.pdf',
        text,
        'COMPLETED',
        new Date('2026-01-01'),
      );
      const newer = await addDocument(
        sara,
        'new.pdf',
        text,
        'COMPLETED',
        new Date('2026-06-01'),
      );

      const hits = await ask(sara, 'warranty');

      expect(hits.map((hit) => hit.documentId)).toEqual([newer.id, older.id]);
    });

    it('returns at most the limit', async () => {
      await addDocument(
        sara,
        'a.pdf',
        Array.from({ length: 10 }, (_, i) => ({ content: `Policy item ${i}` })),
      );

      expect(await ask(sara, 'policy', 3)).toHaveLength(3);
    });
  });

  describe('what must never come back', () => {
    it("another user's chunk, even when it matches best", async () => {
      await addDocument(omar, 'secret.pdf', [
        {
          content: 'The merger codename is Falcon. The merger codename again.',
        },
      ]);
      await addDocument(sara, 'mine.pdf', [
        { content: 'The cafeteria menu changes weekly.' },
      ]);

      const hits = await ask(sara, 'merger codename');

      expect(hits).toEqual([]);
    });

    it('and the other way round: each user sees only their own', async () => {
      await addDocument(sara, 'sara.pdf', [{ content: 'Shared phrase alpha' }]);
      await addDocument(omar, 'omar.pdf', [{ content: 'Shared phrase alpha' }]);

      const forSara = await ask(sara, 'alpha');
      const forOmar = await ask(omar, 'alpha');

      expect(forSara.map((hit) => hit.documentName)).toEqual(['sara.pdf']);
      expect(forOmar.map((hit) => hit.documentName)).toEqual(['omar.pdf']);
    });

    it.each(['FAILED', 'PROCESSING'] as const)(
      'a chunk of a %s document',
      async (status) => {
        await addDocument(
          sara,
          'unfinished.pdf',
          [{ content: 'Leftover text about warranty' }],
          status,
        );

        expect(await ask(sara, 'warranty')).toEqual([]);
      },
    );

    it('anything for a user who owns nothing, or an id that is not a user', async () => {
      await addDocument(sara, 'a.pdf', [{ content: 'warranty' }]);

      expect(await ask('', 'warranty')).toEqual([]);
      expect(await ask('no-such-user', 'warranty')).toEqual([]);
    });
  });

  describe('hostile or odd questions', () => {
    it('are data: quotes, operators and SQL do nothing but fail to match', async () => {
      await addDocument(sara, 'a.pdf', [{ content: 'warranty twelve months' }]);
      const questions = [
        `'; DROP TABLE "Document"; --`,
        `" OR 1=1 --`,
        'warranty & !twelve | (months',
        '-warranty "unterminated',
        `\\' UNION SELECT * FROM "User" --`,
      ];

      for (const question of questions) {
        await expect(ask(sara, question)).resolves.toBeInstanceOf(Array);
      }

      expect(await prisma.document.count()).toBe(1);
      expect(await prisma.user.count()).toBe(2);
    });

    it('a question of only stop words or punctuation returns nothing and does not fail', async () => {
      await addDocument(sara, 'a.pdf', [{ content: 'what is the' }]);

      expect(await ask(sara, 'What is the?')).toEqual([]);
      expect(await ask(sara, '')).toEqual([]);
      expect(await ask(sara, '؟؟ !!')).toEqual([]);
    });

    it.each([0, -1, 101, 1.5, Number.NaN])(
      'refuses a limit of %s',
      async (limit) => {
        await expect(ask(sara, 'warranty', limit)).rejects.toThrow(RangeError);
      },
    );
  });

  describe('the types', () => {
    it('refuse a search without a user id', () => {
      // Never called: the point is that this does not compile without the directive below.
      const withoutUser = () =>
        // @ts-expect-error userId is required: there is no way to search every user's chunks.
        search.search({ question: 'warranty', limit: 6 });

      expect(withoutUser).toBeInstanceOf(Function);
    });

    it('requires an owner through the port and filters other users at runtime', async () => {
      await addDocument(omar, 'private.pdf', [
        { content: 'Unique merger codename Falcon.' },
      ]);
      expect(
        await retriever.retrieve({
          userId: sara,
          question: 'merger codename',
          limit: 6,
        }),
      ).toEqual([]);
      const withoutUser = () =>
        // @ts-expect-error the retriever cannot be called without userId.
        retriever.retrieve({ question: 'merger', limit: 6 });
      expect(withoutUser).toBeInstanceOf(Function);
    });
  });
});
