// Reads docs/plan/traceability.md and checks every FR/NFR row (task 12.3, NFR-06):
//  - the row names at least one test file, and every test file it names exists;
//  - every document it cites exists.
// Exit code 1 when any row has a problem. Run with `npm run audit:traceability`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// An optional argument names another table: the test uses it to prove the audit can fail.
const table = process.argv[2] ?? path.join(root, 'docs/plan/traceability.md');
const text = fs.readFileSync(table, 'utf8');

const SKIPPED = new Set(['node_modules', 'dist', '.angular', 'generated', 'test-results']);

function walk(directory, out = []) {
  if (!fs.existsSync(directory)) {
    return out;
  }
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (SKIPPED.has(entry.name)) {
      continue;
    }
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

const codeFiles = ['apps', 'packages', 'e2e', 'scripts'].flatMap((dir) => walk(path.join(root, dir)));
const fileNames = new Set(codeFiles.map((file) => path.basename(file)));
const documents = walk(path.join(root, 'docs')).map((file) =>
  path.relative(path.join(root, 'docs'), file).split(path.sep).join('/'),
);

const TEST_FILE = /`([^`]+\.(?:e2e-spec\.ts|spec\.ts|test\.mjs))`/g;

let problems = 0;
const rows = text.split('\n').filter((line) => /^\| (FR|NFR)-\d+/.test(line));

for (const row of rows) {
  const cells = row.split('|').map((cell) => cell.trim());
  const [id, documentCell, phase, testCell] = [cells[1], cells[2], cells[3], cells[4]];
  const tests = [...testCell.matchAll(TEST_FILE)].map((match) => path.basename(match[1]));
  const missing = tests.filter((name) => !fileNames.has(name));

  if (tests.length === 0) {
    problems++;
    console.log(`${id} (phase ${phase}): names no test file: ${testCell.slice(0, 80)}`);
  }
  if (missing.length > 0) {
    problems++;
    console.log(`${id} (phase ${phase}): the test file does not exist: ${missing.join(', ')}`);
  }

  for (const [, reference] of documentCell.matchAll(/`([^`]+)`/g)) {
    const head = reference.split(' ')[0].replace(/\/$/, '').replace(/^docs\//, '');
    const found = documents.some(
      (file) =>
        file === head ||
        file.endsWith(`/${head}`) ||
        path.basename(file).startsWith(head) ||
        // The table abbreviates a numbered guide: `tracks/ai/04` is tracks/ai/04-....md.
        file.startsWith(`${head}-`),
    );
    if (!found) {
      problems++;
      console.log(`${id}: the document does not exist: ${reference}`);
    }
  }
}

console.log(`${rows.length} rows checked, ${problems} problems`);
process.exit(problems === 0 ? 0 : 1);
