import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { ApiError } from '@smartdocs/contracts';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { hashPassword } from './../src/auth/password';
import { PrismaService } from './../src/prisma/prisma.service';
import { resetDatabase } from './support/test-database';

const bodyOf = (response: { body: unknown }) => response.body as ApiError;

const PASSWORD = 'correct horse battery';
const EMAIL = 'sara@example.com';

/** The `sid` Set-Cookie header, or undefined. */
function sidCookie(response: { headers: Record<string, unknown> }) {
  const header = response.headers['set-cookie'] as string[] | undefined;
  return header?.find((cookie) => cookie.startsWith('sid='));
}

/** A removal: empty value, expired in 1970, same attributes it was set with. */
function expectCleared(cookie: string | undefined): void {
  expect(cookie).toBeDefined();
  expect(cookie?.startsWith('sid=;')).toBe(true);
  expect(cookie).toContain('Expires=Thu, 01 Jan 1970');
  expect(cookie).toContain('Path=/');
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=Lax');
}

describe('Session routes: /auth/me and /auth/logout (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);

    await resetDatabase(prisma);
    const user = await prisma.user.create({
      data: {
        name: 'Sara Ahmed',
        email: EMAIL,
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const loginBody = { email: EMAIL, password: PASSWORD };

  describe('the whole session, as a browser would live it', () => {
    it('login, me, logout, then me is 401', async () => {
      // An agent keeps cookies between requests, like a browser.
      const browser = request.agent(app.getHttpServer());

      await browser.post('/api/auth/login').send(loginBody).expect(200);
      const me = await browser.get('/api/auth/me').expect(200);
      expect(bodyOf({ body: me.body }).code).toBeUndefined(); // not an error envelope

      await browser.post('/api/auth/logout').expect(204);

      const after = await browser.get('/api/auth/me').expect(401);
      expect(bodyOf(after).code).toBe('AUTH_REQUIRED');
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns the flat profile and never the hash', async () => {
      const token = await jwt.signAsync({ sub: userId });

      const response = await http()
        .get('/api/auth/me')
        .set('Cookie', `sid=${token}`)
        .expect(200);

      expect(Object.keys(response.body as object).sort()).toEqual([
        'createdAt',
        'email',
        'id',
        'name',
      ]);
      expect(response.body).toMatchObject({ id: userId, email: EMAIL });

      const raw = JSON.stringify(response.body).toLowerCase();
      expect(raw).not.toContain('hash');
      expect(raw).not.toContain('password');
      expect(raw).not.toContain('$2b$');
    });

    it('without a cookie: 401 AUTH_REQUIRED', async () => {
      const response = await http().get('/api/auth/me').expect(401);

      expect(bodyOf(response).code).toBe('AUTH_REQUIRED');
      expectCleared(sidCookie(response));
    });

    it('with an invalid cookie: 401, and the stale cookie is removed', async () => {
      const response = await http()
        .get('/api/auth/me')
        .set('Cookie', 'sid=not-a-jwt')
        .expect(401);

      expect(bodyOf(response).code).toBe('AUTH_REQUIRED');
      expectCleared(sidCookie(response));
    });

    it('for a valid token whose user no longer exists: 401, not a crash and not 404', async () => {
      const ghost = await prisma.user.create({
        data: {
          name: 'Ghost',
          email: 'ghost@example.com',
          passwordHash: 'x',
        },
      });
      const token = await jwt.signAsync({ sub: ghost.id });
      await prisma.user.delete({ where: { id: ghost.id } });

      const response = await http()
        .get('/api/auth/me')
        .set('Cookie', `sid=${token}`)
        .expect(401);

      expect(bodyOf(response).code).toBe('AUTH_REQUIRED');
      expectCleared(sidCookie(response));
    });
  });

  describe('POST /api/auth/logout', () => {
    it('answers 204 with no body and removes the cookie with the same attributes', async () => {
      const token = await jwt.signAsync({ sub: userId });

      const response = await http()
        .post('/api/auth/logout')
        .set('Cookie', `sid=${token}`)
        .expect(204);

      expect(response.text).toBe('');
      expectCleared(sidCookie(response));
    });

    it('without a valid session: 401 AUTH_REQUIRED, and it still removes the cookie', async () => {
      const response = await http().post('/api/auth/logout').expect(401);

      expect(bodyOf(response).code).toBe('AUTH_REQUIRED');
      expectCleared(sidCookie(response));
    });

    it('is POST only', async () => {
      const response = await http().get('/api/auth/logout').expect(404);

      expect(bodyOf(response).code).toBe('NOT_FOUND');
    });
  });

  describe('a documented limitation of stateless sessions', () => {
    it('a token copied before logout still authenticates until it expires', async () => {
      const copied = await jwt.signAsync({ sub: userId });

      await http()
        .post('/api/auth/logout')
        .set('Cookie', `sid=${copied}`)
        .expect(204);

      // Logout removes the browser's cookie; it cannot recall a token someone else holds.
      // There is no revocation list in v1 (ADR-002); the one-hour lifetime is the mitigation.
      // If revocation is ever added, this test must change.
      await http()
        .get('/api/auth/me')
        .set('Cookie', `sid=${copied}`)
        .expect(200);
    });
  });
});
