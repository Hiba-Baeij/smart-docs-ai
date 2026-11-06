# AI Track

Status: reviewed
Related: ADR-008, ADR-009, ADR-010, ADR-011
Verified against: provider API details confirmed at Phase 9

## Who this is for

A beginner in AI who is already a strong engineer. These guides avoid both mysticism and
hype. They explain what the model actually does, what it cannot do, and where this project
puts guardrails.

## Reading order

| Guide | Read before | What it unlocks |
|---|---|---|
| `01-llm-basics-and-tokens.md` | Phase 8 | Context windows, cost, and why RAG exists |
| `02-chunking.md` | Phase 5 | Turning documents into retrievable units |
| `03-retrieval-with-postgres.md` | Phase 5 | Keyword search that actually works on Arabic |
| `04-rag-pipeline-and-evidence.md` | Phase 8 | Evidence policy, fallback, injection resistance |
| `05-adapters-evaluation-and-cost.md` | Phase 9 | Real providers, evaluation, and the cost model |

## The mental model in five sentences

1. A language model predicts the next token from the tokens it can see.
2. It has no memory of your documents and no access to your database.
3. Anything it "knows" about your documents was placed in the prompt by your code.
4. Therefore the quality of the answer is bounded by the quality of retrieval and the
   honesty of the prompt.
5. Prompting reduces bad answers; it cannot guarantee correct ones. This project relies on
   mechanisms (sentinel, exact fallback, citations), not on promises.

## What this track is not

- Not a machine-learning course. No training, no fine-tuning, no embeddings math.
- Not a vendor tutorial. The provider is one adapter behind a port.
- Not a claim that RAG solves hallucination. It narrows the input and makes refusal
  possible; it does not make the model truthful.
