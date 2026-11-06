import './support/processing-limits-env';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { ApiError } from '@smartdocs/contracts';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { hashPassword } from './../src/auth/password';
import {
  DOCUMENT_EXTRACTORS,
  ExtractedDocument,
} from './../src/documents/extraction/document-extractor';
import { PrismaService } from './../src/prisma/prisma.service';
import { resetDatabase } from './support/test-database';

const bodyOf = (response: { body: unknown }) => response.body as ApiError;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A minimal but real PDF: the content check passes and the extractor under test takes over.
const PDF_BYTES = Buffer.from('%PDF-1.4\n%%EOF');

/**
 * The extractor is replaced by one the test controls, so each case can make extraction return
 * what it wants, take as long as it wants, or throw. Limits (100 characters, 300 ms) come from
 * support/processing-limits-env.ts.
 */
describe('POST /api/documents/upload, limits and status transitions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cookie: string;
  let behavior: () => Promise<ExtractedDocument>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DOCUMENT_EXTRACTORS)
      .useValue([{ supports: () => true, extract: () => behavior() }])
      .compile();
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
  });

  afterAll(async () => {
    await app.close();
  });

  const upload = () =>
    request(app.getHttpServer())
      .post('/api/documents/upload')
      .set('Cookie', cookie)
      .attach('file', PDF_BYTES, 'report.pdf');

  const onlyRow = async () => {
    const rows = await prisma.document.findMany();
    expect(rows).toHaveLength(1);
    return rows[0];
  };

  describe('status transitions', () => {
    it('is PROCESSING, committed and visible, while extraction runs, then COMPLETED', async () => {
      let during: { status: string; extractedText: string }[] = [];
      behavior = async () => {
        during = await prisma.document.findMany({
          select: { status: true, extractedText: true },
        });
        return { text: 'some extracted text' };
      };

      await upload().expect(201);

      expect(during).toEqual([{ status: 'PROCESSING', extractedText: '' }]);
      expect(await onlyRow()).toMatchObject({
        status: 'COMPLETED',
        errorCode: null,
        extractedText: 'some extracted text',
      });
    });

    it('is PROCESSING, then FAILED with the code, when extraction ends in failure', async () => {
      let during: string[] = [];
      behavior = async () => {
        during = (await prisma.document.findMany()).map((row) => row.status);
        return { text: '   \n ' };
      };

      await upload().expect(422);

      expect(during).toEqual(['PROCESSING']);
      expect(await onlyRow()).toMatchObject({
        status: 'FAILED',
        errorCode: 'EMPTY_EXTRACTION',
      });
    });
  });

  describe('no text', () => {
    it('whitespace only is 422 EMPTY_EXTRACTION, FAILED, nothing stored', async () => {
      behavior = () => Promise.resolve({ text: ' \n\t ' });

      const response = await upload().expect(422);

      expect(bodyOf(response).code).toBe('EMPTY_EXTRACTION');
      expect(await onlyRow()).toMatchObject({
        status: 'FAILED',
        errorCode: 'EMPTY_EXTRACTION',
        extractedText: '',
      });
    });
  });

  describe('the character cap (100 here)', () => {
    it('allows exactly the cap', async () => {
      behavior = () => Promise.resolve({ text: 'a'.repeat(100) });

      await upload().expect(201);

      expect((await onlyRow()).extractedText).toHaveLength(100);
    });

    it('one character over is 413 FILE_TOO_LARGE, FAILED, with none of the text stored', async () => {
      behavior = () => Promise.resolve({ text: 'a'.repeat(101) });

      const response = await upload().expect(413);

      expect(bodyOf(response).code).toBe('FILE_TOO_LARGE');
      expect(bodyOf(response).message).toBe(
        'The document contains too much text to process.',
      );
      expect(await onlyRow()).toMatchObject({
        status: 'FAILED',
        errorCode: 'FILE_TOO_LARGE',
        extractedText: '',
      });
    });
  });

  describe('a parser that throws', () => {
    it('is 422 EXTRACTION_FAILED, FAILED, and its message stays out of the response', async () => {
      behavior = () =>
        Promise.reject(new Error('secret parser detail: offset 4096'));

      const response = await upload().expect(422);

      expect(bodyOf(response).code).toBe('EXTRACTION_FAILED');
      expect(JSON.stringify(response.body)).not.toContain('secret parser');
      expect(await onlyRow()).toMatchObject({
        status: 'FAILED',
        errorCode: 'EXTRACTION_FAILED',
      });
    });
  });

  describe('the time budget (300 ms here)', () => {
    it('is 504 PROCESSING_TIMEOUT, FAILED, and a late result never changes the row', async () => {
      behavior = async () => {
        await sleep(900);
        return { text: 'finished far too late' };
      };

      const startedAt = Date.now();
      const response = await upload().expect(504);

      expect(Date.now() - startedAt).toBeLessThan(800);
      expect(bodyOf(response).code).toBe('PROCESSING_TIMEOUT');
      expect(await onlyRow()).toMatchObject({
        status: 'FAILED',
        errorCode: 'PROCESSING_TIMEOUT',
        extractedText: '',
      });

      // The parser finishes after the client already has its 504.
      await sleep(900);

      expect(await onlyRow()).toMatchObject({
        status: 'FAILED',
        errorCode: 'PROCESSING_TIMEOUT',
        extractedText: '',
      });
    });

    it('does not fire for work that finishes within the budget', async () => {
      behavior = async () => {
        await sleep(100);
        return { text: 'in time' };
      };

      await upload().expect(201);
    });
  });
});
