import './support/security-limit-env';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { ApiError } from '@smartdocs/contracts';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDatabase } from './support/test-database';

const code = (response: { body: unknown }) => (response.body as ApiError).code;
const allowed = 'http://localhost:4200';
const foreign = 'https://attacker.example';

describe('Phase 11 HTTP hardening', () => {
  let app: INestApplication<App>;
  let cookie: string;
  let prisma: PrismaService;
  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    const user = await prisma.user.create({
      data: { name: 'Sara', email: 'sara@example.com', passwordHash: 'test' },
    });
    cookie = `sid=${await app.get(JwtService).signAsync({ sub: user.id })}`;
  });
  afterEach(async () => {
    await app.close();
  });
  const http = () => request(app.getHttpServer());

  it('allows credentials only for the configured origin', async () => {
    const good = await http()
      .get('/api/health')
      .set('Origin', allowed)
      .expect(200);
    expect(good.headers['access-control-allow-origin']).toBe(allowed);
    expect(good.headers['access-control-allow-credentials']).toBe('true');
    const bad = await http()
      .get('/api/health')
      .set('Origin', foreign)
      .expect(403);
    expect(code(bad)).toBe('FORBIDDEN_ORIGIN');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects a forged Origin on a state-changing route before creating a row', async () => {
    const response = await http()
      .post('/api/conversations')
      .set('Cookie', cookie)
      .set('Origin', foreign)
      .send({})
      .expect(403);
    expect(code(response)).toBe('FORBIDDEN_ORIGIN');
    expect(await prisma.conversation.count()).toBe(0);
  });

  it('rejects a cross-site browser write even when Origin is stripped', async () => {
    const response = await http()
      .post('/api/conversations')
      .set('Cookie', cookie)
      .set('Sec-Fetch-Site', 'cross-site')
      .send({})
      .expect(403);
    expect(code(response)).toBe('FORBIDDEN_ORIGIN');
  });

  it('limits general requests and sends Retry-After', async () => {
    for (let i = 0; i < 3; i++)
      await http().get('/api/auth/me').set('Cookie', cookie).expect(200);
    const blocked = await http()
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(429);
    expect(code(blocked)).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('limits uploads per user before reading multipart', async () => {
    for (let i = 0; i < 2; i++)
      await http()
        .post('/api/documents/upload')
        .set('Cookie', cookie)
        .field('note', 'missing file')
        .expect(422);
    const blocked = await http()
      .post('/api/documents/upload')
      .set('Cookie', cookie)
      .field('note', 'missing file')
      .expect(429);
    expect(code(blocked)).toBe('RATE_LIMITED');
  });

  it('limits chat sends per user before validating the body', async () => {
    const conversation = await prisma.conversation.create({
      data: {
        title: 'Test',
        userId: (await prisma.user.findFirstOrThrow()).id,
      },
    });
    for (let i = 0; i < 2; i++)
      await http()
        .post(`/api/conversations/${conversation.id}/messages`)
        .set('Cookie', cookie)
        .send({})
        .expect(422);
    const blocked = await http()
      .post(`/api/conversations/${conversation.id}/messages`)
      .set('Cookie', cookie)
      .send({})
      .expect(429);
    expect(code(blocked)).toBe('RATE_LIMITED');
    expect(await prisma.message.count()).toBe(0);
  });

  it('rejects oversized JSON before the handler writes anything', async () => {
    const response = await http()
      .post('/api/conversations')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ title: 'a'.repeat(200) }))
      .expect(413);
    expect(code(response)).toBe('FILE_TOO_LARGE');
    expect(await prisma.conversation.count()).toBe(0);
  });
});
