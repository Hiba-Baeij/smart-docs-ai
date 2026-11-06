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

function tokenFrom(setCookie: string): string {
  return setCookie.split(';')[0].slice('sid='.length);
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString()) as Record<
    string,
    unknown
  >;
}

describe('POST /api/auth/login (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

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

  const login = (body: unknown) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send(body as object);

  describe('with correct credentials', () => {
    it('returns 200 and the user, and the token only in the cookie, never in the body', async () => {
      const response = await login({ email: EMAIL, password: PASSWORD }).expect(
        200,
      );

      expect(Object.keys(response.body as object)).toEqual(['user']);
      const { user } = response.body as { user: Record<string, unknown> };
      expect(Object.keys(user).sort()).toEqual([
        'createdAt',
        'email',
        'id',
        'name',
      ]);
      expect(user.id).toBe(userId);

      const raw = JSON.stringify(response.body);
      const token = tokenFrom(sidCookie(response) as string);
      expect(raw).not.toContain(token);
      expect(raw.toLowerCase()).not.toContain('hash');
      expect(raw).not.toContain(PASSWORD);
    });

    it('sets the session cookie HttpOnly, SameSite=Lax, Path=/, one hour, not Secure locally', async () => {
      const response = await login({ email: EMAIL, password: PASSWORD }).expect(
        200,
      );

      const cookie = sidCookie(response) as string;
      expect(cookie).toBeDefined();
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('Max-Age=3600');
      expect(cookie).not.toContain('Secure'); // COOKIE_SECURE=false for local HTTP
    });

    it('signs a token with only sub, iat and exp, valid for exactly one hour', async () => {
      const response = await login({ email: EMAIL, password: PASSWORD }).expect(
        200,
      );
      const token = tokenFrom(sidCookie(response) as string);

      const [header, payload] = token.split('.');
      expect(decodeSegment(header).alg).toBe('HS256');

      const claims = decodeSegment(payload);
      expect(Object.keys(claims).sort()).toEqual(['exp', 'iat', 'sub']);
      expect(claims.sub).toBe(userId);
      expect((claims.exp as number) - (claims.iat as number)).toBe(3600);

      // The signature verifies with the server secret.
      const verified = await app
        .get(JwtService)
        .verifyAsync<{ sub: string }>(token);
      expect(verified.sub).toBe(userId);
    });

    it('accepts the email in any case and with surrounding spaces', async () => {
      await login({ email: '  SARA@Example.COM ', password: PASSWORD }).expect(
        200,
      );
    });
  });

  describe('with wrong credentials', () => {
    it('answers a wrong password and an unknown email with the same 401 body', async () => {
      const wrongPassword = await login({
        email: EMAIL,
        password: 'definitely not it',
      }).expect(401);
      const unknownEmail = await login({
        email: 'nobody@example.com',
        password: PASSWORD,
      }).expect(401);

      const a = bodyOf(wrongPassword);
      const b = bodyOf(unknownEmail);
      expect(a.code).toBe('AUTH_INVALID_CREDENTIALS');
      expect(b.code).toBe('AUTH_INVALID_CREDENTIALS');
      // Everything except the per-request fields is identical.
      expect({ ...a, requestId: '', timestamp: '' }).toEqual({
        ...b,
        requestId: '',
        timestamp: '',
      });
    });

    it('clears the session cookie with the same attributes it is set with', async () => {
      const response = await login({
        email: EMAIL,
        password: 'definitely not it',
      }).expect(401);

      const cookie = sidCookie(response) as string;
      expect(cookie).toBeDefined();
      expect(cookie.startsWith('sid=;')).toBe(true);
      expect(cookie).toContain('Expires=Thu, 01 Jan 1970');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
    });

    it('does as much work for an unknown email as for a wrong password (dummy-hash comparison)', async () => {
      const started = Date.now();
      await login({ email: 'nobody@example.com', password: PASSWORD }).expect(
        401,
      );
      const elapsed = Date.now() - started;

      // One bcrypt comparison at cost 12 takes ~250-450 ms here. Without the dummy comparison
      // an unknown email returns in a few milliseconds and this fails.
      expect(elapsed).toBeGreaterThan(100);
    });
  });

  describe('with an invalid body', () => {
    it('rejects missing fields, listing each', async () => {
      const response = await login({}).expect(422);

      expect(Object.keys(bodyOf(response).details ?? {}).sort()).toEqual([
        'email',
        'password',
      ]);
    });

    it('rejects an empty password and unknown fields', async () => {
      const empty = await login({ email: EMAIL, password: '' }).expect(422);
      const extra = await login({
        email: EMAIL,
        password: PASSWORD,
        userId: 'someone-else',
      }).expect(422);

      expect(bodyOf(empty).details).toHaveProperty('password');
      expect(bodyOf(extra).details).toHaveProperty('userId');
    });
  });
});
