# ADR-008: LlmProvider port with a deterministic mock as the default

Status: accepted
Date: 2026-10-23

## Context

The PRD requires a configurable provider and forbids exposing keys to the client.
Development and tests need to run without network access, cost, or nondeterminism.

## Decision

- Define one port:

```ts
interface LlmProvider {
  generate(input: {
    system: string;
    messages: ChatMessage[];
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
  }): Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number } }>;
}
```

- Provide `MockLlmProvider` (default in `NODE_ENV !== 'production'` and in tests).
  It returns scripted responses keyed by a test hook, and `NO_EVIDENCE` when no evidence
  is present in the prompt.
- Provide one real adapter for an OpenAI-compatible endpoint, selected by configuration.
- Selection happens only inside `AiModule`. No other module imports an adapter class.
- Errors are normalised to `AI_TIMEOUT` and `AI_UNAVAILABLE` at the port boundary.

## Alternatives considered

- **Call the SDK directly from the chat service.** Fewest files, but every test needs a
  network mock and every provider change touches a use case.
- **LangChain or similar framework.** Adds a large abstraction for one call shape;
  obscures what the learner needs to see.
- **Multiple real providers at once.** No requirement yet; the port makes it additive.

## Consequences

- Tests are deterministic and free; the real adapter is exercised by a smaller set of
  contract tests with recorded fixtures.
- The mock must be realistic enough to exercise the sentinel path, or the evidence policy
  is untested in practice.
- Streaming is not in the interface in v1; adding it is an additive method, not a rewrite.
