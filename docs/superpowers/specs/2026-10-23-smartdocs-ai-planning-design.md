# SmartDocs AI — Planning Deliverable Design

Status: approved
Date: 2026-10-23
Owner: project author
Scope: design of the documentation set and phased plan. No application code.

## 1. Purpose

This document specifies the documentation and planning artifacts for SmartDocs AI, a
single-company document question-answering application (NestJS + Angular + PostgreSQL +
Prisma + RAG).

The plan is written for one reader with a specific profile:

- Senior in Vue and React.
- Beginner in Angular.
- Comfortable with NestJS.
- Beginner in AI/RAG.

The goal is understanding, not delegation. Every phase must leave the reader able to
explain what happened and why, not merely able to run commands. That requirement drives
the two mechanisms this design adds to a normal plan: a **predict step** before running
anything, and a **deliberate failure** step before declaring a phase done.

## 2. Goals and non-goals

### Goals

1. A complete, self-consistent document set that teaches the three technologies *and*
   the system that combines them.
2. A phased plan (Phase 0–12) where every phase has a verification gate, an
   understanding checkpoint, and a progress record.
3. Traceability from every product requirement to a document, a phase, and a test.
4. Documentation that stays true to the code: version claims are dated and re-checked,
   decisions are recorded as ADRs, and one fact has exactly one home.

### Non-goals

- Writing application code in this deliverable.
- Producing a generic Angular or NestJS tutorial. Track docs explain only what this
  project uses, in the order the project needs it.
- Multi-tenant SaaS, OCR, file storage, streaming, queues, pgvector, refresh tokens.
  These are documented as deliberate deferrals with an upgrade path, not as gaps.
- Arabic documentation. The project PRD originally requested Arabic; the author chose
  English-only docs on 2026-10-23. This is recorded as an amendment in §11.

## 3. Constraints and assumptions

- The repository starts empty apart from `docs/product/PRD.md`. No package versions are known,
  so no version-specific claim may be written as fact. Each such claim carries
  `verified_against` metadata and is re-checked at phase start.
- Single owner per resource: a document belongs to one user, a conversation belongs to
  one user. Authorization is ownership, not roles.
- The application is synchronous in v1. No worker process, no queue, no object storage.
- The LLM provider is accessed only from the backend through a port. A deterministic
  mock provider is the default in development and tests.
- Retrieval starts with PostgreSQL full-text search. Semantic retrieval is a documented
  future path, not a v1 dependency.

## 4. Deliverable inventory

```
docs/
├── README.md                         index, reading order, how to use the set
├── superpowers/specs/
│   └── 2026-10-23-smartdocs-ai-planning-design.md
├── product/
│   ├── PRD.md                        existing source of truth for requirements
│   ├── scope.md                      in-scope, deferred, refused
│   ├── user-stories.md               FR/NFR identifiers used everywhere
│   └── glossary.md                   one term, one meaning
├── architecture/
│   ├── system-overview.md            containers, modules, layers, ports
│   ├── data-flow.md                  write path and read path, step by step
│   ├── security-model.md             trust zones, ownership, threats, limits
│   └── decisions/                    ADR-001 through ADR-016, one decision per file
├── tracks/
│   ├── angular/                      README + 4 guides
│   ├── nestjs/                       README + 5 guides
│   └── ai/                           README + 5 guides
├── integration/
│   ├── api-contract.md               every endpoint: request, response, errors
│   ├── error-model.md                shape, codes, status mapping, client handling
│   ├── auth-flow.md                  login → cookie → guard → 401/403
│   └── upload-to-answer.md           the flow that crosses all three tracks
├── plan/
│   ├── README.md                     how to execute a phase
│   ├── implementation-plan.md        Phase 0–12, full task detail
│   ├── checkpoints.md                predict + explain-back questions per phase
│   ├── traceability.md               FR/NFR → doc → phase → test
│   └── progress/TEMPLATE.md          per-phase learning log
└── ops/
    ├── local-setup.md                Postgres, env, first run
    └── commands.md                   every command, explained once
```

### Single-source rules

| Fact | Lives only in |
|---|---|
| Requirements and acceptance intent | `product/PRD.md` |
| Requirement identifiers | `product/user-stories.md` |
| Term definitions | `product/glossary.md` |
| API shapes and error codes | `integration/api-contract.md` + `packages/contracts` |
| Technical decisions and rationale | `architecture/decisions/` |
| Task order, gates, verification | `plan/implementation-plan.md` |
| Learning checks | `plan/checkpoints.md` |

No document restates another's table. Documents link instead.

## 5. System architecture

### Deployment shape

One repository, npm workspaces, no Nx:

```
apps/api        NestJS
apps/web        Angular
packages/contracts   shared TypeScript types and error-code enums
```

`packages/contracts` exists to make drift a compile error rather than a runtime
surprise. It contains types only, no runtime logic beyond enum constants.

### Trust zones

```
[ Browser ] --untrusted--> [ Nest API ] --trusted--> [ PostgreSQL ]
                                 |
                                 +--outbound--> [ LLM provider ]
```

The browser holds no provider key, never supplies a `userId` for authorization, and
never receives another user's rows. The provider receives only excerpts the API selected
for the authenticated user.

### Backend: modular monolith, four layers

| Layer | Example | Rule |
|---|---|---|
| Controller | `DocumentsController` | HTTP only: parse, validate, delegate. No Prisma, no branching business logic. |
| Application service | `UploadDocumentService` | One use case, one transaction boundary. |
| Domain service | `ChunkingService`, `PromptBuilder`, `EvidencePolicy` | Pure, no I/O, unit-tested without mocks of infrastructure. |
| Infrastructure adapter | `PrismaService`, `PdfExtractor`, `OpenAiAdapter` | Implements a port; replaceable. |

Dependency direction:

```
Controllers → Application services → Domain services
                                          ↑
                              Infrastructure adapters (implement ports)
```

Modules: `AuthModule`, `UsersModule`, `DocumentsModule`, `ConversationsModule`,
`RetrievalModule`, `AiModule`, `PrismaModule`, plus `common/` (guards, filters,
interceptors, pipes).

Three ports carry the whole extensibility story:

- `DocumentExtractor` → pdf, docx, xlsx adapters. OCR becomes a fourth adapter.
- `ChunkRetriever` → keyword adapter now; a vector adapter later.
- `LlmProvider` → mock, OpenAI-compatible, local, in any order.

### Frontend: standalone Angular, feature-first

```
web/src/app/
├── core/        guards, interceptors, api client, auth signal store
├── features/    auth/ documents/ chat/
├── shared/      dumb components, pipes
└── app.routes.ts
```

Standalone components, signals for state, functional guards and interceptors, typed
reactive forms, one thin API service per feature. No NgRx. SCSS with about six shared
presentational components.

## 6. Data flows

### 6.1 Write path: upload to chunks

1. `JwtAuthGuard` resolves the user from the cookie; the user id never comes from the body.
2. `multer` `memoryStorage` applies the size limit; nothing touches disk.
3. `FileValidationService` checks extension, MIME, magic bytes, and non-empty buffer.
4. Insert `Document(status=PROCESSING)` and commit. Failures must be visible.
5. Dispatch to the extractor by file type → `ExtractedDocument { text, pages, sheets, headings }`.
6. Empty extraction → `FAILED` + `EMPTY_EXTRACTION` (the scanned-PDF message).
7. `ChunkingService` produces ordered chunks with page/sheet metadata.
8. One transaction inserts chunks and updates the document to `COMPLETED` with `extractedText`.
9. On error: roll back chunks, persist `FAILED` + `errorCode`, log without content.
10. Return a `DocumentSummary`.

The early commit and the atomic chunk write are intentional: the row always reflects
reality and chunks are never half-written.

### 6.2 Read path: question to answer

1. Guard, then ownership check on the conversation.
2. Persist the user message before calling the model.
3. `RetrievalService` queries `DocumentChunk` joined to `Document` where
   `uploadedBy = user.id` and `status = COMPLETED`; rank 20, keep 6, ~3,000-token budget.
4. `PromptBuilder` assembles system rules, last 6 messages, and delimited evidence.
5. `LlmProvider.generate` with temperature ≤ 0.2, a hard timeout, one retry.
6. `EvidencePolicy` maps the `NO_EVIDENCE` sentinel to the exact Arabic fallback sentence.
7. Persist the assistant message with its sources.
8. Return `{ message, sources }`.

### 6.3 Schema addition

`Message` gains a nullable `sources` JSON column (document id, chunk index, page or
sheet, filename). Without it, sources survive only in the HTTP response and disappear on
reload. Recorded in ADR-003.

## 7. Error model

One shape, produced by a global exception filter:

```json
{
  "statusCode": 404,
  "code": "DOCUMENT_NOT_FOUND",
  "message": "Document not found.",
  "details": null,
  "requestId": "...",
  "timestamp": "...",
  "path": "/documents/123"
}
```

- Codes are a stable enum in `packages/contracts`.
- A resource owned by another user returns `404`, never `403`. Existence is not confirmed.
- Logs contain `requestId`, method, path, status, duration. Never bodies, cookies,
  tokens, or document text.
- Angular's error interceptor maps `code` to a human message, clears auth state on
  `401`, and distinguishes network failure from server rejection.

## 8. Testing strategy

| Level | Scope | Environment |
|---|---|---|
| Unit | chunking edges, file validation, prompt builder, evidence policy, query builder | Jest, no I/O |
| Integration | every endpoint through Supertest | real PostgreSQL, LLM mocked, truncate per test |
| Contract | response shapes against `packages/contracts` | Jest |
| Component | loading/empty/error/validation states, guards, interceptors | TestBed |
| E2E | register → upload → ask → answer | Playwright, final phase |

Non-negotiable cases, each attached to a phase gate:

- Ownership matrix: user A calls every endpoint with user B's ids → `404`, no leakage.
- Exact fallback sentence when evidence is absent.
- Document containing "ignore previous instructions" does not change behavior.
- Fixtures: PDF, DOCX, XLSX, scanned PDF, empty file, Arabic content.
- Failed extraction leaves `FAILED` and zero chunks.
- Chunk order and page/sheet metadata survive a round trip.

## 9. Decision register

Each row is an ADR file in `architecture/decisions/`.

| ADR | Decision |
|---|---|
| 001 | npm workspaces, three packages, no Nx |
| 002 | JWT in httpOnly `SameSite=Lax` cookie, 1 h, no refresh token in v1 |
| 003 | UUIDv7 ids, FK/cascade rules, nullable `Message.sources` |
| 004 | Full-text search via generated `tsvector` + GIN, raw SQL migration, config spike first |
| 005 | Chunking: 700-word target, 100-word overlap, 1200 max, boundary-aware |
| 006 | Synchronous upload processing, 30 s budget, transactional chunk write, no file storage |
| 007 | File validation: extension + MIME + magic bytes + size, memory storage |
| 008 | `LlmProvider` port with deterministic mock as development default |
| 009 | Retrieval budget: rank 20, keep 6, ~3,000 tokens; history last 6 messages |
| 010 | `NO_EVIDENCE` sentinel mapped to the exact Arabic fallback |
| 011 | Prompt-injection defense via delimiters, system rule, and fixtures |
| 012 | Angular: standalone, signals, functional guards/interceptors, no NgRx |
| 013 | Error envelope, stable codes, 404 for foreign resources, redacted logs |
| 014 | Testing stack: Jest + Supertest + real Postgres; TestBed; one Playwright journey |
| 015 | docker-compose for PostgreSQL only; Node runs locally |
| 016 | Explicit v1 non-goals with documented upgrade paths |

## 10. Plan structure

Thirteen phases, backend-first so Angular phases land on real endpoints:

| # | Focus | Gate |
|---|---|---|
| 0 | Foundations, versions, Postgres, workspaces, ADRs | empty apps lint and build, DB reachable |
| 1 | Schema, migrations, constraints, seed | migrate from zero, cascade verified |
| 2 | Auth backend | hashing, invalid credentials, cookie flags, rate limit |
| 3 | Auth frontend | guard, 401 redirect, component tests |
| 4 | Upload and extraction | three fixtures plus failure cases, no orphan chunks |
| 5 | Chunking and search spike, tsvector migration | chunk tests, spike recorded in ADR |
| 6 | Documents UI and API | upload states, cascade delete, cross-user 404 |
| 7 | Conversations and messages API | ownership matrix except `POST /messages` |
| 8 | Retrieval and RAG with mock provider | exact fallback, injection fixtures, scoping |
| 9 | Real provider adapter | timeout and retry mapping, no key in logs |
| 10 | Chat UI | component tests, sources rendered |
| 11 | Hardening | security checklist executed |
| 12 | E2E and docs truth pass | journey green, every FR mapped |

Every phase document contains: goal, prerequisites, reading list, concepts, a predict
question, ordered tasks with file paths and commands, a verification gate with expected
output, one deliberate failure drill, explain-back questions, and a record step.

Execution loop per phase:

```
Read → Predict → Build → Verify → Break → Explain → Record
```

## 11. PRD amendments

| PRD section | Amendment | Reason |
|---|---|---|
| §3, §14 Communication | English documentation; conversation in English | Author's explicit choice, 2026-10-23 |
| §5 Message entity | Add nullable `sources` JSON | PRD also requires source references; content-only storage loses them on reload |
| §4 Authentication | JWT carried in an httpOnly cookie instead of an `Authorization` header | XSS cannot read the token; still a JWT access token |
| §6 Processing | Synchronous processing with a 30 s budget in v1 | PRD permits "an appropriate processing strategy"; a queue is deferred, not denied |
| §13 Implementation order | Interleaved vertical slices; the Angular phases land at 3, 6, and 10 instead of all at step 12 | Backend-first slices give the learner a working endpoint and fast feedback; the PRD order is preserved in substance |
| §10, §13 Frontend timing | The UI is built incrementally, not in one final step | Same reason: each UI phase is testable against real data |

All other PRD requirements stand unchanged.

## 12. Risks and open items

| Risk | Handling |
|---|---|
| Arabic full-text search quality is unknown | Phase 5 one-day spike over `simple`+`unaccent`, `arabic`, `pg_trgm`; decision recorded in ADR-004 before any RAG work |
| PDF page numbers may not be available for every library version | Extract what the installed version provides; store `pageNumber` nullable; document the limitation |
| Magic-byte validation libraries may be ESM-only | Verify import strategy at Phase 0; fall back to a small manual signature check |
| LLM cost and latency are unpredictable | Mock-first development, token budgets, timeouts, no streaming in v1 |
| Docs drifting from code | `verified_against` metadata, traceability table, Phase 12 truth pass |
| Prisma may not support generated `tsvector` columns | Raw SQL migration, documented in ADR-004 |

## 13. Acceptance criteria for this deliverable

1. All files in §4 exist and are linked from `docs/README.md`.
2. No unfinished or placeholder sections.
3. Every FR/NFR in `product/user-stories.md` appears in `plan/traceability.md` with a
   phase and a test.
4. Every ADR referenced by a document exists.
5. Every phase in `plan/implementation-plan.md` has a gate, a predict question, a
   failure drill, and explain-back questions.
6. The plan can be executed by one person at ~20 h/week without consulting any other
   source for the project's own decisions.
