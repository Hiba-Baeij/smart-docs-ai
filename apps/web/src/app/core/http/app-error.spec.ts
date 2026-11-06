import { HttpErrorResponse } from '@angular/common/http';
import type { ApiError } from '@smartdocs/contracts';
import { AppError, toAppError } from './app-error';

const envelope = (overrides: Partial<ApiError>): ApiError => ({
  statusCode: 409,
  code: 'AUTH_EMAIL_TAKEN',
  message: 'Email already registered.',
  details: null,
  requestId: 'req-1',
  timestamp: '2026-10-31T00:00:00.000Z',
  path: '/api/auth/register',
  ...overrides,
});

describe('toAppError', () => {
  it('keeps the code, message, status and request id of an API error', () => {
    const error = toAppError(new HttpErrorResponse({ status: 409, error: envelope({}) }));

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('AUTH_EMAIL_TAKEN');
    expect(error.message).toBe('Email already registered.');
    expect(error.status).toBe(409);
    expect(error.requestId).toBe('req-1');
    expect(error.details).toBeNull();
  });

  it('keeps field details of a validation failure', () => {
    const error = toAppError(
      new HttpErrorResponse({
        status: 422,
        error: envelope({
          statusCode: 422,
          code: 'VALIDATION_FAILED',
          details: { password: ['too short'] },
        }),
      }),
    );

    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details).toEqual({ password: ['too short'] });
  });

  it('calls a status-0 failure NETWORK: the server never answered', () => {
    const error = toAppError(new HttpErrorResponse({ status: 0 }));

    expect(error.code).toBe('NETWORK');
    expect(error.status).toBe(0);
  });

  it('calls an answer that is not the API envelope UNKNOWN, keeping the status', () => {
    const html = toAppError(
      new HttpErrorResponse({ status: 502, error: '<html>Bad Gateway</html>' }),
    );
    const empty = toAppError(new HttpErrorResponse({ status: 500, error: null }));

    expect(html.code).toBe('UNKNOWN');
    expect(html.status).toBe(502);
    expect(empty.code).toBe('UNKNOWN');
  });

  it('never copies a non-envelope body into the message', () => {
    const error = toAppError(
      new HttpErrorResponse({ status: 500, error: '<script>alert(1)</script> secret stack' }),
    );

    expect(error.message).not.toContain('script');
    expect(error.message).not.toContain('secret');
  });

  it('turns anything else into UNKNOWN', () => {
    expect(toAppError(new Error('boom')).code).toBe('UNKNOWN');
    expect(toAppError('a string').code).toBe('UNKNOWN');
    expect(toAppError(undefined).code).toBe('UNKNOWN');
  });

  it('is idempotent: an AppError passes through unchanged', () => {
    const original = new AppError('RATE_LIMITED', 'Too many requests.', 429);

    expect(toAppError(original)).toBe(original);
  });
});
