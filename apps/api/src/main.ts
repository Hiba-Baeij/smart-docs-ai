import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { RedactingLogger, redactLogValue } from './security/redacting-logger';

async function bootstrap() {
  // abortOnError: false lets us print a short message instead of a stack trace.
  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
    logger: new RedactingLogger(),
  });
  configureApp(app);
  const port = app.get(ConfigService).get<number>('PORT', 3000);
  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Startup failed: ${String(redactLogValue(message))}`);
  process.exit(1);
});
