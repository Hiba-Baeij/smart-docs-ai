// What can be checked mechanically about "the documentation matches the code" (NFR-10).
// It cannot judge whether an explanation is still correct; it can prove that the commands, paths and
// URLs the documents tell a reader to use exist. Run with `node --test scripts/docs-truth.test.mjs`.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = join(root, 'docs');

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      return markdownFiles(full);
    }
    return entry.name.endsWith('.md') ? [full] : [];
  });
}

const posix = (file) => relative(root, file).split(sep).join('/');

/** Progress logs and design specs record history, which was true when written; they are not instructions. */
const isHistory = (file) => /docs\/(plan\/progress|superpowers)\//.test(posix(file));
const living = [...markdownFiles(docsRoot), join(root, 'README.md')].filter(
  (file) => existsSync(file) && !isHistory(file),
);

const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const workspaces = new Map();
for (const group of ['apps', 'packages']) {
  for (const name of readdirSync(join(root, group))) {
    const manifest = join(root, group, name, 'package.json');
    if (existsSync(manifest)) {
      const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
      workspaces.set(pkg.name, pkg.scripts ?? {});
      workspaces.set(`${group}/${name}`, pkg.scripts ?? {});
      workspaces.set(name, pkg.scripts ?? {});
    }
  }
}

/** A path in backticks that is meant literally: no placeholder, wildcard, or example marker. */
const PATH = /`((?:apps|packages|e2e|scripts|docs)\/[A-Za-z0-9_.\-/]+|docker-compose\.yml|\.env\.example)`/g;
const looksLikeAPlaceholder = (path) => /[<>*]|\.\.\.|NN|:id|\{/.test(path);

describe('the commands the documents tell a reader to run', () => {
  it('every `npm run <script>` exists in the package it names', () => {
    const unknown = [];
    for (const file of living) {
      for (const [, script, rest] of readFileSync(file, 'utf8').matchAll(
        /npm run ([a-z][a-z0-9:_-]*)([^`\n|]*)/g,
      )) {
        const workspace = /(?:-w|--workspace)(?:=|\s+)([@\w/.-]+)/.exec(rest)?.[1];
        const scripts = workspace ? workspaces.get(workspace.replace(/^\.\//, '')) : rootPackage.scripts;
        if (!scripts || !(script in scripts)) {
          unknown.push(`${posix(file)}: npm run ${script}${workspace ? ` -w ${workspace}` : ''}`);
        }
      }
    }
    assert.deepEqual(unknown, []);
  });
});

describe('the paths the documents point at', () => {
  it('every repository path in backticks exists', () => {
    const missing = [];
    for (const file of living) {
      for (const [, path] of readFileSync(file, 'utf8').matchAll(PATH)) {
        if (!looksLikeAPlaceholder(path) && !existsSync(join(root, path))) {
          missing.push(`${posix(file)}: ${path}`);
        }
      }
    }
    assert.deepEqual(missing, []);
  });

  it('every documents-relative link in the documentation map exists', () => {
    const readme = readFileSync(join(docsRoot, 'README.md'), 'utf8');
    const missing = [...readme.matchAll(/`((?:product|architecture|tracks|integration|plan|ops)\/[A-Za-z0-9_.\-/]+)`/g)]
      .map((match) => match[1])
      .filter((path) => !looksLikeAPlaceholder(path) && !existsSync(join(docsRoot, path)));

    assert.deepEqual(missing, []);
  });
});

describe('the URLs the documents promise', () => {
  it('every API URL on localhost:3000 is under /api, as the application serves it', () => {
    const wrong = [];
    for (const file of living) {
      for (const [, path] of readFileSync(file, 'utf8').matchAll(/localhost:3000(\/[A-Za-z0-9_\-/]*)/g)) {
        if (!path.startsWith('/api/')) {
          wrong.push(`${posix(file)}: localhost:3000${path}`);
        }
      }
    }
    assert.deepEqual(wrong, []);
  });
});

describe('the front matter of the documents that teach or specify', () => {
  it('has a Status and a Verified against line', () => {
    const lacking = [];
    for (const file of living) {
      const path = posix(file);
      if (!/^docs\/(tracks|architecture|integration|ops)\//.test(path) || path.includes('/decisions/')) {
        continue;
      }
      const head = readFileSync(file, 'utf8').split('\n').slice(0, 8).join('\n');
      for (const field of ['Status:', 'Verified against:']) {
        if (!head.includes(field)) {
          lacking.push(`${path}: no "${field}"`);
        }
      }
    }
    assert.deepEqual(lacking, []);
  });
});

describe('the error codes', () => {
  const contract = readFileSync(join(root, 'packages/contracts/src/errors.ts'), 'utf8');
  const statuses = readFileSync(join(root, 'apps/api/src/common/errors/app-error.ts'), 'utf8');
  const table = readFileSync(join(docsRoot, 'integration/error-model.md'), 'utf8');
  const codes = [...contract.matchAll(/^\s+([A-Z_]+):\s*["'][A-Z_]+["'],?$/gm)].map((match) => match[1]);

  it('are found in the contract (so the checks below are not vacuous)', () => {
    assert.ok(codes.length >= 15, `found only ${codes.length} codes`);
    assert.ok(codes.includes('RATE_LIMITED'));
  });

  it('each has a row in docs/integration/error-model.md with the HTTP status the API really sends', () => {
    const wrong = [];
    for (const code of codes) {
      const inCode = new RegExp(`^\\s+${code}:\\s*(\\d+),`, 'm').exec(statuses)?.[1];
      const inDoc = new RegExp(`\\|\\s*\`${code}\`\\s*\\|\\s*(\\d+)\\s*\\|`).exec(table)?.[1];
      if (inCode === undefined || inDoc === undefined || inCode !== inDoc) {
        wrong.push(`${code}: code says ${inCode ?? 'nothing'}, document says ${inDoc ?? 'nothing'}`);
      }
    }
    assert.deepEqual(wrong, []);
  });
});
