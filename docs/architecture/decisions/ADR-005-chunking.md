# ADR-005: Chunking parameters and boundary policy

Status: accepted
Date: 2026-10-23

## Context

Chunk size determines retrieval quality, prompt cost, and citation precision. The PRD
gives a starting range of 500–800 words with modest overlap and requires order and
metadata preservation.

## Decision

- Target 700 words, 100-word overlap, hard maximum 1200.
- Boundary preference: paragraph → sentence → word. A chunk never starts mid-word.
- Chunks are emitted only when non-empty after trimming.
- `chunkIndex` is 0-based and contiguous per document.
- Metadata is copied from the source region: `pageNumber` for PDF, `sheetName` for XLSX.
- For XLSX, each row is rendered as `header: value` text before chunking, and the sheet
  name is prepended to the chunk text so a retrieved fragment is self-describing.
- All four values are configuration with validated defaults, not hard-coded constants.

## Alternatives considered

- **Token-based chunking.** More accurate for the provider budget, but requires a
  tokenizer per provider and couples chunking to the AI layer. Rejected for v1; character
  and word estimates are visibly named as estimates.
- **Fixed character windows.** Simpler but splits sentences and tables.
- **Semantic chunking.** Requires embeddings, which are deferred.

## Consequences

- Overlap duplicates text across chunks; retrieval may return near-duplicates. The budget
  step deduplicates by `(documentId, chunkIndex)` only, not by content similarity.
- Long tables may exceed the max and split mid-row; the split respects the 1200-word cap
  and keeps the header line in each fragment, which is the documented trade-off.
- Chunking is a pure function, so changing parameters is testable and does not require a
  database.

---

## As built, Phase 5

Details the decision left open, settled while building `apps/api/src/chunking`:

- Three numbers are configuration (`CHUNK_TARGET_WORDS`, `CHUNK_OVERLAP_WORDS`, `CHUNK_MAX_WORDS`),
  checked together at start-up: overlap below target, and the maximum at least target + overlap + 60.
  The 60 is room reserved for a heading-path prefix (at most 30 words) and a heading carried over from
  the previous chunk (at most 30), which is what lets "no chunk is longer than the maximum" be true
  and tested, not hoped for.
- A word is a run of non-space characters. The target counts new text only; overlap and prefix sit on
  top of it.
- Overlap is the last words of the previous chunk, at most half of it when that chunk was tiny; when the
  chunk ends in lines (table rows, PDF lines) it is whole lines, so an overlap never cuts a row.
  Spreadsheets have no overlap: a row is already self-contained.
- A chunk's page number is the page where its own text starts, not where its overlap came from.
- A heading is never the last thing in a chunk; it moves to the next one. A chunk carries the headings
  above it as `A > B — text`.
- A table or any block of lines too big for one chunk is split between lines, the first line (the
  header) repeated at the top of each piece; then between sentences; then between words.
- A spreadsheet row too big for the maximum is split by words, each piece carrying the sheet name and
  the column names.
