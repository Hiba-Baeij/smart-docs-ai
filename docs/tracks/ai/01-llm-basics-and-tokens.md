# AI 01 — LLM Basics, Tokens, and Context

Status: reviewed
Related: ADR-008, ADR-009, NFR-12
Verified against: token counts and prices are provider-specific; measure, do not assume

## 1. What the model does

Given a sequence of tokens, the model produces a probability distribution over the next
token. Decoding picks one, appends it, and repeats. A "chat" is a formatted sequence of
role-labelled messages.

Consequences that matter for engineering:

| Property | Consequence |
|---|---|
| No memory between calls | History must be sent every time, or the model has amnesia |
| No access to your data | Retrieval is the only bridge |
| Probabilistic output | The same prompt can produce different wording |
| Bounded input | The context window limits history + evidence + question |
| Bounded output | Answers can be cut off; set `maxTokens` |
| Trained on public data | It will confidently answer from memory if you let it |

The last one is the reason for the project's central rule: the model must answer only from
supplied evidence.

## 2. Tokens

A token is a sub-word unit. Rough rules:

- English: ~1 token per 0.75 words, or ~4 characters.
- Arabic: fewer characters per token; estimates tend to undercount.
- Code and tables: more tokens per character than prose.

`estimateTokens(text) = ceil(text.length / 4)` is deliberately crude. It is used for
budgeting, with a safety margin, and it is named as an estimate everywhere. Exact
tokenisation requires the provider's tokenizer and would couple the domain layer to a
vendor.

### Why tokens are the unit of money and time

- Cost ≈ input tokens × input price + output tokens × output price.
- Latency grows with output tokens, not input tokens, in the common case.
- A 3000-token evidence block costs roughly the same whether it is one chunk or six, but
  six small chunks usually retrieve better than one large one.

## 3. The context window

```
[ system rules ][ history ][ evidence ][ question ][ answer (generated) ]
```

The window is shared. This project's policy:

| Component | Budget |
|---|---|
| System rules | ~200 tokens, fixed |
| History | last 6 messages, trimmed first |
| Evidence | ~3000 tokens, packed by rank |
| Question | ≤ 4000 characters by validation |
| Answer | ≤ 700 output tokens |

Evidence is budgeted before history because the documents are the point of the product.
If the budget is tight, the conversation loses old small talk, not the source material.

## 4. Temperature and determinism

- `temperature` controls randomness. 0 is greedier and more repeatable; 1 is more varied.
- This project uses 0.2: answers should be stable, but not so rigid that phrasing becomes
  awkward.
- Determinism is not guaranteed even at 0; provider infrastructure can vary.
- Tests never depend on model wording. They depend on the sentinel, the fallback constant,
  and the structure of the prompt.

## 5. Hallucination, precisely

A hallucination is fluent text that is not supported by the evidence (or by reality).
Three distinct causes:

1. **No evidence available.** The model fills the gap from training data.
2. **Weak evidence.** Retrieval returned something adjacent, and the model over-connects.
3. **Instruction conflict.** The prompt invites speculation ("be helpful and answer
   everything").

Mitigations in this project, matched to causes:

| Cause | Mitigation |
|---|---|
| No evidence | Zero-candidate short-circuit; sentinel; exact fallback |
| Weak evidence | Ranking, top-6 budget, explicit "if insufficient, return NO_EVIDENCE" |
| Instruction conflict | System prompt that forbids outside knowledge and speculation |

None of these makes the model truthful. They make refusal possible and make unsupported
answers less likely. That is the honest claim.

## 6. Roles in a chat request

| Role | Contains | Trust |
|---|---|---|
| `system` | Rules, persona, output contract | Trusted, written by us |
| `user` | The question | Untrusted input |
| `assistant` | Prior answers | Semi-trusted: could contain injected content echoed from a document |
| `tool` | Not used in v1 | — |

Because assistant messages can carry injected text forward, history is limited and the
system rule applies to the whole conversation, not just the current question.

## 7. Why RAG instead of fine-tuning

| Approach | Cost | Freshness | Citations | Fit here |
|---|---|---|---|---|
| Fine-tune | High, slow | Stale on upload | None | No |
| Long prompt with all docs | Explodes the window | Fresh | Weak | No |
| RAG | Per-question tokens | Fresh | Yes, structural | Yes |

Fine-tuning teaches style and format, not facts you can cite. This product needs citations
and per-user isolation, which is a retrieval problem.

## 8. The three questions to answer before Phase 8

1. What exactly is sent to the provider for one question, in order, and what is *not* sent?
2. Why can the same question produce two different answers, and which test must not depend
   on that?
3. Name one failure that prompting cannot prevent, and the mechanism that handles it in
   code.
