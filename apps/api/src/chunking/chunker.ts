import type { ExtractedDocument } from '../documents/extraction/document-extractor';
import {
  sheetRowLines,
  sheetTitle,
  type Sheet,
} from '../documents/extraction/xlsx.extractor';
import {
  ChunkConfig,
  PREFIX_CAP_WORDS,
  RESERVED_CONTEXT_WORDS,
  assertValidChunkConfig,
} from './chunk-config';

export type ChunkDraft = {
  /** 0-based and contiguous over the whole document. */
  chunkIndex: number;
  content: string;
  /** PDF: the page the chunk's own text starts on. */
  pageNumber: number | null;
  /** XLSX: the one sheet the chunk belongs to. */
  sheetName: string | null;
};

/** A paragraph, a heading, or a group of table rows: the unit chunks are built from. */
type Block = {
  text: string;
  words: number;
  pageNumber: number | null;
  /** The headings in force just before this block, outermost first. */
  path: string[];
  isHeading: boolean;
};

const HEADING_LINE = /^(#{1,6})\s+(.+)$/;
const SENTENCE_BOUNDARY = /(?<=[.!?؟…。])\s+/;

/**
 * Turns an extracted document into the chunks that retrieval ranks and citations point to
 * (ADR-005, docs/tracks/ai/02-chunking.md). A pure function: the same input and configuration
 * always give the same output, and nothing is read from the clock, the environment or a random
 * source.
 */
export function chunkDocument(
  document: ExtractedDocument,
  config: ChunkConfig,
): ChunkDraft[] {
  assertValidChunkConfig(config);

  const drafts: Omit<ChunkDraft, 'chunkIndex'>[] = document.sheets?.length
    ? document.sheets.flatMap((sheet) => chunkSheet(sheet, config))
    : chunkFlow(blocksOf(document), config);

  return drafts.map((draft, chunkIndex) => ({ chunkIndex, ...draft }));
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

// ---------------------------------------------------------------------------------------------
// Text and PDF: a flow of blocks with overlap between chunks.
// ---------------------------------------------------------------------------------------------

function blocksOf(document: ExtractedDocument): Block[] {
  if (document.pages?.length) {
    // Paragraph boundaries are unreliable in a PDF, and a line starting with "#" is just text.
    return document.pages.flatMap((page) =>
      paragraphsOf(page.text).map((text) =>
        plainBlock(text, page.pageNumber, []),
      ),
    );
  }

  const blocks: Block[] = [];
  const path: { level: number; text: string }[] = [];
  for (const text of paragraphsOf(document.text)) {
    const heading = HEADING_LINE.exec(text);
    const pathBefore = path.map((entry) => entry.text);
    if (heading) {
      const level = heading[1].length;
      while (path.length > 0 && path[path.length - 1].level >= level) {
        path.pop();
      }
      path.push({ level, text: heading[2].trim() });
    }
    blocks.push({
      text,
      words: countWords(text),
      pageNumber: null,
      path: pathBefore,
      isHeading: heading !== null,
    });
  }
  return blocks;
}

function plainBlock(
  text: string,
  pageNumber: number | null,
  path: string[],
): Block {
  return {
    text,
    words: countWords(text),
    pageNumber,
    path,
    isHeading: false,
  };
}

/** Line endings normalised, runs of blank lines collapsed to one, paragraphs trimmed. */
function paragraphsOf(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');
}

function chunkFlow(
  rawBlocks: Block[],
  config: ChunkConfig,
): Omit<ChunkDraft, 'chunkIndex'>[] {
  const { targetWords, overlapWords, maxWords } = config;
  // A block above this cannot be a chunk of its own once the overlap and prefix are added.
  const splitAbove = maxWords - overlapWords - RESERVED_CONTEXT_WORDS;

  const blocks = rawBlocks.flatMap((block) =>
    block.words > splitAbove
      ? splitText(block.text, targetWords).map((text) => ({
          ...block,
          text,
          words: countWords(text),
          isHeading: false,
        }))
      : [block],
  );

  const drafts: Omit<ChunkDraft, 'chunkIndex'>[] = [];
  let current: Block[] = [];
  let currentWords = 0;
  let overlap = '';

  const emit = (): void => {
    // A heading must not end a chunk: it belongs with the text it introduces. A very long one
    // is left where it is, so the reserved room for a carried heading is never exceeded.
    const carried: Block[] = [];
    const last = current[current.length - 1];
    if (
      current.length > 1 &&
      last.isHeading &&
      last.words <= PREFIX_CAP_WORDS
    ) {
      carried.push(current.pop() as Block);
    }

    const body = [overlap, ...current.map((block) => block.text)]
      .filter((part) => part !== '')
      .join('\n\n');
    const bodyOfNewText = current.map((block) => block.text).join('\n\n');
    drafts.push({
      content: withPrefix(current[0].path, body),
      pageNumber: current[0].pageNumber,
      sheetName: null,
    });

    overlap = overlapOf(
      current,
      Math.min(overlapWords, Math.floor(countWords(bodyOfNewText) / 2)),
    );
    current = carried;
    currentWords = carried.reduce((sum, block) => sum + block.words, 0);
  };

  for (const block of blocks) {
    if (current.length > 0 && currentWords + block.words > targetWords) {
      emit();
    }
    current.push(block);
    currentWords += block.words;
  }
  if (current.length > 0) {
    emit();
  }

  return drafts;
}

/** `Terms > Payment — text`: a fragment without its heading is often meaningless. */
function withPrefix(path: string[], body: string): string {
  if (path.length === 0) {
    return body;
  }
  const words = path.join(' > ').split(/\s+/);
  const kept = words.slice(-PREFIX_CAP_WORDS).join(' ');
  return `${kept} — ${body}`;
}

/**
 * The text repeated at the head of the next chunk. Ordinarily the last `count` words, with their
 * original spacing. When the chunk ends with a block made of lines (table rows, PDF lines) the
 * overlap is whole lines instead, so a row is never cut in half by it.
 */
function overlapOf(chunkBlocks: Block[], count: number): string {
  if (count <= 0) {
    return '';
  }
  const last = chunkBlocks[chunkBlocks.length - 1].text;
  if (last.includes('\n')) {
    const lines = last.split('\n');
    const kept: string[] = [];
    let words = 0;
    for (let at = lines.length - 1; at >= 0; at--) {
      words += countWords(lines[at]);
      if (words > count) {
        break;
      }
      kept.unshift(lines[at]);
    }
    return kept.join('\n');
  }
  const text = chunkBlocks.map((block) => block.text).join('\n\n');
  const starts = [...text.matchAll(/\S+/g)].map((match) => match.index);
  return starts.length <= count
    ? text
    : text.slice(starts[starts.length - count]);
}

// ---------------------------------------------------------------------------------------------
// Splitting one block that is too big: lines (table rows), then sentences, then words.
// ---------------------------------------------------------------------------------------------

/** Pieces of at most `limit` words that, read in order, contain every word of `text`. */
function splitText(text: string, limit: number): string[] {
  if (countWords(text) <= limit) {
    return [text];
  }
  if (text.includes('\n')) {
    return splitLines(text, limit);
  }
  return splitSentences(text, limit);
}

/** Rows stay whole; the first row (the header of a table) is repeated at the top of each piece. */
function splitLines(text: string, limit: number): string[] {
  const [header, ...rest] = text.split('\n');
  const headerWords = countWords(header);
  const repeatHeader = rest.length > 0 && headerWords <= limit / 4;
  const rows = repeatHeader ? rest : [header, ...rest];
  const room = repeatHeader ? limit - headerWords : limit;

  const pieces = pack(rows, '\n', room, (row) => splitSentences(row, room));
  return repeatHeader ? pieces.map((piece) => `${header}\n${piece}`) : pieces;
}

function splitSentences(text: string, limit: number): string[] {
  const sentences = text.split(SENTENCE_BOUNDARY).filter((s) => s !== '');
  return pack(sentences, ' ', limit, (sentence) => splitWords(sentence, limit));
}

/** The last resort: groups of whole words, never a cut inside a word. */
function splitWords(text: string, limit: number): string[] {
  const words = text.trim().split(/\s+/);
  const pieces: string[] = [];
  for (let at = 0; at < words.length; at += limit) {
    pieces.push(words.slice(at, at + limit).join(' '));
  }
  return pieces;
}

/** Greedily groups units into pieces of at most `limit` words; a unit that is too big is split deeper. */
function pack(
  units: string[],
  joiner: string,
  limit: number,
  splitDeeper: (unit: string) => string[],
): string[] {
  const pieces: string[] = [];
  let current: string[] = [];
  let currentWords = 0;
  const flush = (): void => {
    if (current.length > 0) {
      pieces.push(current.join(joiner));
      current = [];
      currentWords = 0;
    }
  };

  for (const unit of units) {
    const words = countWords(unit);
    if (words > limit) {
      flush();
      pieces.push(...splitDeeper(unit));
    } else {
      if (currentWords + words > limit) {
        flush();
      }
      current.push(unit);
      currentWords += words;
    }
  }
  flush();
  return pieces;
}

// ---------------------------------------------------------------------------------------------
// Spreadsheets: whole rows, the sheet name on every chunk, no overlap.
// ---------------------------------------------------------------------------------------------

function chunkSheet(
  sheet: Sheet,
  config: ChunkConfig,
): Omit<ChunkDraft, 'chunkIndex'>[] {
  const { targetWords, maxWords } = config;
  const title = sheetTitle(sheet);
  const titleWords = countWords(title);
  const columns = capWords(`Columns: ${sheet.rows[0].join(' | ')}`);

  // A row is a unit that is never cut, unless it alone cannot fit under the maximum; then its
  // pieces each carry the title and the column names, so no piece is a bare string of values.
  const tooBig = maxWords - titleWords;
  const pieceWords = Math.max(1, targetWords - titleWords - PREFIX_CAP_WORDS);
  const rows: { text: string; prefix: string }[] = sheetRowLines(sheet).flatMap(
    (line) =>
      countWords(line) > tooBig
        ? splitText(line, pieceWords).map((text) => ({
            text,
            prefix: `${title}\n${columns}`,
          }))
        : [{ text: line, prefix: title }],
  );

  const drafts: Omit<ChunkDraft, 'chunkIndex'>[] = [];
  let current: string[] = [];
  let currentPrefix = title;
  let currentWords = titleWords;

  const emit = (): void => {
    drafts.push({
      content: [currentPrefix, ...current].join('\n'),
      pageNumber: null,
      sheetName: sheet.sheetName,
    });
    current = [];
  };

  for (const row of rows) {
    const startsNewChunk =
      current.length > 0 &&
      (row.prefix !== currentPrefix ||
        currentWords + countWords(row.text) > targetWords);
    if (startsNewChunk) {
      emit();
    }
    if (current.length === 0) {
      currentPrefix = row.prefix;
      currentWords = countWords(row.prefix);
    }
    current.push(row.text);
    currentWords += countWords(row.text);
  }
  if (current.length > 0) {
    emit();
  }
  return drafts;
}

function capWords(text: string): string {
  return text.split(/\s+/).slice(0, PREFIX_CAP_WORDS).join(' ');
}
