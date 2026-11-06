import { contentQuery } from './chunk-search.service';
import { isStopWord, tokenize } from './query-terms';

describe('tokenize', () => {
  it('splits on anything that is not a letter, a digit or a mark', () => {
    expect(tokenize('Net-30, due: 2026!')).toEqual([
      'Net',
      '30',
      'due',
      '2026',
    ]);
  });

  it('keeps Arabic words whole, diacritics included', () => {
    expect(tokenize('كَمْ مُدَّةُ الضَّمَانِ؟')).toEqual([
      'كَمْ',
      'مُدَّةُ',
      'الضَّمَانِ',
    ]);
  });

  it('gives nothing for punctuation and whitespace', () => {
    expect(tokenize(' \n ?! ... ')).toEqual([]);
  });
});

describe('isStopWord', () => {
  it.each(['what', 'The', 'ما', 'هل', 'كم', 'إلى', 'الى', 'كَمْ'])(
    'recognises %s however it is written',
    (word) => {
      expect(isStopWord(word)).toBe(true);
    },
  );

  it.each(['invoice', 'الفواتير', 'إجازة', 'password', 'NDA'])(
    'keeps %s, a content word',
    (word) => {
      expect(isStopWord(word)).toBe(false);
    },
  );
});

describe('contentQuery', () => {
  it('joins the content words of a question with or', () => {
    expect(contentQuery('How often must passwords be changed?')).toBe(
      'passwords or changed',
    );
  });

  it('drops Arabic question words and prepositions', () => {
    expect(contentQuery('ما هي مدة الإجازة المرضية؟')).toBe(
      'مدة or الإجازة or المرضية',
    );
  });

  it('is empty when nothing but stop words and punctuation is left', () => {
    expect(contentQuery('What is the?')).toBe('');
    expect(contentQuery('؟؟ !!')).toBe('');
  });

  it('cannot produce a search operator from user input', () => {
    // websearch_to_tsquery reads quotes, a leading minus and the word "or" as operators.
    const query = contentQuery('"exact phrase" -excluded OR (a; b) & c | d');

    expect(query).toBe('exact or phrase or excluded or b or c or d');
    expect(query).not.toMatch(/["\-()&|;]/);
  });
});
