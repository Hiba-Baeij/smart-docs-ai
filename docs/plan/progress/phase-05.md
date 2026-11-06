# Phase 5 — Chunking, Search Spike, tsvector

Date started: 2026-10-31
Date finished: 2026-10-31
Time spent:

## Predict (written before building)

Question: which configuration do you expect to win for Arabic, and what evidence would change
your mind?

Provenance: **[me]** is my own wording; **[Claude]** is what Claude corrected or added.

**[me]** Remove the diacritics, turn capital letters into small ones, unify the alef forms and the
teh marbuta, and remove the diacritics and the tatweel.

**[Claude]** That is a clear guess: configuration **D**, `simple` plus an application normaliser
(lower-casing, one alef, one teh marbuta, no tashkeel, no tatweel). Missing from the answer, the
second half of the question: what evidence would change your mind. My addition: a normaliser only
makes spellings equal, it does not reduce words to a root. Before the spike I checked the installed
PostgreSQL: the `arabic` configuration exists and reduced `المدرسة` to `مدرس`, but left
`والمدارس` (with the prefix و) untouched, and `simple` keeps the tashkeel inside the token
(`مَرْحَبًا` is one token, different from `مرحبا`), which supports the guess. So the evidence that
should change the guess is a measured one: if `arabic`, or `arabic` after the normaliser, beats D on
Recall@6 and MRR over the 20 questions, especially on the questions that use a plural or a
different form of the word than the document does, D loses. Two more pieces of evidence: a corpus
that is mostly English (the `english` stemmer would matter), and queries with typos (trigram
similarity would matter). The 20 questions are written by Claude, not taken from your real
documents, so a win on them is a win on that corpus only; this is recorded in the spike.

**Result [Claude]:** the guess was partly right and partly wrong. A normaliser does help over plain
`simple` (19/20 against 18/20), but `arabic` alone wins (20/20, MRR 0.925 against 0.875), and
adding the normaliser on top of `arabic` measured as nothing. The evidence named above is exactly
what decided it: `arabic` beat D on the questions with the article and with plurals. Details:
`phase-05-spike-results.md` and the ADR-004 amendment.

## What I built

- **5.1 Chunking service.** `src/chunking`: `chunkDocument(document, config)`, a pure function from
  an `ExtractedDocument` to `{ chunkIndex, content, pageNumber, sheetName }`. Blocks (paragraphs,
  headings, line groups) are accumulated to a target of new words; a block too big is split between
  lines (header line repeated), then sentences, then words; overlap repeats the last words (whole lines
  when the chunk ends in table rows or PDF lines); headings give a path prefix (`A > B — text`) and
  never end a chunk; spreadsheets chunk on whole rows with the sheet name on every chunk and no
  overlap. Three numbers are configuration (`CHUNK_TARGET_WORDS`, `CHUNK_OVERLAP_WORDS`,
  `CHUNK_MAX_WORDS`), validated together at start-up (`env.validation.spec.ts`, 6 tests). The "no chunk
  over the maximum" rule needed reserved room for the prefix and a carried heading (60 words), so the
  config check is `max >= target + overlap + 60`; the design decisions are recorded in ADR-005 ("As
  built"). 39 tests in `chunker.spec.ts`: the eight cases of the guide plus page numbers, headings,
  overlap reconstruction (every word, in order, once), the hard maximum, determinism, and invalid
  configurations.
  - Mutation checks, each confirmed applied: no overlap → 5 failures; overlap not halved for tiny
    chunks → 1; no heading path → 3; page taken from the last block → 1; table header not repeated → 1;
    sheet title only on the first chunk → 3; target ignored → 7; words cut mid-word → 1; CRLF not
    normalised → 1. Three needed a second round: "no heading carry-over" was NOT APPLIED the first
    time (prettier had reformatted the line), and "split threshold ignores the reserve" and "overlap
    line alignment off" SURVIVED. The hard-maximum test used paragraphs exactly at the threshold, not
    above it, and the table test checked only lines that looked like rows. I strengthened both; the
    stronger table test then failed on the real code because one word of overlap (`here`) is correct
    behaviour my pattern did not allow, which I fixed in the test. All three now fail when mutated
    (2, 1 and 1 failures).
- **5.2 Chunking in the upload.** `UploadDocumentService` now extracts, normalises the whole result
  (`toStorableDocument`: NULs out of `pages` and `sheets` too, not only of `text`), chunks inside the
  time budget, and writes the chunks and `COMPLETED` in ONE interactive transaction. The chunking
  function is injected (`CHUNK_DOCUMENT`) so a test can hand the use case a faulty chunker.
  `documents-chunking.e2e-spec.ts` (7 tests, chunks of about ten words from `chunking-small-env.ts`):
  real PDF chunks cite pages 1, 2, 3 with the overlap in the second; a workbook's chunks each belong
  to one sheet and start with its name; a Word chunk after a heading carries the path; `chunkCount`
  equals the rows; the invariant "COMPLETED exactly when chunks exist" holds over a mix of successes
  and four kinds of failure; a chunker that numbers twice is stopped by the unique constraint (500,
  `FAILED/INTERNAL`, no chunks, no text); and a database trigger that refuses the final `UPDATE` AFTER
  the chunk insert succeeded leaves zero chunks, which is the only case that proves the transaction.
  - Mutation checks, each confirmed applied: chunks written outside the transaction → 1 failure (the
    trigger test, exactly the one predicted); chunks not written → 7; `chunkCount` reported as 0 → 3;
    page number not stored → 2; sheet name not stored → 2; NUL not removed from the structure → 3;
    zero chunks accepted → 1.
  - The 4.8 tests that injected a failure into `prisma.document.update` were rewritten to fail the
    transaction instead (`$transaction` spy), because the successful write no longer goes through
    that call.
- **5.3 Search column.** Migration `search_vector` (raw SQL): `unaccent` and `pg_trgm`, a generated
  `tsvector` and a GIN index. `\d "DocumentChunk"` shows `search_vector ... generated always as
  (...) stored` and `document_chunk_search_idx gin (search_vector)`. Prisma then wanted to drop the
  column on the next `migrate dev` (it saw drift); declaring it in the schema as
  `Unsupported("tsvector")? @default(dbgenerated())` made `migrate diff` empty. `schema-search.e2e-spec.ts`
  (4 tests): extensions present, column generated, GIN index, direct writes refused, and the arabic
  configuration folds alef variants and the article.
- **5.4 Normaliser.** `normalizeSearchText` (NFKC, invisible marks, tashkeel and tatweel, alef forms,
  teh marbuta, alef maksura, Persian yeh and kaf, eastern digits, lower case): 20 tests, 11 rule
  mutations each caught (1 to 4 failures), none survived. It is one TypeScript function used on both
  sides of the index, as the guide asked; the spike then showed the index does not need it (below), so
  it now serves stop-word matching.
- **5.5 Spike.** `test/spike`: 39 passages and 23 questions (all written by Claude; 20 before any run,
  3 after, disclosed), 15 runs (configurations A to E, two mismatch runs X and Y, trigram T; each with
  the question as typed and as an OR of content words), Recall@6, MRR, noise. Printed by
  `search-spike.e2e-spec.ts`; full table in `phase-05-spike-results.md`.
- **5.6 ADR-004 amended**, with the winner, the numbers, one line for each loser, and what was not
  adopted. Second migration `search_arabic` rebuilds the generated column with `'arabic'` (6 existing
  rows rebuilt, no drift). The spike spec asserts the decision (5 tests).
- **5.7 Retrieval query.** `ChunkSearchService.search({ userId, question, limit })`: content words of
  the question joined with `or`, `websearch_to_tsquery('arabic', ...)`, `ts_rank_cd`, owner and
  `COMPLETED` filters in the same statement, every value bound, limit 1 to 100, recency as tie-break.
  Without `userId` it does not compile (a `@ts-expect-error` test). `chunk-search.e2e-spec.ts` (20) and
  `search-after-upload.e2e-spec.ts` (5, real uploads of the three formats searched through the real
  path), plus 20 unit tests of the query builder.
  - Mutation checks, each confirmed applied: owner filter removed → 4 failures; status filter removed
    → 2; stop words kept → 7; AND instead of OR → 7; `simple` in the query → 2; worst first → 2; no
    LIMIT → 1; older first on ties → 1; limit not validated → 5. Nothing survived.

### What the spike found, in the order it matters

1. **A question passed as typed finds almost nothing.** `websearch_to_tsquery` needs every word to
   match; the retrieval guide's own query would return nothing for a natural question (Recall@6 0 to
   2 of 20 in every configuration, against 18 to 20 with stop words removed and `or`).
2. **`arabic` beats `simple`, and the app normaliser adds nothing on top of it.**
3. **The `arabic` stemmer is asymmetrical:** `الفواتير` and `بالفواتير` become `فواتير`, but bare
   `فواتير` becomes `واتير`, so a bare word does not match the same word with the article. Kept as a
   canary test.
4. **The normaliser mismatch collapses recall only on `simple`** (19/20 to 14/20, MRR 0.875 to 0.650);
   on `arabic` it is hidden, which is a reason not to keep a normaliser in the index.
5. **Trigram similarity had the best MRR (0.975) and the least noise.** Not adopted, with reasons, in
   the ADR; it is the result most worth revisiting on real documents.

## Gate output

Run 2026-10-31 on the final code; database `smartdocs_test` for the e2e:

```
npm run lint        All files pass linting.
npm run typecheck   0 errors
npm test            Test Suites: 14 passed, 14 total   Tests: 180 passed, 180 total
npm run test:e2e -w api
                    Test Suites: 22 passed, 22 total   Tests: 165 passed, 165 total
npm run build       Application bundle generation complete.
```

The plan's gate list: chunking tests green (`chunker.spec.ts`); spike table recorded
(`phase-05-spike-results.md`); ADR amended; a query for a known term returns the expected chunk in the
top 6 (`search-after-upload.e2e-spec.ts` for a PDF page, a workbook row and a Word section, each rank 1).

## Failure drill

Run inside the spike harness against PostgreSQL (a scratch table in the test database, dropped
afterwards), because the deployed index has no normaliser to mismatch.

| What I broke | I expected | What actually happened |
|---|---|---|
| D: the index holds normalised text (`simple`), the question is NOT normalised (run Y) | recall collapses | Recall@6 19/20 to 14/20, MRR 0.875 to 0.650, 6 questions with no result at all |
| E: the same mistake with the `arabic` configuration (run X) | recall collapses | no change: 20/20, MRR 0.950 against 0.942 |

Why the first collapses: the index holds `احمد` and the question says `أحمد`; they are different
lexemes and nothing is found, but only for the questions that contain a variant, so the system looks
half-working. Why the second does not: the `arabic` stemmer folds the question itself, so the
mismatch is repaired by accident. I had predicted a collapse for both; the second surprised me, and I
added run Y to get the drill the plan asks for. Restored: nothing to restore, the table is dropped and
the deployed column is generated from `content` alone. The lesson the drill leaves is the design
choice: no application normaliser in the index means there is no pair of paths that can drift apart.

## Explain back

Provenance for this whole section: I asked Claude to write these answers. They are
**[Claude, at my request]**, not my own words, and they have not been checked against my own
understanding. My own attempt at the Predict question is in the Predict section.

1. What does `to_tsvector('simple', ...)` do, and what does it deliberately not do?

   **[Claude, at my request]** It splits text into tokens with PostgreSQL's parser, lower-cases them
   and stores a sorted list of lexemes with their positions, so a query can ask "are these lexemes in
   this text" through the GIN index. It deliberately does no linguistics: no stemming, no stop words,
   no language knowledge, no folding of accents or of Arabic letter variants. That makes it
   predictable and language-agnostic, and it is exactly why `أحمد` and `احمد`, `الفواتير` and
   `فواتير`, or a word with and without tashkeel are different lexemes to it. In the spike that cost
   it two questions (18/20 against 20/20 for `arabic`).

2. Why must the write path and the query path share the same normaliser?

   **[Claude, at my request]** Because the index and the question must be written in the same
   alphabet. If the text is stored as `احمد` and the question arrives as `أحمد`, no lexeme matches,
   whatever the SQL is. The failure is partial, which makes it miserable to diagnose: questions
   without a variant still work. I measured it: with the index normalised and the question left raw,
   Recall@6 fell from 19 to 14 of 20 and MRR from 0.875 to 0.650. The same mistake under the `arabic`
   configuration changed nothing, because the stemmer folds the question too; that is why the
   deployed index has no application normaliser at all, which removes the pair of paths that could
   drift apart.

3. What do Recall@6 and MRR each tell you that the other does not?

   **[Claude, at my request]** Recall@6 says whether the right chunk is inside the window that is
   handed to the model, yes or no, and says nothing about where inside it. MRR says how high the first
   right chunk sits, so it notices rank 1 against rank 6, and it also gives credit below rank 6, so it
   cannot tell whether the answer made the window. The spike has both cases: A and D tie on MRR (0.875)
   but differ in recall (18 against 19), and C and E tie on recall (20) but differ in MRR (0.925
   against 0.942). A configuration should be judged on both, and on a corpus larger than 20 questions,
   where a one-question difference is not evidence.

4. Why is a 700-word chunk not automatically better than a 300-word chunk?

   **[Claude, at my request]** Size trades context against precision. A bigger chunk keeps more of the
   surrounding text, but it can hold several topics, so its ranking blurs, it costs more of the
   prompt budget (six chunks of 700 words is a lot), and a citation points at a wider region. A smaller
   chunk ranks and cites precisely and is cheap, but it can lose the context that makes it meaningful
   or split an answer in two. 700/100/1200 is a hypothesis from the ADR, and this spike did not
   test it: the spike's passages are 30 to 60 words each. It is measured in Phase 8 with real questions,
   one parameter at a time.

## Where I was wrong

- **[Claude]** I misread my own probe of the `arabic` configuration and wrote, in the first draft of
  the ADR amendment, that the article and the bare form "become one lexeme". They do not: bare
  `فواتير` becomes `واتير` because the stemmer also strips a leading ف. The retrieval test caught it
  (an Arabic question that matched in my head returned nothing); I corrected the ADR and the guide
  and kept a canary test for the quirk. It also explains why spike question 5 ranked second, not
  first, under `arabic`.
- **[Claude]** I predicted that the normaliser mismatch would collapse recall on `arabic` as well. It
  did not (the stemmer masks it). I added run Y to have the drill the plan asks for, and the
  surprise became one of the reasons for the decision.
- **[Claude]** The spike has three questions (21 to 23) that I added after the first run, once the
  probe showed which letters `arabic` folds. They are marked in the code and reported separately; the
  decision rests on the first 20 and on gaps larger than one question. Even so, they do not
  stress what I meant them to (digits were matched by the other words of the question).
- **[Claude]** The plan, ADR-004 and the retrieval guide were wrong in places the spike corrected: the
  winner (`simple` in the ADR), the claim that `arabic` does not fold alef or teh marbuta, and above
  all the query itself, which as written would return nothing for a natural question.
- **[Claude]** Tooling mistakes of mine, each caught by a check: the shell turned backslash escapes
  into real newlines and broke the XLSX extractor, the chunker and two specs (I now edit with the file
  tools, and escape-heavy source is written as code points); one `sed` mutation silently did not apply;
  a hung `prisma migrate dev` that I stopped left its database connection holding the migration
  advisory lock, so the next migration timed out until I terminated that orphaned session (two
  `pg_terminate_backend` calls on sessions my own commands had opened).

## Open questions

- **The measurement is on a corpus I wrote.** Before anyone relies on Recall@6 as a number about the
  product, run the spike again on the user's real documents and questions.
- **Trigram similarity** had the best MRR; it is the first thing to revisit if typos or very short
  queries matter in real use.
- **English text has no stemmer** under `arabic`; it was found without one in the spike, but a mixed
  vector (arabic plus english) is an option if English documents dominate.
- **Chunk size is untested** (see explain-back 4); Phase 8.
- Documents uploaded before Phase 5 are `COMPLETED` with zero chunks (the development database holds
  five from the Phase 4 drill) and cannot be found by search; re-uploading fixes them. There is no
  re-chunking job in v1.

## Next phase readiness

- [x] Gate commands run and seen
- [x] Failure drill observed (inside the spike harness, on PostgreSQL)
- [x] Explain-back filled (by Claude at my request, not verified as my own understanding)
- [x] Traceability updated (FR-11, FR-21, NFR-05 name the real tests)
- [x] Docs updated with anything that changed (ADR-004 amendment, ADR-005 "As built", retrieval guide,
      local-setup and `.env.example` for the chunk parameters, schema comment)
