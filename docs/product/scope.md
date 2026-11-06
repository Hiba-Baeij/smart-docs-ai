# Scope

Status: reviewed
Related: PRD §1, §2, §13
Verified against: not applicable (no dependency claims)

This file defines what v1 builds, what is deferred, and what is refused. If a feature is
not listed here and not in `user-stories.md`, it is out of scope by default.

## In scope (v1)

| Area | Included |
|---|---|
| Accounts | Register, login, logout, session restore, password hashing |
| Documents | Upload PDF/DOCX/XLSX, validate, extract, chunk, list, view, delete |
| Conversations | Create, list, delete, message history |
| Question answering | Owner-scoped keyword retrieval, evidence-only answers, sources, exact fallback |
| AI | Provider port, deterministic mock, one real adapter |
| Client | Angular SPA with auth, documents, and chat features; loading/empty/error states |
| Operations | Local setup, env config, docker-compose Postgres, test suite, rate limits |

## Deferred (designed for, deliberately not built)

| Deferred | Why now | Upgrade path |
|---|---|---|
| pgvector semantic search | Arabic FTS quality must be measured first; embeddings cost money and add a migration risk | `ChunkRetriever` port; add a vector adapter and an `embedding` column |
| Streaming answers | Adds SSE plumbing and partial-message persistence | `LlmProvider` interface stays stream-capable |
| Background processing queue | One synchronous upload path is enough at this size | Move the extraction call behind a job queue; status model already exists |
| Refresh tokens | One-hour cookie is acceptable; refresh adds rotation and revocation design | Add a `RefreshToken` entity and rotation rules |
| OCR for scanned PDFs | Large dependency and accuracy cost | New `DocumentExtractor` adapter |
| Document sharing / teams | Single-owner design is the PRD's core assumption | Requires a membership model; do not bolt it on |
| Folder organization, tags, search UI | Not required for the core flow | Additive schema and filters |
| Admin panel, usage analytics | No admin role exists | Requires roles, which the PRD excludes |

## Refused (will not build even later without a new product decision)

- Multi-tenant SaaS with organizations and billing.
- Public or anonymous document sharing.
- Permanent storage of original uploaded files.
- Sending document content to a provider without a user-initiated question.
- Client-side AI calls or any provider key in the browser.

## MVP cut line

A build is MVP-complete when a new user can register, upload one Arabic PDF and one
Excel sheet, ask a question answerable from them, receive a cited answer, ask an
unanswerable question, and receive exactly:

`ليس لدي معلومات كافية للإجابة عن سؤالك.`

Everything else in the PRD supports that sentence.
