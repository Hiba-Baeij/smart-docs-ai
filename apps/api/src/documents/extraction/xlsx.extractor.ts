import { Injectable } from '@nestjs/common';
import type { FileType } from '@smartdocs/contracts';
import readXlsxFile from 'read-excel-file/node';
import type {
  DocumentExtractor,
  ExtractedDocument,
} from './document-extractor';

// The library types a date cell as `typeof Date` (the constructor), which is wrong, so cells are
// narrowed at runtime instead of trusting its type.
type Cell = unknown;
export type Sheet = NonNullable<ExtractedDocument['sheets']>[number];

@Injectable()
export class XlsxExtractor implements DocumentExtractor {
  supports(fileType: FileType): boolean {
    return fileType === 'xlsx';
  }

  async extract(
    file: Parameters<DocumentExtractor['extract']>[0],
  ): Promise<ExtractedDocument> {
    const workbook = await readXlsxFile(file.buffer);

    const sheets = workbook.flatMap(({ sheet, data }) => {
      const parsed = parseSheet(sheet, data);
      return parsed ? [parsed] : [];
    });

    return {
      text: sheets.map(renderSheet).join('\n\n'),
      sheets,
    };
  }
}

/** A sheet without a single data row is left out: there is nothing in it to retrieve. */
function parseSheet(sheetName: string, data: Cell[][]): Sheet | null {
  const filled = data.filter((row) => !row.every(isBlank));
  if (filled.length === 0) {
    return null;
  }

  // The library already pads every row to the widest one and drops trailing empty columns.
  const width = Math.max(...filled.map((row) => row.length));
  const hasHeader = looksLikeHeader(filled[0]);
  const headerNames = Array.from({ length: width }, (_, column) =>
    hasHeader && !isBlank(filled[0][column])
      ? formatCell(filled[0][column])
      : `column ${column + 1}`,
  );
  const dataRows = (hasHeader ? filled.slice(1) : filled).map((row) =>
    Array.from({ length: width }, (_, column) => formatCell(row[column])),
  );
  if (dataRows.length === 0) {
    return null;
  }

  return { sheetName, hasHeader, rows: [headerNames, ...dataRows] };
}

/** The first non-empty row is the header when it is made of labels, not numbers, dates or booleans. */
function looksLikeHeader(row: Cell[]): boolean {
  return row
    .filter((cell) => !isBlank(cell))
    .every((cell) => typeof cell === 'string');
}

/** `Sheet: <name>`, with a note when the columns had to be numbered. */
export function sheetTitle(sheet: Sheet): string {
  return sheet.hasHeader
    ? `Sheet: ${sheet.sheetName}`
    : `Sheet: ${sheet.sheetName} (no header row; columns are numbered)`;
}

/**
 * One `header: value | header: value` line per data row, so a row never loses its header
 * (docs/tracks/ai/02-chunking.md section 4). Empty cells are skipped, and so are rows left with
 * nothing. The chunker works from these same lines.
 */
export function sheetRowLines(sheet: Sheet): string[] {
  const [headerNames, ...dataRows] = sheet.rows;
  return dataRows
    .map((row) =>
      row
        .flatMap((value, column) =>
          value === '' ? [] : [`${headerNames[column]}: ${value}`],
        )
        .join(' | '),
    )
    .filter((line) => line !== '');
}

function renderSheet(sheet: Sheet): string {
  return [sheetTitle(sheet), ...sheetRowLines(sheet)].join('\n');
}

function isBlank(cell: Cell): boolean {
  return cell === null || cell === undefined || cell === '';
}

function formatCell(cell: Cell): string {
  if (isBlank(cell)) {
    return '';
  }
  if (cell instanceof Date) {
    const iso = cell.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
  }
  if (typeof cell === 'boolean') {
    return cell ? 'TRUE' : 'FALSE';
  }
  return String(cell);
}
