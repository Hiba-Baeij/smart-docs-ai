// Regenerates the XLSX fixtures in this folder: `node test/fixtures/build-xlsx-fixtures.mjs`.
// Minimal hand-written SpreadsheetML packages, zipped with jszip, so the cells are known exactly.
//   budget.xlsx      sheet "Q3 Budget" (header, two rows, an empty row between) and sheet
//                    "Deadlines" (a date cell and a boolean cell)
//   no-header.xlsx   one sheet "Data" holding only numbers
//   edge-cases.xlsx  an empty sheet, a header-only sheet, a sheet whose first row holds a number,
//                    leading empty rows, a blank header cell, a row longer than its header,
//                    empty cells inside a row
import JSZip from 'jszip';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

const escapeXml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** 0 -> A, 25 -> Z, 26 -> AA */
function columnLetters(index) {
  let letters = '';
  for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
  }
  return letters;
}

/**
 * A cell is a string, number, boolean, null (no cell written), or { date: excelSerialNumber }.
 * Strings go through the shared strings table, as Excel itself writes them.
 */
function worksheetXml(rows, strings) {
  const sharedIndex = (text) => {
    let at = strings.indexOf(text);
    if (at === -1) at = strings.push(text) - 1;
    return at;
  };
  const rowsXml = rows
    .map((cells, r) => {
      const cellsXml = cells
        .map((cell, c) => {
          const ref = `${columnLetters(c)}${r + 1}`;
          if (cell === null) return '';
          if (typeof cell === 'string')
            return `<c r="${ref}" t="s"><v>${sharedIndex(cell)}</v></c>`;
          if (typeof cell === 'boolean')
            return `<c r="${ref}" t="b"><v>${cell ? 1 : 0}</v></c>`;
          if (typeof cell === 'object')
            return `<c r="${ref}" s="1"><v>${cell.date}</v></c>`;
          return `<c r="${ref}"><v>${cell}</v></c>`;
        })
        .join('');
      return cellsXml === '' ? '' : `<row r="${r + 1}">${cellsXml}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="${MAIN}"><sheetData>${rowsXml}</sheetData></worksheet>`;
}

async function build(file, sheets) {
  const strings = [];
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join(
        '',
      )}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets>${sheets
      .map(
        (s, i) =>
          `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
      )
      .join('')}</sheets></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${PKG_REL}">${sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join(
        '',
      )}<Relationship Id="rId${sheets.length + 1}" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId${sheets.length + 2}" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
  );
  // Style 0 is General; style 1 is the built-in date format 14 (m/d/yyyy).
  zip.file(
    'xl/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${MAIN}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`,
  );
  sheets.forEach((sheet, i) => {
    zip.file(
      `xl/worksheets/sheet${i + 1}.xml`,
      worksheetXml(sheet.rows, strings),
    );
  });
  zip.file(
    'xl/sharedStrings.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="${MAIN}" count="${strings.length}" uniqueCount="${strings.length}">${strings
      .map((s) => `<si><t xml:space="preserve">${escapeXml(s)}</t></si>`)
      .join('')}</sst>`,
  );
  // Fixed timestamps keep the bytes identical between runs.
  zip.forEach((_, entry) => {
    entry.date = new Date(Date.UTC(2026, 0, 1));
  });
  writeFileSync(
    join(here, file),
    await zip.generateAsync({ type: 'nodebuffer' }),
  );
}

// 46112 is 2026-03-31 as an Excel serial number.
await build('budget.xlsx', [
  {
    name: 'Q3 Budget',
    rows: [
      ['Category', 'Planned', 'Actual', 'Variance'],
      ['Travel', 12000, 9800, -2200],
      [],
      ['Software', 3000, 3150, 150],
    ],
  },
  {
    name: 'Deadlines',
    rows: [
      ['Item', 'Due', 'Done'],
      ['Audit', { date: 46112 }, false],
    ],
  },
]);

await build('no-header.xlsx', [
  {
    name: 'Data',
    rows: [
      [1, 2, 3],
      [4, 5, 6],
    ],
  },
]);

await build('edge-cases.xlsx', [
  { name: 'Empty', rows: [] },
  { name: 'HeaderOnly', rows: [['A', 'B']] },
  {
    name: 'Mixed',
    rows: [
      ['Total', 5],
      ['x', 1],
    ],
  },
  {
    name: 'Messy',
    rows: [
      [],
      [null, null],
      ['Name', null, 'Score'],
      ['Ann', 'ignored? no, kept', 90, 'extra cell'],
      ['Bob', null, null],
      [null, null, null],
      [null, null, 70],
    ],
  },
]);

console.log('wrote budget.xlsx, no-header.xlsx and edge-cases.xlsx');
