import { toStorableText } from './extracted-text';

describe('toStorableText', () => {
  it('removes every NUL character', () => {
    expect(toStorableText('a\u0000b\u0000\u0000c')).toBe('abc');
  });

  it('returns text without NULs unchanged, whitespace and line endings included', () => {
    const text = '  indented\r\nnext line\n\n\ttabbed  \n';

    expect(toStorableText(text)).toBe(text);
  });

  it('keeps other control characters and non-Latin text', () => {
    const text = 'a\u0001b مرحبا 👋';

    expect(toStorableText(text)).toBe(text);
  });

  it('turns text that was only NULs into an empty string', () => {
    expect(toStorableText('\u0000\u0000')).toBe('');
  });
});
