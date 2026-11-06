import { sanitizeOriginalName } from './original-name';

describe('sanitizeOriginalName', () => {
  it('leaves an ordinary name, including Arabic, untouched', () => {
    expect(sanitizeOriginalName('Q3 report (final).pdf')).toBe(
      'Q3 report (final).pdf',
    );
    expect(sanitizeOriginalName('تقرير المبيعات.pdf')).toBe(
      'تقرير المبيعات.pdf',
    );
  });

  it('removes control characters, including the NUL byte PostgreSQL rejects', () => {
    expect(sanitizeOriginalName('re\u0000po\nrt\t.pdf')).toBe('report.pdf');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeOriginalName('  report.pdf  ')).toBe('report.pdf');
  });

  it('caps the length at 255 and keeps the extension', () => {
    const result = sanitizeOriginalName(`${'a'.repeat(400)}.xlsx`);

    expect(result).toHaveLength(255);
    expect(result.endsWith('.xlsx')).toBe(true);
  });

  it('leaves a name of exactly 255 characters alone', () => {
    const name = `${'a'.repeat(251)}.pdf`;

    expect(sanitizeOriginalName(name)).toBe(name);
  });
});
