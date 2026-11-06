import { extname } from 'node:path';

const MAX_NAME_LENGTH = 255;

/**
 * The client-chosen file name, made safe to store and to show: control characters (a NUL byte
 * would make PostgreSQL reject the row) are removed and the length is capped, keeping the
 * extension. It is a label only; the stored `fileType` comes from the verified bytes.
 */
export function sanitizeOriginalName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (cleaned.length <= MAX_NAME_LENGTH) {
    return cleaned;
  }
  const extension = extname(cleaned);
  return cleaned.slice(0, MAX_NAME_LENGTH - extension.length) + extension;
}
