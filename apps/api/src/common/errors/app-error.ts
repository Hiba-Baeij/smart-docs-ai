import { ErrorCode } from '@smartdocs/contracts';

/**
 * HTTP status for every error code (docs/integration/error-model.md §2). Typed as a full
 * Record so adding a code to contracts without a status here is a compile error.
 */
export const errorStatus: Record<ErrorCode, number> = {
  AUTH_REQUIRED: 401,
  AUTH_INVALID_CREDENTIALS: 401,
  AUTH_EMAIL_TAKEN: 409,
  VALIDATION_FAILED: 422,
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_FILE_TYPE: 415,
  EMPTY_EXTRACTION: 422,
  EXTRACTION_FAILED: 422,
  PROCESSING_TIMEOUT: 504,
  DOCUMENT_NOT_FOUND: 404,
  CONVERSATION_NOT_FOUND: 404,
  AI_TIMEOUT: 504,
  AI_UNAVAILABLE: 503,
  RATE_LIMITED: 429,
  FORBIDDEN_ORIGIN: 403,
  NOT_FOUND: 404,
  INTERNAL: 500,
};

/**
 * Base class of every error the application throws on purpose. Services throw these; the
 * exception filter is the only place that turns them into HTTP responses (ADR-013).
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    /** Field -> messages; only for VALIDATION_FAILED. */
    readonly details: Record<string, string[]> | null = null,
  ) {
    super(message);
    this.name = new.target.name;
  }

  get statusCode(): number {
    return errorStatus[this.code];
  }
}

export type ResourceKind = 'DOCUMENT' | 'CONVERSATION';

/**
 * The resource does not exist OR belongs to someone else. The two are deliberately
 * indistinguishable (404, never 403), so a client cannot probe for other users' ids.
 */
export class ResourceNotFoundError extends AppError {
  constructor(readonly kind: ResourceKind) {
    super(
      kind === 'DOCUMENT'
        ? ErrorCode.DOCUMENT_NOT_FOUND
        : ErrorCode.CONVERSATION_NOT_FOUND,
      kind === 'DOCUMENT' ? 'Document not found.' : 'Conversation not found.',
    );
  }
}

/** No valid session. Expired, missing and tampered tokens are intentionally the same. */
export class UnauthorizedError extends AppError {
  constructor() {
    super(ErrorCode.AUTH_REQUIRED, 'Authentication required.');
  }
}

/**
 * Wrong email or wrong password. One class, one message, one code for both, so the response
 * never says which of the two was wrong.
 */
export class InvalidCredentialsError extends AppError {
  constructor() {
    super(ErrorCode.AUTH_INVALID_CREDENTIALS, 'Invalid email or password.');
  }
}

/**
 * Registration conflict. This does reveal that an email is registered; that is an accepted,
 * documented usability trade-off (docs/tracks/nestjs/03-auth-and-ownership.md §7).
 */
export class EmailTakenError extends AppError {
  constructor() {
    super(ErrorCode.AUTH_EMAIL_TAKEN, 'Email already registered.');
  }
}

export class ValidationFailedError extends AppError {
  constructor(details: Record<string, string[]>) {
    super(ErrorCode.VALIDATION_FAILED, 'Validation failed.', details);
  }
}

/** The upload is not a PDF, DOCX or XLSX; the message says which check said no, never the content. */
export class UnsupportedFileTypeError extends AppError {
  constructor(message: string) {
    super(ErrorCode.UNSUPPORTED_FILE_TYPE, message);
  }
}

/** The parser ran but found no text, typically a scanned PDF. Names the likely cause for the user. */
export class EmptyExtractionError extends AppError {
  constructor() {
    super(
      ErrorCode.EMPTY_EXTRACTION,
      'No text could be extracted from this file. If it is a scanned PDF it contains only images; upload a version with selectable text.',
    );
  }
}

/** The parser threw. The parser's own message stays in the server log, not in the response. */
export class ExtractionFailedError extends AppError {
  constructor() {
    super(
      ErrorCode.EXTRACTION_FAILED,
      'The file could not be read. It may be corrupted or protected.',
    );
  }
}

export class ProcessingTimeoutError extends AppError {
  constructor() {
    super(
      ErrorCode.PROCESSING_TIMEOUT,
      'Processing took too long and was stopped.',
    );
  }
}

/** The file passed the size limit, but what it unpacks to does not. */
export class ExtractedTextTooLargeError extends AppError {
  constructor() {
    super(
      ErrorCode.FILE_TOO_LARGE,
      'The document contains too much text to process.',
    );
  }
}
