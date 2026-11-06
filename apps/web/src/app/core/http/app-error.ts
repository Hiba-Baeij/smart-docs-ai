import { HttpErrorResponse } from '@angular/common/http';
import type { ApiError, ErrorCode } from '@smartdocs/contracts';

/** An API error code, or one of the two failures that have no API answer at all. */
export type AppErrorCode = ErrorCode | 'NETWORK' | 'UNKNOWN';

/**
 * The one error shape the UI deals with. Every failure, whatever its source, is turned into
 * this so a component branches on `code` (a stable value) and never on message text or status.
 */
export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly status: number,
    /** Field -> messages; only present for VALIDATION_FAILED. */
    readonly details: Record<string, string[]> | null = null,
    /** Echoed by the API on every error; useful for support, never shown as a story. */
    readonly requestId: string | null = null,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** A response body that looks like the API's error envelope (ADR-013). */
function isApiError(body: unknown): body is ApiError {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { code?: unknown }).code === 'string' &&
    typeof (body as { message?: unknown }).message === 'string'
  );
}

/**
 * Normalises anything thrown by an HTTP call. It is idempotent: an `AppError` passes through
 * unchanged, so it is safe to call both in an interceptor and again where the error is shown.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof HttpErrorResponse) {
    // Status 0 means the browser never got an answer: server down, offline, blocked.
    if (error.status === 0) {
      return new AppError('NETWORK', 'Cannot reach the server.', 0);
    }

    if (isApiError(error.error)) {
      return new AppError(
        error.error.code,
        error.error.message,
        error.status,
        error.error.details ?? null,
        error.error.requestId ?? null,
      );
    }

    return new AppError('UNKNOWN', 'Unexpected response from the server.', error.status);
  }

  return new AppError('UNKNOWN', 'Something went wrong.', 0);
}
