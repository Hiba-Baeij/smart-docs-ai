# Phase 11 — Hardening

Date: 2026-11-01

## Prediction

T7 (resource exhaustion) remains partially mitigated in v1. The API has request and work
budgets, but rate counters live in one process, and an in-process document parser cannot be
force-cancelled after its timeout. The HTTP rate tests and processing-limit tests prove the
bounded behavior of one instance, while a multi-replica deployment or a hostile parser needs
separate infrastructure validation.

## Changes

- Explicit single-origin credentialed CORS. Requests with a foreign `Origin` return 403
  `FORBIDDEN_ORIGIN`; cross-site writes without `Origin` are also blocked using Fetch Metadata.
  Non-browser clients without these headers remain supported. Production config requires
  `COOKIE_SECURE=true`.
- Login/register retain their IP limit. Upload, chat send, and other requests now have
  configurable per-user limits (IP fallback for anonymous requests), 429 envelopes, and
  `Retry-After`.
- JSON request bodies have an explicit byte ceiling and map parser overflow to 413. Multipart
  size remains enforced by Multer before `UploadDocumentService` runs.
- Process logger centrally masks sensitive fields and token patterns. Unexpected exceptions
  and parser failures now log metadata without original messages or stacks.
- Evidence sent to the provider uses citation ids instead of automatically including document
  filenames. The server still maps ids to document names for the UI.

## Threat checklist

| Threat | Status and evidence | Remaining limit |
|---|---|---|
| T1 cross-user document read | Verified: `ownership.e2e-spec.ts` | — |
| T2 forged user id | Verified: `ownership.e2e-spec.ts`, validation e2e tests | — |
| T3 token theft via XSS | Verified controls: `cookie-secure.e2e-spec.ts`, Angular escaped-text component tests | No CSP in v1 |
| T4 CSRF | Verified: `security-hardening.e2e-spec.ts`, `auth-session.e2e-spec.ts` | Requests without browser Origin/Fetch Metadata are accepted for API clients; SameSite=Lax remains required |
| T5 password cracking | Verified: `auth-login.e2e-spec.ts`, `auth-register.e2e-spec.ts`, `redacting-logger.spec.ts` | — |
| T6 malicious upload | Verified controls: `documents-upload.e2e-spec.ts`, `file-validation.service.spec.ts`, `documents-processing-limits.e2e-spec.ts` | Parsers run in process; no OS sandbox |
| T7 resource exhaustion | Verified single-instance controls: `rate-limit.e2e-spec.ts`, `security-hardening.e2e-spec.ts`, `documents-processing-limits.e2e-spec.ts`, provider timeout tests | Rate counters are process-local; timed-out parser work is not force-cancelled |
| T8 prompt injection | Verified: `chat-provider.e2e-spec.ts`, injection fixtures and `evidence-policy.spec.ts` | Prompting cannot guarantee all answers are factual |
| T9 provider key leakage | Verified controls: `env.validation.spec.ts`, `openai-compatible.provider.spec.ts`, source and bundle secret-pattern scans | User questions still go to the configured provider |
| T10 provider over-sharing | Verified: `prompt.spec.ts`, `evidence.spec.ts` | Verbatim user question and recent history may contain filenames typed by the user |
| T11 log secret leakage | Verified: `redacting-logger.spec.ts`, `documents-failures.e2e-spec.ts` | External logs and hosting configuration require separate review |
| T12 resource enumeration | Verified: `ownership.e2e-spec.ts`, `auth-login.e2e-spec.ts` | Exact timing equality is not claimed |
| T13 SQL injection | Verified control: `schema-search.e2e-spec.ts`; raw queries use `Prisma.sql` bound parameters | — |
| T14 stale logout session | Verified: `auth-session.e2e-spec.ts` | A copied stateless token remains valid until its one-hour expiry; no revocation list in v1 |

## Failure drill and verification

- `redacting-logger.spec.ts` deliberately logs a request-shaped object with password,
  authorization, cookie, and API key markers, then asserts no marker reaches the logger sink.
  The test first exposed a Bearer-token leak; the redactor was corrected and the test passed.
- Full API e2e: **31 suites, 281 tests passed**. API unit: **23 suites, 218 tests passed**,
  snapshot 1/1. API typecheck, lint, and production build passed. Web typecheck and production
  build passed after the shared error-code change.
- `npm audit --omit=dev --audit-level=low` and `npm audit --audit-level=low`: **0 findings**.
- Source and freshly built web bundle scans for common provider/cloud/private-key patterns:
  **0 matches**. This pattern scan cannot prove absence of every possible secret format.
