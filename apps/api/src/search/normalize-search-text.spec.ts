import { normalizeSearchText } from './normalize-search-text';

describe('normalizeSearchText', () => {
  describe('spellings that must become the same string', () => {
    it.each([
      ['alef with hamza above, below, and bare', ['أحمد', 'إحمد', 'احمد']],
      ['alef with madda and bare', ['آمن', 'امن']],
      ['alef wasla and bare', ['ٱلكتاب', 'الكتاب']],
      ['teh marbuta and heh', ['شركة', 'شركه']],
      ['alef maksura and yeh', ['على', 'علي']],
      ['Persian yeh and Arabic yeh', ['عربی', 'عربي']],
      ['Persian kaf and Arabic kaf', ['کتاب', 'كتاب']],
      ['with and without diacritics', ['كِتَابٌ', 'كتاب']],
      ['with and without a superscript alef', ['هٰذا', 'هذا']],
      ['with and without a tatweel', ['كــتاب', 'كتاب']],
      ['upper and lower case Latin', ['Contract', 'contract']],
      ['Arabic-Indic digits and ASCII digits', ['٢٠٢٦', '2026']],
      ['Persian digits and ASCII digits', ['۲۰۲۶', '2026']],
    ])('%s', (_label, [a, b]) => {
      expect(normalizeSearchText(a)).toBe(normalizeSearchText(b));
    });
  });

  it('turns the lam-alef ligature glyph into the two letters it stands for', () => {
    expect(normalizeSearchText('\uFEFB')).toBe('لا');
  });

  it('removes invisible direction and joiner characters that would split a word', () => {
    expect(normalizeSearchText('كت\u200Fاب\u200B')).toBe('كتاب');
  });

  it('does not merge letters that are different words', () => {
    expect(normalizeSearchText('كتب')).not.toBe(normalizeSearchText('كتاب'));
    expect(normalizeSearchText('ذهب')).not.toBe(normalizeSearchText('دهب'));
  });

  it('leaves English and punctuation alone apart from the case', () => {
    expect(normalizeSearchText('Net-30 Payment, due: 2026!')).toBe(
      'net-30 payment, due: 2026!',
    );
  });

  it('handles Arabic and English in one string', () => {
    expect(normalizeSearchText('عقد Contract الشِّرْكَةِ')).toBe(
      'عقد contract الشركه',
    );
  });

  it('is idempotent: normalising twice is the same as once', () => {
    const text = 'أَحْمَدُ في الشَّرِكَةِ ٢٠٢٦ Contract';

    expect(normalizeSearchText(normalizeSearchText(text))).toBe(
      normalizeSearchText(text),
    );
  });

  it('turns an empty string into an empty string', () => {
    expect(normalizeSearchText('')).toBe('');
  });
});
