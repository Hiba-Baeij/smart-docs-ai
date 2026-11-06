import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AllExceptionsFilter } from '../common/errors/all-exceptions.filter';
import { UnauthorizedError } from '../common/errors/app-error';
import {
  SESSION_COOKIE_NAME,
  clearSessionCookieOptions,
} from './session-cookie';

/**
 * On the session routes, a request that is not authenticated also removes whatever `sid`
 * cookie the browser holds, so a stale or invalid cookie is not sent again. A guard failure
 * happens before any interceptor, so a route-level exception filter is the only hook that sees
 * it. The response body is still built by the shared filter; this class only adds the header.
 */
@Catch(UnauthorizedError)
export class ClearSessionCookieOnUnauthorizedFilter implements ExceptionFilter {
  private readonly shared = new AllExceptionsFilter();

  constructor(private readonly config: ConfigService) {}

  catch(exception: UnauthorizedError, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<Response>()
      .clearCookie(
        SESSION_COOKIE_NAME,
        clearSessionCookieOptions(
          this.config.getOrThrow<boolean>('COOKIE_SECURE'),
        ),
      );

    this.shared.catch(exception, host);
  }
}
