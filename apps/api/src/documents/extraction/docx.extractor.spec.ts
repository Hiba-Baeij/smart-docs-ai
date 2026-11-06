import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DocxExtractor } from './docx.extractor';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../../../test/fixtures', name));

describe('DocxExtractor', () => {
  const extractor = new DocxExtractor();
  const extract = (buffer: Buffer) =>
    extractor.extract({ buffer, originalName: 'fixture.docx' });

  it('supports docx and nothing else', () => {
    expect(extractor.supports('docx')).toBe(true);
    expect(extractor.supports('pdf')).toBe(false);
    expect(extractor.supports('xlsx')).toBe(false);
  });

  describe('headings and paragraphs', () => {
    it('keeps document order, with headings as level markers', async () => {
      const { text } = await extract(fixture('headings.docx'));

      expect(text).toBe(
        [
          '# Terms of Service',
          'These terms apply to every customer.',
          '## Payment terms',
          'Invoices are due within 30 days of receipt, no exceptions.',
          'Late payments accrue interest.',
          '# Support',
          'Support is available on weekdays.',
        ].join('\n\n'),
      );
    });

    it('lists the headings with their levels, in order', async () => {
      const { headings } = await extract(fixture('headings.docx'));

      expect(headings).toEqual([
        { level: 1, text: 'Terms of Service' },
        { level: 2, text: 'Payment terms' },
        { level: 1, text: 'Support' },
      ]);
    });

    it('joins runs split by formatting into one paragraph', async () => {
      const { text } = await extract(fixture('headings.docx'));

      expect(text).toContain(
        'Invoices are due within 30 days of receipt, no exceptions.',
      );
    });

    it('drops the empty paragraph instead of leaving a gap', async () => {
      const { text } = await extract(fixture('headings.docx'));

      expect(text).not.toMatch(/\n{3,}/);
    });

    it('has no pages or sheets', async () => {
      const result = await extract(fixture('headings.docx'));

      expect(result.pages).toBeUndefined();
      expect(result.sheets).toBeUndefined();
    });
  });

  describe('a table', () => {
    it('is rendered row by row, in its place between the paragraphs', async () => {
      const { text } = await extract(fixture('table.docx'));

      expect(text).toBe(
        [
          'Price list',
          'Plan | Price\nBasic | 10\nPro | 25',
          'Prices exclude tax.',
        ].join('\n\n'),
      );
    });

    it('adds no headings', async () => {
      const { headings } = await extract(fixture('table.docx'));

      expect(headings).toEqual([]);
    });
  });

  describe('awkward content', () => {
    it('trims padded paragraphs, drops whitespace-only ones, keeps a tab', async () => {
      const { text } = await extract(fixture('edge-cases.docx'));
      const blocks = text.split('\n\n');

      expect(blocks[0]).toBe('padded with spaces');
      expect(blocks[1]).toBe('left\tright');
    });

    it('flattens a line break inside a heading and caps the level at 6', async () => {
      const { text, headings } = await extract(fixture('edge-cases.docx'));

      expect(text).toContain('### Split Heading');
      expect(text).toContain('###### Deep');
      expect(headings).toEqual([
        { level: 3, text: 'Split Heading' },
        { level: 6, text: 'Deep' },
      ]);
    });

    it('drops an empty table row and keeps a multi-paragraph cell on one line', async () => {
      const { text } = await extract(fixture('edge-cases.docx'));

      expect(text.endsWith('Name | Note\nAnn | first line second line')).toBe(
        true,
      );
    });
  });

  describe('bytes that are not a readable DOCX', () => {
    it('rejects bytes that are not a Word package', async () => {
      await expect(extract(fixture('text-3-pages.pdf'))).rejects.toThrow();
    });

    it('rejects a truncated real DOCX', async () => {
      await expect(
        extract(fixture('headings.docx').subarray(0, 100)),
      ).rejects.toThrow();
    });
  });
});
