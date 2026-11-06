# Traceability

Status: reviewed
Related: all FR/NFR, all phases
Verified against: last audited at Phase 12

Every requirement maps to a document, a phase, and at least one test. A requirement with no
test is a wish. This table is the anti-drift mechanism: it is updated whenever a requirement
or a test changes, and audited at Phase 12.

Test paths below identify the implemented checks. The audit verifies cited file names exist;
the phase gate also runs the checks and reviews whether their assertions cover the requirement.

## Functional requirements

| ID | Primary doc | Phase | Test |
|---|---|---|---|
| FR-01 | `integration/auth-flow.md` §1 | 2 | `api/test/auth-register.e2e-spec.ts` register valid |
| FR-02 | `auth-flow.md` §2 | 2 | `api/test/auth-login.e2e-spec.ts` login sets cookie; `rate-limit.e2e-spec.ts`; `cookie-secure.e2e-spec.ts` |
| FR-03 | `api-contract.md` /auth/me | 2 | `api/test/auth-session.e2e-spec.ts` me has no hash; `auth-guard.e2e-spec.ts` |
| FR-04 | `auth-flow.md` §7 | 2 | `api/test/auth-session.e2e-spec.ts` logout then 401 |
| FR-05 | `auth-flow.md` §4 | 3 | `apps/web/src/app/core/auth/auth.guard.spec.ts`, `return-url.spec.ts`, `app.routes.spec.ts` |
| FR-06 | `api-contract.md` upload | 4 | `documents-processing.e2e-spec.ts` three formats; `documents-upload.e2e-spec.ts` the HTTP edge |
| FR-07 | `security-model.md` §6 | 4 | `file-validation.service.spec.ts` per rejection; `documents-upload.e2e-spec.ts` size limit |
| FR-08 | `data-flow.md` §1 extraction | 4 | `pdf.extractor.spec.ts`, `docx.extractor.spec.ts`, `xlsx.extractor.spec.ts` |
| FR-09 | `data-flow.md` failure table | 4 | `documents-processing.e2e-spec.ts` scanned PDF; `documents-failures.e2e-spec.ts` |
| FR-10 | `api-contract.md` detail | 4 | `documents-persistence.e2e-spec.ts` extractedText (the detail endpoint itself is Phase 6) |
| FR-11 | `tracks/ai/02-chunking.md` | 5 | `chunker.spec.ts` (the eight cases and more); `documents-chunking.e2e-spec.ts` stored chunks, transaction |
| FR-12 | `data-flow.md` state machine | 4 | `documents-processing-limits.e2e-spec.ts` status transitions |
| FR-13 | `api-contract.md` GET /documents | 6 | `documents-manage.e2e-spec.ts` owner scope, pagination, no N+1; web: `documents.store.spec.ts`, `documents-page.spec.ts` |
| FR-14 | `api-contract.md` GET /documents/:id | 6 | `documents-manage.e2e-spec.ts` detail, previews, 404; web: `document-detail.spec.ts` |
| FR-15 | `api-contract.md` DELETE | 6 | `documents-manage.e2e-spec.ts` chunks gone after 204, foreign 404; database level since Phase 1: `schema-cascade.e2e-spec.ts`; web: `document-detail.spec.ts` |
| FR-16 | `security-model.md` §6 | 4 | `documents-upload.e2e-spec.ts` bytes arrive in memory, no `path` (nothing is written to disk) |
| FR-17 | `api-contract.md` POST /conversations | 7 | `conversations.e2e-spec.ts` create, validation, no `userId`; `conversation-title.spec.ts`; `send-message.e2e-spec.ts` title |
| FR-18 | `api-contract.md` GET /conversations | 7 | `conversations.e2e-spec.ts` owner scope, ordering, paging; `send-message.e2e-spec.ts` moves to the top |
| FR-19 | `api-contract.md` messages | 7 | `conversations.e2e-spec.ts` ordering, paging, sources always an array; `send-message.e2e-spec.ts` question saved before the answer, survives a failure |
| FR-20 | `upload-to-answer.md` §6 | 8 | `chat.e2e-spec.ts` answer path |
| FR-21 | `security-model.md` §5 | 5, 8 | `chunk-search.e2e-spec.ts` owner scope, status filter (the retrieval query exists since Phase 5); chat wiring in Phase 8 |
| FR-22 | `api-contract.md` sources | 8 | `chat.e2e-spec.ts` sources persisted |
| FR-23 | `tracks/ai/04` §4 | 8 | `evidence-policy.spec.ts` exact constant |
| FR-24 | `api-contract.md` DELETE conversation | 7 | `conversations.e2e-spec.ts` messages gone after 204, foreign 404; database level since Phase 1: `schema-cascade.e2e-spec.ts` |
| FR-25 | `tracks/ai/04` §5 | 8 | `chat.e2e-spec.ts` injection fixtures |
| FR-26 | `security-model.md` §5 | 7–8 | `ownership.e2e-spec.ts` matrix, parameterised; the POST messages row is tested below HTTP now and over HTTP in Phase 8 |
| FR-27 | `integration/error-model.md` | 2, 3 | `api/test/errors.e2e-spec.ts` envelope; client: `apps/web/src/app/core/http/app-error.spec.ts`, `error.interceptor.spec.ts` |
| FR-28 | `security-model.md` §9 | 11 | `rate-limit.e2e-spec.ts` four scopes |
| FR-29 | `tracks/angular/02` §6 | 6, 10 | `documents.store.spec.ts` and `documents-page.spec.ts` (four states, precedence), `document-detail.spec.ts`; `chat-page.spec.ts` in Phase 10 |
| FR-30 | `security-model.md` §3 T1 | 6 | `documents.store.spec.ts` and `documents-page.spec.ts` no flash when another user signs in |

## Non-functional requirements

| ID | Primary doc | Phase | Test |
|---|---|---|---|
| NFR-01 | `security-model.md` §3 T9 | 11, 12 | `scan-secrets.test.mjs` (`npm run test:secrets`): the source tree and the built web bundle, key shapes and the real configured values, with a planted-secret control |
| NFR-02 | `tracks/nestjs/03` §1 | 2 | `api/test/auth-register.e2e-spec.ts` hash prefix `$2b$12$` |
| NFR-03 | `security-model.md` §3 T1 | 7, 11 | `ownership.e2e-spec.ts` (Phase 7), log audit (Phase 11) |
| NFR-04 | `tracks/ai/05` §1 | 9 | `ai.module.spec.ts` selection |
| NFR-05 | `ADR-009` | 5, 8 | `env.validation.spec.ts` chunk parameters (Phase 5); `evidence.spec.ts` token budget packing (Phase 8) |
| NFR-06 | `product/PRD.md` §12 | 12 | `traceability.test.mjs` (`npm run audit:traceability`): every row names tests that exist and documents that exist; with a control that must fail |
| NFR-07 | `error-model.md` §6 | 11 | `redacting-logger.spec.ts` redaction |
| NFR-08 | `ADR-006` | 4 | `documents-processing-limits.e2e-spec.ts` timeout |
| NFR-09 | `tracks/angular/04` §5 | 10 | manual checklist + `chat-page.spec.ts` |
| NFR-10 | `docs/README.md` conventions | 12 | `docs-truth.test.mjs`: every command and path the docs cite exists; plus the manual truth pass recorded in `phase-12.md` |
| NFR-11 | `ops/local-setup.md` | 12 | `journey.spec.ts` verifies the running product; fresh-copy install, generate, migrate and startup were checked separately and recorded in `phase-12.md` |
| NFR-12 | `ADR-009` | 9, 12 | `evidence.spec.ts` token budget; `generate-with-retry.spec.ts` one retry; `openai-compatible.provider.spec.ts` timeout and temperature passed on; `env.validation.spec.ts` rejects temperature above 0.2 |

## PRD §12 test list → location

| PRD requirement | Test |
|---|---|
| Registration and login | `auth-register.e2e-spec.ts`, `auth-login.e2e-spec.ts` |
| Invalid credentials and hashing | `auth-login.e2e-spec.ts`, `auth-register.e2e-spec.ts` |
| Unauthorized requests | `auth-session.e2e-spec.ts`, `ownership.e2e-spec.ts` |
| Cross-user document access | `ownership.e2e-spec.ts` |
| Cross-user conversation access | `ownership.e2e-spec.ts` |
| File type and size validation | `file-validation.service.spec.ts`, `documents-upload.e2e-spec.ts` |
| PDF, DOCX, XLSX extraction | `pdf.extractor.spec.ts`, `docx.extractor.spec.ts`, `xlsx.extractor.spec.ts` |
| Chunk ordering and metadata | `chunker.spec.ts`, `documents-chunking.e2e-spec.ts` |
| Document/chunk persistence consistency | `documents-chunking.e2e-spec.ts` |
| Retrieval restricted to the user | `chunk-search.e2e-spec.ts` |
| Cited answers in the test corpus | `chat.e2e-spec.ts`, `chat-evaluation.e2e-spec.ts` |
| Exact insufficient-evidence fallback | `evidence-policy.spec.ts` |
| Prompt injection attempts | `chat.e2e-spec.ts` |

## Maintenance rules

1. Add a requirement → add a row here in the same change.
2. Add a test → replace the indicative path with the real one.
3. Change a phase boundary → update every affected row.
4. Phase 12 audits this file before the docs truth pass, not after.
