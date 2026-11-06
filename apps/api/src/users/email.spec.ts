import { normalizeEmail } from './email';

describe('normalizeEmail', () => {
  it('lowercases the address', () => {
    expect(normalizeEmail('Sara.Ahmed@Example.COM')).toBe(
      'sara.ahmed@example.com',
    );
  });

  it('trims surrounding whitespace, including tabs and newlines', () => {
    expect(normalizeEmail('  sara@example.com \t\n')).toBe('sara@example.com');
  });

  it('does not touch whitespace or characters inside the address', () => {
    expect(normalizeEmail('sara+tag@example.com')).toBe('sara+tag@example.com');
    expect(normalizeEmail('a b@example.com')).toBe('a b@example.com');
  });

  it('is idempotent', () => {
    const once = normalizeEmail('  MiXeD@Example.com ');

    expect(normalizeEmail(once)).toBe(once);
  });

  it('maps addresses that differ only in case or padding to the same value', () => {
    expect(normalizeEmail(' SARA@example.com')).toBe(
      normalizeEmail('sara@EXAMPLE.com  '),
    );
  });
});
