import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { ApiError } from '@smartdocs/contracts';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { AuthModule } from './../src/auth/auth.module';
import { CurrentUser } from './../src/auth/current-user.decorator';
import { JwtAuthGuard } from './../src/auth/jwt-auth.guard';
import { hashPassword } from './../src/auth/password';
import { PrismaService } from './../src/prisma/prisma.service';
import { resetDatabase } from './support/test-database';

const bodyOf = (response: { body: unknown }) => response.body as ApiError;

const PASSWORD = 'correct horse battery';

/** Routes that exist only for this test. */
@Controller('probe')
class ProbeController {
  @UseGuards(JwtAuthGuard)
  @Get('whoami')
  whoami(@CurrentUser() userId: string): { id: string } {
    return { id: userId };
  }

  /** A forgotten guard: @CurrentUser must fail closed here, not return undefined. */
  @Get('unguarded')
  unguarded(@CurrentUser() userId: string): { id: string } {
    return { id: userId };
  }
}

const b64url = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

describe('JwtAuthGuard and @CurrentUser (e2e)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let userId: string;
  let validToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, AuthModule],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    const user = await prisma.user.create({
      data: {
        name: 'Sara Ahmed',
        email: 'sara@example.com',
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    userId = user.id;

    jwt = app.get(JwtService);
    validToken = await jwt.signAsync({ sub: userId });
  });

  afterAll(async () => {
    await app.close();
  });

  const whoami = (cookie?: string) => {
    const call = request(app.getHttpServer()).get('/api/probe/whoami');
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };

  describe('a valid session', () => {
    it('lets the request through and exposes only the verified id', async () => {
      const response = await whoami(`sid=${validToken}`).expect(200);

      expect(response.body).toEqual({ id: userId });
    });

    it('works with the cookie issued by a real login', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'sara@example.com', password: PASSWORD })
        .expect(200);
      const setCookie = (
        (login.headers as Record<string, unknown>)['set-cookie'] as string[]
      ).find((c) => c.startsWith('sid=')) as string;

      const response = await whoami(setCookie.split(';')[0]).expect(200);

      expect(response.body).toEqual({ id: userId });
    });
  });

  describe('every kind of bad credential is the same 401 AUTH_REQUIRED', () => {
    // Built lazily so each case can await the signing it needs.
    const cases: Array<
      [string, () => string | undefined | Promise<string | undefined>]
    > = [
      ['no cookie at all', () => undefined],
      ['an empty cookie value', () => 'sid='],
      ['a value that is not a JWT', () => 'sid=not-a-jwt'],
      [
        'a tampered payload (valid signature of another payload)',
        () => {
          const [header, , signature] = validToken.split('.');
          const forged = b64url({
            sub: 'someone-else',
            iat: 1,
            exp: 9_999_999_999,
          });
          return `sid=${header}.${forged}.${signature}`;
        },
      ],
      [
        'a token signed with a different secret',
        async () => {
          const other = new JwtService({
            secret: 'a-completely-different-secret-of-32+-characters',
          });
          return `sid=${await other.signAsync({ sub: userId })}`;
        },
      ],
      [
        'an expired token',
        async () =>
          `sid=${await jwt.signAsync({ sub: userId }, { expiresIn: -10 })}`,
      ],
      [
        'a token using another algorithm (HS512) with the right secret',
        async () =>
          `sid=${await jwt.signAsync({ sub: userId }, { algorithm: 'HS512' })}`,
      ],
      [
        'an unsigned token (alg "none")',
        () =>
          `sid=${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({
            sub: userId,
            iat: 1,
            exp: 9_999_999_999,
          })}.`,
      ],
      [
        'a correctly signed token with no subject',
        async () => `sid=${await jwt.signAsync({ note: 'no sub here' })}`,
      ],
    ];

    it.each(cases)('rejects %s', async (_label, build) => {
      const response = await whoami(await build()).expect(401);

      expect(bodyOf(response).code).toBe('AUTH_REQUIRED');
      expect(bodyOf(response).statusCode).toBe(401);
    });

    it('gives the client no way to tell the failures apart', async () => {
      const messages = new Set<string>();
      for (const [, build] of cases) {
        const response = await whoami(await build()).expect(401);
        const { requestId, timestamp, ...rest } = bodyOf(response);
        void requestId;
        void timestamp;
        messages.add(JSON.stringify(rest));
      }

      expect(messages.size).toBe(1);
    });

    it('does not accept the token from an Authorization header instead of the cookie', async () => {
      await request(app.getHttpServer())
        .get('/api/probe/whoami')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(401);
    });
  });

  describe('@CurrentUser', () => {
    it('fails closed on a route that has no guard, even with a valid cookie', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/probe/unguarded')
        .set('Cookie', `sid=${validToken}`)
        .expect(401);

      expect(bodyOf(response).code).toBe('AUTH_REQUIRED');
    });
  });
});
