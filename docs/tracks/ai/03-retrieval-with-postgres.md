# AI 03 — Retrieval with PostgreSQL

Status: reviewed
Related: FR-21, ADR-004, ADR-009
Verified against: PostgreSQL 17 (postgres:17-alpine), Phase 5, 2026-10-31. Extension availability
and text-search configurations vary by build, so re-check them on any other server.

## 1. What full-text search actually is

PostgreSQL converts text into a `tsvector`: a sorted list of lexemes with positions.

```
'contract':1 'notice':4 'period':6 'thirty':8
```

A query becomes a `tsquery`, and the `@@` operator checks containment. A GIN index makes
that check fast without scanning rows.

Crucially: this is not "does the string contain the word". It is "do the normalised
lexemes match", which is why the *configuration* matters more than the SQL.

## 2. Configurations

| Configuration | What it does | Effect on this project |
|---|---|---|
| `simple` | lowercases, splits, no stemming, no stop words | Predictable, language-agnostic, no stemming |
| `english` | stemming + stop words | Good for English, useless for Arabic |
| `arabic` | Arabic stemmer; present in PostgreSQL 17 (checked with `SELECT cfgname FROM pg_ts_config;`) | Strips the article and prefixes (asymmetrically: a bare word starting with ف loses it, so it does not match the same word with the article), folds hamza/alef, teh marbuta, tashkeel, tatweel and Arabic-Indic digits; **the measured winner** (ADR-004 amendment) |
| `unaccent` | strips accents (Latin-centric) | Helps European text, does not solve Arabic diacritics |
| `pg_trgm` | trigram similarity | Good for typos and short queries |

Do not assume `arabic` exists. Do not assume `unaccent` is installed in the database just
because the image ships the extension. Both are checked in the spike and recorded in
ADR-004.

## 3. Arabic normalisation

Arabic matching fails for reasons that have nothing to do with the SQL:

| Variation | Example | Consequence |
|---|---|---|
| Diacritics (tashkeel) | كِتَاب vs كتاب | Treated as different lexemes |
| Alef forms | أحمد / إحمد / احمد | Different tokens |
| Teh marbuta | شركة vs شركه | Different tokens |
| Tatweel | كــتاب | Breaks the token |
| Persian vs Arabic yeh | ی vs ي | Different tokens |

Options, in order of preference:

1. **Normalise in the application before indexing and before querying**, and store the
   normalised text in a column that feeds the generated `tsvector`. One implementation,
   used by both sides, unit-tested.
2. A custom `IMMUTABLE` SQL function used inside the generated column. Works, but moves
   logic into the database where it is harder to test and slower to change.
3. Rely on the `arabic` configuration. Least code. The guess here used to be that it "does not
   normalise alef or teh marbuta variants"; the Phase 5 probe showed that on PostgreSQL 17 it does.

**Phase 5 outcome: option 3.** Measured on 20 questions, `arabic` found the answer in the top 6
for 20 of 20; `simple` plus an application normaliser for 19 of 20; plain `simple` for 18 of 20.
Adding the normaliser on top of `arabic` changed nothing measurable, and an index normalised on
one side only collapsed recall on `simple` (19/20 to 14/20) while `arabic` hid the mistake. So the
index has no application normaliser. `normalizeSearchText` remains for matching stop words.

Whichever is chosen, both the write path and the query path must use the same normaliser.
A mismatch here produces "search works for some documents" bugs that are miserable to
diagnose.

## 4. The schema

```sql
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "DocumentChunk"
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('arabic', coalesce(content, ''))) STORED;

CREATE INDEX document_chunk_search_idx ON "DocumentChunk" USING GIN (search_vector);
```

This is the deployed form (migration `search_arabic`; the first migration used `'simple'`). If
normalisation were done in the app, the generated expression would use the normalised column
instead; the spike found no need. The index must be built after data exists? No — it can be built on an empty table
and maintained automatically; a large backfill is the only case needing a separate
`CREATE INDEX CONCURRENTLY`.

## 5. The query

```sql
SELECT
  c.id,
  c."documentId",
  c."chunkIndex",
  c.content,
  c."pageNumber",
  c."sheetName",
  d."originalName" AS "documentName",
  ts_rank_cd(c.search_vector, q.query) AS score
FROM "DocumentChunk" c
JOIN "Document" d ON d.id = c."documentId"
CROSS JOIN LATERAL (SELECT websearch_to_tsquery('arabic', $1) AS query) q
WHERE d."uploadedBy" = $2
  AND d.status = 'COMPLETED'
  AND c.search_vector @@ q.query
ORDER BY score DESC, d."createdAt" DESC
LIMIT $3;
```

- `websearch_to_tsquery` tolerates user input (`"exact phrase"`, `-exclusion`) without
  throwing syntax errors, unlike `to_tsquery`.
- **`$1` is not the question as typed.** `websearch_to_tsquery` requires every word to match, and a
  question carries words the answer does not ("what", "is", "ما", "كم"): passed as typed, Recall@6
  was 0 to 2 of 20 in every configuration. `$1` is the question's content words joined with
  `or` (stop words removed), which scored 18 to 20 of 20. See `src/search/query-terms.ts`.
- All values are bound parameters. No interpolation, ever.
- The owner filter is in the same query as the rank. Never rank first and filter later.
- `status = 'COMPLETED'` prevents retrieving chunks from a document that failed to finish.

### Why `ts_rank_cd`

It uses cover density: matches closer together score higher. For a paragraph-sized chunk
that is a better relevance signal than plain `ts_rank`. Recency is a tie-breaker only, not
a relevance signal.

## 6. The Phase 5 spike (one day, produces an ADR amendment)

Build a table of 20 questions with the chunk that contains each answer. Run four
configurations:

| Run | Config | Normalisation |
|---|---|---|
| A | `simple` | none |
| B | `simple` + `unaccent` | Latin accents |
| C | `arabic` (if available) | stemmer |
| D | `simple` + app normaliser | Arabic char folding |

Measure:

- **Recall@6**: is the answer chunk in the top 6?
- **MRR**: how high is the first correct result?
- **False positives**: irrelevant chunks in the top 6.

Record: query, expected chunk, ranks per run, and a one-line conclusion. Then amend
ADR-004 with the winner and the evidence. This is the only honest way to choose; opinions
about Arabic stemming are not data.

If `arabic` is missing or performs worse, that is a finding, not a failure.

**Result (Phase 5):** `arabic` won; the table, the per-question ranks and the reading are in
`docs/plan/progress/phase-05-spike-results.md` and the ADR-004 amendment. The corpus was written by
Claude, not taken from real documents; repeat the measurement on real ones.

## 7. Failure modes to expect

| Symptom | Likely cause |
|---|---|
| Zero results for a word present in the text | normalisation mismatch between write and query |
| Everything matches | query built with `||` between terms instead of `&&`, or empty tsquery |
| Short queries return noise | two-letter tokens; consider trigram fallback |
| Arabic question, no matches | diacritics or alef variants; normaliser missing |
| Same chunk returned repeatedly | overlap plus no dedupe; dedupe by `(documentId, chunkIndex)` |
| Slow query | missing GIN index, or a `LIKE '%...%'` slipped in |

## 8. What this cannot do

- Synonyms ("termination" vs "ending the agreement").
- Paraphrased questions where no content word appears.
- Cross-language questions (Arabic question, English document) without translation.

These are the honest limits of v1 and the reason the fallback exists. The upgrade path is
an embedding adapter behind `ChunkRetriever`; it is not pretended to be solved now.

## 9. Question before moving on

> A user searches for a word that appears on page 3, and gets nothing. List the five most
> likely causes in the order you would check them, with the query or test you would run for
> each.
