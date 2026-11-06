import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { XlsxExtractor } from './xlsx.extractor';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../../../test/fixtures', name));

describe('XlsxExtractor', () => {
  const extractor = new XlsxExtractor();
  const extract = (buffer: Buffer) =>
    extractor.extract({ buffer, originalName: 'fixture.xlsx' });

  it('supports xlsx and nothing else', () => {
    expect(extractor.supports('xlsx')).toBe(true);
    expect(extractor.supports('pdf')).toBe(false);
    expect(extractor.supports('docx')).toBe(false);
  });

  describe('a workbook with headers', () => {
    it('renders every data row as "header: value" pairs under the sheet name', async () => {
      const { text } = await extract(fixture('budget.xlsx'));

      expect(text).toBe(
        [
          'Sheet: Q3 Budget',
          'Category: Travel | Planned: 12000 | Actual: 9800 | Variance: -2200',
          'Category: Software | Planned: 3000 | Actual: 3150 | Variance: 150',
          '',
          'Sheet: Deadlines',
          'Item: Audit | Due: 2026-03-31 | Done: FALSE',
        ].join('\n'),
      );
    });

    it('keeps the sheet names, in workbook order, with the header as the first row', async () => {
      const { sheets } = await extract(fixture('budget.xlsx'));

      expect(sheets).toEqual([
        {
          sheetName: 'Q3 Budget',
          hasHeader: true,
          rows: [
            ['Category', 'Planned', 'Actual', 'Variance'],
            ['Travel', '12000', '9800', '-2200'],
            ['Software', '3000', '3150', '150'],
          ],
        },
        {
          sheetName: 'Deadlines',
          hasHeader: true,
          rows: [
            ['Item', 'Due', 'Done'],
            ['Audit', '2026-03-31', 'FALSE'],
          ],
        },
      ]);
    });

    it('skips the empty row between data rows', async () => {
      const { sheets } = await extract(fixture('budget.xlsx'));

      expect(sheets?.[0].rows).toHaveLength(3);
    });

    it('has no pages or headings', async () => {
      const result = await extract(fixture('budget.xlsx'));

      expect(result.pages).toBeUndefined();
      expect(result.headings).toBeUndefined();
    });
  });

  describe('a sheet with no header row', () => {
    it('numbers the columns and says so, instead of treating data as labels', async () => {
      const { text, sheets } = await extract(fixture('no-header.xlsx'));

      expect(text).toBe(
        [
          'Sheet: Data (no header row; columns are numbered)',
          'column 1: 1 | column 2: 2 | column 3: 3',
          'column 1: 4 | column 2: 5 | column 3: 6',
        ].join('\n'),
      );
      expect(sheets).toEqual([
        {
          sheetName: 'Data',
          hasHeader: false,
          rows: [
            ['column 1', 'column 2', 'column 3'],
            ['1', '2', '3'],
            ['4', '5', '6'],
          ],
        },
      ]);
    });
  });

  describe('awkward sheets', () => {
    it('leaves out an empty sheet and a sheet that has only a header', async () => {
      const { sheets } = await extract(fixture('edge-cases.xlsx'));

      expect(sheets?.map((sheet) => sheet.sheetName)).toEqual([
        'Mixed',
        'Messy',
      ]);
    });

    it('uses the first non-empty row as the header and names blank or missing header cells', async () => {
      const { sheets } = await extract(fixture('edge-cases.xlsx'));

      expect(sheets?.find((s) => s.sheetName === 'Messy')?.rows[0]).toEqual([
        'Name',
        'column 2',
        'Score',
        'column 4',
      ]);
    });

    it('skips empty cells and empty rows when rendering', async () => {
      const { text } = await extract(fixture('edge-cases.xlsx'));

      expect(text).toContain(
        [
          'Sheet: Messy',
          'Name: Ann | column 2: ignored? no, kept | Score: 90 | column 4: extra cell',
          'Name: Bob',
          'Score: 70',
        ].join('\n'),
      );
    });

    it('does not take a first row that holds a number for a header', async () => {
      const { sheets } = await extract(fixture('edge-cases.xlsx'));

      expect(sheets?.find((s) => s.sheetName === 'Mixed')).toEqual({
        sheetName: 'Mixed',
        hasHeader: false,
        rows: [
          ['column 1', 'column 2'],
          ['Total', '5'],
          ['x', '1'],
        ],
      });
    });
  });

  describe('bytes that are not a readable XLSX', () => {
    it('rejects bytes that are not a ZIP', async () => {
      await expect(extract(fixture('text-3-pages.pdf'))).rejects.toThrow();
    });

    it('rejects a Word package', async () => {
      await expect(extract(fixture('headings.docx'))).rejects.toThrow();
    });

    it('rejects a truncated real XLSX', async () => {
      await expect(
        extract(fixture('budget.xlsx').subarray(0, 100)),
      ).rejects.toThrow();
    });
  });
});
