import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import type { Express } from 'express';
import { ValidationFailedError } from './common/errors/app-error';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { requestIdMiddleware } from './common/request-id.middleware';
import { toValidationDetails } from './common/validation/validation-details';

/**
 * Applies the HTTP-level setup shared by main.ts and the e2e tests, so tests
 * exercise the same app shape as production.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  // Count only known reverse-proxy hops. Never trust arbitrary forwarded headers by default.
  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.set('trust proxy', config.getOrThrow<number>('TRUST_PROXY_HOPS'));
  const allowedOrigin = config.getOrThrow<string>('CORS_ORIGIN');
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allowed?: string | boolean) => void,
    ) => callback(null, origin === allowedOrigin ? allowedOrigin : false),
    credentials: true,
  });
  app.use(json({ limit: config.getOrThrow<number>('MAX_JSON_BYTES') }));
  app.setGlobalPrefix('api');
  app.use(requestIdMiddleware);
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      // Unknown fields are rejected, not ignored: a stray `userId` is a client bug or an attack.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // Keep rejected values out of the error objects altogether.
      validationError: { target: false, value: false },
      exceptionFactory: (errors) =>
        new ValidationFailedError(toValidationDetails(errors)),
    }),
  );
}
