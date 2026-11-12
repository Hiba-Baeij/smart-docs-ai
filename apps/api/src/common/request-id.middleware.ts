import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithDiagnostics } from './diagnostics/diagnostics';

/**
 * Gives every request an id, returned in the `X-Request-Id` header and echoed in error
 * bodies and logs. Always generated here: an id supplied by the client is never trusted.
 */
export function requestIdMiddleware(
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  const requestId = randomUUID();
  response.locals.requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  // Every later step of this request notes into its own diagnostic trail.
  runWithDiagnostics(next);
}
