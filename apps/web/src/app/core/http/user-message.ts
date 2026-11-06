import { AppError } from './app-error';

/**
 * What a person reads when an API call fails. The wording belongs to the screens, not to the
 * interceptor, and it is chosen by the stable error `code`, never by the server's message text or
 * the HTTP status: the server can reword a message without breaking the interface.
 *
 * Messages say what is wrong with the thing the user did and what they can do next. They never
 * include a stack, a query or an upstream response; the server does not send those.
 */
export function userMessage(error: AppError): string {
  switch (error.code) {
    case 'FILE_TOO_LARGE':
      return 'This file is too large. Upload a smaller file, or split it into parts.';
    case 'UNSUPPORTED_FILE_TYPE':
      return 'This file type is not supported. Upload a PDF, DOCX or XLSX file.';
    case 'EMPTY_EXTRACTION':
      return 'No text could be read from this file. If it is a scanned PDF it contains only images; upload a version with selectable text.';
    case 'EXTRACTION_FAILED':
      return 'The file could not be read. It may be corrupted or protected with a password.';
    case 'PROCESSING_TIMEOUT':
      return 'Processing the file took too long and was stopped. Try a smaller file.';
    case 'VALIDATION_FAILED':
      // The API names the field and the rule ("The file is empty."): that is exactly what helps.
      return firstDetail(error) ?? 'The request was not accepted. Check it and try again.';
    case 'RATE_LIMITED':
      return 'Too many requests in a short time. Wait a moment and try again.';
    case 'AUTH_REQUIRED':
      return 'Your session ended. Sign in again.';
    case 'DOCUMENT_NOT_FOUND':
      return 'This document does not exist, or it is not yours.';
    case 'NETWORK':
      return 'Cannot reach the server. Check your connection and try again.';
    default:
      return 'Something went wrong on our side. Try again; if it keeps happening, contact support.';
  }
}

function firstDetail(error: AppError): string | null {
  const messages = Object.values(error.details ?? {}).flat();
  return messages.length > 0 ? messages[0] : null;
}
