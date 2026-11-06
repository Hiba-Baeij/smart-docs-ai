import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PdfExtractor } from './pdf.extractor';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../../../test/fixtures', name));

describe('PdfExtractor', () => {
  const extractor = new PdfExtractor();
  const extract = (buffer: Buffer) =>
    extractor.extract({ buffer, originalName: 'fixture.pdf' });

  it('supports pdf and nothing else', () => {
    expect(extractor.supports('pdf')).toBe(true);
    expect(extractor.supports('docx')).toBe(false);
    expect(extractor.supports('xlsx')).toBe(false);
  });

  describe('a three-page PDF with text', () => {
    it('returns one entry per page, numbered from 1 in order', async () => {
      const result = await extract(fixture('text-3-pages.pdf'));

      expect(result.pages?.map((page) => page.pageNumber)).toEqual([1, 2, 3]);
    });

    it('attributes each sentence to the page it is on', async () => {
      const { pages } = await extract(fixture('text-3-pages.pdf'));

      expect(pages?.[0].text).toBe('Page one covers the refund policy.');
      expect(pages?.[1].text).toBe('Page two covers the shipping times.');
      expect(pages?.[2].text).toBe(
        'Page three covers the warranty terms.\nPage three also has a second line.',
      );
    });

    it('builds the full text from the pages, in page order', async () => {
      const { text } = await extract(fixture('text-3-pages.pdf'));

      expect(text).toBe(
        [
          'Page one covers the refund policy.',
          'Page two covers the shipping times.',
          'Page three covers the warranty terms.\nPage three also has a second line.',
        ].join('\n\n'),
      );
    });

    it('leaves the caller buffer intact', async () => {
      const buffer = fixture('text-3-pages.pdf');
      const copy = Buffer.from(buffer);

      await extract(buffer);

      expect(buffer.equals(copy)).toBe(true);
      // Extracting the same bytes again must work too.
      await expect(extract(buffer)).resolves.toHaveProperty('pages');
    });
  });

  describe('a PDF with a blank page between two text pages', () => {
    it('keeps the blank page so numbering stays true, and skips it in the full text', async () => {
      const result = await extract(fixture('text-blank-middle.pdf'));

      expect(result.pages).toEqual([
        { pageNumber: 1, text: 'First page text.' },
        { pageNumber: 2, text: '' },
        { pageNumber: 3, text: 'Third page text.' },
      ]);
      expect(result.text).toBe('First page text.\n\nThird page text.');
    });
  });

  describe('a scanned PDF (pages are only an image)', () => {
    it('reports its pages with no text; deciding that is a failure is not the adapter job', async () => {
      const result = await extract(fixture('scanned.pdf'));

      expect(result.text).toBe('');
      expect(result.pages).toEqual([
        { pageNumber: 1, text: '' },
        { pageNumber: 2, text: '' },
      ]);
    });
  });

  describe('bytes that are not a readable PDF', () => {
    it('rejects, so the use case can record EXTRACTION_FAILED', async () => {
      const garbage = Buffer.concat([
        Buffer.from('%PDF-1.4\n'),
        Buffer.alloc(200, 7),
      ]);

      await expect(extract(garbage)).rejects.toThrow();
    });

    it('rejects a truncated real PDF', async () => {
      const truncated = fixture('text-3-pages.pdf').subarray(0, 200);

      await expect(extract(truncated)).rejects.toThrow();
    });
  });
});
