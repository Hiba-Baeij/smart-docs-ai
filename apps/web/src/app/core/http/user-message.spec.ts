import { AppError, AppErrorCode } from './app-error';
import { userMessage } from './user-message';

const error = (code: AppErrorCode, details: Record<string, string[]> | null = null) =>
  new AppError(code, 'server wording that must not be shown', 0, details);

describe('userMessage', () => {
  it.each([
    ['FILE_TOO_LARGE', /too large/i],
    ['UNSUPPORTED_FILE_TYPE', /PDF, DOCX or XLSX/],
    ['EMPTY_EXTRACTION', /scanned PDF/],
    ['EXTRACTION_FAILED', /corrupted/],
    ['PROCESSING_TIMEOUT', /too long/],
    ['RATE_LIMITED', /Too many requests/],
    ['AUTH_REQUIRED', /Sign in/],
    ['DOCUMENT_NOT_FOUND', /does not exist/],
    ['NETWORK', /Cannot reach the server/],
  ] as const)('says what is wrong for %s', (code, expected) => {
    expect(userMessage(error(code))).toMatch(expected);
  });

  it('shows the rule the API names for a validation failure, such as an empty file', () => {
    expect(userMessage(error('VALIDATION_FAILED', { file: ['The file is empty.'] }))).toBe(
      'The file is empty.',
    );
  });

  it('has a generic validation message when the API names no rule', () => {
    expect(userMessage(error('VALIDATION_FAILED'))).toMatch(/not accepted/);
  });

  it.each(['INTERNAL', 'UNKNOWN'] as const)('does not blame the user for %s', (code) => {
    expect(userMessage(error(code))).toMatch(/our side/);
  });

  it('never repeats the server wording', () => {
    const codes: AppErrorCode[] = [
      'FILE_TOO_LARGE',
      'UNSUPPORTED_FILE_TYPE',
      'EMPTY_EXTRACTION',
      'EXTRACTION_FAILED',
      'INTERNAL',
      'NETWORK',
      'UNKNOWN',
    ];

    for (const code of codes) {
      expect(userMessage(error(code))).not.toContain('server wording');
    }
  });
});
