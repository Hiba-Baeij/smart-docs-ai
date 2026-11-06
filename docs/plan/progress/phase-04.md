# Phase 4 — Upload and Extraction

Date started: 2026-10-31
Date finished: 2026-10-31
Time spent:

## Predict (written before building)

Question: at which line does the first commit happen, and what would be lost if the whole upload
were one transaction?

Provenance: **[me]** is my own wording; **[Claude]** is what Claude corrected or added.

**[me]** If the upload were one transaction, any failure would lose the data and we would not know
whether the upload happened. Doing it in stages is clearer: a failure at any step leaves a status
for the file, like COMPLETED or PENDING or FAILED.

**[Claude]** Right about the idea: with one transaction a failure rolls back even the `PROCESSING`
row, so the request would vanish without a trace. Missing or to correct:
1. The statuses are `PROCESSING`, `COMPLETED` and `FAILED`; there is no `PENDING`.
2. The question asked WHERE the first commit is: after the validation steps pass and before
   extraction, `INSERT document(status = PROCESSING)` followed by COMMIT.
3. A second reason: extraction can take seconds, and an open transaction holds a database
   connection for all of that time, starving the pool for other users.
4. "In stages" does not mean everything is separate: the second commit (insert the chunks and
   `UPDATE ... COMPLETED`) is one transaction on purpose, so that "COMPLETED with no chunks" and
   "chunks of a PROCESSING document" are both impossible. We split where it makes failures
   visible and join where an invariant needs atomicity.

## What I built

- Library vetting before installing anything (2026-10-31). Extraction libraries parse files that
  strangers upload, so they are attack surface (T6). I checked latest versions, dependencies and
  the npm advisory service. A first attempt at the advisory query silently failed (HTTP 400) and
  printed "no advisory" for everything; I only noticed because a known-vulnerable control package
  was not tested yet, so I re-ran it with a control (`lodash@4.17.15`: 6 advisories) and the
  results below are from the working query.
  - `xlsx` on npm: never published beyond 0.18.5, which has 2 HIGH advisories (prototype pollution
    `<0.19.3`, ReDoS `<0.20.2`); the fixes exist only outside npm. Rejected. The docs name it.
  - `multer` 2.4.0, already installed through `@nestjs/platform-express` 11.2.8: 1 HIGH advisory
    (denial of service via a pending async `fileFilter`, `>=2.0.0 <2.5.0`). The newest Nest 11
    release still asks for 2.4.0; Nest 12 asks for 2.5.0. We do not use `fileFilter`, but the
    upload route is exactly where multer runs, so it will be pinned to 2.5.0 with an npm override.
  - `mammoth` 1.13.0 is clean itself but its `@xmldom/xmldom ^0.8.6` has 15 advisories up to 0.8.14
    (most HIGH: injection, quadratic-time parsing, ReDoS) and `underscore <=1.13.7` has 1 HIGH.
    `0.8.15` and `1.13.8` exist and satisfy its ranges, so a fresh install should resolve to them;
    to be verified with `npm audit` after installing.
  - `pdf-parse` 2.4.5 has no advisory but hard-depends on the native `@napi-rs/canvas`. `unpdf`
    2.1.0 has no dependencies (canvas is an optional peer), extracts per page, no advisory; it is
    ESM-only and needs Node >= 24 (we run 24.15).
  - `read-excel-file` 9.3.14: maintained (modified 2026-10-29), no advisory, deps `saxen`,
    `fflate`, `worker-f`, `unzipper-esm`; ESM-only.

- Install result (2026-10-31), exact versions in `apps/api`: `unpdf 2.1.0`, `mammoth 1.13.0`,
  `read-excel-file 9.3.14`, `jszip 3.10.2`, `multer 2.5.0`, `@types/multer 2.3.0`.
  - The `overrides: { multer: "2.5.0" }` in the root `package.json` was NOT honored by npm 11.12.1
    in this workspace (flat and nested forms both tried; npm kept the locked 2.4.0). What worked:
    `multer` as a direct dependency of `api` plus removing the stale multer entries from
    `package-lock.json` so npm re-resolved. Result: Nest loads multer 2.5.0 (checked by resolving
    from `@nestjs/platform-express`), no nested copy, `npm audit --omit=dev` = 0.
  - Known leftover: `npm ls multer` prints `invalid: "2.4.0" from @nestjs/platform-express` and exits
    non-zero (ELSPROBLEMS). It is cosmetic (Nest 11 declares `2.4.0`, we run `2.5.0`), but it is
    fragile: a lockfile regeneration may bring 2.4.0 back, so re-check after any `npm install`.
    The clean fix is `@nestjs/platform-express` for Nest 12, which asks for 2.5.0.
  - `npm install` is idempotent after this (`up to date`).
  - Full `npm audit` went from 10 to 42 (3 low, 39 moderate, 0 high). The 39 are not from the new
    packages: they come from two new advisories on `minimatch <11.0.1` and `glob <=14.0.1`
    reached only through dev tools (eslint, jest, nest cli, ts-jest). Production dependencies: 0.
    Accepted for now; the proposed fixes are major upgrades of dev tooling.

- 4.1 Upload endpoint (2026-10-31). `POST /api/documents/upload`: `JwtAuthGuard` at class level,
  `FileInterceptor('file')` with options from `MulterModule.registerAsync` (memory storage,
  `limits.fileSize = MAX_UPLOAD_BYTES` from validated config), missing file → 422
  `VALIDATION_FAILED { file }`. The use case `UploadDocumentService` is a stub that rejects until
  4.2-4.8, so the endpoint is 500 for real traffic on purpose; the e2e overrides it.
  `test/documents-upload.e2e-spec.ts` (10 tests, 1 KiB ceiling via `support/upload-limit-env.ts`):
  bytes arrive in memory with no `path`; exactly-limit passes; limit+1 and 500x limit → 413
  `FILE_TOO_LARGE`, use case not called, zero `Document` rows; anonymous oversized → 401 (guard
  before multer reads the body); no file / JSON body / wrong field / two files → 422.
  - Mutation checks (predict, break, run, restore; no `MUTATION` marker left):
    - remove `fileSize` → predicted 2 failures, got 2 (both 413 tests).
    - remove `files: 1` → predicted 0, got 0: `single('file')` already rejects a second file, so the
      option was redundant and I removed it.
    - remove the guard → predicted 1 (anonymous oversized), got 5. I forgot the guard is what sets
      `request.user`, so authenticated calls fail too; anonymous small calls still 401 because
      `@CurrentUser()` fails closed.
    - remove the missing-file check → predicted 3, got 2. The wrong-field-name case is rejected by
      multer itself (`LIMIT_UNEXPECTED_FILE`), so my check is not what protects it.
- 4.2 File validation service (2026-10-31). `FileValidationService.validate({originalname,
  mimetype, buffer})` returns the verified `FileType` or throws: extension (415) → declared MIME,
  case-insensitive, parameters ignored (415) → non-empty (422 `VALIDATION_FAILED`) → content (415).
  Content: PDF `%PDF-` at offset 0; DOCX/XLSX `PK\x03\x04` at offset 0, then jszip reads only the
  table of contents and requires `[Content_Types].xml` + `word/document.xml` (DOCX) or
  `xl/workbook.xml` (XLSX). Each rejection has its own message naming the check, never the content.
  36 unit tests in `file-validation.service.spec.ts` (accepts, each rejection, order).
  Not wired into `DocumentsModule` yet; task 4.6 injects it.
  - Deviation, **[Claude]**: ADR-007 listed the empty check after magic bytes, but an empty file has
    no signature, so that order would answer 415 where `data-flow.md` says 422. Emptiness now comes
    first; ADR-007 and the NestJS track doc are amended.
  - Mutation checks (predict, break, run, restore; no marker left): lower-casing of the extension,
    stripping MIME parameters, lower-casing the MIME → 1 failure each, as predicted. Empty check
    moved after content → 4 (3 empty types + the order test), as predicted. Drop `word/document.xml`
    from DOCX → predicted 1, got 2 (an XLSX renamed `.docx` also passed). Drop `[Content_Types].xml`
    → 1. PDF signature "anywhere" instead of offset 0 → 1. XLSX using DOCX parts → 2.
    Remove the ZIP signature check → predicted 0 and got 0: jszip finds the archive from the END of
    the file, so it opened a DOCX with bytes in front. That means the check was NOT redundant; the
    suite just did not prove it. Added "a valid DOCX with bytes in front of the ZIP signature"; the
    same mutation now fails 1.
  - Known limit: `JSZip.loadAsync` builds an object per archive entry, and a 10 MB file can hold
    on the order of 200k tiny entries. Bounded by the size limit; revisit with the extraction cap
    in 4.6 (T6/T7).
- 4.3 Extractor port and PDF adapter (2026-10-31). `extraction/document-extractor.ts` defines
  `ExtractedDocument` (`text`, optional `pages` / `sheets` / `headings`) and the
  `DocumentExtractor` port (`supports`, `extract`). `PdfExtractor` loads `unpdf` with a dynamic
  `import()` (ESM-only, project is CommonJS), copies the buffer (PDF.js takes ownership of what it
  is given), returns one entry per page numbered from 1 with trimmed text, and `text` = non-empty
  pages joined by a blank line. A page with no text layer stays in `pages` with `text: ''`, so
  numbering stays true; deciding that "no text at all" is `EMPTY_EXTRACTION` is the use case's job
  (4.6). A parser error is not caught here.
  - Fixtures in `apps/api/test/fixtures/`, regenerated by `build-pdf-fixtures.mjs` (hand-written PDF
    bytes, no library): `text-3-pages.pdf` (page 3 has two lines), `text-blank-middle.pdf`,
    `scanned.pdf` (pages are only an image). 9 tests in `pdf.extractor.spec.ts`.
  - Found while probing: in this pdf.js build `PDFDocumentProxy` has no `destroy()`; it is on
    `pdf.loadingTask.destroy()`. My first probe script crashed on `pdf.destroy()`.
  - Mutation checks: 0-based page numbers → predicted 1, got 3 (the blank and scanned tests also
    assert page numbers). Join with one newline → predicted 1, got 2. My first attempt of this
    mutation reported 0 failures because the `sed` pattern silently did not match; I only noticed
    because 0 was not what I expected, redid it with a script that printed `changed: true`. Lesson:
    check that a mutation was applied. Keep empty pages in `text` → 2. `supports` always true → 1.
    No copy of the buffer → 6 (PDF.js breaks on the shared bytes). Remove `loadingTask.destroy()` →
    0 and remove `.trim()` → 0: neither is observable here (resource release; and unpdf 2.1.0 already
    returns trimmed page text for my fixtures). Both stay as defensive code, not test-proven.
- 4.4 DOCX adapter (2026-10-31). `DocxExtractor` uses mammoth's `transformDocument` hook to read the
  document tree (paragraphs with style names, tables) instead of its HTML. mammoth is CommonJS, so a
  plain `import` works; only unpdf needed a dynamic one. Output: `text` = non-empty blocks joined by
  a blank line, in document order; a paragraph in a Heading style (`heading N` name or `HeadingN`
  id) becomes `#`..`######` + text (level capped at 6, whitespace collapsed) as the chunking doc
  asks, and is also listed in `headings`; a table is one block, one line per row, cells joined by
  ` | `, all-empty rows dropped. Images are never read (`imgElement` returning an empty src) and
  `externalFileAccess` is explicitly false, so a package that links an outside file cannot make the
  server open it. Limitation: text boxes, headers/footers, footnotes and comments are not extracted.
  - Fixtures from `build-docx-fixtures.mjs` (hand-written OOXML zipped with jszip, fixed timestamps,
    byte-identical on every run): `headings.docx`, `table.docx`, `edge-cases.docx`. 13 tests in
    `docx.extractor.spec.ts`.
  - A real bug the edge-case fixture found: a table cell with two paragraphs came out as
    `first linesecond line` (words glued). Fixed by joining a cell's paragraphs with a space.
    Caught the first time the test ran, and my first mutation round was muddied by that test
    already failing, so I fixed the bug and redid all mutations from a green baseline.
  - Mutation checks, each confirmed applied (`applied` printed; `!! NOT APPLIED` otherwise): no
    heading marker → 2 failures; no level cap → 1; paragraph not trimmed → 1; empty blocks kept → 3;
    cell separator → 2; block separator → 3; empty table rows kept → 1; heading whitespace not
    collapsed → 1; line break ignored → 1; cell paragraphs glued → 1. Only one survived: using
    `styleName` alone (dropping the `styleId` fallback) → 0, because every fixture style has a name.
    The fallback stays as defensive code, not test-proven.
- 4.5 XLSX adapter (2026-10-31). `XlsxExtractor` reads every sheet with `read-excel-file/node` (the
  package ships a CommonJS build, so a plain `import` works; the PDF adapter alone needs a dynamic
  one). Per sheet: all-empty rows dropped; the first non-empty row is the header when it is made
  only of labels (strings), otherwise the sheet has no header, columns are named `column 1, column
  2, ...` and the title says so. A blank header cell is also named `column N`. Each data row renders
  as `header: value | header: value`, empty cells skipped, under `Sheet: <name>`; sheets joined by a
  blank line. A sheet with no data rows (empty, or header only) is left out. Dates render as
  `YYYY-MM-DD` (full ISO when there is a time), booleans as `TRUE`/`FALSE`. `ExtractedDocument.sheets`
  gained `hasHeader`, and `rows[0]` is always the header (synthesized when absent), so the chunker
  can work from structure; `text` holds the rendering.
  - Library typing bug: `read-excel-file` types a date cell as `typeof Date` (the constructor, not a
    Date), so cells are narrowed at runtime and typed `unknown` here.
  - Fixtures from `build-xlsx-fixtures.mjs` (hand-written SpreadsheetML zipped with jszip,
    byte-identical on every run): `budget.xlsx` (two sheets, a date, a boolean, an empty row),
    `no-header.xlsx`, `edge-cases.xlsx` (empty sheet, header-only sheet, numeric first row, leading
    empty rows, blank header cell, longer-than-header row). 13 tests in `xlsx.extractor.spec.ts`.
  - Mistake, mine: the first run of the edge-case test failed because I inserted the `Mixed` sheet
    before `Messy` in the fixture and the test assumed the other order. The extractor was right;
    I fixed the test to look sheets up by name. Workbook order is itself asserted in the budget test.
  - Probing showed the library already pads rows to one width and drops trailing empty columns and
    whitespace-only cells, so my first, more elaborate width calculation was unobservable; it is now
    one line.
  - Mutation checks, each confirmed applied: header always assumed → 2 failures; never assumed → 6;
    blank header cell not named → 2; header-only sheets kept → 1; empty rows kept → 4; empty cells
    rendered → 1; pair separator → 3; date with time → 2; booleans lowercase → 2; sheet separator →
    1; no-header note removed → 1. One survived: taking the width from the header row only → 0,
    because the library returns rectangular data. `Math.max` stays as a cheap guard against ragged
    rows, not test-proven. Limit: a very large worksheet is read fully into memory; the character
    cap and time budget of 4.6 are what bound it.
- 4.6 Processing orchestration (2026-10-31). `UploadDocumentService.execute`: validate (a rejection
  creates no row) → `INSERT document(PROCESSING)` committed → extract OUTSIDE any transaction, inside
  a `UPLOAD_TIMEOUT_MS` budget → empty text → `EmptyExtractionError` (422, message names scanned PDFs)
  → text over the new `MAX_EXTRACTED_CHARS` (default 2,000,000) → `FILE_TOO_LARGE` (413) → `UPDATE
  COMPLETED` with the text. Any failure → `markFailed` (row `FAILED` + the `ErrorCode`), then the
  error is rethrown; a non-`AppError` is `INTERNAL`. A parser throw becomes `EXTRACTION_FAILED` and
  its message goes only to the log. `DocumentsModule` now wires the validation service, the three
  extractors (`DOCUMENT_EXTRACTORS` token) and `PrismaModule`.
  - Scope note: the plan splits this across 4.6/4.7/4.8. The success write (text + `COMPLETED`) and
    the generic failure marking are in 4.6 because without them a `PROCESSING` row could never end.
    4.7 will verify text persistence properly (including characters PostgreSQL rejects) and 4.8 the
    failure paths I have not injected yet (database error, `markFailed` itself failing).
  - Decisions: the char cap is a config value, not a constant, and exceeding it is `FILE_TOO_LARGE`
    with a distinct message (the row is created, unlike the size-limit 413, so `data-flow.md` and
    `error-model.md` are amended; I also corrected the table's `FAILED/TIMEOUT` to the real code
    `PROCESSING_TIMEOUT`). The timeout stops WAITING, not the parser (JavaScript cannot cancel it):
    a late result is ignored and never changes the row (asserted). A parser stuck in synchronous CPU
    work would block the event loop and the timer; that stays a documented limit for Phase 11.
  - File names: `sanitizeOriginalName` strips control characters (a NUL byte would make PostgreSQL
    reject the insert) and caps at 255 keeping the extension. multer now gets `defParamCharset:
    'utf8'`, otherwise its latin1 default garbles Arabic names; an e2e test uploads `تقرير المبيعات.pdf`.
  - Tests: `documents-processing.e2e-spec.ts` (real app, real extractors, real DB: three formats,
    scanned PDF, broken PDF, empty file, text renamed `.pdf`, wrong MIME, DOCX renamed `.xlsx`, Arabic
    name, control character in name, same file twice, response shape, zero chunks for every failure)
    and `documents-processing-limits.e2e-spec.ts` (an extractor the test controls, cap 100 chars and
    budget 300 ms from `support/processing-limits-env.ts`: the `PROCESSING` row is visible and
    uncommitted-text-free DURING extraction, empty, cap exactly/over, parser throw, timeout with a
    late result). Plus `original-name.spec.ts`.
  - Found by the tests, mine: `DocumentsModule` did not import `PrismaModule`, so all 20 new tests
    failed at start-up with Nest's "can't resolve PrismaService". The 4.1 e2e had not caught it
    because it replaces the whole service.
  - Mutation checks, each confirmed applied: row created as `COMPLETED` → 2 failures; text not stored
    → 5; failure not recorded → 7; cap `>=` → 1; cap check removed → 1; empty check removed → 3;
    parser error not mapped → 2; always `INTERNAL` code → 7; name not sanitized → 1 (after I added
    an e2e for it; before, 0, so the wiring was unproven); utf8 charset off → 1. "No timeout" →
    7, but only because the leftover timer then rejected unhandled and took other tests down; the
    timeout test itself failed too. Not observable: `clearTimeout` in `finally` (a leaked timer fires
    harmlessly after the race), kept for hygiene.
- 4.7 extractedText persistence (2026-10-31). The check is "stored text equals the extraction
  output". Writing the test first found one case where it could not: a NUL character in the text
  (PDFs can contain them) makes PostgreSQL `text` reject the insert, so the upload failed with a 500
  `INTERNAL` and a `FAILED/INTERNAL` row. Red first (2 of 6 failed, both 500), then
  `toStorableText` (removes NULs, changes nothing else) is applied before the empty and cap checks,
  so a text of only NULs is `EMPTY_EXTRACTION`. Whitespace, `\r\n` and indentation are deliberately
  NOT normalized: the stored text is the output, not an interpretation of it. The cap counts UTF-16
  code units (`string.length`), so an emoji counts 2; noted in the NestJS track doc.
  - `documents-persistence.e2e-spec.ts` (default limits, extractor controlled by the test): exact
    whitespace, Arabic + CJK + astral characters, NUL removed, NUL-only, 1,900,000 characters
    compared by SHA-256 (stored length and hash equal), and 2,000,001 refused as `FILE_TOO_LARGE` with
    the default cap. `extracted-text.spec.ts` (4 unit tests).
  - The text and the status are one `UPDATE` statement, so `COMPLETED` with an empty text cannot be
    observed; the partial-failure side is for 4.8.
  - Mutation checks, each confirmed applied: normalizer not used → 2 failures; normalizer trims → 2
    (one unit, one e2e); converts CRLF → 2; strips every control character → 3 (two unit, one e2e);
    normalizer does nothing → 4 (two unit, two e2e). All caught, none survived. Not observable: the
    order of normalizing and the cap check (no test has a NUL-padded text near the cap).
- 4.8 Failure cleanup (2026-10-31). The structure from 4.6 (catch → `markFailed` → rethrow) already
  covered a parser throw; 4.8 proves the paths a file cannot cause. `documents-failures.e2e-spec.ts`
  makes the database fail at chosen points by replacing one Prisma call (`jest.spyOn`; every other
  call is real): saving the text fails → 500 `INTERNAL`, row `FAILED/INTERNAL`, no text, no chunks,
  and the response does not contain the database message; creating the `PROCESSING` row fails → 500,
  no row; recording the failure fails too (the database is gone) → the original error is reported
  (a parser failure still answers `EXTRACTION_FAILED`, not the database error), the row stays
  `PROCESSING` as the honest evidence of a crash mid-request, and the second failure is logged; the
  next upload is unaffected; and a check over every failed document (database failure, broken
  PDF, scanned PDF) finds zero chunks each. All 6 passed on the first run: no code change was needed.
  - Because nothing failed, the tests had to prove themselves by mutation (each confirmed applied):
    `markFailed` errors not contained → 2 failures; failure not recorded → 4 (I predicted 3; the
    "logged" assertion also depends on it); failure not logged → 1. My "error swallowed" mutation was
    badly built: it replaced the error with a generic one instead of swallowing it, and still got 2
    failures (the parser failure answered `INTERNAL`), which does show that the ORIGINAL error being
    preserved is asserted.
  - Limits, stated: a `PROCESSING` row left by a crash or a lost database is not cleaned up by
    anything in v1 (no reaper), only visible; chunk atomicity (`COMPLETED` ⇔ chunks exist) belongs to
    task 5.2 where chunks first exist, so "zero chunks on failure" is trivially true today and the
    test will start to mean something then.

## Gate output

Run 2026-10-31 on the final code, database `smartdocs_test` for the e2e:

```
npm run lint        All files pass linting.
npm run typecheck   0 errors
npm test            Test Suites: 10 passed, 10 total   Tests: 95 passed, 95 total
npm run test:e2e -w api
                    Test Suites: 17 passed, 17 total   Tests: 122 passed, 122 total
npm run build       Application bundle generation complete.
```

The plan's gate list, and where each item is asserted: three formats (`documents-processing`:
pdf, docx, xlsx), scanned PDF, empty file, wrong magic bytes (text renamed `.pdf`), and "chunkCount
is zero for every failed document" (`documents-failures`, last test, and per case in
`documents-processing`). Phase 4 totals: 3 new unit specs for extractors, 2 for validation and
text helpers, 6 e2e specs for upload; the whole API went from 79 to 122 e2e tests.

## Failure drill

Run against the real compiled server (`node dist/main`) and the development database, with a
throwaway user `drill-phase4@example.com`. Files in the scratchpad.

| What I broke | I expected | What actually happened |
|---|---|---|
| Plain text named `renamed.txt.pdf` | rejected at the content check, no row | 415 `UNSUPPORTED_FILE_TYPE`, "The file content is not a valid PDF file."; no row |
| A scanned PDF | `FAILED/EMPTY_EXTRACTION`, message names scanned PDFs | 422 `EMPTY_EXTRACTION`, message contains "scanned PDF"; row `FAILED`, 0 chars, 0 chunks |
| A 12 MB file | 413 before buffering it all | 413 `FILE_TOO_LARGE`, no row (message is the generic "Payload too large.") |
| The same PDF twice | two documents, no crash | two `COMPLETED` rows, 145 chars each |
| A PDF sent as `text/plain` | rejected at the MIME check | 415, "The declared content type does not match the file extension."; no row |
| Database killed 0.5 s into a ~1.2 s upload (an 80,000-paragraph DOCX, so extraction is slow enough to interrupt; `docker kill`, then `docker start`) | the write of the text fails; the failure cannot be recorded either | 500 `INTERNAL` after 1.1 s; the log has two entries (could not mark document ... as FAILED, then the request error "Connection terminated unexpectedly"); the row stayed `PROCESSING`, 0 chars, 0 chunks; the API served the next upload without a restart (201) |

Why the last one matters, and what it corrected: both `docs/tracks/nestjs/04-...md` and
`data-flow.md` said a killed database leaves `FAILED/INTERNAL`. That only holds when one write
fails and the database is still reachable (injected in the e2e). With the database gone,
`markFailed` fails too, so the row stays `PROCESSING`, which is the evidence the design relies on.
Both docs are corrected. I also saw that the 413 body for an oversized upload carries the generic
message "Payload too large." rather than one naming the limit; the code is right, the wording is
not yet helpful (a UI concern for Phase 6). One extra throwaway user and 5 documents from this
drill remain in the development database (as does `browser-check-ugqtac@example.com` from before);
I did not delete them, because deleting needs your word.

## Explain back

Provenance for this whole section: I asked Claude to write these answers. They are
**[Claude, at my request]**, not my own words, and they have not been checked against my own
understanding. My own attempt at the Predict question is in the Predict section.

1. Name the five validation steps in order and the code each returns.

   **[Claude, at my request]** In the order the code runs them (ADR-007 as amended in task 4.2):
   (1) size, enforced by the multipart parser while it reads, `413 FILE_TOO_LARGE`; (2) extension
   allowlist `.pdf .docx .xlsx`, `415 UNSUPPORTED_FILE_TYPE`; (3) declared MIME type matching the
   extension, also `415 UNSUPPORTED_FILE_TYPE`; (4) buffer not empty, `422 VALIDATION_FAILED`;
   (5) magic bytes and, for DOCX/XLSX, the archive's entry names, `415 UNSUPPORTED_FILE_TYPE`. A
   sixth check can only run after parsing: extraction produced text, else `422 EMPTY_EXTRACTION`.
   None of the first five creates a row. The order is cheapest first, and emptiness sits before the
   signature check because an empty file has no signature: checked the other way round it would be
   reported as an unsupported type (415) when the failure table says an empty file is a 422.

2. Why must the magic-byte check inspect ZIP entry names for DOCX/XLSX?

   **[Claude, at my request]** DOCX and XLSX are both ZIP archives, and so are JAR, APK, ODT and any
   `.zip`, so the `PK` signature only says "some ZIP". Without the entry names a renamed
   archive, or a DOCX renamed `.xlsx`, would pass and reach a parser that was not built for it. The
   names tell the formats apart: `[Content_Types].xml` plus `word/document.xml` for DOCX,
   `xl/workbook.xml` for XLSX. Reading them is cheap and safe, because the ZIP library reads only the
   table of contents and decompresses nothing. The signature must also be at offset 0 even though
   the library would open an archive with bytes in front of it, so a file that is a GIF and a ZIP at
   once is refused (a test fails if that check is removed). It is a filter, not proof: a package with
   the right names can still be broken, and then the parser throws and the result is
   `EXTRACTION_FAILED`.

3. What is the final state after extraction succeeds and the chunk insert fails?

   **[Claude, at my request]** The design (ADR-006): chunks and the `COMPLETED` update are one
   transaction, so a failed chunk insert rolls back both. The chunk table has no rows for that
   document, the document row is `FAILED` with `errorCode INTERNAL` and an empty `extractedText`,
   and the client gets `500 INTERNAL` with a generic message; "COMPLETED with no chunks" and "chunks
   of a PROCESSING document" are both impossible. If the database is gone entirely the failure
   cannot be recorded and the row stays `PROCESSING`. Honest status: chunks do not exist until
   task 5.2, so what Phase 4 proves is the same shape one step earlier. When the write after
   extraction fails, the `catch` in `UploadDocumentService.execute` calls `markFailed` with
   `INTERNAL` (row `FAILED`), rethrows, and the exception filter turns it into the 500
   (`documents-failures.e2e-spec.ts`); in the real drill, with the database killed, the row stayed
   `PROCESSING` and the log named both failures.

4. Why is no original file written to disk, and what does that remove from the threat model?

   **[Claude, at my request]** The product does not need the original after extraction (the PRD
   forbids permanent storage), so the bytes live only in memory for the length of one request
   (`memoryStorage`, the test checks the file has no `path`). That removes a whole class of risk:
   path traversal and writes steered by the client's file name (the name is only a sanitized label,
   never a path); files left behind by a crash or a bug in cleanup; the disk filling up from
   uploads; an uploaded file later being served or executed; and the permissions, retention and
   deletion questions of owning stored files. It does not remove memory exhaustion (limit times
   concurrent uploads, which the rate limit of Phase 11 is for), an exploit in a parser running in
   our process, or an archive that unpacks to far more than it weighs (the size check applies to
   the upload, so the character cap applies to the result).

## Where I was wrong

- **[Claude]** I declared the multer 2.5.0 fix working after checking only that Nest resolved
  version `2.5.0`. My lockfile edits had also dropped the nested `media-typer 0.3.0` and
  `mime-types 2.1.x` that multer's `type-is@1.6.18` needs, so `type-is` used the hoisted 1.x/3.x
  versions and silently returned "not multipart": multer parsed nothing and every upload looked
  like "no file". The 4.1 e2e test exposed it; `npm ls` had been printing `invalid` for exactly
  these packages. Fixed by restoring those four nested lock entries (consistent set taken from the
  pre-edit lock) and proving it with a real multer run (small file parsed, oversized file
  `LIMIT_FILE_SIZE`). Lesson: verify behavior, not a version string, and do not wave away `invalid`.
- The plan says `pdf-parse / mammoth / xlsx`; the real set is `unpdf / mammoth / read-excel-file`
  (see "What I built", library vetting).
- **[Claude]** Smaller mistakes of mine this phase, each caught by a check rather than by luck: the
  first advisory query silently returned nothing (HTTP 400) and I almost reported "no advisories";
  a `sed` mutation that silently did not apply reported "0 failures" for one PDF mutation; the
  documents module forgot to import `PrismaModule` (all 20 new tests failed at start-up); a DOCX
  cell with two paragraphs glued its words; mutation predictions that were off (guard removal, wrong
  field name, XLSX width) and what they taught is in each task entry.
- **[Claude]** The docs were wrong in three places and are now corrected: ADR-007's order of the
  empty and signature checks, the failure table's `FAILED/TIMEOUT` (the real code is
  `PROCESSING_TIMEOUT`), and "kill the database leaves `FAILED/INTERNAL`" (it leaves `PROCESSING`).

## Open questions

Phase 4 has no chunking yet (Phase 5), so a document that extracts successfully is `COMPLETED`
with `extractedText` and zero chunks until Phase 5 wires chunking into the upload. That is a
temporary state, not the invariant of ADR-006.

## Next phase readiness

- [x] Gate commands run and seen
- [x] Failure drill observed (real compiled server and development database, including a killed database)
- [x] Explain-back filled (by Claude at my request, not verified as my own understanding)
- [x] Traceability updated (FR-06 to FR-10, FR-12, FR-16 and NFR-08 name the real tests)
- [x] Docs updated with anything that changed (ADR-007 order, nestjs track 04, data-flow validation
      order and failure table, error-model, local-setup and .env.example for MAX_EXTRACTED_CHARS)
