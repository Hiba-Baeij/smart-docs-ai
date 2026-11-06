# System Overview

Status: reviewed
Related: FR-01…FR-30, NFR-01…NFR-12, ADR-001, ADR-012
Verified against: API module imports, Angular routes, and provider input, 2026-11-02

## 1. What the system is

A single-company web application. A user registers, uploads documents, and asks questions
about those documents. Answers are produced only from the user's own documents, with
citations, or refused with a fixed sentence.

Three technologies meet in one flow:

- **NestJS** owns authentication, persistence, extraction, retrieval, and the provider call.
- **Angular** owns the authenticated experience and never holds a secret.
- **RAG** is the policy layer that decides what the model is allowed to see and how to
  answer when it sees too little.

## 2. Containers

```
Browser (Angular SPA) <--HTTP + session cookie--> NestJS API
                                                 |          |
                                              Prisma     HTTPS outbound
                                                 |          |
                                                 v          v
                                             PostgreSQL  LLM provider
```

Nothing calls the provider from the browser. Nothing calls the database from the browser.
The API sends selected excerpts, the current question, and recent conversation history.
It does not automatically add a user id, email, or filename; users can still type such
information into a question.

## 3. Repository layout

```
apps/api                 NestJS application
  src/
    common/              shared errors and HTTP infrastructure
    config/              validated environment configuration
    prisma/              PrismaService, module
    auth/                register, login, logout, me
    users/               profile reads used by auth
    documents/           upload, list, detail, delete, extraction
    chunking/            document-to-chunk conversion
    conversations/       conversations, messages, answer use case
    search/              keyword retrieval
    ai/                  evidence policy, LlmProvider port and adapters
  test/                  integration and contract tests
apps/web                 Angular application
  src/app/
    core/                auth store, guards, interceptors, api base
    features/            auth, documents, chat
    shared/              presentational components
packages/contracts       DTO types, error codes, enums, source types
```

## 4. Backend layers and dependency rule

```
Controller ──► Application service ──► Domain service
                     │                        ▲
                     └──► Port ◄──────────────┘ (implemented by infrastructure)
```

| Layer | May import | May not import |
|---|---|---|
| Controller | application services, DTOs, contracts | Prisma, adapters |
| Application service | domain services, ports, contracts | Express/Nest HTTP types, SDKs |
| Domain service | contracts, pure utilities | Prisma, HTTP, SDKs, `process.env` |
| Adapter | SDKs, Prisma, `process.env` via config | controllers, application services |

The rule exists so that chunking, prompting, and evidence policy can be tested with plain
values, and so that swapping the provider does not touch a use case.

## 5. Modules and responsibilities

| Module | Owns | Depends on |
|---|---|---|
| `AuthModule` | register, login, logout, token issuance, `JwtAuthGuard` | `UsersModule`, config |
| `UsersModule` | user persistence and safe projections | `PrismaModule` |
| `DocumentsModule` | upload use case, extraction, chunking, document reads/deletes | `PrismaModule`, extractor port |
| `ConversationsModule` | conversations, messages, ownership, answer orchestration | `AuthModule`, `PrismaModule`, `SearchModule`, `AiModule` |
| `SearchModule` | owner-scoped keyword search and retriever port | `PrismaModule` |
| `AiModule` | `LlmProvider` port, mock adapter, real adapter selection | config |
| `PrismaModule` | database client lifecycle | — |
| `common` | cross-cutting HTTP concerns | contracts |

`DocumentsModule` does not import `AiModule`. `AiModule` does not import Prisma.
`SearchModule` returns chunks, not prompts.

## 6. Ports

| Port | Methods (shape) | Adapters |
|---|---|---|
| `DocumentExtractor` | `supports(fileType)`, `extract({ buffer, originalName }) → ExtractedDocument` | PDF, DOCX, XLSX |
| `ChunkRetriever` | `retrieve({ userId, question, limit }) → ChunkHit[]` | keyword (v1), vector (later) |
| `LlmProvider` | `generate({ system, messages, temperature, maxTokens, timeoutMs }) → { text, usage? }` | mock, OpenAI-compatible |

Ports are TypeScript interfaces plus injection tokens. A use case depends on the token,
never on a concrete class.

## 7. Request lifecycle (NestJS)

```
request
  → global middleware (requestId, logging)
  → guards (JwtAuthGuard: is there a valid session?)
  → interceptors (before)
  → pipes (ValidationPipe: is the payload shape valid?)
  → controller
  → application service (ownership check + transaction)
  → response
  → interceptors (after)
  → exception filter (on any throw)
```

Two distinct questions, deliberately separate:

- **Guard**: is the caller authenticated?
- **Service**: does this caller own *this* resource?

A guard cannot answer the second question because it does not know which row is requested.

## 8. Frontend architecture

```
AppComponent
└── routes
    ├── /login, /register          public
    ├── shell (authGuard)
    │   ├── /documents             list + upload
    │   ├── /documents/:id         detail
    │   └── /chat                  conversations + messages
    └── **                         not-found
```

- `AuthStore` (signal-based): `user`, `status`, `login()`, `logout()`, `restore()`.
- `authGuard` (functional): reads the store, initialises once on reload, redirects with
  `returnUrl`.
- Interceptors: credentials and error mapping.
- Feature state lives in a feature store, not a global store.

## 9. Failure philosophy

1. Fail closed on authorization: unknown ownership means 404.
2. Fail visibly on processing: a document is never silently `COMPLETED`.
3. Fail safely on AI: timeout, one retry, then a typed error; never a fabricated answer.
4. Fail honestly to the user: one error envelope, stable codes, actionable messages.

## 10. What this architecture deliberately does not do

- No multi-tenancy, no roles, no sharing.
- No event bus, no CQRS, no microservices.
- No generic repository abstraction over Prisma.
- No caching layer in v1; the dataset is small and correctness matters more.

Each omission is revisited only when a measured problem appears, not preemptively.
