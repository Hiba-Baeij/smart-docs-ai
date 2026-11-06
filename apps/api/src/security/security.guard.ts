import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '@smartdocs/contracts';
import type { Request, Response } from 'express';
import { AppError } from '../common/errors/app-error';
import { SESSION_COOKIE_NAME } from '../auth/session-cookie';

type Window = { count: number; resetAt: number };

/** One process-local counter per scope and principal. The auth routes retain their IP limiter. */
@Injectable()
export class SecurityGuard implements CanActivate {
  private readonly windows = new Map<string, Window>();
  private requests = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const origin = request.headers.origin;
    const allowedOrigin = this.config.getOrThrow<string>('CORS_ORIGIN');
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);

    // Browsers send Origin for cross-origin requests. Non-browser clients may omit it;
    // a cross-site browser request that strips Origin is still rejected by Fetch Metadata.
    if (
      (origin !== undefined && origin !== allowedOrigin) ||
      (unsafe && !origin && request.headers['sec-fetch-site'] === 'cross-site')
    ) {
      throw new AppError(ErrorCode.FORBIDDEN_ORIGIN, 'Origin is not allowed.');
    }

    const path = request.path;
    if (/^\/api\/auth\/(login|register)\/?$/.test(path)) return true;

    const scope = /^\/api\/documents\/upload\/?$/.test(path)
      ? 'upload'
      : /^\/api\/conversations\/[^/]+\/messages\/?$/.test(path) &&
          request.method === 'POST'
        ? 'message'
        : 'general';
    const limit = this.config.getOrThrow<number>(
      scope === 'upload'
        ? 'UPLOAD_RATE_LIMIT'
        : scope === 'message'
          ? 'MESSAGE_RATE_LIMIT'
          : 'GENERAL_RATE_LIMIT',
    );
    const principal =
      (await this.userId(request)) ??
      `ip:${request.ip ?? request.socket.remoteAddress ?? 'unknown'}`;
    const key = `${scope}:${principal}`;
    const now = Date.now();
    const previous = this.windows.get(key);
    const window =
      previous && previous.resetAt > now
        ? previous
        : {
            count: 0,
            resetAt: now + this.config.getOrThrow<number>('RATE_WINDOW_MS'),
          };
    if (window.count >= limit) {
      response.setHeader(
        'Retry-After',
        String(Math.max(1, Math.ceil((window.resetAt - now) / 1000))),
      );
      throw new HttpException('Too many requests.', 429);
    }
    window.count++;
    this.windows.set(key, window);
    if (++this.requests % 1000 === 0) {
      for (const [oldKey, value] of this.windows)
        if (value.resetAt <= now) this.windows.delete(oldKey);
    }
    return true;
  }

  private async userId(request: Request): Promise<string | null> {
    const token: unknown = request.cookies?.[SESSION_COOKIE_NAME];
    if (typeof token !== 'string') return null;
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: unknown }>(token, {
        algorithms: ['HS256'],
      });
      return typeof payload.sub === 'string' && payload.sub
        ? payload.sub
        : null;
    } catch {
      return null;
    }
  }
}
