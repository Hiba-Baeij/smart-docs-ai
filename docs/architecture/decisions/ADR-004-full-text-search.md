# ADR-004: Full-text search with a generated tsvector, decided by a spike

Status: accepted
Date: 2026-10-23

## Context

The PRD requires keyword retrieval first and forbids introducing pgvector before its
compatibility is verified. The corpus is expected to contain Arabic, possibly mixed with
English. Arabic stemming and normalisation quality in PostgreSQL vary by configuration
and version, and this is the single largest technical uncertainty in the design.

## Decision

1. Add a generated `search_vector` column to `DocumentChunk`:

```sql
ALTER TABLE "DocumentChunk"
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED;

CREATE INDEX document_chunk_search_idx
  ON "DocumentChunk" USING GIN (search_vector);
```

2. The migration is **raw SQL**, because Prisma's schema language cannot express generated
   `tsvector` columns. It is applied with `prisma migrate dev --create-only` and edited
   before applying.
3. **Phase 5 runs a one-day spike** comparing three configurations on real samples:
   - `simple` + `unaccent`
   - `arabic`
   - `pg_trgm` similarity for short queries and typos
   The winner is recorded by amending this ADR with measured examples.
4. Queries are built with bound parameters; user input is never concatenated into SQL.

## Alternatives considered

- **`ILIKE '%term%'`.** Trivial, no index usage at scale, terrible relevance. Rejected.
- **`pg_trgm` only.** Good for typos, weak for multi-word relevance. Considered as a
  complement, not a replacement.
- **Application-side search.** Loads the corpus into Node. Rejected.
- **pgvector now.** Blocked by the PRD and by unmeasured embedding cost.

## Consequences

- Retrieval quality is a measured decision, not a guess. The spike output is an artifact
  of Phase 5.
- Arabic stop words and diacritics may need explicit normalisation; the spike decides.
- If `arabic` wins, the generated column must be rebuilt with that configuration, which
  means a second migration and a re-index.
- Ranking uses `ts_rank_cd`, with recency as a tie-breaker only.

---

## Amendment, 2026-10-31 — the Phase 5 spike result

Decisions 1 and 3 above are settled by measurement. Where they differ from the text above, this
section wins.

### Decision

1. The generated column uses the **`arabic`** configuration on the chunk content, with no
   application normaliser:
   `to_tsvector('arabic', coalesce(content, ''))` (migration `search_arabic`; the first migration,
   `search_vector`, created it with `'simple'`, as written above).
2. Queries use `websearch_to_tsquery('arabic', ...)` over the question's **content words joined
   by `or`**, not over the question as typed (see "The finding that mattered more").
3. `ts_rank_cd` ranks; recency only breaks ties. `pg_trgm` stays installed but is **not** part of
   retrieval in v1 (see "Not adopted").

### Evidence

23 questions over 39 passages (29 Arabic, 10 English); all written by Claude, not taken from the
user's documents, so the result describes this kind of text and not the user's files. The first 20
questions were written before any configuration ran. Three more (21 to 23) were added after a probe
of what `arabic` folds; they are shown separately. Full per-question table:
`docs/plan/progress/phase-05-spike-results.md`. Reproduce: `npm run test:e2e -w api -- search-spike`.

| Run | Configuration | Recall@6 (first 20) | MRR (first 20) | Recall@6 (all 23) |
|---|---|---|---|---|
| A | `simple` | 18/20 | 0.875 | 20/23 |
| B | `simple` + `unaccent` | 18/20 | 0.875 | 20/23 |
| C | **`arabic`** | **20/20** | 0.925 | **23/23** |
| D | `simple` + application normaliser | 19/20 | 0.875 | 22/23 |
| E | `arabic` + application normaliser | 20/20 | 0.942 | 23/23 |
| T | `pg_trgm` word similarity | 20/20 | 0.975 | 23/23 |

(OR-of-content-words queries for A to E.)

### The configurations that lost, one line each

- **A `simple`:** misses a word that appears with or without the article (`الفواتير` vs `فواتير`) and
  one with diacritics; 18/20.
- **B `simple` + `unaccent`:** identical to A in every number: `unaccent` removes Latin accents and
  the corpus has none that matter; no help for Arabic.
- **D `simple` + application normaliser:** fixes spelling variants (19/20) but not the article or
  plurals, so it stays below `arabic`; and it is the fragile one (next point).
- **E `arabic` + application normaliser:** ties C on recall, +0.017 MRR (two questions moved by one rank, in opposite
  directions); not worth a second column and a function both the write path and the read path must call.
- **Predicted winner:** the Predict answer guessed D. The measurement says D helps over A, but the
  stemmer matters more than the normaliser.

### What the probe of `arabic` showed

On this PostgreSQL 17 build `arabic` already folds hamza and alef variants, teh marbuta, tashkeel,
tatweel, the lam-alef ligature and Arabic-Indic digits, and strips the article and the preposition
prefix (`الفواتير` and `بالفواتير` both become `فواتير`). It is not symmetrical: it also strips a
leading `ف`, so the bare word `فواتير` becomes `واتير` and does NOT match `الفواتير` in a text. (I
first misread the probe as "article and bare form become one lexeme"; the retrieval test caught it,
and it is why spike question 5 ranked second, not first, under `arabic`.) It does not fold Persian
yeh, kaf or digits, does not reduce broken plurals (`مدارس` vs `مدرس` stay different), and does not
drop a right-to-left mark inside a word.
The track guide's claim that `arabic` "does not normalise alef or teh marbuta variants" is
**false on this build**; it is corrected there.

### The finding that mattered more than the configuration

Every configuration found almost nothing (Recall@6 0 to 2 of 20) when the question was passed to
`websearch_to_tsquery` as typed: it requires every word to match, and a real question carries words
the answer does not ("what", "is", "the", "ما", "هي", "كم"). The same configurations scored 18 to 20
once stop words were removed and the content words were joined with `or`. The query in the retrieval
guide, as written, would return nothing for natural questions. The query module (task 5.7) builds
`or`-queries from content words, using a short stop-word list for Arabic and English.

### The failure drill, measured

The normaliser on the write side only (index normalised, question as typed) collapses recall on
`simple`: Recall@6 19/20 to 14/20, MRR 0.875 to 0.650 (runs D and Y). On `arabic` the same mistake
changes nothing measurable (runs E and X), because the stemmer re-folds the question itself. That
is a second reason not to keep an application normaliser in the index: it adds a way to fail
silently, for a gain that was not measured.

### Not adopted, and why

- **`pg_trgm` as the primary search (run T, best MRR 0.975 and the least noise).** It is the best
  single number and the result deserves to be taken seriously, but: 39 passages cannot say how it
  ranks at scale; its ranking is similarity, not the cover density that `ts_rank_cd` gives; and the
  plan fixes full-text search with a GIN index. Left as a documented complement for typos and very
  short queries, to be revisited if real use shows they matter. The extension remains installed.
- **The `english` stemmer for English text.** English words were found without it (4 of 4 questions
  at rank 1). Mixed-language stemming (a vector built from two configurations) is a later option.

### Consequences

- The application has no search normaliser. `normalizeSearchText` stays as a tested helper, used to
  recognise stop words however they are spelled; it is not in the index.
- Changing the configuration again means a migration that drops and re-adds the generated column
  (PostgreSQL rebuilds it for existing rows); no application re-index is needed.
- 20 questions is a small sample: a difference of one or two questions is not evidence. The
  conclusions above rest on the larger gaps (naive vs OR queries, `simple` vs `arabic`).
- The measurement must be redone on the user's real documents before anyone relies on Recall@6 as a
  number about the product.
