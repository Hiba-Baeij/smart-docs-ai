import 'dotenv/config';
import { PrismaClient } from '../../src/generated/prisma/client';

/**
 * The only way a test learns which database to use (ADR-014). It throws unless
 * TEST_DATABASE_URL is set and names a database ending in `_test`, so no test can ever
 * reach the development database by accident.
 */
export function getTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;

  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Integration tests need a dedicated database.',
    );
  }

  const databaseName = new URL(url).pathname.replace(/^\//, '');

  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests: TEST_DATABASE_URL points at "${databaseName}", which does not end in "_test".`,
    );
  }

  return url;
}

/**
 * Empties every table so a test can never pass on leftover rows. Table names are fixed
 * constants, so the unsafe raw call carries no user input.
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Message", "Conversation", "DocumentChunk", "Document", "User" RESTART IDENTITY CASCADE',
  );
}
