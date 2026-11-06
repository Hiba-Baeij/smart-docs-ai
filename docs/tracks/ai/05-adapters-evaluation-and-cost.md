# AI 05 — Provider Adapters, Evaluation, and Cost

Status: reviewed
Related: NFR-04, NFR-12, ADR-008
Verified against: Phase 9 adapter and recorded fixture telemetry, 2026-11-02; live provider prices remain operator-specific

## 1. The port, again

The snippets in sections 1–4 illustrate the interfaces and policy. The implemented code is
`apps/api/src/ai/llm-provider.ts`, `mock-llm.provider.ts`,
`openai-compatible.provider.ts`, and `generate-with-retry.ts`.

```ts
export interface LlmProvider {
  generate(input: {
    system: string;
    messages: { role: 'user' | 'assistant'; content: string }[];
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
  }): Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number } }>;
}
```

Why this shape:

- It is the smallest thing the use case needs. No provider concepts leak.
- `usage` is optional: a mock has none, and the app must not depend on it.
- No streaming method in v1; adding one is additive.

## 2. The mock adapter

```ts
export class MockLlmProvider implements LlmProvider {
  behaviour: 'answer' | 'no_evidence' | 'timeout' | 'error' = 'answer';
  answer = 'ANSWER [S1]';

  async generate(input: LlmProviderInput) {
    if (this.behaviour === 'timeout') throw new AiTimeoutError();
    if (this.behaviour === 'error') throw new AiUnavailableError();
    if (this.behaviour === 'no_evidence' || !input.messages.some(m => m.content.includes('EVIDENCE'))) {
      return { text: 'NO_EVIDENCE' };
    }
    return { text: this.answer };
  }
}
```

It is the default in development and tests. It must be able to simulate every branch the
real adapter can produce, or those branches are untested.

## 3. The real adapter

```ts
export class OpenAiCompatibleProvider implements LlmProvider {
  async generate(input: LlmProviderInput) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          temperature: input.temperature,
          max_tokens: input.maxTokens,
          messages: [{ role: 'system', content: input.system }, ...input.messages],
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new AiUnavailableError(response.status);
      const data = await response.json();
      return { text: data.choices[0]?.message?.content ?? '', usage: mapUsage(data.usage) };
    } catch (error) {
      if (isAbort(error)) throw new AiTimeoutError();
      if (error instanceof AiUnavailableError) throw error;
      throw new AiUnavailableError();
    } finally {
      clearTimeout(timer);
    }
  }
}
```

Adapter rules:

- It is the only file that knows the vendor's payload shape.
- It maps every failure to `AI_TIMEOUT` or `AI_UNAVAILABLE`. Nothing vendor-specific
  escapes.
- It never logs the prompt, the completion, or the key.
- It never retries internally; retry policy belongs to the use case, where it is visible
  and testable.

## 4. Retry policy

- One retry, only for timeout and 5xx.
- No retry for 4xx (bad key, bad request) — retrying a misconfiguration wastes money.
- Backoff of a few hundred milliseconds, not exponential, because the user is waiting.
- Total budget: `LLM_TIMEOUT_MS` per attempt, two attempts max.

```ts
async function generateWithRetry(llm: LlmProvider, input: LlmProviderInput) {
  try {
    return await llm.generate(input);
  } catch (error) {
    if (!isRetryable(error)) throw error;
    return llm.generate(input);
  }
}
```

## 5. Cost model

Per question:

```
input tokens  = system + history + evidence + question
output tokens = answer (≤ maxTokens)
cost ≈ input × inputPrice + output × outputPrice
```

Worked example (replace prices with the provider's current numbers):

| Component | Tokens | Note |
|---|---|---|
| System | 200 | fixed |
| History | 400 | 6 short messages |
| Evidence | 3000 | budgeted |
| Question | 60 | typical |
| **Input** | **3660** | |
| Output | 300 | typical, capped at 700 |

Three cost controls, in order of effect:

1. **Evidence budget** — the largest term and the most tunable.
2. **History limit** — unbounded history is the classic silent cost leak.
3. **Output cap** — stops a rambling answer from doubling the bill.

Track `usage` per request in development logs (tokens only, never content) to replace
estimates with measurements after the first week.

## 6. Provider data handling

Before enabling a real provider, answer these in the deployment README:

- Does the provider retain inputs for training? Can it be disabled?
- What is the data region?
- What is the retention period?
- Is the content regulated (contracts, personal data)?
- Does the provider's terms permit this use?

This project sends only the question, six excerpts, and recent history. That reduces
exposure but does not eliminate it. The choice of provider is an operator decision that
must be recorded, not a default.

## 7. Evaluation harness

```
apps/api/test/chat-evaluation.e2e-spec.ts
  fixed 36-case corpus in the test file; runs through search, evidence packing,
  the mock provider, and message persistence
```

This test:

- Seeds a fixed document set for each case.
- Runs each case through the real retrieval and prompt pipeline.
- Records: retrieved ids, packed ids, sentinel or answer, cited sources.
- Prints a table and a pass/fail summary during the API integration suite.
- Uses the deterministic mock; it never calls a live provider or incurs provider charges.

Use it when changing chunk size, search config, top-k, or prompt wording. One knob per
run, or the result means nothing.

## 8. Upgrading to embeddings later

The seam already exists:

1. Add `embedding vector(1536)` to `DocumentChunk` (requires pgvector; verify Prisma
   support first).
2. Add an `EmbeddingProvider` port and a backfill job.
3. Implement `VectorChunkRetriever` behind `ChunkRetriever`.
4. Optionally hybrid: merge keyword and vector results with reciprocal rank fusion.
5. Re-run the evaluation set. Keep whichever wins on recall@6.

No use case changes. That is the payoff of the port.

## 9. What "done" looks like for the AI layer

- [x] Mock covers answer, sentinel, timeout, error.
- [x] Real adapter maps failures; no vendor type escapes `AiModule`.
- [x] Retry happens once and is visible in logs as a count, not a prompt.
- [x] Exact fallback is asserted from the exported constant.
- [x] Injection fixtures pass in the test corpus.
- [x] Token use is measured with a recorded fixture; live monetary cost requires an operator's model price.
- [x] The provider data-handling questions are documented in `docs/ops/local-setup.md` for the operator to answer before live use.

## 10. Question before moving on

> Your cost per question doubles after a chat feature ships. Name the three most likely
> causes in order, and the log field you would inspect for each.
