/**
 * Makes spellings that mean the same word the same string (docs/tracks/ai/03-retrieval-with-
 * postgres.md section 3). It is applied to the text before it is indexed AND to the question
 * before it is searched: if only one side is normalised, a word that is in the text is not found.
 * Both sides must call this one function.
 *
 * What it does not do: reduce a word to its root. It makes أحمد / احمد / إحمد equal; it does not
 * make "المدرسة" and "المدارس" equal. That is the job of a stemmer, and whether one is needed is
 * what the Phase 5 spike measured.
 */

/** Diacritics (tashkeel), the superscript alef, Quranic annotation marks, and the tatweel. */
const MARKS_TO_REMOVE = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

/** Zero-width and direction control characters that are invisible but split tokens. */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\u061C\uFEFF]/g;

/** Letters folded to one form, written as code points because several look identical. */
const FOLDED_LETTERS: Record<string, string> = {
  '\u0623': '\u0627', // alef with hamza above -> alef
  '\u0625': '\u0627', // alef with hamza below -> alef
  '\u0622': '\u0627', // alef with madda -> alef
  '\u0671': '\u0627', // alef wasla -> alef
  '\u0629': '\u0647', // teh marbuta -> heh
  '\u0649': '\u064A', // alef maksura -> yeh
  '\u06CC': '\u064A', // Persian yeh -> Arabic yeh
  '\u06A9': '\u0643', // Persian kaf -> Arabic kaf
};

const FOLD_PATTERN = new RegExp(
  `[${Object.keys(FOLDED_LETTERS).join('')}]`,
  'g',
);

/** Arabic-Indic (U+0660-0669) and Persian (U+06F0-06F9) digits -> 0-9. */
const EASTERN_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;

export function normalizeSearchText(text: string): string {
  return (
    text
      // Presentation forms and ligatures (for example the single lam-alef glyph) -> base letters.
      .normalize('NFKC')
      .replace(INVISIBLE, '')
      .replace(MARKS_TO_REMOVE, '')
      .replace(FOLD_PATTERN, (letter) => FOLDED_LETTERS[letter])
      .replace(EASTERN_DIGITS, (digit) => {
        const code = digit.charCodeAt(0);
        return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
      })
      .toLowerCase()
  );
}
