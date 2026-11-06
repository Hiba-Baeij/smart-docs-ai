/** UI preflight only. The API remains the authority for size, MIME and file signatures. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export type FileSelectionError = 'unsupported' | 'empty' | 'too-large';

export function validateSelectedFile(file: File): FileSelectionError | null {
  if (!/\.(pdf|docx|xlsx)$/i.test(file.name)) return 'unsupported';
  if (file.size === 0) return 'empty';
  if (file.size > MAX_UPLOAD_BYTES) return 'too-large';
  return null;
}
