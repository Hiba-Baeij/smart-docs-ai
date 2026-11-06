import { TITLE_MAX_CHARACTERS, defaultTitle } from './conversation-title';

describe('defaultTitle', () => {
  it('is the question itself when it is short', () => {
    expect(defaultTitle('What is the notice period?')).toBe(
      'What is the notice period?',
    );
  });

  it('is cut at 60 characters with an ellipsis when it is longer', () => {
    const question = 'a'.repeat(100);

    expect(defaultTitle(question)).toBe(`${'a'.repeat(60)}…`);
  });

  it('keeps a question of exactly 60 characters whole', () => {
    const question = 'b'.repeat(TITLE_MAX_CHARACTERS);

    expect(defaultTitle(question)).toBe(question);
  });

  it('does not leave a space before the ellipsis', () => {
    const question = `${'word '.repeat(12)}and more`;

    expect(defaultTitle(question).endsWith(' …')).toBe(false);
    expect(defaultTitle(question).endsWith('…')).toBe(true);
  });

  it('puts a pasted paragraph on one line', () => {
    expect(defaultTitle('first line\n\n  second\tline  ')).toBe(
      'first line second line',
    );
  });

  it('counts characters, not UTF-16 units, so an emoji is never split', () => {
    const question = '👋'.repeat(70);

    const title = defaultTitle(question);

    expect(Array.from(title).length).toBe(61);
    expect(title).toBe(`${'👋'.repeat(60)}…`);
    expect(title).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it('works for Arabic', () => {
    const question = 'ما هي مدة الإشعار المطلوبة في العقد؟';

    expect(defaultTitle(question)).toBe(question);
  });

  it('is empty for a question that is only whitespace', () => {
    expect(defaultTitle('  \n\t ')).toBe('');
  });
});
