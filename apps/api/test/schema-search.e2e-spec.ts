import { TestingModule } from '@nestjs/testing';
import { PrismaService } from './../src/prisma/prisma.service';
import { createPrismaTestModule } from './support/prisma-test-module';
import { resetDatabase } from './support/test-database';

/**
 * The search column and its index come from a raw SQL migration (ADR-004), so nothing in the
 * Prisma schema proves they exist. This does, against the database the migrations built.
 */
describe('Search column and index (e2e)', () => {
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

  it('has the extensions the spike compares', async () => {
    const rows = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname IN ('unaccent', 'pg_trgm')`;

    expect(rows.map((row) => row.extname).sort()).toEqual([
      'pg_trgm',
      'unaccent',
    ]);
  });

  it('has a generated tsvector column and a GIN index on it', async () => {
    const [column] = await prisma.$queryRaw<
      { data_type: string; is_generated: string }[]
    >`
      SELECT data_type, is_generated FROM information_schema.columns
      WHERE table_name = 'DocumentChunk' AND column_name = 'search_vector'`;
    const [index] = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'DocumentChunk' AND indexname = 'document_chunk_search_idx'`;

    expect(column).toEqual({ data_type: 'tsvector', is_generated: 'ALWAYS' });
    expect(index.indexdef).toMatch(/USING gin \(search_vector\)/);
  });

  it('fills the column from the content by itself, and refuses a direct write', async () => {
    const user = await prisma.user.create({
      data: { name: 'T', email: 't@example.com', passwordHash: 'x' },
    });
    const document = await prisma.document.create({
      data: {
        originalName: 'a.pdf',
        fileType: 'pdf',
        extractedText: 'x',
        status: 'COMPLETED',
        uploadedBy: user.id,
      },
    });
    await prisma.documentChunk.create({
      data: {
        documentId: document.id,
        chunkIndex: 0,
        content: 'Invoices are due within thirty days',
      },
    });

    const [match] = await prisma.$queryRaw<{ found: boolean; miss: boolean }[]>`
      SELECT search_vector @@ websearch_to_tsquery('simple', 'thirty') AS found,
             search_vector @@ websearch_to_tsquery('simple', 'refund') AS miss
      FROM "DocumentChunk"`;
    expect(match).toEqual({ found: true, miss: false });

    await expect(
      prisma.$executeRaw`UPDATE "DocumentChunk" SET search_vector = to_tsvector('simple', 'x')`,
    ).rejects.toThrow();
  });

  it('is built with the arabic configuration (the spike result), which folds alef variants and the article', async () => {
    const user = await prisma.user.create({
      data: { name: 'T', email: 't2@example.com', passwordHash: 'x' },
    });
    const document = await prisma.document.create({
      data: {
        originalName: 'a.pdf',
        fileType: 'pdf',
        extractedText: 'x',
        status: 'COMPLETED',
        uploadedBy: user.id,
      },
    });
    await prisma.documentChunk.create({
      data: {
        documentId: document.id,
        chunkIndex: 0,
        content: 'يعمل أحمد في الشركة وتُسدَّد الفواتير شهرياً',
      },
    });

    const [match] = await prisma.$queryRaw<
      { alef: boolean; article: boolean }[]
    >`
      SELECT search_vector @@ websearch_to_tsquery('arabic', 'احمد') AS alef,
             search_vector @@ websearch_to_tsquery('arabic', 'الفواتير') AS article
      FROM "DocumentChunk"`;

    // Under 'simple' both would be false: أحمد is not احمد, and الفواتير is not فواتير.
    expect(match).toEqual({ alef: true, article: true });
  });
});
