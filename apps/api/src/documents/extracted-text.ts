import type { ExtractedDocument } from './extraction/document-extractor';

/**
 * What the parsers return, made storable. The only change is removing NUL characters: PDFs
 * can contain them and PostgreSQL `text` cannot hold one (the insert fails). Everything else,
 * whitespace and line endings included, is kept exactly, so the stored text is the extraction
 * output and not an interpretation of it.
 */
export function toStorableText(text: string): string {
  return text.replaceAll('\u0000', '');
}

/**
 * The same, for a whole extraction result. Chunks are built from `pages` and `sheets`, not
 * from `text`, so a NUL left in either would fail the chunk insert.
 */
export function toStorableDocument(
  document: ExtractedDocument,
): ExtractedDocument {
  return {
    text: toStorableText(document.text),
    pages: document.pages?.map((page) => ({
      pageNumber: page.pageNumber,
      text: toStorableText(page.text),
    })),
    sheets: document.sheets?.map((sheet) => ({
      sheetName: toStorableText(sheet.sheetName),
      hasHeader: sheet.hasHeader,
      rows: sheet.rows.map((row) => row.map(toStorableText)),
    })),
    headings: document.headings?.map((heading) => ({
      level: heading.level,
      text: toStorableText(heading.text),
    })),
  };
}
