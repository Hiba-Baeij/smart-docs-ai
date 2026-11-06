# Phase 9 — Real Provider Adapter

Date started: 2026-11-01
Date finished: 2026-11-01

## Prediction

A provider 429 is mapped to `AI_UNAVAILABLE` without retry. The plan permits one retry only
for timeout and 5xx. The user's question remains stored, so the caller can retry later without
an invented assistant answer.

## Implementation

- `OpenAiCompatibleProvider` sends the system message, recent history, temperature, model, and
  output cap to `/chat/completions`, maps reported token usage, and aborts each attempt on timeout.
- Upstream failures become safe `AI_TIMEOUT` or `AI_UNAVAILABLE` errors. The response never
  exposes a vendor body, key, prompt, or completion.
- The answer use case retries once after timeout or 5xx, with 300 ms backoff, and logs only the
  retry count and measured token usage. It does not retry 401 or 429.
- `AiModule` chooses mock or real adapter from `LLM_PROVIDER`. Development defaults to mock;
  production requires explicit real-provider settings.
- The operator data-handling checklist and token-cost record are in `docs/ops/local-setup.md`.

## Failure drill

A recorded 401 response represents an invalid key. The HTTP route returned 503 with
`AI_UNAVAILABLE`; one user question remained and no assistant row was fabricated. After the
fixture switched to a successful response, the same conversation accepted another question and
saved an answer. There was no retry on the 401. The response and captured logs contained no
key, question, evidence, or vendor error body.

## Verification

- Full API e2e: **30 suites, 274 tests passed**.
- API unit tests: **22 suites, 213 tests passed**, snapshot 1/1.
- Web unit tests: **22 files, 257 tests passed**.
- Workspace lint, typecheck, and build: passed.
- Adapter contract tests use a recorded success fixture and controlled fetch responses; no
  request reaches a live provider.
- The recorded success fixture reports **120 input + 20 output = 140 tokens**. This is measured
  fixture telemetry, not live currency cost; no actual provider key or model price was supplied.
- Unit tests cover the request shape, timeout abort, status mapping, malformed responses,
  retries, no-retry 401/429, provider selection, and production configuration.
- The HTTP drill covers 503 on invalid key and 504 on timeout, with durable user messages.

## Limit

Real provider quality, data retention, region, terms, and live monetary cost depend on the
operator's selected endpoint and credentials. No live provider call was made in this phase.
