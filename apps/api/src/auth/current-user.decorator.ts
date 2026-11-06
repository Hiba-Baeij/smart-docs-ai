import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { UnauthorizedError } from '../common/errors/app-error';
import type { AuthenticatedRequest } from './authenticated-user';

/**
 * The only way a controller obtains the caller's id: the one the guard verified from the
 * token. Client-supplied identity (a body or query `userId`) is never a source, not even a
 * fallback.
 *
 * It fails closed: used on a route that has no JwtAuthGuard, it throws instead of returning
 * undefined, so a forgotten guard cannot turn into an anonymous caller.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new UnauthorizedError();
    }

    return request.user.id;
  },
);
