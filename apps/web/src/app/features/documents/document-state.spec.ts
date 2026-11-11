import { english } from '../../core/i18n/messages.en';
import { arabic } from '../../core/i18n/messages.ar';
import {
  STALLED_AFTER_MS,
  STALLED_MESSAGE,
  documentState,
  failedDocumentMessage,
} from './document-state';

const NOW = Date.parse('2026-10-31T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('documentState', () => {
  it('is the stored status for a finished document', () => {
    expect(documentState({ status: 'COMPLETED', createdAt: ago(10 * 86_400_000) }, NOW)).toBe(
      'completed',
    );
    expect(documentState({ status: 'FAILED', createdAt: ago(0) }, NOW)).toBe('failed');
  });

  it('is processing for a recent PROCESSING row', () => {
    expect(documentState({ status: 'PROCESSING', createdAt: ago(5_000) }, NOW)).toBe('processing');
  });

  it('is stalled for a PROCESSING row older than any request can last', () => {
    expect(documentState({ status: 'PROCESSING', createdAt: ago(STALLED_AFTER_MS + 1) }, NOW)).toBe(
      'stalled',
    );
  });

  it('is still processing exactly at the limit', () => {
    expect(documentState({ status: 'PROCESSING', createdAt: ago(STALLED_AFTER_MS) }, NOW)).toBe(
      'processing',
    );
  });

  it('is processing, not stalled, when the server clock is ahead of the browser', () => {
    expect(documentState({ status: 'PROCESSING', createdAt: ago(-60_000) }, NOW)).toBe(
      'processing',
    );
  });
});

describe('failedDocumentMessage', () => {
  it('gives actionable Arabic feedback for a scanned PDF and a stalled upload', () => {
    expect(arabic[failedDocumentMessage('EMPTY_EXTRACTION')]).toContain('نص قابل للتحديد');
    expect(arabic[STALLED_MESSAGE]).toContain('ارفعه مرة أخرى');
  });
  it.each([
    ['EMPTY_EXTRACTION', /scanned PDF/],
    ['EXTRACTION_FAILED', /corrupted/],
    ['PROCESSING_TIMEOUT', /too long/],
    ['FILE_TOO_LARGE', /too much text/],
    ['INTERNAL', /our side/],
    [null, /our side/],
  ] as const)('explains %s', (code, expected) => {
    expect(english[failedDocumentMessage(code)]).toMatch(expected);
  });
});
