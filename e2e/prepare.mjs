// Gets the machine ready for the browser journey, then exits. Playwright runs it as the first half of
// the API's start command, so the database exists, is empty and is migrated BEFORE the API connects.
//
// It recreates a dedicated database, `smartdocs_e2e`, every run: the journey must start from an empty
// one (docs/plan/implementation-plan.md, task 12.1), and it must never touch the development or
// the test database. The name is checked, not trusted.
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const adminUrl = process.env.E2E_ADMIN_DATABASE_URL ?? 'postgresql://smartdocs:smartdocs@localhost:5433/postgres';
const databaseUrl = process.env.E2E_DATABASE_URL ?? 'postgresql://smartdocs:smartdocs@localhost:5433/smartdocs_e2e';

const name = new URL(databaseUrl).pathname.slice(1);
if (!/^[a-z0-9_]+_e2e$/.test(name)) {
  throw new Error(`Refusing to recreate "${name}": the end-to-end database must be named *_e2e.`);
}

const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
try {
  // The name was validated above, so interpolating it is safe; identifiers cannot be bound.
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
} finally {
  await admin.end();
}

const run = (command, args, options = {}) =>
  execFileSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', ...options });

run('npm', ['run', 'build:contracts']);
run('npm', ['run', 'build', '-w', 'api']);
run('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: join(root, 'apps', 'api'),
  env: { ...process.env, DATABASE_URL: databaseUrl },
});

console.log(`e2e database "${name}" is empty and migrated`);
