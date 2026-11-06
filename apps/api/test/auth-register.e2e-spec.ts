import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ApiError } from '@smartdocs/contracts';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import { resetDatabase } from './support/test-database';

const bodyOf = (response: { body: unknown }) => response.body as ApiError;

const VALID = {
  name: 'Sara Ahmed',
  email: 'sara@example.com',
  password: 'correct horse battery',
};

describe('POST /api/auth/register (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  const register = (body: unknown) =>
    request(app.getHttpServer())
      .post('/api/auth/register')
      .send(body as object);

  it('creates the user: 201, a bcrypt cost-12 hash in the database, no hash in the response', async () => {
    const response = await register(VALID).expect(201);

    // Response: exactly { user: { id, name, email, createdAt } }, nothing else.
    expect(Object.keys(response.body as object)).toEqual(['user']);
    const { user } = response.body as { user: Record<string, unknown> };
    expect(Object.keys(user).sort()).toEqual([
      'createdAt',
      'email',
      'id',
      'name',
    ]);
    expect(user.email).toBe('sara@example.com');

    const raw = JSON.stringify(response.body);
    expect(raw).not.toContain(VALID.password);
    expect(raw.toLowerCase()).not.toContain('hash');
    expect(raw).not.toContain('$2b$');

    // Database: a real bcrypt hash at cost 12 that matches the password.
    const stored = await prisma.user.findUniqueOrThrow({
      where: { email: 'sara@example.com' },
    });
    expect(stored.passwordHash.startsWith('$2b$12$')).toBe(true);
    expect(stored.passwordHash).not.toContain(VALID.password);
    expect(await bcrypt.compare(VALID.password, stored.passwordHash)).toBe(
      true,
    );
  });

  it('normalises the email: trims and lowercases before storing', async () => {
    await register({ ...VALID, email: '  Sara@Example.COM ' }).expect(201);

    expect(
      await prisma.user.count({ where: { email: 'sara@example.com' } }),
    ).toBe(1);
  });

  it('rejects a duplicate email, even with different case, with 409 AUTH_EMAIL_TAKEN', async () => {
    await register(VALID).expect(201);

    const response = await register({
      ...VALID,
      name: 'Someone Else',
      email: 'SARA@example.com',
    }).expect(409);

    expect(bodyOf(response).code).toBe('AUTH_EMAIL_TAKEN');
    expect(await prisma.user.count()).toBe(1);
  });

  it('rejects a password shorter than 10 characters with details.password', async () => {
    const response = await register({ ...VALID, password: 'short-123' }).expect(
      422,
    );

    expect(bodyOf(response).code).toBe('VALIDATION_FAILED');
    expect(bodyOf(response).details).toHaveProperty('password');
    expect(JSON.stringify(response.body)).not.toContain('short-123');
    expect(await prisma.user.count()).toBe(0);
  });

  it('accepts a password of exactly 10 and exactly 128 characters, rejects 129', async () => {
    await register({
      ...VALID,
      email: 'a@example.com',
      password: 'x'.repeat(10),
    }).expect(201);
    await register({
      ...VALID,
      email: 'b@example.com',
      password: 'x'.repeat(128),
    }).expect(201);

    const tooLong = await register({
      ...VALID,
      email: 'c@example.com',
      password: 'x'.repeat(129),
    }).expect(422);

    expect(bodyOf(tooLong).details).toHaveProperty('password');
  });

  it('rejects an invalid email with details.email', async () => {
    const response = await register({ ...VALID, email: 'not-an-email' }).expect(
      422,
    );

    expect(bodyOf(response).code).toBe('VALIDATION_FAILED');
    expect(bodyOf(response).details).toHaveProperty('email');
  });

  it('reports every missing field at once', async () => {
    const response = await register({}).expect(422);

    expect(Object.keys(bodyOf(response).details ?? {}).sort()).toEqual([
      'email',
      'name',
      'password',
    ]);
  });

  it('rejects a blank name made only of spaces', async () => {
    const response = await register({ ...VALID, name: '    ' }).expect(422);

    expect(bodyOf(response).details).toHaveProperty('name');
  });

  it('rejects unknown fields instead of ignoring them, and creates nothing', async () => {
    const response = await register({
      ...VALID,
      id: '00000000-0000-7000-8000-00000000beef',
      userId: 'someone-else',
    }).expect(422);

    expect(bodyOf(response).details).toHaveProperty('userId');
    expect(bodyOf(response).details).toHaveProperty('id');
    expect(await prisma.user.count()).toBe(0);
  });

  it('rejects a body that is not JSON with the standard envelope', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send('{ not json')
      .expect(422);

    expect(bodyOf(response).code).toBe('VALIDATION_FAILED');
    expect(Object.keys(bodyOf(response)).sort()).toEqual([
      'code',
      'details',
      'message',
      'path',
      'requestId',
      'statusCode',
      'timestamp',
    ]);
  });
});
