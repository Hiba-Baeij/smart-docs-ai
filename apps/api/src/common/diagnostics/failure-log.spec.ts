import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FailureLog, failureChannelOf } from './failure-log';

describe('failureChannelOf', () => {
  it.each([
    ['POST', '/api/conversations/abc/messages', 'chat'],
    ['POST', '/api/documents/upload', 'upload'],
    ['GET', '/api/conversations/abc/messages', null],
    ['POST', '/api/conversations', null],
    ['POST', '/api/auth/login', null],
    ['DELETE', '/api/documents/abc', null],
  ])('%s %s → %s', (method, path, expected) => {
    expect(failureChannelOf(method, path)).toBe(expected);
  });
});

describe('FailureLog', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'failure-log-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const lines = (file: string) =>
    readFileSync(join(dir, file), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);

  it('writes chat and upload failures to their own files, one JSON line each', async () => {
    const log = new FailureLog(dir);
    await log.write('chat', { requestId: 'a', code: 'AI_TIMEOUT' });
    await log.write('upload', { requestId: 'b', code: 'EXTRACTION_FAILED' });
    await log.write('chat', { requestId: 'c', code: 'AI_UNAVAILABLE' });
    expect(lines('chat-errors.log').map((entry) => entry.requestId)).toEqual([
      'a',
      'c',
    ]);
    expect(lines('upload-errors.log')).toEqual([
      { requestId: 'b', code: 'EXTRACTION_FAILED' },
    ]);
  });

  it('creates a missing folder', async () => {
    const nested = join(dir, 'deep', 'logs');
    await new FailureLog(nested).write('chat', { requestId: 'a' });
    expect(readFileSync(join(nested, 'chat-errors.log'), 'utf8')).toContain(
      '"requestId":"a"',
    );
  });

  it('keeps line order for concurrent writes', async () => {
    const log = new FailureLog(dir);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => log.write('chat', { n: i })),
    );
    expect(lines('chat-errors.log').map((entry) => entry.n)).toEqual(
      Array.from({ length: 20 }, (_, i) => i),
    );
  });

  it('rotates to .1 when the file would pass the size limit', async () => {
    const log = new FailureLog(dir, undefined, 60);
    await log.write('upload', { n: 1, pad: 'x'.repeat(30) });
    await log.write('upload', { n: 2, pad: 'x'.repeat(30) });
    expect(lines('upload-errors.log').map((entry) => entry.n)).toEqual([2]);
    expect(lines('upload-errors.log.1').map((entry) => entry.n)).toEqual([1]);
  });

  it('writes nothing when disabled', async () => {
    const log = new FailureLog('');
    expect(log.enabled).toBe(false);
    await log.write('chat', { requestId: 'a' });
  });

  it('never throws on a write error and reports it once', async () => {
    const blocker = join(dir, 'not-a-folder');
    writeFileSync(blocker, '');
    const reports: string[] = [];
    const log = new FailureLog(blocker, (message) => reports.push(message));
    await expect(log.write('chat', { a: 1 })).resolves.toBeUndefined();
    await expect(log.write('chat', { a: 2 })).resolves.toBeUndefined();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatch(/could not write the failure log/);
  });
});
