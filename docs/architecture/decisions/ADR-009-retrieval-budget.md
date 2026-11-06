# ADR-009: Retrieval budget and history policy

Status: accepted
Date: 2026-10-23

## Context

Sending every matching chunk is expensive, slow, and reduces answer quality by burying
the relevant text. Chat history competes with evidence for the same context window.

## Decision

| Item | Default | Setting |
|---|---|---|
| Ranked candidates | 20 | `RETRIEVAL_CANDIDATES` |
| Chunks kept | 6 | `RETRIEVAL_TOP_K` |
| Evidence budget | ~3000 tokens (estimated) | `RETRIEVAL_TOKEN_BUDGET` |
| History | last 6 messages | `CHAT_HISTORY_MESSAGES` |
| Temperature | 0.2 | `LLM_TEMPERATURE` |
| Max output tokens | 700 | `LLM_MAX_OUTPUT_TOKENS` |

Rules:

- Evidence is packed in rank order until the budget would be exceeded; a chunk that does
  not fit is skipped, not truncated mid-sentence.
- History is included only after evidence is packed, and is trimmed oldest-first.
- The estimator is `characters / 4`, named `estimateTokens`, used consistently everywhere
  so budgets are comparable.
- A single chunk larger than the whole budget is truncated at a sentence boundary and
  marked in its source reference.

## Alternatives considered

- **Send all candidates.** Unbounded cost; quality degrades with noise.
- **Exact tokenisation.** Requires a tokenizer tied to the provider; rejected as coupling
  for an estimate that only needs to be safe.
- **Summarise history.** Extra model call, extra cost, extra failure mode. Deferred.

## Consequences

- Very long conversations lose early context; that is accepted and visible.
- Budget changes are configuration, verified by a unit test on the packing function.
- The estimate can undercount for Arabic; the margin is deliberate and documented.
