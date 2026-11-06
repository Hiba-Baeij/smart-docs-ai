import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { getTestDatabaseUrl } from './support/test-database';

/**
 * Runs once before the whole e2e run (jest `globalSetup`). The test bootstrap owns the test
 * database: it applies every committed migration to `*_test`, so a fresh clone or a reset
 * volume needs no manual step. `migrate deploy` only applies existing migrations; it never
 * creates or resets anything.
 */
export default function globalSetup(): void {
  const url = getTestDatabaseUrl();

  execSync('npx --no-install prisma migrate deploy', {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
