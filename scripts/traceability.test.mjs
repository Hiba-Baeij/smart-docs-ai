// Run with `npm run audit:traceability` (which runs the audit) or `node --test scripts/`.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const audit = join(root, 'scripts', 'audit-traceability.mjs');

const run = (table) =>
  spawnSync(process.execPath, table ? [audit, table] : [audit], { cwd: root, encoding: 'utf8' });

function tableWith(...rows) {
  const file = join(mkdtempSync(join(tmpdir(), 'traceability-')), 'traceability.md');
  writeFileSync(file, ['| ID | Primary doc | Phase | Test |', '|---|---|---|---|', ...rows].join('\n'));
  return file;
}

describe('the traceability audit (a check that cannot fail proves nothing)', () => {
  it('fails a row whose test file does not exist', () => {
    const result = run(tableWith('| FR-99 | `plan/traceability.md` | 1 | `no-such-file.e2e-spec.ts` |'));

    assert.equal(result.status, 1);
    assert.match(result.stdout, /FR-99.*does not exist: no-such-file\.e2e-spec\.ts/);
  });

  it('fails a row that names no test file at all', () => {
    const result = run(tableWith('| FR-98 | `plan/traceability.md` | 1 | a manual check |'));

    assert.equal(result.status, 1);
    assert.match(result.stdout, /FR-98.*names no test file/);
  });

  it('fails a row that cites a document that does not exist', () => {
    const result = run(tableWith('| FR-97 | `no/such/document.md` | 1 | `ownership.e2e-spec.ts` |'));

    assert.equal(result.status, 1);
    assert.match(result.stdout, /FR-97: the document does not exist/);
  });

  it('passes a row whose tests and documents exist', () => {
    const result = run(tableWith('| FR-96 | `plan/traceability.md` | 1 | `ownership.e2e-spec.ts`, `journey.spec.ts` |'));

    assert.equal(result.status, 0, result.stdout);
  });
});

describe('docs/plan/traceability.md', () => {
  it('has a document, a phase and an existing test for every requirement', () => {
    const result = run();

    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /42 rows checked, 0 problems/);
  });
});
