import './support/upload-limit-env';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { ApiError, DocumentSummary } from '@smartdocs/contracts';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import {
  UploadDocumentInput,
  UploadDocumentService,
} from './../src/documents/upload-document.service';
import { hashPassword } from './../src/auth/password';
import { PrismaService } from './../src/prisma/prisma.service';
import { resetDatabase } from './support/test-database';

const bodyOf = (response: { body: unknown }) => response.body as ApiError;

/** Matches MAX_UPLOAD_BYTES in support/upload-limit-env.ts. */
const LIMIT = 1024;

const summary: DocumentSummary = {
  id: 'doc-1',
  originalName: 'report.pdf',
  fileType: 'pdf',
  status: 'COMPLETED',
  errorCode: null,
  chunkCount: 0,
  createdAt: '2026-10-31T00:00:00.000Z',
};

describe('POST /api/documents/upload, the HTTP edge (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cookie: string;
  let userId: string;
  const received: UploadDocumentInput[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // Task 4.1 owns the edge only; what happens after the file arrives is tested in 4.6+.
      .overrideProvider(UploadDocumentService)
      .useValue({
        execute: (input: UploadDocumentInput) => {
          received.push(input);
          return Promise.resolve(summary);
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    const user = await prisma.user.create({
      data: {
        name: 'Sara Ahmed',
        email: 'sara@example.com',
        passwordHash: await hashPassword('correct horse battery'),
      },
    });
    userId = user.id;
    cookie = `sid=${await app.get(JwtService).signAsync({ sub: userId })}`;
  });

  beforeEach(() => {
    received.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  const upload = (withCookie = true) => {
    const call = request(app.getHttpServer()).post('/api/documents/upload');
    return withCookie ? call.set('Cookie', cookie) : call;
  };

  const bytes = (size: number) => Buffer.alloc(size, 'a');

  describe('a file within the limit', () => {
    it('reaches the use case with the caller id and the bytes in memory', async () => {
      const content = bytes(100);

      const response = await upload()
        .attach('file', content, 'report.pdf')
        .expect(201);

      expect(response.body).toEqual(summary);
      expect(received).toHaveLength(1);
      expect(received[0].userId).toBe(userId);
      expect(received[0].file.originalname).toBe('report.pdf');
      expect(received[0].file.buffer.equals(content)).toBe(true);
      // Memory storage: there is no file on disk to leak or to clean up.
      expect((received[0].file as { path?: string }).path).toBeUndefined();
    });

    it('accepts a file of exactly the limit', async () => {
      await upload().attach('file', bytes(LIMIT), 'edge.pdf').expect(201);

      expect(received[0].file.size).toBe(LIMIT);
    });
  });

  describe('a file over the limit', () => {
    it('is 413 FILE_TOO_LARGE one byte over, and never reaches the use case', async () => {
      const response = await upload()
        .attach('file', bytes(LIMIT + 1), 'edge.pdf')
        .expect(413);

      expect(bodyOf(response).code).toBe('FILE_TOO_LARGE');
      expect(received).toHaveLength(0);
    });

    it('is 413 for a body far over the limit, and creates no document row', async () => {
      const response = await upload()
        .attach('file', bytes(LIMIT * 500), 'huge.pdf')
        .expect(413);

      expect(bodyOf(response).code).toBe('FILE_TOO_LARGE');
      expect(received).toHaveLength(0);
      expect(await prisma.document.count()).toBe(0);
    });
  });

  describe('authentication comes before the body is read', () => {
    it('is 401 without a session', async () => {
      const response = await upload(false)
        .attach('file', bytes(100), 'report.pdf')
        .expect(401);

      expect(bodyOf(response).code).toBe('AUTH_REQUIRED');
      expect(received).toHaveLength(0);
    });

    it('is 401, not 413, for an oversized file from an anonymous caller', async () => {
      const response = await upload(false)
        .attach('file', bytes(LIMIT + 1), 'edge.pdf')
        .expect(401);

      expect(bodyOf(response).code).toBe('AUTH_REQUIRED');
    });
  });

  describe('a malformed request is 422 VALIDATION_FAILED', () => {
    it('without a file part', async () => {
      const response = await upload().field('note', 'no file here').expect(422);

      expect(bodyOf(response).code).toBe('VALIDATION_FAILED');
      expect(bodyOf(response).details).toEqual({
        file: ['A file is required.'],
      });
    });

    it('with a JSON body instead of multipart', async () => {
      const response = await upload().send({ file: 'text' }).expect(422);

      expect(bodyOf(response).code).toBe('VALIDATION_FAILED');
    });

    it('with the file under another field name', async () => {
      const response = await upload()
        .attach('document', bytes(100), 'report.pdf')
        .expect(422);

      expect(bodyOf(response).code).toBe('VALIDATION_FAILED');
      expect(received).toHaveLength(0);
    });

    it('with two files, which is one more than a request may carry', async () => {
      const response = await upload()
        .attach('file', bytes(100), 'one.pdf')
        .attach('file', bytes(100), 'two.pdf')
        .expect(422);

      expect(bodyOf(response).code).toBe('VALIDATION_FAILED');
      expect(received).toHaveLength(0);
    });
  });
});
