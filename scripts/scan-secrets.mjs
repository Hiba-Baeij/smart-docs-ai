// Looks for secrets where they must never be: the source tree and the built web bundle (NFR-01).
//
// Two kinds of evidence, both reported WITHOUT printing the secret itself:
//  1. well-known key shapes (provider keys, cloud keys, private keys, tokens);
//  2. the actual secret values configured in apps/api/.env (JWT secret, provider key, database
//     password): if one of them appears in a file that ships, that is a leak whatever its shape.
//
// A pattern scan cannot prove the absence of every possible secret format; it proves the absence of
// the ones listed here and of the real values this installation uses.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const PATTERNS = [
  { name: 'provider key (sk-...)', regex: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: 'AWS access key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Google API key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'GitHub token', regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'Slack token', regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'private key block', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  '.angular',
  '.git',
  'generated',
  'test-results',
  'coverage',
]);
// Lock files are long lists of integrity hashes, not places a person writes a secret.
const SKIPPED_FILES = new Set(['package-lock.json']);
const MAX_BYTES = 5 * 1024 * 1024;

/** Values from an .env file whose name says "secret": only those long enough to be a real secret. */
export function configuredSecrets(envFile) {
  if (!existsSync(envFile)) {
    return [];
  }
  return readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .map((line) => /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line))
    .filter((match) => match && /SECRET|KEY|PASSWORD|TOKEN/.test(match[1]))
    .map((match) => ({ name: match[1], value: match[2].replace(/^['"]|['"]$/g, '') }))
    .filter((entry) => entry.value.length >= 8);
}

function* files(directory, skipEnvFiles) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        yield* files(join(directory, entry.name), skipEnvFiles);
      }
    } else if (!SKIPPED_FILES.has(entry.name) && !(skipEnvFiles && /^\.env($|\.)/.test(entry.name))) {
      yield join(directory, entry.name);
    }
  }
}

/**
 * Scans every readable text file under `roots`. `.env` files are skipped when scanning source
 * (they are meant to hold secrets and are ignored by version control); never when scanning a bundle.
 */
export function scan({ roots, secrets = [], skipEnvFiles = true, base = process.cwd() }) {
  const findings = [];
  let scanned = 0;
  for (const root of roots) {
    if (!existsSync(root)) {
      continue;
    }
    const all = statSync(root).isDirectory() ? [...files(root, skipEnvFiles)] : [root];
    for (const file of all) {
      if (statSync(file).size > MAX_BYTES) {
        continue;
      }
      const text = readFileSync(file, 'utf8');
      scanned++;
      const where = relative(base, file).split(sep).join('/');
      for (const pattern of PATTERNS) {
        if (pattern.regex.test(text)) {
          findings.push({ file: where, what: pattern.name });
        }
      }
      for (const secret of secrets) {
        if (text.includes(secret.value)) {
          findings.push({ file: where, what: `the configured value of ${secret.name}` });
        }
      }
    }
  }
  return { scanned, findings };
}
