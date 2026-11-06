import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ApiError, ErrorCode } from '@smartdocs/contracts';
import type { Request, Response } from 'express';
import { AppError, errorStatus } from './app-error';

type Mapped = Pick<ApiError, 'code' | 'message' | 'details'>;

/**
 * Maps every failure to the single error envelope (ADR-013, error-model.md §3). Nothing else
 * in the application builds an error response.
 *
 * The body never contains a stack, a SQL fragment, an upstream response or the original
 * message of an unexpected error; the log contains only request metadata keyed by requestId.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const requestId = (response.locals.requestId as string | undefined) ?? '';

    const mapped = this.map(exception);

    if (mapped.code === ErrorCode.INTERNAL) {
      this.logger.error(
        `requestId=${requestId} ${request.method} ${this.pathOf(request)} code=INTERNAL`,
      );
    }

    const statusCode = errorStatus[mapped.code];
    const body: ApiError = {
      statusCode,
      code: mapped.code,
      message: mapped.message,
      details: mapped.details,
      requestId,
      timestamp: new Date().toISOString(),
      path: this.pathOf(request),
    };

    response.status(statusCode).json(body);
  }

  private map(exception: unknown): Mapped {
    if (
      exception instanceof Error &&
      (exception as Error & { type?: string }).type === 'entity.too.large'
    ) {
      return this.mapHttpException(413);
    }
    if (exception instanceof AppError) {
      return {
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      return this.mapHttpException(exception.getStatus());
    }

    return {
      code: ErrorCode.INTERNAL,
      message: 'Internal server error.',
      details: null,
    };
  }

  /** Framework errors (unknown route, malformed body, ...) carry no domain meaning. */
  private mapHttpException(status: number): Mapped {
    switch (status) {
      case 401:
        return this.simple(ErrorCode.AUTH_REQUIRED, 'Authentication required.');
      case 404:
        return this.simple(ErrorCode.NOT_FOUND, 'Route not found.');
      case 429:
        return this.simple(ErrorCode.RATE_LIMITED, 'Too many requests.');
      case 400:
      case 422:
        return this.simple(ErrorCode.VALIDATION_FAILED, 'Validation failed.');
      case 413:
        return this.simple(ErrorCode.FILE_TOO_LARGE, 'Payload too large.');
      case 415:
        return this.simple(
          ErrorCode.UNSUPPORTED_FILE_TYPE,
          'Unsupported media type.',
        );
      default:
        return this.simple(ErrorCode.INTERNAL, 'Internal server error.');
    }
  }

  private simple(code: ErrorCode, message: string): Mapped {
    return { code, message, details: null };
  }

  /** The path without its query string, which may carry sensitive values. */
  private pathOf(request: Request): string {
    return request.originalUrl.split('?')[0];
  }
}
