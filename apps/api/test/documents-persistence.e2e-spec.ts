import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { ApiError } from '@smartdocs/contracts';
import { createHash } from 'node:crypto';
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
const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

// A minimal but real PDF: the content check passes and the extractor under test takes over.
const PDF_BYTES = Buffer.from('%PDF-1.4\n%%EOF');

/**
 * What the extractor returns is what the database holds, character for character. The
 * extractor is replaced by one the test controls so the text can be exactly what a hostile or
 * unusual file would produce; default limits apply (2,000,000 characters).
 */
describe('extractedText persistence (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cookie: string;
  let extracted: string;
  /** The pages or sheets an extractor reports besides the text; chunks are built from these. */
  let structure: Partial<ExtractedDocument> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DOCUMENT_EXTRACTORS)
      .useValue([
        {
          supports: () => true,
          extract: (): Promise<ExtractedDocument> =>
            Promise.resolve({ text: extracted, ...structure }),
        },
      ])
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    structure = {};
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

  it('stores whitespace, line endings and indentation exactly as extracted', async () => {
    extracted = '  line one\r\nline two\n\n\ttabbed  \n';

    await upload().expect(201);

    expect((await onlyRow()).extractedText).toBe(extracted);
  });

  it('round-trips Arabic, CJK and characters outside the BMP', async () => {
    extracted = 'مرحبا بالعالم — 日本語 — 👋🏽 𝒳';

    await upload().expect(201);

    expect((await onlyRow()).extractedText).toBe(extracted);
  });

  describe('the NUL character, which PostgreSQL text cannot hold', () => {
    it('is removed, and the rest of the text is stored', async () => {
      extracted = 'before\u0000after\u0000';

      await upload().expect(201);

      expect(await onlyRow()).toMatchObject({
        status: 'COMPLETED',
        extractedText: 'beforeafter',
      });
    });

    it('is removed from the pages and sheets the chunks are built from, too', async () => {
      extracted = 'a\u0000b';
      structure = {
        pages: [{ pageNumber: 4, text: 'pa\u0000ge text' }],
      };
      await upload().expect(201);
      let [chunk] = await prisma.documentChunk.findMany();
      expect(chunk).toMatchObject({ content: 'page text', pageNumber: 4 });

      await resetDatabase(prisma);
      await prisma.user.create({
        data: {
          name: 'Sara Ahmed',
          email: 'sara@example.com',
          passwordHash: await hashPassword('correct horse battery'),
        },
      });
      cookie = `sid=${await app.get(JwtService).signAsync({
        sub: (await prisma.user.findFirstOrThrow()).id,
      })}`;
      structure = {
        sheets: [
          {
            sheetName: 'Sh\u0000eet',
            hasHeader: true,
            rows: [['Na\u0000me'], ['A\u0000nn']],
          },
        ],
      };
      await upload().expect(201);
      [chunk] = await prisma.documentChunk.findMany();
      expect(chunk).toMatchObject({
        content: 'Sheet: Sheet\nName: Ann',
        sheetName: 'Sheet',
      });
    });

    it('leaves nothing to extract when the text was only NULs: EMPTY_EXTRACTION', async () => {
      extracted = '\u0000\u0000';

      const response = await upload().expect(422);

      expect(bodyOf(response).code).toBe('EMPTY_EXTRACTION');
      expect(await onlyRow()).toMatchObject({
        status: 'FAILED',
        errorCode: 'EMPTY_EXTRACTION',
        extractedText: '',
      });
    });
  });

  describe('a large document', () => {
    it('stores 1,900,000 characters unchanged', async () => {
      extracted = 'سطر من النص. Line of text. '
        .repeat(70_400)
        .slice(0, 1_900_000);
      expect(extracted).toHaveLength(1_900_000);

      await upload().expect(201);

      const stored = (await onlyRow()).extractedText;
      expect(stored).toHaveLength(extracted.length);
      expect(sha256(stored)).toBe(sha256(extracted));
    });

    it('is refused above the default cap of 2,000,000 characters', async () => {
      extracted = 'a'.repeat(2_000_001);

      const response = await upload().expect(413);

      expect(bodyOf(response).code).toBe('FILE_TOO_LARGE');
      expect(await onlyRow()).toMatchObject({
        status: 'FAILED',
        extractedText: '',
      });
    });
  });
});
