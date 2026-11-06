# Upload to Answer — The Cross-Track Flow

Status: reviewed
Related: FR-06…FR-25, ADR-004, ADR-005, ADR-009, ADR-010
Verified against: no version-specific claims

This is the one document that touches all three tracks. Read it after the track guides and
before Phase 8. It answers a single question: **what exactly happens between a user's file
and a cited sentence?**

## Stage 1 — The file becomes text (NestJS + extraction)

The upload controller does four things and nothing else: authenticate, take the buffer,
validate it, delegate. Extraction is an adapter behind `DocumentExtractor`, chosen by
`fileType`. The output is not a string; it is a structure:

```ts
type ExtractedDocument = {
  text: string;
  pages?: { pageNumber: number; text: string }[];      // PDF
  sheets?: { sheetName: string; rows: string[][] }[];  // XLSX
  headings?: { level: number; text: string }[];        // DOCX
};
```

Structure matters because a citation without a page or sheet is weak evidence, and because
a table chunk without its header is misleading.

**Decision point:** keep `Document.extractedText` as the full text for display and
traceability, and derive chunks from the structured form, not from the stored string. If
you derive from the stored string you lose page boundaries.

## Stage 2 — Text becomes chunks (AI track)

Chunking is the first place where a retrieval decision is made, long before any model is
involved. The parameters (700/100/1200) are a hypothesis. The test suite proves ordering,
non-emptiness, metadata, and determinism; it cannot prove relevance. Relevance is measured
in Phase 8 with real questions.

A chunk is the unit of both retrieval and citation. That is why `chunkIndex` is stable and
why a chunk never straddles two pages without recording which page it started on.

## Stage 3 — The question becomes evidence (PostgreSQL)

```
question
  → normalise (trim, collapse whitespace, length check)
  → build tsquery
  → SELECT c.*, d.originalName, ts_rank_cd(...) AS score
      FROM "DocumentChunk" c
      JOIN "Document" d ON d.id = c."documentId"
     WHERE d."uploadedBy" = $1
       AND d.status = 'COMPLETED'
       AND c.search_vector @@ $2
     ORDER BY score DESC, d."createdAt" DESC
     LIMIT $3
```

Three properties are non-negotiable and each has a test:

1. `uploadedBy = $1` comes from the token.
2. Only `COMPLETED` documents contribute.
3. No raw user string is concatenated into SQL.

`ts_rank_cd` rewards term proximity; recency only breaks ties. The search configuration
(`simple` + `unaccent`, `arabic`, or `pg_trgm` assist) is chosen by the Phase 5 spike and
recorded in ADR-004.

## Stage 4 — Evidence becomes a prompt (AI track)

The prompt is assembled, not concatenated ad hoc:

```
buildPrompt({ system, history, evidence, question })
  → delimit each evidence block with [S1] + source header
  → wrap content in <<< >>>
  → pack until the token budget is reached
  → include the last 6 messages
  → return { system, messages, usedSources }
```

`usedSources` is the list of sources actually packed. It is what the response cites. A
retrieved chunk that does not fit the budget is not cited, because it was never shown to
the model.

## Stage 5 — The answer is policed (the part people skip)

```
response = await provider.generate(...)
if (isNoEvidence(response.text)) {
  return { content: INSUFFICIENT_EVIDENCE_ANSWER, sources: [] }
}
return { content: response.text, sources: usedSources }
```

The fallback sentence is produced by code, not by the model. This is the difference
between "we asked the model to refuse" and "the system refuses".

## Stage 6 — Persistence and return

Both messages are stored. `sources` is stored on the assistant message so a reload shows
the same citations. The conversation's `updatedAt` moves. The response returns the
assistant message and the user message.

## The full trace of one question

```
"ما هي مدة الإشعار في العقد؟"
  → 3 chunks retrieved from contract.pdf page 3, chunk 12-14
  → budget keeps 2 chunks
  → prompt cites [S1] p.3 and [S2] p.4
  → model answers using both
  → assistant message: "مدة الإشعار ثلاثون يوماً [S1]."
  → sources: two references
```

Ask instead "ما هو رأس المال المصرح به للشركة؟" when no chunk contains it:

```
  → 0 candidates, or candidates with low relevance
  → model returns NO_EVIDENCE
  → stored assistant message: ليس لدي معلومات كافية للإجابة عن سؤالك.
  → sources: []
```

Same code path. Different branch. Both tested.

## Where the difficulty actually lives

| Looks hard | Actually hard |
|---|---|
| Calling an LLM | Deciding what evidence is allowed to reach it |
| Chunking text | Keeping citations meaningful across pages and sheets |
| Prompt wording | Proving the fallback and injection behaviour |
| Angular chat UI | Ownership and error states under real failure |

## Checklist before Phase 8 is done

- [x] Retrieval is impossible to call without a user id.
- [x] A question with no matching chunk returns the exact fallback.
- [x] A question with irrelevant matching chunks still returns the exact fallback.
- [x] An injection document does not change the answer policy (tested with the mock provider).
- [x] Sources survive a page reload.
- [x] Deleting a cited document does not break an old conversation.
- [x] The prompt is built by a pure function with a snapshot test.
- [x] Token budgeting is unit-tested at the boundary (one chunk too large).
