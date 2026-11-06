# NestJS 04 — Ingestion: Uploads, Extraction, and Transactions

Status: reviewed
Related: FR-06…FR-16, ADR-005, ADR-006, ADR-007
Verified against: multer and parser library APIs confirmed at Phase 4

## 1. The controller stays boring

```ts
@Post('upload')
@UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX } }))
async upload(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: CurrentUser) {
  if (!file) throw new ValidationError('file', 'A file is required.');
  return this.uploadDocument.execute({ userId: user.id, file });
}
```

Everything else — validation, extraction, chunking, persistence — is the application
service's job. The controller does not know what a chunk is.

## 2. Validation as a sequence, not a bag of checks

```
size → extension → declared MIME → non-empty → magic bytes → extraction non-empty
```

Each step returns a typed failure with its own code. The order is intentional: cheap
checks fail fast, and the expensive parser only runs on plausible input.

Magic-byte notes:

- PDF: starts with `%PDF-`.
- DOCX/XLSX: ZIP container (`PK\x03\x04` at offset 0), then inspect entry names:
  `[Content_Types].xml` plus `word/document.xml` for DOCX or `xl/workbook.xml` for XLSX.
  A renamed `.zip` must fail, and so must a DOCX renamed `.xlsx`.
- The signature must be at offset 0 even though the ZIP library would also open an archive with
  bytes in front of it; otherwise a file that is a GIF and a ZIP at once gets through.
- Emptiness is checked before the signature: an empty file has no signature, but it is a
  malformed request (422), not an unsupported type (415).
- A library may be ESM-only; if so, load it dynamically inside the service and keep the
  call in one adapter. Do not reshape the whole project's module system for one import.

## 3. Extraction adapters

```ts
export interface DocumentExtractor {
  supports(fileType: FileType): boolean;
  extract(file: { buffer: Buffer; originalName: string }): Promise<ExtractedDocument>;
}
```

| Adapter | Library shape | Must preserve |
|---|---|---|
| PDF | per-page text | page number |
| DOCX | paragraph list with style names | heading level, order |
| XLSX | sheet → rows | sheet name, header row |

Failure policy:

- Parser throws → `EXTRACTION_FAILED`, document `FAILED`, no chunks.
- Parser succeeds with whitespace only → `EMPTY_EXTRACTION`, with a message that names
  scanned PDFs.
- Extraction output is capped by characters to avoid a decompression bomb becoming an
  unbounded row.
  The cap (`MAX_EXTRACTED_CHARS`) counts UTF-16 code units, i.e. JavaScript `string.length`.
- The stored `extractedText` is the extraction output with one change: NUL characters are removed,
  because PostgreSQL `text` cannot hold them and the insert would fail (HTTP 500). Whitespace and
  line endings are stored as extracted.

## 4. Chunking service (pure)

```ts
chunk(input: ExtractedDocument, config: ChunkConfig): ChunkDraft[]
```

- No Prisma, no HTTP, no logging of content.
- Deterministic: same input and config → identical output.
- Emits `chunkIndex` contiguously from 0.
- Never emits an empty chunk.
- Copies `pageNumber` / `sheetName` from the source region.

Test it with: a short document, a long document, a document with headings, a table, a
spreadsheet with two sheets, and text with no sentence punctuation.

## 5. The write sequence

```
1 INSERT document(PROCESSING)          commit
2 extract                              outside any transaction
3 chunk                                pure
4 BEGIN
    INSERT chunks
    UPDATE document(COMPLETED, extractedText)
  COMMIT
```

Why not one transaction from step 1?

- Extraction can take seconds; holding a transaction open starves the pool.
- A visible `PROCESSING` row is useful evidence when something hangs.
- The only invariant that needs atomicity is "chunks exist ⇔ status is COMPLETED".

Why not write chunks lazily on first read? Because retrieval must be able to assume that a
`COMPLETED` document has chunks.

## 6. Timeouts

- `UPLOAD_TIMEOUT_MS` (default 30 000) wraps extraction + chunking.
- On timeout: roll back, set `FAILED` + `PROCESSING_TIMEOUT`, return 504.
- The timeout must be shorter than the interactive transaction timeout, or the driver
  error masks the domain error.

## 7. Failure drills for this phase

| Drill | Expected observation |
|---|---|
| Upload a `.txt` renamed to `.pdf` | rejected at magic bytes, no row |
| Upload a scanned PDF | `FAILED` + `EMPTY_EXTRACTION`, zero chunks |
| Kill the database after extraction | 500 `INTERNAL`, chunks absent, document stays `PROCESSING` (the failure cannot be recorded in a dead database); `FAILED/INTERNAL` only when a single write fails and the database is still reachable |
| Upload a 12 MB file | 413 before buffering the whole body |
| Upload the same file twice | two documents, no crash on unique constraint |

The kill-the-database drill is the one that teaches why the transaction boundary matters.
Run it deliberately, read the log, then restore.

## 8. Delete

```ts
await this.prisma.$transaction(async (tx) => {
  const deleted = await tx.document.deleteMany({ where: { id, uploadedBy: userId } });
  if (deleted.count === 0) throw new ResourceNotFoundError('DOCUMENT');
});
```

`deleteMany` with the owner filter returns a count, so ownership and deletion are one
round trip. Chunks go with the cascade; a test proves it.

## 9. Question before moving on

> Extraction succeeds but the chunk insert fails. Describe the final state of the document
> row, the chunk table, and the HTTP response, and explain which line of code produced
> each.
