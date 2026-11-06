# ADR-010: The NO_EVIDENCE sentinel owns the fallback sentence

Status: accepted
Date: 2026-10-23

## Context

The PRD requires an exact Arabic sentence when evidence is insufficient. Prompt
instructions alone cannot guarantee an exact string: models paraphrase, translate, or
add explanations.

## Decision

- The system prompt instructs the model to return exactly `NO_EVIDENCE` when the evidence
  cannot answer the question.
- The service checks the response (trimmed, uppercase, whole token). On match, it **emits
  the fallback string from code** and never stores model text.

```ts
export const INSUFFICIENT_EVIDENCE_ANSWER =
  'ليس لدي معلومات كافية للإجابة عن سؤالك.';
```

- The stored assistant message is that constant.
- The API returns it with `sources: []`.
- Any extra text around the sentinel is discarded.

## Alternatives considered

- **Prompt-only enforcement of the Arabic sentence.** Fragile, unverifiable, and fails
  the exact-match test on the first paraphrasing model.
- **String-similarity detection of refusal.** Brittle and language-specific.
- **Treat empty retrieval as the only trigger.** Misses the case where chunks exist but
  do not answer the question; the model must still be allowed to refuse.

## Consequences

- Two refusal paths are possible (no candidates, model sentinel); both map to the same
  constant. Tests cover both.
- A model that never returns the sentinel may answer unsupported questions; that is a
  quality risk, not a correctness guarantee. Retrieval quality and prompt rules reduce it.
- The constant is exported for tests so the assertion cannot drift from the code.
