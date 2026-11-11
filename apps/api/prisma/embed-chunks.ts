/**
 * Adds the missing embeddings (ADR-018): every chunk whose `embedding` is NULL, because it was
 * stored before semantic retrieval existed, by the seed, or while the provider was down.
 *
 *   npm run db:embed -w api
 *
 * Safe to run again: it only touches chunks that still have no embedding. Uses the same provider
 * selection as the application (mock embeddings with LLM_PROVIDER=mock).
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';
import {
  toEmbeddingLiteral,
  type EmbeddingProvider,
} from '../src/ai/embedding-provider';
import { MockEmbeddingProvider } from '../src/ai/mock-embedding.provider';
import {
  EMBEDDING_BATCH_SIZE,
  OpenAiCompatibleEmbeddingProvider,
} from '../src/ai/openai-compatible-embedding.provider';

function providerFromEnv(): EmbeddingProvider {
  const env = process.env;
  if (env.LLM_PROVIDER !== 'openai') return new MockEmbeddingProvider();
  if (!env.EMBEDDING_MODEL || !env.LLM_BASE_URL || !env.LLM_API_KEY) {
    throw new Error(
      'Set EMBEDDING_MODEL, LLM_BASE_URL and LLM_API_KEY to add embeddings with the openai provider.',
    );
  }
  return new OpenAiCompatibleEmbeddingProvider(
    env.LLM_BASE_URL,
    env.LLM_API_KEY,
    env.EMBEDDING_MODEL,
  );
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set.');
  const provider = providerFromEnv();
  const timeoutMs = Number(process.env.EMBEDDING_TIMEOUT_MS ?? 10_000) * 3;
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    let done = 0;
    for (;;) {
      const batch = await prisma.$queryRaw<{ id: string; content: string }[]>(
        Prisma.sql`SELECT id, content FROM "DocumentChunk"
                    WHERE embedding IS NULL
                    ORDER BY id
                    LIMIT ${EMBEDDING_BATCH_SIZE}`,
      );
      if (batch.length === 0) break;
      const vectors = await provider.embed(
        batch.map((chunk) => chunk.content),
        timeoutMs,
      );
      await prisma.$executeRaw(Prisma.sql`
        UPDATE "DocumentChunk" AS c
           SET embedding = v.embedding::real[]
          FROM unnest(
                 ${batch.map((chunk) => chunk.id)}::text[],
                 ${vectors.map(toEmbeddingLiteral)}::text[]
               ) AS v(id, embedding)
         WHERE c.id = v.id`);
      done += batch.length;
      console.log(`Embedded ${done} chunk(s)...`);
    }
    console.log(`Done: ${done} chunk(s) embedded.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const code =
    error instanceof Error && 'code' in error ? ` (${String(error.code)})` : '';
  console.error(
    `Embedding failed${code}: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
