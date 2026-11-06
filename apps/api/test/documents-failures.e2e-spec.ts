import { INestApplication, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { ApiError } from '@smartdocs/contracts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { hashPassword } from './../src/auth/password';
import { PrismaService } from './../src/prisma/prisma.service';
import { resetDatabase } from './support/test-database';

const bodyOf = (response: { body: unknown }) => response.body as ApiError;
const pdf = readFileSync(join(__dirname, 'fixtures', 'text-3-pages.pdf'));
// A valid header and a body the parser cannot read.
const brokenPdf = Buffer.concat([
  Buffer.from('%PDF-1.4\n'),
  Buffer.alloc(200, 7),
]);

const databaseError = () =>
  new Error('connection terminated: secret database detail');

/**
 * Failures the database causes, not the file. The database is made to fail at chosen points of
 * the write sequence by replacing one Prisma call; every other call is the real one.
 */
describe('POST /api/documents/upload, when the database fails (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cookie: string;
  let logged: jest.SpyInstance;

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
    const user = await prisma.user.create({
      data: {
        name: 'Sara Ahmed',
        email: 'sara@example.com',
        passwordHash: await hashPassword('correct horse battery'),
      },
    });
    cookie = `sid=${await app.get(JwtService).signAsync({ sub: user.id })}`;
    // The failures below are logged on purpose; keep the test output readable and assertable.
    logged = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const upload = (content: Buffer = pdf) =>
    request(app.getHttpServer())
      .post('/api/documents/upload')
      .set('Cookie', cookie)
      .attach('file', content, 'report.pdf');

  const rows = () => prisma.document.findMany();

  /** The write of the chunks and COMPLETED (one transaction) fails, as if the commit were lost. */
  const failTheCommit = () =>
    jest.spyOn(prisma, '$transaction').mockRejectedValueOnce(databaseError());

  it('when the transaction that stores the chunks and the text fails: 500 INTERNAL, the row is FAILED/INTERNAL, no text, no chunks', async () => {
    failTheCommit();

    const response = await upload().expect(500);

    expect(bodyOf(response).code).toBe('INTERNAL');
    expect(JSON.stringify(response.body)).not.toContain('secret database');
    expect(await rows()).toMatchObject([
      { status: 'FAILED', errorCode: 'INTERNAL', extractedText: '' },
    ]);
    expect(await prisma.documentChunk.count()).toBe(0);
  });

  it('when creating the PROCESSING row fails: 500, no row, and extraction never runs', async () => {
    jest
      .spyOn(prisma.document, 'create')
      .mockRejectedValueOnce(databaseError());

    const response = await upload().expect(500);

    expect(bodyOf(response).code).toBe('INTERNAL');
    expect(await rows()).toHaveLength(0);
  });

  describe('when recording the failure fails as well (the database is gone)', () => {
    it('reports the original error, leaves the row PROCESSING, and logs it', async () => {
      failTheCommit();
      jest.spyOn(prisma.document, 'update').mockRejectedValue(databaseError());

      const response = await upload().expect(500);

      expect(bodyOf(response).code).toBe('INTERNAL');
      jest.restoreAllMocks();
      expect(await rows()).toMatchObject([
        { status: 'PROCESSING', errorCode: null, extractedText: '' },
      ]);
      expect(logged).toHaveBeenCalledWith(
        expect.stringMatching(/could not mark document .* as FAILED/),
      );
      expect(JSON.stringify(logged.mock.calls)).not.toContain(
        'secret database detail',
      );
    });

    it('still reports a parser failure as EXTRACTION_FAILED, not as the database error', async () => {
      jest.spyOn(prisma.document, 'update').mockRejectedValue(databaseError());

      const response = await upload(brokenPdf).expect(422);

      expect(bodyOf(response).code).toBe('EXTRACTION_FAILED');
      jest.restoreAllMocks();
      expect(await rows()).toMatchObject([{ status: 'PROCESSING' }]);
    });
  });

  it('a failure leaves the next upload unaffected', async () => {
    failTheCommit();
    await upload().expect(500);

    await upload().expect(201);

    expect((await rows()).map((row) => row.status).sort()).toEqual([
      'COMPLETED',
      'FAILED',
    ]);
  });

  it('every failed document, whatever the cause, has zero chunks', async () => {
    failTheCommit();
    await upload().expect(500);
    await upload(brokenPdf).expect(422);
    await upload(
      readFileSync(join(__dirname, 'fixtures', 'scanned.pdf')),
    ).expect(422);

    const failed = await prisma.document.findMany({
      where: { status: 'FAILED' },
      include: { _count: { select: { chunks: true } } },
    });

    expect(failed).toHaveLength(3);
    expect(failed.map((row) => row._count.chunks)).toEqual([0, 0, 0]);
  });
});
