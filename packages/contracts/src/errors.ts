/**
 * Stable machine-readable error codes. Clients branch on `code`, never on `message`.
 * Adding a code requires updating the table in docs/integration/error-model.md.
 */
export const ErrorCode = {
  AUTH_REQUIRED: "AUTH_REQUIRED",
  AUTH_INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS",
  AUTH_EMAIL_TAKEN: "AUTH_EMAIL_TAKEN",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  UNSUPPORTED_FILE_TYPE: "UNSUPPORTED_FILE_TYPE",
  EMPTY_EXTRACTION: "EMPTY_EXTRACTION",
  EXTRACTION_FAILED: "EXTRACTION_FAILED",
  PROCESSING_TIMEOUT: "PROCESSING_TIMEOUT",
  DOCUMENT_NOT_FOUND: "DOCUMENT_NOT_FOUND",
  CONVERSATION_NOT_FOUND: "CONVERSATION_NOT_FOUND",
  AI_TIMEOUT: "AI_TIMEOUT",
  AI_UNAVAILABLE: "AI_UNAVAILABLE",
  RATE_LIMITED: "RATE_LIMITED",
  FORBIDDEN_ORIGIN: "FORBIDDEN_ORIGIN",
  NOT_FOUND: "NOT_FOUND",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** The one error envelope every failing response uses. */
export type ApiError = {
  statusCode: number;
  code: ErrorCode;
  /** For humans; may change. */
  message: string;
  /** Populated only for VALIDATION_FAILED: field -> messages. */
  details: Record<string, string[]> | null;
  requestId: string;
  timestamp: string;
  path: string;
};
