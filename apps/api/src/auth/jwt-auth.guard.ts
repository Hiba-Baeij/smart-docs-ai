import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedError } from '../common/errors/app-error';
import type { AuthenticatedRequest } from './authenticated-user';
import { SESSION_COOKIE_NAME } from './session-cookie';

/**
 * Authentication only: it proves WHO is calling, from the session cookie. It does not and
 * cannot decide whether the caller may touch a given row; only a service that queries that
 * row can (docs/tracks/nestjs/01 and 03).
 *
 * Every failure (no cookie, garbage, tampered, wrong algorithm, expired, no subject) is the
 * same AUTH_REQUIRED, so the client cannot tell an expired token from a forged one.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token: unknown = request.cookies?.[SESSION_COOKIE_NAME];

    if (typeof token !== 'string' || token.length === 0) {
      throw new UnauthorizedError();
    }

    try {
      // Pin the algorithm: never let the token choose how it is verified ("none", HS512, ...).
      const payload = await this.jwt.verifyAsync<{ sub?: unknown }>(token, {
        algorithms: ['HS256'],
      });

      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw new UnauthorizedError();
      }

      request.user = { id: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedError();
    }
  }
}
