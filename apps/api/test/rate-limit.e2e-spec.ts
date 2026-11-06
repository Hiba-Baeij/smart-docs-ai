// Must stay the first import: it sets the real limit before AppModule loads (see the file).
import './support/rate-limit-env';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ApiError } from '@smartdocs/contracts';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { hashPassword } from './../src/auth/password';
import { PrismaService } from './../src/prisma/prisma.service';
import { resetDatabase } from './support/test-database';

jest.setTimeout(30_000);

const bodyOf = (response: { body: unknown }) => response.body as ApiError;

const EMAIL = 'sara@example.com';
const PASSWORD = 'correct horse battery';
const LIMIT = 5;

describe('Rate limiting on login and register (e2e)', () => {
  let app: INestApplication<App>;
  let userSeeded = false;

  beforeEach(async () => {
    // A fresh app per test means a fresh in-memory counter.
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    if (!userSeeded) {
      const prisma = app.get(PrismaService);
      await resetDatabase(prisma);
      await prisma.user.create({
        data: {
          name: 'Sara Ahmed',
          email: EMAIL,
          passwordHash: await hashPassword(PASSWORD),
        },
      });
      userSeeded = true;
    }
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const login = (body: unknown) =>
    http()
      .post('/api/auth/login')
      .send(body as object);
  const register = (body: unknown) =>
    http()
      .post('/api/auth/register')
      .send(body as object);

  // An invalid body is cheap (422, no bcrypt) yet still counts: the guard runs before validation.
  async function useUpLogins(
    count: number,
    forwardedFor?: (i: number) => string,
  ) {
    for (let i = 0; i < count; i++) {
      const call = http().post('/api/auth/login').send({});
      await (
        forwardedFor ? call.set('X-Forwarded-For', forwardedFor(i)) : call
      ).expect(422);
    }
  }

  it('lets five logins through and answers the sixth with 429 RATE_LIMITED', async () => {
    for (let i = 0; i < LIMIT; i++) {
      await login({ email: EMAIL, password: 'definitely not it' }).expect(401);
    }

    const sixth = await login({
      email: EMAIL,
      password: 'definitely not it',
    }).expect(429);

    expect(bodyOf(sixth).code).toBe('RATE_LIMITED');
    expect(bodyOf(sixth).statusCode).toBe(429);
    expect(Object.keys(bodyOf(sixth)).sort()).toEqual([
      'code',
      'details',
      'message',
      'path',
      'requestId',
      'statusCode',
      'timestamp',
    ]);
  });

  it('blocks even the CORRECT password once the limit is hit, and issues no cookie', async () => {
    for (let i = 0; i < LIMIT; i++) {
      await login({ email: EMAIL, password: 'definitely not it' }).expect(401);
    }

    const correct = await login({ email: EMAIL, password: PASSWORD }).expect(
      429,
    );

    const setCookie = (correct.headers as Record<string, unknown>)[
      'set-cookie'
    ] as string[] | undefined;
    expect(
      setCookie?.some((c) => c.startsWith('sid=') && !c.startsWith('sid=;')),
    ).toBeFalsy();
  });

  it('counts successful logins too, not only failures', async () => {
    for (let i = 0; i < LIMIT; i++) {
      await login({ email: EMAIL, password: PASSWORD }).expect(200);
    }

    await login({ email: EMAIL, password: PASSWORD }).expect(429);
  });

  it('limits register the same way', async () => {
    for (let i = 0; i < LIMIT; i++) {
      await register({}).expect(422);
    }

    const sixth = await register({}).expect(429);

    expect(bodyOf(sixth).code).toBe('RATE_LIMITED');
  });

  it('tells the client when to retry, in the standard Retry-After header (seconds)', async () => {
    await useUpLogins(LIMIT);

    const blocked = await login({}).expect(429);

    const retryAfter = Number(blocked.headers['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it('cannot be bypassed by forging X-Forwarded-For', async () => {
    await useUpLogins(LIMIT, (i) => `203.0.113.${i + 1}`);

    // A different "client address" in the header must not reset the counter.
    await http()
      .post('/api/auth/login')
      .set('X-Forwarded-For', '198.51.100.99')
      .send({})
      .expect(429);
  });

  it('keeps a separate counter per route', async () => {
    await useUpLogins(LIMIT);
    await login({}).expect(429);

    // Documented trade-off: login being blocked does not block register.
    await register({}).expect(422);
  });

  it('does not throttle other routes', async () => {
    for (let i = 0; i < 15; i++) {
      await http().get('/api/health').expect(200);
      await http().get('/api/auth/me').expect(401);
    }
  });
});
