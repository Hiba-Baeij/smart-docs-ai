import type { DocumentSummary, ErrorCode } from '@smartdocs/contracts';
import type { Locale } from '../../core/i18n/locale.service';

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

/** A sentence for a stored failure. Only the code is stored, never a message. */
export function failedDocumentMessage(code: ErrorCode | null, locale: Locale = 'en'): string {
  if (locale === 'ar') {
    switch (code) {
      case 'EMPTY_EXTRACTION':
        return 'تعذرت قراءة النص. إذا كان ملف PDF صورة ممسوحة ضوئيًا، فارفع نسخة بنص قابل للتحديد.';
      case 'EXTRACTION_FAILED':
        return 'تعذرت قراءة الملف. قد يكون تالفًا أو محميًا بكلمة مرور.';
      case 'PROCESSING_TIMEOUT':
        return 'استغرقت المعالجة وقتًا طويلًا فتوقفت.';
      case 'FILE_TOO_LARGE':
        return 'يحتوي الملف على نص أكثر من الحد المسموح لمعالجته.';
      default:
        return 'فشلت المعالجة بسبب مشكلة في الخدمة. احذف المستند وارفع الملف مرة أخرى.';
    }
  }
  switch (code) {
    case 'EMPTY_EXTRACTION':
      return 'No text could be read. If this is a scanned PDF, upload a version with selectable text.';
    case 'EXTRACTION_FAILED':
      return 'The file could not be read. It may be corrupted or protected with a password.';
    case 'PROCESSING_TIMEOUT':
      return 'Processing took too long and was stopped.';
    case 'FILE_TOO_LARGE':
      return 'The file contains too much text to process.';
    default:
      return 'Processing failed because of a problem on our side. Delete it and upload the file again.';
  }
}

/** Shown for a document that never finished; the only things possible are to delete and re-upload. */
export const STALLED_MESSAGE = 'This upload did not finish. Delete it and upload the file again.';
export function stalledMessage(locale: Locale): string {
  return locale === 'ar'
    ? 'لم يكتمل رفع هذا الملف. احذفه ثم ارفعه مرة أخرى.'
    : STALLED_MESSAGE;
}
