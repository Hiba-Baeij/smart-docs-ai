import { Injectable } from '@nestjs/common';
import type { FileType } from '@smartdocs/contracts';
import mammoth from 'mammoth';
import type {
  DocumentExtractor,
  ExtractedDocument,
} from './document-extractor';

/** The part of mammoth's document tree this adapter reads. */
type DocxElement = {
  type: string;
  value?: string;
  styleName?: string | null;
  styleId?: string | null;
  children?: DocxElement[];
};

type Block = { text: string; headingLevel?: number };

const MAX_HEADING_LEVEL = 6;

@Injectable()
export class DocxExtractor implements DocumentExtractor {
  supports(fileType: FileType): boolean {
    return fileType === 'docx';
  }

  async extract(
    file: Parameters<DocumentExtractor['extract']>[0],
  ): Promise<ExtractedDocument> {
    let blocks: Block[] = [];

    // mammoth is built to produce HTML; its document tree (paragraphs with style names, tables)
    // is only reachable through this hook, so the HTML it returns is discarded.
    await mammoth.convertToHtml(
      { buffer: file.buffer },
      {
        transformDocument: (document: DocxElement) => {
          blocks = blocksOf(document);
          return document;
        },
        // Images are neither read nor embedded, and files outside the package are never opened.
        convertImage: mammoth.images.imgElement(() =>
          Promise.resolve({ src: '' }),
        ),
        externalFileAccess: false,
      },
    );

    return {
      // Headings keep their level as a Markdown-style marker, which is how the chunker
      // recognizes them (docs/tracks/ai/02-chunking.md section 5).
      text: blocks
        .map((block) =>
          block.headingLevel
            ? `${'#'.repeat(block.headingLevel)} ${block.text}`
            : block.text,
        )
        .join('\n\n'),
      headings: blocks.flatMap((block) =>
        block.headingLevel
          ? [{ level: block.headingLevel, text: block.text }]
          : [],
      ),
    };
  }
}

/** Top-level paragraphs and tables of the body, in document order; empty ones are dropped. */
function blocksOf(document: DocxElement): Block[] {
  const blocks: Block[] = [];
  for (const element of document.children ?? []) {
    if (element.type === 'paragraph') {
      const level = headingLevelOf(element);
      const text = level
        ? collapseWhitespace(textOf(element))
        : textOf(element).trim();
      if (text !== '') {
        blocks.push({ text, headingLevel: level });
      }
    } else if (element.type === 'table') {
      const text = tableText(element);
      if (text !== '') {
        blocks.push({ text });
      }
    }
  }
  return blocks;
}

/** "heading 1" / "Heading 1" (style name) or "Heading1" (style id) -> 1; anything else -> undefined. */
function headingLevelOf(paragraph: DocxElement): number | undefined {
  for (const style of [paragraph.styleName, paragraph.styleId]) {
    const match = /^heading\s*([1-9])$/i.exec(style ?? '');
    if (match) {
      return Math.min(Number(match[1]), MAX_HEADING_LEVEL);
    }
  }
  return undefined;
}

/** One line per row, cells separated by " | ". The header row is just the first line. */
function tableText(table: DocxElement): string {
  return (table.children ?? [])
    .filter((row) => row.type === 'tableRow')
    .map((row) =>
      (row.children ?? [])
        // A cell holds paragraphs; they are joined with a space so words do not run together.
        .map((cell) =>
          collapseWhitespace((cell.children ?? []).map(textOf).join(' ')),
        )
        .join(' | '),
    )
    .filter((line) => line.replaceAll('|', '').trim() !== '')
    .join('\n');
}

function textOf(element: DocxElement): string {
  switch (element.type) {
    case 'text':
      return element.value ?? '';
    case 'tab':
      return '\t';
    case 'break':
      return '\n';
    default:
      return (element.children ?? []).map(textOf).join('');
  }
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
