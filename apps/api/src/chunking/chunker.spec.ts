import type { ExtractedDocument } from '../documents/extraction/document-extractor';
import { DEFAULT_CHUNK_CONFIG, assertValidChunkConfig } from './chunk-config';
import { ChunkDraft, chunkDocument, countWords } from './chunker';

/** `count` distinct words: w0 w1 w2 ... */
const words = (count: number, label = 'w', from = 0) =>
  Array.from({ length: count }, (_, i) => `${label}${from + i}`).join(' ');

/** 40 new words per chunk, 8 repeated, nothing above 120 (40 + 8 + 60 reserved fits). */
const SMALL = { targetWords: 40, overlapWords: 8, maxWords: 120 };

const text = (value: string): ExtractedDocument => ({ text: value });
const chunk = (doc: ExtractedDocument, config = SMALL) =>
  chunkDocument(doc, config);
const wordsOf = (value: string) => value.split(/\s+/).filter(Boolean);

describe('chunkDocument', () => {
  describe('short text (below the target)', () => {
    it('is exactly one chunk holding the whole text', () => {
      const result = chunkDocument(
        text('Invoices are due within thirty days.'),
        DEFAULT_CHUNK_CONFIG,
      );

      expect(result).toEqual([
        {
          chunkIndex: 0,
          content: 'Invoices are due within thirty days.',
          pageNumber: null,
          sheetName: null,
        },
      ]);
    });
  });

  describe('long text', () => {
    const paragraphs = Array.from({ length: 30 }, (_, i) =>
      words(25, `p${i}_`),
    );
    const long = text(paragraphs.join('\n\n'));

    it.each([
      ['the default configuration', DEFAULT_CHUNK_CONFIG],
      ['a small configuration', SMALL],
    ])(
      'keeps every chunk under the maximum, none empty, with %s',
      (_n, config) => {
        const result = chunkDocument(long, config);

        expect(result.length).toBeGreaterThan(1);
        for (const part of result) {
          expect(part.content.trim()).not.toBe('');
          expect(countWords(part.content)).toBeLessThanOrEqual(config.maxWords);
        }
      },
    );

    it('numbers the chunks from 0 without gaps', () => {
      const result = chunk(long);

      expect(result.map((part) => part.chunkIndex)).toEqual(
        result.map((_part, index) => index),
      );
    });

    it('stops a chunk at the target: new text never grows past it across blocks', () => {
      const result = chunk(long);

      // 25-word paragraphs: 1 fits in 40, 2 do not, so one paragraph of new text per chunk.
      expect(result).toHaveLength(30);
    });
  });

  describe('a document with headings', () => {
    const doc = text(
      [
        '# Terms',
        words(30, 'intro'),
        '## Payment',
        words(30, 'pay'),
        words(30, 'late'),
      ].join('\n\n'),
    );

    it('puts the heading path in front of the chunk that follows a heading', () => {
      const result = chunk(doc);

      expect(result[2].content.startsWith('Terms > Payment — ')).toBe(true);
    });

    it('gives a chunk that starts at a heading only its parents as path', () => {
      const result = chunk(doc);

      expect(result[1].content.startsWith('Terms — ')).toBe(true);
      expect(result[1].content).toContain('## Payment');
    });

    it('never leaves a heading as the last thing in a chunk', () => {
      const result = chunk(doc);

      expect(result[0].content.trimEnd().endsWith('## Payment')).toBe(false);
      expect(result[0].content).toContain('# Terms');
    });

    it('does not add a path to text above the first heading', () => {
      const result = chunk(text(`${words(5)}\n\n# After`));

      expect(result[0].content.startsWith('w0 ')).toBe(true);
    });

    it('caps a very long path at 30 words, keeping the innermost', () => {
      const long = words(40, 'h');
      const result = chunk(
        text(`# ${long}\n\n${words(30, 'a')}\n\n${words(30, 'b')}`),
      );

      const prefix = result[1].content.split(' — ')[0];
      expect(countWords(prefix)).toBe(30);
      expect(prefix.endsWith('h39')).toBe(true);
    });
  });

  describe('a table', () => {
    const header = 'Plan | Price | Seats';
    const rows = Array.from(
      { length: 30 },
      (_, i) => `r${i}a | r${i}b | r${i}c`,
    );
    const doc = text(`Intro words here\n\n${[header, ...rows].join('\n')}`);

    it('keeps every row whole, in order, and each piece starts under the header', () => {
      const result = chunk(doc);
      const withRows = result.filter((part) => part.content.includes('| r'));

      expect(withRows.length).toBeGreaterThan(1);
      for (const part of withRows) {
        expect(part.content).toContain(`\n\n${header}\n`);
      }
      const seen = result.flatMap((part) =>
        part.content.split('\n').filter((line) => /^r\d+a \|/.test(line)),
      );
      // The overlap repeats whole rows at the head of the next chunk; each row first appears
      // once, in order, and never in pieces.
      expect([...new Set(seen)]).toEqual(rows);
    });

    it('does not let the overlap cut a row in half', () => {
      const result = chunk(doc);
      // "here" is the overlap of the intro paragraph (one word of three); rows are never partial.
      const allowed =
        /^(r\d+a \| r\d+b \| r\d+c|Plan \| Price \| Seats|Intro words here|here|)$/;

      for (const part of result) {
        for (const line of part.content.split('\n')) {
          expect(line).toMatch(allowed);
        }
      }
    });
  });

  describe('overlap', () => {
    const doc = text(
      Array.from({ length: 6 }, (_, i) => words(25, `p${i}_`)).join('\n\n'),
    );

    it('starts each chunk with the last words of the one before', () => {
      const result = chunk(doc);

      for (let i = 1; i < result.length; i++) {
        const previous = wordsOf(result[i - 1].content);
        const head = wordsOf(result[i].content).slice(0, 8);

        expect(head).toEqual(previous.slice(-8));
      }
    });

    it('has no overlap on the first chunk', () => {
      expect(chunk(doc)[0].content.startsWith('p0_0 ')).toBe(true);
    });

    it('reconstructs the source: every word, in order, once, when the overlap is removed', () => {
      const result = chunk(doc);
      const rebuilt = result.flatMap((part, i) =>
        wordsOf(part.content).slice(i === 0 ? 0 : 8),
      );

      expect(rebuilt).toEqual(wordsOf(doc.text));
    });

    it('is shorter than the overlap setting when the chunk before was tiny', () => {
      const result = chunk(text(`${words(4)}\n\n${words(60, 'big')}`));

      // 4 words before: at most half of them, 2, are repeated.
      expect(wordsOf(result[1].content).slice(0, 2)).toEqual(['w2', 'w3']);
      expect(wordsOf(result[1].content)[2]).toBe('big0');
    });
  });

  describe('text with no punctuation and no paragraphs', () => {
    const long = words(300, 'كلمة');

    it('splits on words, never inside one, and loses none', () => {
      const result = chunk(text(long));
      const source = new Set(wordsOf(long));

      for (const part of result) {
        for (const word of wordsOf(part.content)) {
          expect(source.has(word)).toBe(true);
        }
        expect(countWords(part.content)).toBeLessThanOrEqual(SMALL.maxWords);
      }
      const rebuilt = result.flatMap((part, i) =>
        wordsOf(part.content).slice(i === 0 ? 0 : 8),
      );
      expect(rebuilt).toEqual(wordsOf(long));
    });
  });

  describe('a paragraph with sentences, too long for one chunk', () => {
    it('splits between sentences when it can', () => {
      const sentence = (n: number) => `${words(19, `s${n}_`)} end${n}.`;
      const paragraph = Array.from({ length: 12 }, (_, n) => sentence(n)).join(
        ' ',
      );

      const result = chunk(text(paragraph));

      for (const part of result) {
        expect(part.content.trimEnd().endsWith('.')).toBe(true);
      }
    });
  });

  describe('whitespace only', () => {
    it.each([[''], ['   '], ['\n\n \t \n\n'], ['\r\n\r\n']])(
      'gives no chunks for %j',
      (value) => {
        expect(chunk(text(value))).toEqual([]);
      },
    );
  });

  describe('line endings and blank lines', () => {
    it('treats CRLF like LF and collapses runs of blank lines', () => {
      const a = chunk(text('one two\r\n\r\n\r\n\r\nthree four'));
      const b = chunk(text('one two\n\nthree four'));

      expect(a).toEqual(b);
    });
  });

  describe('a PDF with pages', () => {
    const pdf: ExtractedDocument = {
      text: '',
      pages: [
        { pageNumber: 1, text: words(30, 'a') },
        { pageNumber: 2, text: words(30, 'b') },
        { pageNumber: 3, text: '' },
        { pageNumber: 4, text: words(30, 'c') },
      ],
    };

    it("cites the page where the chunk's own text starts", () => {
      const result = chunk(pdf);

      expect(result.map((part) => part.pageNumber)).toEqual([1, 2, 4]);
    });

    it('does not make a chunk for the empty page', () => {
      expect(chunk(pdf)).toHaveLength(3);
    });

    it('lets a chunk that holds two pages cite the first', () => {
      const result = chunk({
        text: '',
        pages: [
          { pageNumber: 3, text: words(10, 'a') },
          { pageNumber: 4, text: words(10, 'b') },
        ],
      });

      expect(result).toHaveLength(1);
      expect(result[0].pageNumber).toBe(3);
      expect(result[0].content).toContain('b9');
    });

    it('treats a line starting with # on a page as text, not a heading', () => {
      const result = chunk({
        text: '',
        pages: [{ pageNumber: 1, text: `# not a heading\n\n${words(30)}` }],
      });

      expect(result[0].content.startsWith('# not a heading')).toBe(true);
      expect(result[0].content).not.toContain(' — ');
    });
  });

  describe('a workbook', () => {
    const sheet = (name: string, rowCount: number) => ({
      sheetName: name,
      hasHeader: true,
      rows: [
        ['Item', 'Cost'],
        ...Array.from({ length: rowCount }, (_, i) => [`${name}${i}`, `${i}`]),
      ],
    });
    const workbook: ExtractedDocument = {
      text: '',
      sheets: [sheet('Alpha', 20), sheet('Beta', 3)],
    };

    it('puts the sheet name on every chunk and never mixes two sheets', () => {
      const result = chunk(workbook);

      expect(result.length).toBeGreaterThan(2);
      for (const part of result) {
        const title = part.sheetName;
        expect(part.content.startsWith(`Sheet: ${title}\n`)).toBe(true);
        expect(
          part.content.includes(title === 'Alpha' ? 'Beta' : 'Alpha'),
        ).toBe(false);
      }
      expect(result.map((part) => part.sheetName)).toEqual(
        [...result.map((part) => part.sheetName)].sort(),
      );
    });

    it('cuts only between rows, and keeps each row as the header: value line', () => {
      const result = chunk(workbook);
      const lines = result.flatMap((part) => part.content.split('\n').slice(1));

      expect(lines).toHaveLength(23);
      expect(lines[0]).toBe('Item: Alpha0 | Cost: 0');
      expect(lines[22]).toBe('Item: Beta2 | Cost: 2');
    });

    it('has no overlap between chunks of a sheet', () => {
      const result = chunk(workbook).filter(
        (part) => part.sheetName === 'Alpha',
      );
      const rows = result.flatMap((part) => part.content.split('\n').slice(1));

      expect(new Set(rows).size).toBe(rows.length);
    });

    it('records that the columns are numbered when the sheet has no header', () => {
      const result = chunk({
        text: '',
        sheets: [
          {
            sheetName: 'Data',
            hasHeader: false,
            rows: [
              ['column 1', 'column 2'],
              ['1', '2'],
            ],
          },
        ],
      });

      expect(result[0].content).toBe(
        'Sheet: Data (no header row; columns are numbered)\ncolumn 1: 1 | column 2: 2',
      );
    });

    it('splits a row that alone is too big, every piece with the sheet and the columns', () => {
      const huge = words(300, 'cell');
      const result = chunk({
        text: '',
        sheets: [
          {
            sheetName: 'Notes',
            hasHeader: true,
            rows: [
              ['Topic', 'Body'],
              ['short', 'row'],
              ['long', huge],
            ],
          },
        ],
      });

      const pieces = result.filter((part) => part.content.includes('Columns:'));
      expect(pieces.length).toBeGreaterThan(1);
      for (const part of pieces) {
        expect(
          part.content.startsWith('Sheet: Notes\nColumns: Topic | Body\n'),
        ).toBe(true);
      }
      for (const part of result) {
        expect(countWords(part.content)).toBeLessThanOrEqual(SMALL.maxWords);
      }
    });
  });

  describe('determinism', () => {
    it('gives identical output for identical input, and leaves the input untouched', () => {
      const input: ExtractedDocument = {
        text: `# A\n\n${words(90)}\n\n${words(90, 'x')}`,
      };
      const before = JSON.stringify(input);

      const first = chunk(input);
      const second = chunk(input);

      expect(second).toEqual(first);
      expect(JSON.stringify(input)).toBe(before);
    });
  });

  describe('the hard maximum', () => {
    it('holds with a heading path, an overlap and a carried heading all present', () => {
      const long = words(40, 'h').split(' ').slice(0, 20).join(' ');
      const body = Array.from({ length: 20 }, (_, i) => [
        `## ${long}`,
        words(100, `p${i}_`),
      ]).flat();
      const result: ChunkDraft[] = chunk(
        text(`# ${long}\n\n${body.join('\n\n')}`),
      );

      for (const part of result) {
        expect(countWords(part.content)).toBeLessThanOrEqual(SMALL.maxWords);
      }
    });
  });

  describe('the configuration', () => {
    it.each([
      [{ targetWords: 0, overlapWords: 1, maxWords: 200 }],
      [{ targetWords: 40, overlapWords: 40, maxWords: 200 }],
      [{ targetWords: 40, overlapWords: 8, maxWords: 107 }],
      [{ targetWords: 40.5, overlapWords: 8, maxWords: 200 }],
    ])('is refused when it cannot honor the maximum: %j', (config) => {
      expect(() => assertValidChunkConfig(config)).toThrow();
      expect(() => chunkDocument(text('a b c'), config)).toThrow();
    });

    it('accepts the defaults and the smallest legal maximum', () => {
      expect(() => assertValidChunkConfig(DEFAULT_CHUNK_CONFIG)).not.toThrow();
      expect(() =>
        assertValidChunkConfig({
          targetWords: 40,
          overlapWords: 8,
          maxWords: 108,
        }),
      ).not.toThrow();
    });
  });
});
