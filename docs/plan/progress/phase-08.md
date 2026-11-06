# Phase 8 — Retrieval and RAG with the Mock Provider

Date started: 2026-10-31
Date finished: 2026-11-01

## Prediction and observed result

For a related document without the requested fact, keyword retrieval can return a candidate.
The mock provider returns `NO_EVIDENCE`; `policeAnswer` emits the exact Arabic fallback.
With zero candidates, `RagAnswerStep` skips the provider and emits the same constant.

## What was built

- An owner-required `ChunkRetriever` port backed by PostgreSQL keyword search.
- Ranked evidence packing with skip-when-full selection. A first oversized chunk is shortened,
  marked `truncated`, and only packed references are returned.
- A pure prompt builder with a structural snapshot, delimited evidence, source markers, and a
  six-message history default.
- A deterministic mock provider with answer, refusal, timeout, and error modes.
- A code-owned fallback, marker validation, and persistence through
  `POST /api/conversations/:id/messages`.
- PDF and DOCX fixtures containing instruction attacks, exercised through real upload and chat.

## Evaluation corpus

The fixed 36-case corpus runs PostgreSQL retrieval, packing, prompt construction, the mock
provider, and persistence. `Recall` means each required chunk was among the six packed sources;
`cited` means the response included the expected fact and a relevant citation. This is not
human-graded answer accuracy.

| Bucket | Cases | Recall | Fallbacks | Cited expected fact |
|---|---:|---:|---:|---:|
| Answerable, one chunk | 10 | 10 | 0 | 10 |
| Answerable, two chunks | 5 | 5 | 0 | 5 |
| Topically similar, fact absent | 5 | — | 5 | — |
| Unrelated | 3 | — | 3 | — |
| Adversarial | 3 | — | 3 | — |
| Arabic | 6 | 6 | 0 | 6 |
| English | 4 | 4 | 0 | 4 |

Recall@6: **25/25**. Fallback precision on unanswerable cases: **11/11**. Answerable
non-fallback rate: **25/25**. The corpus is small and synthetic; the real provider needs
separate evaluation before its quality can be claimed.

## Failure drill

- Forced zero retrieval for an answerable invoice question: exact fallback, no sources, no
  provider call. This misses an answer without inventing an unsupported fact.
- An invoice chunk mentions payment but not the requested tax rate: retrieval returns it;
  the mock refuses and code emits the same fallback.

## Gate evidence

- Full API e2e: **29 suites, 272 tests passed**.
- API unit tests: **19 suites, 198 tests passed**, snapshot 1/1.
- Web unit tests: **22 files, 257 tests passed**.
- Workspace build, typecheck, and lint: passed.
- PDF and DOCX injection tests: 2/2 passed.
- Deleting a cited document leaves the stored citation visible in old conversation history.

## Limits and next phase

Prompt boundaries reduce injection risk but cannot guarantee that a real model obeys the rule.
The mock uses deterministic overlap and duration cues; its evaluation scores cannot be
transferred to the Phase 9 provider. Phase 9 adds the real adapter, timeout and retry policy,
and a fresh quality and privacy check.
