# SmartDocs AI Implementation Plan

> **For the project author:** This plan is a learning instrument, not a handoff. Steps
> are checkboxes so progress is visible. Each phase ends with a gate you must pass and
> explain before moving on. Do not skip the Predict, Failure drill, or Explain-back steps;
> they are the reason this plan exists.

**Goal:** Build SmartDocs AI — a single-company document Q&A application — while being able
to explain every layer from upload to cited answer.

**Architecture:** npm workspaces with a NestJS API, an Angular SPA, and a shared
contracts package. Backend is a modular monolith in four layers with three ports
(extractor, retriever, LLM). Retrieval is PostgreSQL full-text search. Answers are
evidence-only with a code-enforced fallback.

**Tech Stack:** NestJS + TypeScript, Angular + TypeScript, PostgreSQL, Prisma, bcrypt,
JWT (httpOnly cookie), pdf-parse / mammoth / xlsx, Jest + Supertest + TestBed + Playwright.

## Global Constraints

- Node.js LTS; exact versions recorded in `package.json` `engines` at Phase 0.
- No package is installed without `npm ls <package>` confirming the version in use.
- No secret in the Angular bundle; provider key backend-only.
- Every resource query filters by the owner id from the token.
- Foreign resources return 404, never 403.
- One error envelope; codes from `packages/contracts`.
- Exact fallback: `ليس لدي معلومات كافية للإجابة عن سؤالك.`
- No original file retained; in-memory processing only.
- No pgvector, OCR, streaming, queue, or refresh tokens in v1.
- After every phase: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`.
- Report actual command output; never claim a pass that was not run.

## Execution loop (every phase)

```
Read      the linked docs for this phase
Predict   the answer to the phase's predict question, in writing
Build     the tasks in order, running the check command after each
Verify    the gate commands and compare with expected output
Break     the failure drill, observe, restore
Explain   answer the explain-back questions out loud or in the progress log
Record    fill plan/progress/phase-NN.md
```

A phase is not done until Record is written. The log is the artifact that proves
understanding, and it is what Phase 12 reviews.

## Phase map

| Phase | Deliverable | Track docs |
|---|---|---|
| 0 | Workspace, config, database, health | nest 01 |
| 1 | Schema, migrations, seed, constraints | nest 02, ADR-003 |
| 2 | Auth API | nest 03, ADR-002/013 |
| 3 | Auth UI | angular 01–03 |
| 4 | Upload and extraction | nest 04, ADR-006/007 |
| 5 | Chunking, search spike, tsvector | ai 02–03, ADR-004/005 |
| 6 | Documents API + UI | angular 02, api-contract |
| 7 | Conversations API | nest 03, api-contract |
| 8 | Retrieval + RAG + mock | ai 01, 04, ADR-008/009/010/011 |
| 9 | Real provider adapter | ai 05 |
| 10 | Chat UI | angular 04 |
| 11 | Hardening | security-model, ADR-013 |
| 12 | E2E + docs truth pass | all |

---

## Phase 0 — Foundations

**Goal:** An empty but real system: two apps, one contracts package, a reachable database,
a health endpoint, and a configuration that refuses to boot when misconfigured.

**Prerequisites:** none.

**Read:** `tracks/nestjs/01-request-lifecycle-and-layers.md`, `ops/local-setup.md`,
`architecture/system-overview.md`, ADR-001, ADR-015.

**Predict:** If `packages/contracts` contains a function with a runtime dependency, what
breaks and when?

### Tasks

- [ ] **0.1 Verify the toolchain.** Run `node -v`, `npm -v`, `docker --version`. Record the
  versions in `ops/local-setup.md` under "Verified against". Do not write version-specific
  code until this is done.
- [ ] **0.2 Create the workspaces.** Root `package.json` with `workspaces: ["apps/*",
  "packages/*"]`; scaffold `apps/api` with `npx @nestjs/cli new`, `apps/web` with
  `npx @angular/cli new`; create `packages/contracts` with `src/index.ts`, `errors.ts`,
  `types.ts`. Check: `npm ls` shows three workspaces.
- [ ] **0.3 Contracts skeleton.** Define `ErrorCode` const union, `DocumentStatus`,
  `MessageRole`, `SourceReference`, `DocumentSummary`, `DocumentPage`, `Message`,
  `MessagePage`, `ApiError`. No runtime dependencies. Check: `npm run typecheck`.
- [ ] **0.4 Configuration.** `ConfigModule.forRoot` with a validation schema for every
  variable in `ops/local-setup.md`. Create `.env.example`. Check: start with a missing
  `JWT_SECRET` and confirm the process exits with a readable message.
- [ ] **0.5 Database.** `docker-compose.yml` with Postgres, a healthcheck, a named volume,
  and an init script creating `smartdocs` and `smartdocs_test`. Check:
  `docker compose up -d db` then `pg_isready` or a `SELECT 1` through Prisma.
- [ ] **0.6 Quality scripts.** Root scripts: `lint`, `typecheck`, `test`, `build`, `dev`,
  `format`. Check: all four pass on the scaffolding.
- [ ] **0.7 Health endpoint.** `GET /api/health` → `{ "status": "ok" }`, no config leakage.
  Check: curl returns 200.
- [ ] **0.8 ADR acceptance pass.** Read ADR-001…016. For each, write one line in
  `plan/progress/phase-00.md`: agree, or the concern. This is the last cheap moment to
  change a decision.

**Gate:**

```bash
npm run lint && npm run typecheck && npm run test && npm run build
curl -s http://localhost:3000/api/health
docker compose ps
```

Expected: four green commands, `{"status":"ok"}`, database healthy.

**Failure drill:** Delete `JWT_SECRET` from the environment, start the API, read the error,
restore it. Explain why a boot failure is better than a runtime failure here.

**Exit criteria:** Gate green, drill observed, `phase-00.md` written with the ADR pass.

---

## Phase 1 — Schema, Migrations, Constraints

**Goal:** The five entities exist with correct relations, indexes, and deletion behaviour,
proven by tests rather than assumed.

**Prerequisites:** Phase 0.

**Read:** `tracks/nestjs/02-persistence-and-migrations.md`, ADR-003, PRD §5.

**Predict:** Deleting a user cascades to documents and conversations. What happens to a
conversation that cited a document that was deleted first? Write the answer before running
anything.

### Tasks

- [ ] **1.1 Prisma schema.** `User`, `Document`, `DocumentChunk`, `Conversation`, `Message`
  with relations, `onDelete` rules, indexes, unique `(documentId, chunkIndex)`, nullable
  `Message.sources Json?`, `Document.errorCode String?`. Confirm `uuid(7)` support and record
  the id choice in ADR-003. Check: `npx prisma validate`.
- [ ] **1.2 First migration.** `npx prisma migrate dev --name init --create-only`, read the
  SQL, then apply. Check: `\dt` shows five tables.
- [ ] **1.3 PrismaService.** Lifecycle hooks, one client, exported from `PrismaModule`.
  Check: a test that connects and runs `SELECT 1`.
- [ ] **1.4 Seed.** One user (known password hash), one Arabic document with chunks, one
  English document with chunks. Check: `npm run db:seed -w apps/api` twice is idempotent or fails
  clearly.
- [ ] **1.5 Cascade tests.** Create document + chunks, delete document, assert zero chunks.
  Create conversation + messages, delete conversation, assert zero messages. Check:
  `npm run test:e2e -w apps/api`.
- [ ] **1.6 Constraint test.** Insert duplicate `(documentId, chunkIndex)` and assert it
  throws. Check: same suite.
- [ ] **1.7 Index check.** Run `EXPLAIN` on `WHERE "uploadedBy" = $1` and confirm an index
  scan. Record the plan output in the progress log.

**Gate:** `npm run test:e2e -w apps/api` green; migrations apply from an empty database;
`npx prisma validate` clean.

**Failure drill:** Drop the `DocumentChunk` foreign key in a scratch migration, delete a
document, observe orphan chunks, restore. Explain why the database must enforce this.

**Exit criteria:** Gate green, cascade proven, drill observed, schema documented in
`phase-01.md`.

---

## Phase 2 — Authentication API

**Goal:** Register, login, logout, and `me`, with a cookie session and the error envelope.

**Prerequisites:** Phase 1.

**Read:** `tracks/nestjs/03-auth-and-ownership.md`, `integration/auth-flow.md`,
`integration/error-model.md`, ADR-002, ADR-013.

**Predict:** Which of these is a guard's job: rejecting a request with no cookie, or
rejecting a request for someone else's document? Why can it not be both?

### Tasks

- [ ] **2.1 Error infrastructure.** Domain errors, global exception filter, `requestId`
  middleware. Check: a deliberate `throw new Error()` returns `INTERNAL` with no stack.
- [ ] **2.2 Users service.** Create with normalised email; find by email; safe projection.
  Check: unit tests for normalisation and duplicate handling.
- [ ] **2.3 Register.** DTO, bcrypt cost 12, `AUTH_EMAIL_TAKEN`, 201. Check: integration
  test asserts hash prefix and no hash in the response.
- [ ] **2.4 Login.** Dummy-hash comparison, JWT `sub` only, cookie flags. Check: test asserts
  `HttpOnly`, `SameSite=Lax`, 1 h max-age.
- [ ] **2.5 Guard and `@CurrentUser()`.** Check: 401 with no cookie, expired cookie, tampered
  cookie.
- [ ] **2.6 Logout and me.** Check: logout then protected call → 401; `me` has no hash.
- [ ] **2.7 Rate limiting.** 5/min on login and register. Check: sixth request → 429.
- [ ] **2.8 Cookie config test.** Assert `Secure` is on when configured for production.

**Gate:** `npm run test:e2e -w apps/api` green; all rows of the Phase 2 test table in
`tracks/nestjs/03-auth-and-ownership.md` exist and pass.

**Failure drill:** Set the JWT secret to a different value while the server runs; make a
request with an old cookie; observe 401. Restore. Explain what the client must do and why it
cannot distinguish expiry from tampering.

**Exit criteria:** All auth tests green, envelope consistent, no secret in logs.

---

## Phase 3 — Authentication UI

**Goal:** A user can register, log in, survive a reload, be redirected when anonymous, and
see a useful error when credentials are wrong.

**Prerequisites:** Phase 2.

**Read:** `tracks/angular/01-mental-model-and-structure.md`,
`02-components-signals-state.md`, `03-routing-guards-http.md`, `integration/auth-flow.md`.

**Predict:** On a hard reload of `/documents/42`, list the exact order of: guard run,
`/auth/me` call, component creation, redirect decision.

### Tasks

- [ ] **3.1 Shell and routes.** Shell component, public routes, protected children, lazy
  `loadComponent`, wildcard not-found. Check: `npm run build -w apps/web`.
- [ ] **3.2 API base and interceptor.** `API_BASE_URL`, `withCredentials`, dev proxy
  `/api → localhost:3000`. Check: a request from the browser includes the cookie.
- [ ] **3.3 AuthStore.** `status: unknown | anonymous | authenticated`, `restore()`,
  `login()`, `logout()`, readonly signals. Check: unit test with a fake API for all three
  transitions.
- [ ] **3.4 Guard.** One restore per page load; `returnUrl` validated to start with `/` and
  not `//`. Check: guard tests for anonymous, authenticated, and malicious `returnUrl`.
- [ ] **3.5 Login and register forms.** Typed reactive forms, inline errors, 401 and 409
  mapped to fields, submit disabled while pending, focus first invalid field. Check:
  component tests.
- [ ] **3.6 Error interceptor.** `AppError`, 401 redirect excluding `/auth/*`, network vs
  server distinction. Check: interceptor tests, including the no-loop case.
- [ ] **3.7 Header/logout.** Shows the user's name, clears state, navigates to login.

**Gate:** `npm run test -w apps/web` green; manual: register → login → reload stays logged
in → logout → `/documents` redirects to login with `returnUrl`.

**Failure drill:** Log in in one tab, delete the cookie in devtools, click a protected link.
Observe the redirect and the message. Explain which layer noticed.

**Exit criteria:** Gate green, manual journey observed, no token in storage
(`localStorage`/`sessionStorage` inspected).

---

## Phase 4 — Upload and Extraction

**Goal:** PDF, DOCX, and XLSX become text plus structure, stored with a truthful status, or
fail with a specific code and no partial data.

**Prerequisites:** Phase 2 (auth) and Phase 1.

**Read:** `tracks/nestjs/04-ingestion-uploads-and-transactions.md`, ADR-006, ADR-007,
`architecture/data-flow.md` §1.

**Predict:** At which line does the first commit happen, and what would be lost if the whole
upload were one transaction?

### Tasks

- [ ] **4.1 Upload endpoint.** `FileInterceptor`, memory storage, size limit, DTO. Check:
  413 without creating a row.
- [ ] **4.2 File validation service.** Extension, MIME, magic bytes, DOCX/XLSX container
  check, empty buffer. Check: unit tests per rejection and per accepted type.
- [ ] **4.3 Extractor port and PDF adapter.** Page numbers preserved. Check: fixture
  extraction test.
- [ ] **4.4 DOCX adapter.** Headings and paragraph order. Check: fixture test.
- [ ] **4.5 XLSX adapter.** Sheet name, header detection, row rendering. Check: fixture test.
- [ ] **4.6 Processing orchestration.** `PROCESSING` commit, extraction, empty-text failure,
  character cap, 30 s timeout. Check: status transitions asserted.
- [ ] **4.7 Document + extractedText persistence.** Check: `extractedText` equals extraction
  output.
- [ ] **4.8 Failure cleanup.** Any error → `FAILED` + code, zero chunks. Check: inject a
  parser throw and assert.

**Gate:** integration tests for three formats + scanned PDF + empty file + wrong magic
bytes; `chunkCount` is zero for every failed document.

**Failure drill:** Upload a `renamed.txt.pdf`. Trace which check rejected it. Then upload a
scanned PDF and confirm the message names scanned PDFs.

**Exit criteria:** All fixtures behave as in the failure table of `data-flow.md`.

---

## Phase 5 — Chunking, Search Spike, tsvector

**Goal:** Deterministic chunks with metadata, and a *measured* decision on the search
configuration.

**Prerequisites:** Phase 4.

**Read:** `tracks/ai/02-chunking.md`, `03-retrieval-with-postgres.md`, ADR-004, ADR-005.

**Predict:** Which configuration do you expect to win for Arabic, and what evidence would
change your mind? Write the guess down; it makes the spike honest.

### Tasks

- [ ] **5.1 Chunking service.** Pure function, paragraph → sentence → word boundaries,
  700/100/1200, contiguous indexes, no empty chunks, metadata copy. Check: the eight cases
  in `tracks/ai/02-chunking.md`.
- [ ] **5.2 Wire chunking into upload.** Transactional chunk insert + `COMPLETED`. Check:
  chunks exist exactly when status is `COMPLETED`.
- [ ] **5.3 Extensions and search column.** Raw SQL migration for `unaccent`, `pg_trgm`, the
  generated `tsvector`, and the GIN index. Check: `\d "DocumentChunk"` shows the column and
  index.
- [ ] **5.4 Normaliser.** One function applied to indexing and querying (or a documented
  decision to use a config instead). Check: unit tests for alef, teh marbuta, diacritics,
  tatweel.
- [ ] **5.5 Spike corpus.** 20 questions with known answer chunks; four configurations as in
  the track doc. Check: a results table exists with Recall@6 and MRR per run.
- [ ] **5.6 Amend ADR-004.** Record the winner, the numbers, and the losing configurations
  with one line each.
- [ ] **5.7 Retrieval query module.** Owner-scoped, status-filtered, bound parameters,
  `websearch_to_tsquery`, `ts_rank_cd`. Check: cannot be called without a user id (type
  level), and a foreign chunk never appears.

**Gate:** chunking tests green; spike table recorded; ADR amended; a query for a known term
returns the expected chunk in the top 6.

**Failure drill:** Re-index with a deliberate normaliser mismatch (write normalised, query
raw) and watch recall collapse. Restore. Explain why the write and read paths must share the
function.

**Exit criteria:** Gate green, ADR-004 contains evidence, `phase-05.md` records the guess
versus the result.

---

## Phase 6 — Documents API and UI

**Goal:** A user can see, open, and delete their documents, with honest states.

**Prerequisites:** Phase 5.

**Read:** `integration/api-contract.md` (documents), `tracks/angular/02` and `03`.

**Predict:** The list shows `status: PROCESSING` for a document from a crashed request. What
should the UI do, and what should the user be able to do about it?

### Tasks

- [ ] **6.1 List endpoint.** Owner-scoped, paginated, `chunkCount` via `_count`, newest
  first. Check: user B sees zero of A's rows.
- [ ] **6.2 Detail endpoint.** `extractedText`, chunk previews, 404 for foreign ids. Check:
  ownership test.
- [ ] **6.3 Delete endpoint.** One transaction, ownership, cascade proven at the API level.
  Check: chunks gone after 204.
- [ ] **6.4 DocumentsStore.** Signals, four states, load/refresh. Check: unit tests.
- [ ] **6.5 List page.** Table with name, type, date, status badge, empty state, error
  banner, pagination. Check: component tests for the four states.
- [ ] **6.6 Upload UI.** Progress, processing, distinct error messages, disabled while
  pending, input reset on success. Check: component tests with synthetic progress events.
- [ ] **6.7 Detail page.** Extracted text rendered as text, chunk list with page/sheet,
  delete with confirmation, not-found state. Check: manual plus component test.

**Gate:** `npm run test -w apps/web` and API integration green; manual journey: upload three
formats, open each, delete one, confirm disappearance.

**Failure drill:** Delete a document in a second tab while the detail page is open, then
press delete again. Observe the 404 handling. Explain why the UI must not treat it as a
crash.

**Exit criteria:** Gate green, no data from another account visible after switching users.

---

## Phase 7 — Conversations and Messages API

**Goal:** Private conversations with persisted messages and the full ownership matrix green.

**Prerequisites:** Phase 6.

**Read:** `integration/api-contract.md` (conversations), `tracks/nestjs/03`,
`architecture/security-model.md` §5.

**Predict:** Which endpoint is most likely to forget the owner filter, and why?

### Tasks

- [ ] **7.1 Conversations service.** Create, list, delete, all owner-scoped. Check: matrix
  rows for conversations.
- [ ] **7.2 Messages read.** Paginated, ascending, 404 for foreign conversation. Check:
  ordering test.
- [ ] **7.3 Message write scaffolding.** Validate content ≤4000 and persist the user message
  through a service whose answer step is not implemented yet. The endpoint is **not exposed**
  until Phase 8; the service and its persistence test are. Check: the user message survives
  a forced error, and no assistant message is fabricated.
- [ ] **7.4 Title defaulting.** Empty title becomes the first question, truncated. Check:
  unit test.
- [ ] **7.5 Ownership matrix (partial).** Every row in `security-model.md` §5 except
  `POST /conversations/:id/messages` automated. That row is enabled in Phase 8 when the
  endpoint exists. Check: suite green with a second user.
- [ ] **7.6 Update `updatedAt`.** Conversation moves to the top on new messages. Check: list
  ordering test.

**Gate:** every existing row of the ownership matrix is green; deleting a conversation
removes messages; no endpoint accepts a `userId` field (validation rejects it). The final
matrix row is completed in Phase 8.

**Failure drill:** Send a message to another user's conversation and confirm 404 **and**
that no message row was created. Check the database, not just the response.

**Exit criteria:** Gate green, matrix automated and parameterised.

---

## Phase 8 — Retrieval and RAG with the Mock Provider

**Goal:** Answers grounded in owner-scoped evidence, with a code-enforced fallback and
injection-resistant behaviour.

**Prerequisites:** Phase 7 (and Phase 5's retrieval module).

**Read:** `tracks/ai/01`, `04`, `integration/upload-to-answer.md`, ADR-008/009/010/011.

**Predict:** A question is topically related to a document but the answer is absent. What
does retrieval return, what does the model return, and which line produces the final
sentence?

### Tasks

- [x] **8.1 `ChunkRetriever` port and keyword adapter.** `userId` is a required parameter.
  Check: type-level and runtime tests.
- [x] **8.2 Budget packer.** Rank order, skip-not-truncate, single oversized chunk handling,
  `usedSources`. Check: boundary tests.
- [x] **8.3 Prompt builder.** Pure function, delimiters, headers, history limit, structural
  snapshot. Check: snapshot plus assertions on `NO_EVIDENCE` instruction.
- [x] **8.4 Mock provider.** Behaviours: answer, no_evidence, timeout, error. Check: each
  behaviour exercised through the service.
- [x] **8.5 Evidence policy.** Sentinel detection, exact constant, `sources: []`, zero
  candidates short-circuits the call. Check: exact string equality against the exported
  constant.
- [x] **8.6 Answer orchestration.** Retrieve → pack → prompt → generate → police → persist.
  Check: one integration test per branch.
- [x] **8.7 Injection fixtures.** PDF and DOCX with embedded instructions. Check: the answer
  does not follow them; the fallback still works.
- [x] **8.8 Complete the ownership matrix.** Enable the `POST /messages` row. Check: user B
  gets 404 and no message row is created.
- [x] **8.9 Evaluation harness.** Seed fixed docs, run the seven buckets, print a table.
  Check: recall@6 and fallback precision recorded.

**Gate:** the checklist at the end of `integration/upload-to-answer.md` is fully checked;
evaluation table recorded in `phase-08.md`.

**Failure drill:** Make retrieval return zero rows for an answerable question and observe
the fallback. Then return an irrelevant row and observe whether the model refuses. Explain
which failure is safer and why.

**Exit criteria:** Fallback is byte-exact and tested; injection tests pass or are documented
with evidence; sources survive persistence.

---

## Phase 9 — Real Provider Adapter

**Goal:** One real provider behind the port, with timeouts, retries, error mapping, and no
secret or content leakage.

**Prerequisites:** Phase 8.

**Read:** `tracks/ai/05`, ADR-008.

**Predict:** A 429 from the provider arrives. Should the system retry, fail, or fall back?
Justify with what the user sees.

### Tasks

- [x] **9.1 Adapter.** OpenAI-compatible request shape, abort on timeout, usage mapping.
  Check: contract tests against recorded fixtures, no live call.
- [x] **9.2 Error mapping.** Timeout → `AI_TIMEOUT`, non-2xx → `AI_UNAVAILABLE`, no vendor
  error body in the response. Check: tests per status.
- [x] **9.3 Retry policy.** One retry for timeout/5xx only, visible in logs as a count.
  Check: test asserts no retry on 401.
- [x] **9.4 Provider selection.** `LLM_PROVIDER` config; mock is the default outside
  production. Check: boot test for each value.
- [x] **9.5 Cost telemetry.** Log `usage` tokens per request, never content. Check: log
  inspection.
- [x] **9.6 Data-handling note.** Fill the provider section in `ops/local-setup.md` or a
  deployment note with the four questions from the track doc.

**Gate:** contract tests green; a forced timeout returns 504 with `AI_TIMEOUT`; grep of logs
finds no key, no prompt, no completion.

**Failure drill:** Set an invalid key, send a question, observe `AI_UNAVAILABLE`, confirm the
user message still exists and the conversation is usable. Restore the key.

**Exit criteria:** Gate green, cost per question measured once and recorded.

---

## Phase 10 — Chat UI

**Goal:** A usable chat interface with honest states, sources, and no cross-conversation
leakage.

**Prerequisites:** Phase 9.

**Read:** `tracks/angular/04-forms-and-chat-ui.md`, `integration/api-contract.md`.

**Predict:** The user switches conversation while an answer is in flight. What must the store
do with the late response, and what would happen if it did not?

### Tasks

- [x] **10.1 ChatStore.** Keyed by conversation id; ignores late responses for other ids.
  Check: unit test with delayed fakes.
- [x] **10.2 Conversation list.** Create, select, delete, ordering. Check: component tests.
- [x] **10.3 Thread.** User and assistant bubbles, optimistic user message, typing state,
  error bubble with retry. Check: state tests.
- [x] **10.4 Sources.** Chips link to documents, handle a deleted document, never render
  HTML. Check: component test.
- [x] **10.5 Composer.** Enter sends, Shift+Enter newline, disabled while pending, preserves
  text on failure. Check: component tests.
- [x] **10.6 Scroll and focus.** Only auto-scroll near the bottom; focus stays in the
  composer. Check: manual.
- [x] **10.7 Accessibility.** `role="log"`, labels, focus visible, error announcement.
  Check: the Phase 10 checklist.

**Gate:** component tests green; manual journey with an answerable and an unanswerable
question; the exact fallback renders with no sources.

**Failure drill:** Disconnect the network mid-send. Observe the error bubble, the preserved
question, and retry. Explain what the server may or may not have persisted.

**Exit criteria:** Gate green, no cross-conversation bleed observed, a11y checklist done.

---

## Phase 11 — Hardening

**Goal:** The security model is executed as a checklist, not assumed.

**Prerequisites:** Phase 10.

**Read:** `architecture/security-model.md`.

**Predict:** Which of the fourteen threats is most likely to be partially mitigated in this
codebase, and what would prove it?

### Tasks

- [x] **11.1 CORS and cookies.** Explicit origin, credentials, `Secure` in production, no
  wildcard. Check: a request from a disallowed origin is rejected.
- [x] **11.2 Origin check.** State-changing requests validate `Origin`. Check: forged origin
  test.
- [x] **11.3 Log redaction.** Central config; test with a request containing `password`,
  `authorization`, `cookie`. Check: grep of test log output.
- [x] **11.4 Rate limits.** All four scopes verified. Check: 429 per scope.
- [x] **11.5 Body and upload limits.** Oversized JSON and multipart rejected before
  processing.
- [x] **11.6 Dependency audit.** `npm audit` reviewed; each finding accepted or fixed with a
  reason.
- [x] **11.7 Secret grep.** Search the repo and the built web bundle for key patterns.
- [x] **11.8 Security checklist.** Every row of the threat table marked verified with the
  test name.

**Gate:** checklist complete; redaction test green; no secret in the bundle.

**Failure drill:** Temporarily log a request body and confirm the redaction test fails. Fix
it. This proves the test is real.

**Exit criteria:** Gate green, checklist stored in `phase-11.md`.

---

## Phase 12 — E2E and Docs Truth Pass

**Goal:** One automated journey proves the system works from an empty database, and the docs
match the code.

**Prerequisites:** Phase 11.

**Read:** `plan/traceability.md`, `ops/local-setup.md`.

**Predict:** Which document is most likely to be stale after twelve phases, and how will you
detect it?

### Tasks

- [x] **12.1 Playwright journey.** Register → upload → ask answerable → assert citation →
  ask unanswerable → assert exact fallback. Check: `npx playwright test`.
- [x] **12.2 Fresh-clone test.** Copy the repo to a temp directory, follow
  `ops/local-setup.md` literally, and fix every step that fails.
- [x] **12.3 Traceability audit.** Every FR/NFR has a doc, a phase, and a test. Fix gaps.
- [x] **12.4 Docs truth pass.** Walk each document; update `verified_against`, remove claims
  that changed, fix paths and commands.
- [x] **12.5 README.** What it is, how to run it, the exact guarantee and its limits, the
  known limitations.
- [x] **12.6 Reflection.** Fill `plan/progress/phase-12.md`: what you would design
  differently, and which deferred feature you would do next.

**Gate:** E2E green; fresh-clone setup succeeds; traceability complete; docs updated.

**Exit criteria:** All of the above, plus a written answer to: "Can you explain the system
end to end without opening the code?"
