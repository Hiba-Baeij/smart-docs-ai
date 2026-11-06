import type { FileType } from '@smartdocs/contracts';

/** Injection token for the list of every registered `DocumentExtractor`. */
export const DOCUMENT_EXTRACTORS = Symbol('DOCUMENT_EXTRACTORS');

/**
 * What extraction hands to chunking (docs/integration/upload-to-answer.md, stage 1). It is a
 * structure, not just a string: chunks are derived from `pages` / `sheets` / `headings` so a
 * citation keeps its page or sheet. `text` is the whole document as plain text, for display
 * and for the stored `extractedText`.
 */
export type ExtractedDocument = {
  text: string;
  /** PDF: one entry per page, 1-based, in order. A page without a text layer has `text: ''`. */
  pages?: { pageNumber: number; text: string }[];
  /**
   * XLSX: one entry per sheet that has data rows. `rows[0]` is always the header (the sheet's own
   * first row, or `column 1, column 2, ...` when `hasHeader` is false), then one array per data row.
   */
  sheets?: { sheetName: string; hasHeader: boolean; rows: string[][] }[];
  /** DOCX: headings in document order. */
  headings?: { level: number; text: string }[];
};

/**
 * One adapter per file type. An adapter reports what the file contains and nothing else:
 * deciding that "no text" is a failure, capping the size, or enforcing the time budget belongs
 * to the use case. A parser error propagates as it is thrown.
 */
export interface DocumentExtractor {
  supports(fileType: FileType): boolean;
  extract(file: {
    buffer: Buffer;
    originalName: string;
  }): Promise<ExtractedDocument>;
}
