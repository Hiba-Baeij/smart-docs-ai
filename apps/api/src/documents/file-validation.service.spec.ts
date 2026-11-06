import { ErrorCode } from '@smartdocs/contracts';
import JSZip from 'jszip';
import { AppError } from '../common/errors/app-error';
import { FileValidationService } from './file-validation.service';

const PDF_MIME = 'application/pdf';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const pdfBytes = () => Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');

async function zipOf(entries: string[]): Promise<Buffer> {
  const zip = new JSZip();
  for (const name of entries) {
    zip.file(name, '<x/>');
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

const docxBytes = () => zipOf(['[Content_Types].xml', 'word/document.xml']);
const xlsxBytes = () => zipOf(['[Content_Types].xml', 'xl/workbook.xml']);

describe('FileValidationService', () => {
  const service = new FileValidationService();

  const file = (originalname: string, mimetype: string, buffer: Buffer) => ({
    originalname,
    mimetype,
    buffer,
  });

  /** Runs validate and returns the AppError it rejected with. */
  async function rejection(input: ReturnType<typeof file>): Promise<AppError> {
    try {
      await service.validate(input);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      return error as AppError;
    }
    throw new Error('validate resolved, expected a rejection');
  }

  describe('accepts a genuine file of each type and returns its type', () => {
    it('pdf', async () => {
      await expect(
        service.validate(file('report.pdf', PDF_MIME, pdfBytes())),
      ).resolves.toBe('pdf');
    });

    it('docx', async () => {
      await expect(
        service.validate(file('memo.docx', DOCX_MIME, await docxBytes())),
      ).resolves.toBe('docx');
    });

    it('xlsx', async () => {
      await expect(
        service.validate(file('budget.xlsx', XLSX_MIME, await xlsxBytes())),
      ).resolves.toBe('xlsx');
    });

    it('an upper-case extension and a MIME type with parameters', async () => {
      await expect(
        service.validate(
          file('REPORT.PDF', 'Application/PDF; charset=binary', pdfBytes()),
        ),
      ).resolves.toBe('pdf');
    });

    it('a name with several dots uses the last extension', async () => {
      await expect(
        service.validate(file('q3.final.v2.pdf', PDF_MIME, pdfBytes())),
      ).resolves.toBe('pdf');
    });
  });

  describe('extension (415 UNSUPPORTED_FILE_TYPE)', () => {
    it.each([
      ['no extension', 'report'],
      ['a plain-text extension', 'notes.txt'],
      ['the old Word format', 'memo.doc'],
      ['a dangerous extension after .pdf', 'report.pdf.exe'],
      ['only a dot-file name', '.pdf'],
      ['a trailing dot', 'report.'],
    ])('rejects %s', async (_label, name) => {
      const error = await rejection(file(name, PDF_MIME, pdfBytes()));

      expect(error.code).toBe(ErrorCode.UNSUPPORTED_FILE_TYPE);
      expect(error.message).toMatch(/extension/);
    });
  });

  describe('declared MIME type (415 UNSUPPORTED_FILE_TYPE)', () => {
    it.each([
      ['text/plain on a .pdf', 'a.pdf', 'text/plain'],
      ['octet-stream on a .pdf', 'a.pdf', 'application/octet-stream'],
      ['an empty MIME type', 'a.pdf', ''],
      ['the PDF type on a .docx', 'a.docx', PDF_MIME],
      ['the DOCX type on a .xlsx', 'a.xlsx', DOCX_MIME],
    ])('rejects %s', async (_label, name, mime) => {
      const error = await rejection(file(name, mime, pdfBytes()));

      expect(error.code).toBe(ErrorCode.UNSUPPORTED_FILE_TYPE);
      expect(error.message).toMatch(/content type/);
    });
  });

  describe('empty buffer (422 VALIDATION_FAILED)', () => {
    it.each([
      ['pdf', 'a.pdf', PDF_MIME],
      ['docx', 'a.docx', DOCX_MIME],
      ['xlsx', 'a.xlsx', XLSX_MIME],
    ])(
      'rejects an empty %s as invalid, not as unsupported',
      async (_t, n, m) => {
        const error = await rejection(file(n, m, Buffer.alloc(0)));

        expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
        expect(error.details).toEqual({ file: ['The file is empty.'] });
      },
    );
  });

  describe('content (415 UNSUPPORTED_FILE_TYPE)', () => {
    const cases: Array<[string, string, string, () => Promise<Buffer>]> = [
      [
        'text renamed to .pdf',
        'a.pdf',
        PDF_MIME,
        () => Promise.resolve(Buffer.from('just some text')),
      ],
      ['a ZIP renamed to .pdf', 'a.pdf', PDF_MIME, docxBytes],
      [
        'a PDF whose header is not at the start',
        'a.pdf',
        PDF_MIME,
        () => Promise.resolve(Buffer.concat([Buffer.from(' '), pdfBytes()])),
      ],
      [
        'a PDF renamed to .docx',
        'a.docx',
        DOCX_MIME,
        () => Promise.resolve(pdfBytes()),
      ],
      [
        'a plain ZIP renamed to .docx',
        'a.docx',
        DOCX_MIME,
        () => zipOf(['readme.txt']),
      ],
      [
        'a ZIP with a word/ folder but no document part',
        'a.docx',
        DOCX_MIME,
        () => zipOf(['[Content_Types].xml', 'word/styles.xml']),
      ],
      [
        'a ZIP with word/document.xml but no content types part',
        'a.docx',
        DOCX_MIME,
        () => zipOf(['word/document.xml']),
      ],
      ['an XLSX renamed to .docx', 'a.docx', DOCX_MIME, xlsxBytes],
      [
        'a valid DOCX with bytes in front of the ZIP signature',
        'a.docx',
        DOCX_MIME,
        async () => Buffer.concat([Buffer.from('GIF89a'), await docxBytes()]),
      ],
      ['a DOCX renamed to .xlsx', 'a.xlsx', XLSX_MIME, docxBytes],
      [
        'a plain ZIP renamed to .xlsx',
        'a.xlsx',
        XLSX_MIME,
        () => zipOf(['data.csv']),
      ],
      [
        'bytes that start like a ZIP but are corrupt',
        'a.docx',
        DOCX_MIME,
        () =>
          Promise.resolve(
            Buffer.concat([
              Buffer.from([0x50, 0x4b, 0x03, 0x04]),
              Buffer.alloc(40, 7),
            ]),
          ),
      ],
      [
        'a truncated DOCX',
        'a.docx',
        DOCX_MIME,
        async () => (await docxBytes()).subarray(0, 30),
      ],
    ];

    it.each(cases)('rejects %s', async (_label, name, mime, build) => {
      const error = await rejection(file(name, mime, await build()));

      expect(error.code).toBe(ErrorCode.UNSUPPORTED_FILE_TYPE);
      expect(error.message).toMatch(/content is not a valid/);
    });

    it('names the type the file claimed, never its content', async () => {
      const error = await rejection(
        file('a.xlsx', XLSX_MIME, Buffer.from('secret payroll')),
      );

      expect(error.message).toBe('The file content is not a valid XLSX file.');
      expect(error.message).not.toContain('payroll');
    });
  });

  describe('the checks run in order, cheapest first', () => {
    it('extension before MIME', async () => {
      const error = await rejection(
        file('a.txt', 'text/plain', Buffer.alloc(0)),
      );

      expect(error.message).toMatch(/extension/);
    });

    it('MIME before emptiness', async () => {
      const error = await rejection(
        file('a.pdf', 'text/plain', Buffer.alloc(0)),
      );

      expect(error.message).toMatch(/content type/);
    });

    it('emptiness before content', async () => {
      const error = await rejection(file('a.pdf', PDF_MIME, Buffer.alloc(0)));

      expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
    });
  });
});
