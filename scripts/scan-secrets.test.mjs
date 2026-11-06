// Run with `npm run test:secrets` (after a build: it scans the compiled web bundle).
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { PATTERNS, configuredSecrets, scan } from './scan-secrets.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = join(root, 'apps', 'api', '.env');

function plant(files) {
  const directory = mkdtempSync(join(tmpdir(), 'secret-scan-'));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(directory, name)), { recursive: true });
    writeFileSync(join(directory, name), content);
  }
  return directory;
}

describe('the scanner itself (a scan that cannot fail proves nothing)', () => {
  it('finds a planted example of every pattern it claims to know', () => {
    // Assembled at run time: a literal key in this file would be found by the scan of the source tree.
    const join2 = (...parts) => parts.join('');
    const samples = {
      'provider key (sk-...)': join2('const key = "sk', '-abcdefghijklmnopqrstuvwxyz0123456789";'),
      'AWS access key': join2('AK', 'IAABCDEFGHIJKLMNOP'),
      'Google API key': join2('AI', 'zaSyA-abcdefghijklmnopqrstuvwxyz01234'),
      'GitHub token': join2('gh', 'p_abcdefghijklmnopqrstuvwxyz0123456789'),
      'Slack token': join2('xo', 'xb-1234567890-abcdefghij'),
      'private key block': join2('-----BEGIN RSA', ' PRIVATE KEY-----'),
    };
    assert.deepEqual(Object.keys(samples).sort(), PATTERNS.map((p) => p.name).sort());

    for (const [name, line] of Object.entries(samples)) {
      const directory = plant({ 'bundle.js': line });

      const { findings } = scan({ roots: [directory], base: directory });

      assert.deepEqual(findings, [{ file: 'bundle.js', what: name }], name);
    }
  });

  it('finds the real configured value of a secret, whatever its shape', () => {
    const directory = plant({ 'main.js': 'var x = "a-plain-looking-but-real-secret-value";' });

    const { findings } = scan({
      roots: [directory],
      base: directory,
      secrets: [{ name: 'JWT_SECRET', value: 'a-plain-looking-but-real-secret-value' }],
    });

    assert.deepEqual(findings, [{ file: 'main.js', what: 'the configured value of JWT_SECRET' }]);
  });

  it('reports a clean tree as clean, and says how much it looked at', () => {
    const directory = plant({ 'a.js': 'console.log("hello")', 'nested/b.js': 'export const n = 1;' });

    const result = scan({ roots: [directory], base: directory });

    assert.deepEqual(result, { scanned: 2, findings: [] });
  });

  it('skips .env files when scanning source, but not when scanning a bundle', () => {
    const directory = plant({ '.env': ['API_KEY=sk', '-abcdefghijklmnopqrstuvwxyz0123456789'].join('') });

    assert.equal(scan({ roots: [directory], base: directory }).findings.length, 0);
    assert.equal(scan({ roots: [directory], base: directory, skipEnvFiles: false }).findings.length, 1);
  });

  it('only treats long values of secret-named variables as secrets', () => {
    const directory = plant({ '.env': 'JWT_SECRET=abcdefghijklmnop\nPORT=3000\nDEBUG_KEY=short\n' });

    const secrets = configuredSecrets(join(directory, '.env'));

    assert.deepEqual(secrets, [{ name: 'JWT_SECRET', value: 'abcdefghijklmnop' }]);
  });
});

describe('this repository', () => {
  const secrets = configuredSecrets(envFile);

  it('has no secret in its source tree', () => {
    const { scanned, findings } = scan({
      roots: [join(root, 'apps'), join(root, 'packages'), join(root, 'docs'), join(root, 'e2e'), join(root, 'scripts')],
      secrets,
      base: root,
    });

    assert.ok(scanned > 100, `scanned only ${scanned} files`);
    assert.deepEqual(findings, []);
  });

  it('has no secret in the built web bundle', () => {
    const bundle = join(root, 'apps', 'web', 'dist');
    assert.ok(existsSync(bundle), 'apps/web/dist does not exist: run `npm run build` first');

    const { scanned, findings } = scan({ roots: [bundle], secrets, skipEnvFiles: false, base: root });

    assert.ok(scanned > 0, 'the bundle folder is empty');
    assert.deepEqual(findings, []);
  });

  it('knows which secrets it is looking for (so the bundle check is not vacuous)', () => {
    // On a machine with no apps/api/.env there is nothing configured to look for; say so loudly.
    assert.ok(existsSync(envFile), 'apps/api/.env is missing: the real-value check has nothing to compare');
    assert.ok(secrets.some((entry) => entry.name === 'JWT_SECRET'));
  });
});
