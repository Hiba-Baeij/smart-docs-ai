import { Controller, Get, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { ApiError } from '@smartdocs/contracts';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureApp } from './../src/app.setup';
import {
  ResourceNotFoundError,
  UnauthorizedError,
  ValidationFailedError,
} from './../src/common/errors/app-error';

/** Routes that fail on purpose, so the error envelope can be asserted without a database. */
@Controller('probe')
class FailingController {
  @Get('unexpected')
  unexpected(): never {
    throw new Error('boom: SELECT secret FROM users WHERE password = 12345');
  }

  @Get('missing-document')
  missingDocument(): never {
    throw new ResourceNotFoundError('DOCUMENT');
  }

  @Get('missing-conversation')
  missingConversation(): never {
    throw new ResourceNotFoundError('CONVERSATION');
  }

  @Get('unauthorized')
  unauthorized(): never {
    throw new UnauthorizedError();
  }

  @Get('invalid')
  invalid(): never {
    throw new ValidationFailedError({
      password: ['must be at least 10 characters'],
    });
  }
}

const ENVELOPE_KEYS = [
  'code',
  'details',
  'message',
  'path',
  'requestId',
  'statusCode',
  'timestamp',
];

/** supertest bodies are `any`; assert against the shared contract type instead. */
const bodyOf = (response: { body: unknown }) => response.body as ApiError;

describe('Error envelope (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FailingController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) =>
              key === 'CORS_ORIGIN' ? 'http://localhost:4200' : 102_400,
            // Optional settings (ERROR_LOG_DIR): unset, so no failure log files.
            get: () => undefined,
          },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('turns an unexpected error into INTERNAL with nothing from the original error', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/probe/unexpected')
      .expect(500);

    expect(Object.keys(bodyOf(response)).sort()).toEqual(ENVELOPE_KEYS);
    expect(response.body).toMatchObject({
      statusCode: 500,
      code: 'INTERNAL',
      message: 'Internal server error.',
      details: null,
    });

    const raw = JSON.stringify(response.body);
    expect(raw).not.toContain('boom');
    expect(raw).not.toContain('SELECT');
    expect(raw).not.toContain('12345');
    expect(raw).not.toMatch(/\bat\b.*\.(ts|js):\d+/); // no stack frame
    expect(raw).not.toContain('Error:');
  });

  it('maps a domain error to its code and status (the path the guide asks us to trace)', async () => {
    const document = await request(app.getHttpServer())
      .get('/api/probe/missing-document')
      .expect(404);
    const conversation = await request(app.getHttpServer())
      .get('/api/probe/missing-conversation')
      .expect(404);

    expect(bodyOf(document).code).toBe('DOCUMENT_NOT_FOUND');
    expect(bodyOf(conversation).code).toBe('CONVERSATION_NOT_FOUND');
    expect(Object.keys(bodyOf(document)).sort()).toEqual(ENVELOPE_KEYS);
  });

  it('maps UnauthorizedError to AUTH_REQUIRED with 401', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/probe/unauthorized')
      .expect(401);

    expect(response.body).toMatchObject({
      code: 'AUTH_REQUIRED',
      details: null,
    });
  });

  it('puts field-level details on VALIDATION_FAILED, and only there', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/probe/invalid')
      .expect(422);

    expect(bodyOf(response).code).toBe('VALIDATION_FAILED');
    expect(bodyOf(response).details).toEqual({
      password: ['must be at least 10 characters'],
    });
  });

  it('answers an unknown route with NOT_FOUND and does not echo the URL in the message', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/no-such-route-<script>')
      .expect(404);

    expect(bodyOf(response).code).toBe('NOT_FOUND');
    expect(bodyOf(response).message).toBe('Route not found.');
    expect(bodyOf(response).message).not.toContain('script');
  });

  it('echoes a generated requestId in the body and the X-Request-Id header', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/probe/unauthorized')
      .set('X-Request-Id', 'client-supplied-and-ignored');

    expect(bodyOf(response).requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers['x-request-id']).toBe(bodyOf(response).requestId);
    expect(bodyOf(response).requestId).not.toBe('client-supplied-and-ignored');
  });

  it('reports the path without the query string', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/probe/unauthorized?token=super-secret',
    );

    expect(bodyOf(response).path).toBe('/api/probe/unauthorized');
    expect(JSON.stringify(response.body)).not.toContain('super-secret');
  });
});
