# AI 02 — Chunking

Status: reviewed
Related: FR-11, ADR-005
Verified against: not applicable (pure logic)

## 1. Why chunk at all

Three independent reasons:

1. **Retrieval granularity.** A 60-page document is not a useful search result. A 700-word
   passage can be ranked, cited, and dropped into a prompt.
2. **Prompt budget.** You cannot send the whole document; you must send the relevant part.
3. **Citation precision.** "Page 3, chunk 12" is a checkable claim. "The document" is not.

Chunking is a retrieval decision made before any model exists. Bad chunks cannot be fixed
by a better prompt.

## 2. The parameters and what each one costs

| Parameter | Value | If too small | If too large |
|---|---|---|---|
| Target size | 700 words | fragments lose context; more chunks to rank | one chunk covers several topics; ranking blurs |
| Overlap | 100 words | a sentence split at a boundary loses meaning | duplicate evidence, wasted budget |
| Max size | 1200 words | tables split awkwardly | a single chunk can exceed the budget |
| Boundary | paragraph → sentence → word | mid-sentence cuts | none |

These are a starting hypothesis, not an optimum. The plan measures them in Phase 8.

## 3. The algorithm

```
1. Normalise line endings; collapse runs of blank lines to one.
2. Segment into blocks: paragraph, heading, table row group.
3. Accumulate blocks until adding the next would exceed the target.
4. If a single block exceeds the max, split it: sentences, then words.
5. Emit the chunk with metadata from its first block.
6. Start the next chunk with the overlap tail of the previous one.
7. Drop chunks that are empty after trimming.
```

Metadata rules:

- `pageNumber`: the page where the chunk *starts*. A chunk spanning pages 3–4 cites page 3.
- `sheetName`: for spreadsheets, every chunk belongs to exactly one sheet.
- Headings: prepend the nearest heading path to the chunk text
  (`"Section 4.2 Payment terms — ..."`), because a retrieved fragment without its heading
  is often meaningless.

## 4. Spreadsheets need different treatment

A raw cell dump is hostile to retrieval: `"2026 | 1200 | 450"` matches nothing useful.
Render rows as text before chunking:

```
Sheet: Q3 Budget
Category: Travel | Planned: 12000 | Actual: 9800 | Variance: -2200
Category: Software | Planned: 3000 | Actual: 3150 | Variance: 150
```

Rules:

- First non-empty row = header.
- Each data row becomes `header: value` pairs.
- The sheet name is prepended to every chunk so a fragment is self-describing.
- Chunk on row boundaries, never mid-row.
- If the sheet has no header, use `column 1, column 2, ...` and record that in the chunk
  text so the reader knows.

## 5. DOCX structure

`mammoth`-style extraction gives paragraphs with style names. Use them:

- Heading styles become heading markers in the text and update the heading path.
- Table content is rendered row-wise, like spreadsheets, with the header row repeated.
- Paragraph order is the document order; do not sort or deduplicate.

## 6. PDF reality check

- Text extraction order is not always reading order; multi-column PDFs interleave.
- Page numbers are reliable; paragraph boundaries are not.
- Scanned PDFs yield nothing: this is `EMPTY_EXTRACTION`, not a chunking problem.
- Ligatures and Arabic presentation forms may appear; the Phase 5 spike decides whether
  normalisation is needed before indexing.

## 7. Determinism is a feature

`chunk(input, config)` must be a pure function. Why it matters:

- Re-processing a document after a config change should be explainable.
- Tests can assert exact output.
- Debugging a bad citation is possible: the same input produces the same chunk 12.

Prohibited inside chunking: dates, random ids, locale-dependent sorting, `Date.now()`,
reading environment variables directly (pass config in).

## 8. How to test chunking

| Case | Assertion |
|---|---|
| Short text (< target) | exactly one chunk, full content |
| Long text | every chunk ≤ max, none empty |
| Heading document | heading path present in the chunk that follows |
| Table | rows intact, header repeated |
| Two sheets | `sheetName` correct per chunk, no mixing |
| Overlap | tail of chunk N appears at the head of N+1 |
| No punctuation | splits on words, never mid-word |
| Whitespace only | zero chunks (and the caller reports empty extraction) |

Property test worth adding: concatenating chunks with overlap removed reconstructs the
normalised source text. If it does not, content was lost.

## 9. The evaluation you cannot skip

Chunking quality is invisible in unit tests. In Phase 8, build 20 questions:

- 10 answerable from one chunk.
- 5 answerable only by combining two chunks.
- 5 unanswerable.

Measure: did retrieval return a chunk containing the answer, and was it in the top 6? If
the answer chunk is frequently at rank 15, the chunk size or boundaries are wrong. Change
one parameter at a time and record the result. This is the difference between tuning and
guessing.

## 10. Question before moving on

> A table row is split across two chunks. What does the user see in the citation, and what
> would you change to prevent it?
