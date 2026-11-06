// Must stay the first import: it sets COOKIE_SECURE=true before AppModule loads (see the file).
import './support/cookie-secure-env';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { hashPassword } from './../src/auth/password';
import { PrismaService } from './../src/prisma/prisma.service';
import { resetDatabase } from './support/test-database';

const EMAIL = 'sara@example.com';
const PASSWORD = 'correct horse battery';

/** The `sid` Set-Cookie header, or undefined. */
function sidCookie(response: { headers: Record<string, unknown> }) {
  const header = response.headers['set-cookie'] as string[] | undefined;
  return header?.find((cookie) => cookie.startsWith('sid='));
}

/** Every attribute the session cookie must carry in a production-style deployment. */
function expectProductionFlags(cookie: string | undefined): void {
  expect(cookie).toBeDefined();
  expect(cookie).toContain('Secure');
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=Lax');
  expect(cookie).toContain('Path=/');
}

describe('Session cookie with COOKIE_SECURE=true (e2e)', () => {
  let app: INestApplication<App>;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const prisma = app.get(PrismaService);
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

  it('marks the cookie Secure when it is issued at login', async () => {
    const response = await http()
      .post('/api/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);

    const cookie = sidCookie(response);
    expectProductionFlags(cookie);
    expect(cookie).toContain('Max-Age=3600');
  });

  it('marks the clearing cookie Secure after a failed login', async () => {
    const response = await http()
      .post('/api/auth/login')
      .send({ email: EMAIL, password: 'definitely not it' })
      .expect(401);

    const cookie = sidCookie(response);
    expectProductionFlags(cookie);
    expect(cookie?.startsWith('sid=;')).toBe(true);
  });

  it('marks the clearing cookie Secure on logout', async () => {
    const token = await app.get(JwtService).signAsync({ sub: userId });

    const response = await http()
      .post('/api/auth/logout')
      .set('Cookie', `sid=${token}`)
      .expect(204);

    const cookie = sidCookie(response);
    expectProductionFlags(cookie);
    expect(cookie?.startsWith('sid=;')).toBe(true);
  });

  it('marks the clearing cookie Secure when a stale session is rejected', async () => {
    const response = await http()
      .get('/api/auth/me')
      .set('Cookie', 'sid=not-a-jwt')
      .expect(401);

    const cookie = sidCookie(response);
    expectProductionFlags(cookie);
    expect(cookie?.startsWith('sid=;')).toBe(true);
  });
});
