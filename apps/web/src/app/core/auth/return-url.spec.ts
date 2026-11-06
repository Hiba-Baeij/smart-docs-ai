import { safeReturnUrl } from './return-url';

describe('safeReturnUrl', () => {
  describe('keeps a path on this site', () => {
    it.each([
      '/documents',
      '/documents/42',
      '/documents/42?tab=text#top',
      '/chat/9f1c',
      '/',
      '/%2F/looks-odd-but-stays-on-this-site',
    ])('%s', (path) => {
      expect(safeReturnUrl(path)).toBe(path);
    });
  });

  describe('falls back for anything that could leave the site', () => {
    it.each([
      ['an absolute URL', 'https://evil.example/steal'],
      ['an absolute http URL', 'http://evil.example'],
      ['a protocol-relative URL', '//evil.example'],
      ['three slashes', '///evil.example'],
      ['a backslash, which browsers read as a slash', '/\\evil.example'],
      ['a tab, which browsers drop', '/\t/evil.example'],
      ['a newline, which browsers drop', '/\n/evil.example'],
      ['a javascript: URL', 'javascript:alert(1)'],
      ['a data: URL', 'data:text/html,<script>alert(1)</script>'],
      ['a path without a leading slash', 'documents'],
      ['an empty string', ''],
    ])('%s', (_label, value) => {
      expect(safeReturnUrl(value)).toBe('/documents');
    });

    it('falls back when there is no value at all', () => {
      expect(safeReturnUrl(null)).toBe('/documents');
      expect(safeReturnUrl(undefined)).toBe('/documents');
    });
  });

  it('uses the fallback it is given', () => {
    expect(safeReturnUrl('//evil.example', '/home')).toBe('/home');
  });
});
