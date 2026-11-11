import type { DocumentSummary, ErrorCode } from '@smartdocs/contracts';
import type { MessageKey } from '../../core/i18n/messages.en';

/**
 * What a document looks like to the person, which is not quite its stored status:
 *  - `processing`: the upload is probably still being worked on;
 *  - `stalled`: it has been `PROCESSING` for longer than any request can last. Uploads are
 *    synchronous with a 30-second budget, so such a row belongs to a request that crashed. It will
 *    never finish, and the screen must say so instead of spinning;
 *  - `completed` and `failed` are the stored statuses.
 */
export type DocumentState = 'processing' | 'stalled' | 'completed' | 'failed';

/** The budget is 30 s; a few minutes leaves room for a slow request and a skewed clock. */
export const STALLED_AFTER_MS = 3 * 60_000;

export function documentState(
  document: Pick<DocumentSummary, 'status' | 'createdAt'>,
  now: number,
): DocumentState {
  switch (document.status) {
    case 'COMPLETED':
      return 'completed';
    case 'FAILED':
      return 'failed';
    case 'PROCESSING':
      return now - Date.parse(document.createdAt) > STALLED_AFTER_MS ? 'stalled' : 'processing';
  }
}

/** Stored failures with their own explanation; any other code gets `docs.failed.other`. */
const FAILED_MESSAGES: Partial<Record<ErrorCode, MessageKey>> = {
  EMPTY_EXTRACTION: 'docs.failed.emptyExtraction',
  EXTRACTION_FAILED: 'docs.failed.extraction',
  PROCESSING_TIMEOUT: 'docs.failed.timeout',
  FILE_TOO_LARGE: 'docs.failed.tooLarge',
};

/** The message for a stored failure. Only the code is stored, never a message. */
export function failedDocumentMessage(code: ErrorCode | null): MessageKey {
  return (code && FAILED_MESSAGES[code]) || 'docs.failed.other';
}

/** Shown for a document that never finished; the only things possible are to delete and re-upload. */
export const STALLED_MESSAGE: MessageKey = 'docs.stalled';
