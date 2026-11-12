import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export type FailureChannel = 'chat' | 'upload';

export type FailureEntry = Record<string, unknown>;

const FILE_NAMES: Record<FailureChannel, string> = {
  chat: 'chat-errors.log',
  upload: 'upload-errors.log',
};

/** The route a failed request belongs to, or null when it is neither chat nor upload. */
export function failureChannelOf(
  method: string,
  path: string,
): FailureChannel | null {
  if (method !== 'POST') return null;
  if (/^\/api\/conversations\/[^/]+\/messages\/?$/.test(path)) return 'chat';
  if (/^\/api\/documents\/upload\/?$/.test(path)) return 'upload';
  return null;
}

/**
 * Appends one JSON line per failed chat or upload request to `<dir>/chat-errors.log` or
 * `<dir>/upload-errors.log`. When a file passes `maxBytes` it becomes `<name>.1` (replacing the
 * previous one) and a new file starts, so the logs never grow without bound.
 *
 * Writing never throws: a full disk or a read-only folder must not turn into a second error for
 * the person; the problem is reported once to `onError` instead.
 */
export class FailureLog {
  private readonly dir: string | null;
  private pending: Promise<void> = Promise.resolve();
  private reportedWriteError = false;

  constructor(
    dir: string | null | undefined,
    private readonly onError: (message: string) => void = () => undefined,
    private readonly maxBytes = 5 * 1024 * 1024,
  ) {
    this.dir = dir ? resolve(dir) : null;
  }

  get enabled(): boolean {
    return this.dir !== null;
  }

  /** Queued so lines from concurrent requests never interleave or race a rotation. */
  write(channel: FailureChannel, entry: FailureEntry): Promise<void> {
    if (!this.dir) return Promise.resolve();
    const file = join(this.dir, FILE_NAMES[channel]);
    const line = `${JSON.stringify(entry)}\n`;
    this.pending = this.pending
      .then(() => this.append(file, line))
      .catch((error: unknown) => {
        if (this.reportedWriteError) return;
        this.reportedWriteError = true;
        this.onError(
          `could not write the failure log in ${this.dir}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    return this.pending;
  }

  private async append(file: string, line: string): Promise<void> {
    await mkdir(this.dir as string, { recursive: true });
    const size = await stat(file).then(
      (info) => info.size,
      () => 0,
    );
    if (size > 0 && size + line.length > this.maxBytes) {
      await rename(file, `${file}.1`);
    }
    await appendFile(file, line, 'utf8');
  }
}
