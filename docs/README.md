# SmartDocs AI — Documentation

A single-company document Q&A application: upload PDF/DOCX/XLSX, ask questions, get answers
grounded only in your own documents, with citations or an exact refusal.

This documentation set is written for one reader: senior in Vue/React, beginner in Angular,
comfortable with NestJS, beginner in AI/RAG. It exists so the build is understood, not
merely completed.

## Start here

0. `../README.md` — what it is, how to run it, what it guarantees and what it does not.
1. `product/PRD.md` — what the product must do (the source of truth for requirements).
2. `product/scope.md` — what v1 builds, defers, and refuses.
3. `architecture/system-overview.md` — containers, layers, ports, request lifecycle.
4. `plan/implementation-plan.md` — the 13 phases, in order, with gates.

Do not start Phase 0 before reading `ops/local-setup.md` and
`tracks/nestjs/01-request-lifecycle-and-layers.md`.

## Reading order by track

| Track | Start | Then |
|---|---|---|
| Angular | `tracks/angular/README.md` | `01` → `02` → `03` → `04` |
| NestJS | `tracks/nestjs/README.md` | `01` → `02` → `03` → `04` → `05` |
| AI / RAG | `tracks/ai/README.md` | `01` → `02` → `03` → `04` → `05` |

The tracks teach the technologies. `integration/` teaches the system where they meet:

- `integration/api-contract.md` — every endpoint, every response.
- `integration/error-model.md` — one envelope, stable codes, client handling.
- `integration/auth-flow.md` — login, cookie, guard, expiry, logout.
- `integration/upload-to-answer.md` — the one flow that crosses all three tracks.

Architecture references: `architecture/data-flow.md` (the two flows and every failure),
`architecture/security-model.md` (threats, controls, ownership matrix).

Operations: `ops/local-setup.md` (database, environment, first run) and
`ops/commands.md` (every command, explained once).

Execution: `plan/README.md` (how to run a phase), `plan/checkpoints.md` (predict and
explain-back questions), `plan/traceability.md` (requirement → doc → phase → test).

## Map

```
product/        requirements, scope, identifiers, glossary
architecture/   system, data flow, security, 16 ADRs
tracks/         Angular (4), NestJS (5), AI (5) teaching guides
integration/    contracts and cross-cutting flows
plan/           the phased plan, checkpoints, traceability, progress log
ops/            local setup and commands
```

## Decisions

Every technical decision lives in `architecture/decisions/`:

| ADR | Decision |
|---|---|
| ADR-001 | npm workspaces, no Nx |
| ADR-002 | JWT in an httpOnly cookie, no refresh token |
| ADR-003 | UUIDs, cascade rules, `Message.sources` |
| ADR-004 | Full-text search, decided by a spike |
| ADR-005 | Chunking parameters and boundaries |
| ADR-006 | Synchronous upload, transactional chunks, no stored file |
| ADR-007 | Three independent upload checks |
| ADR-008 | `LlmProvider` port with a deterministic mock |
| ADR-009 | Retrieval budget and history policy |
| ADR-010 | `NO_EVIDENCE` sentinel owns the fallback |
| ADR-011 | Prompt-injection defense in depth |
| ADR-012 | Angular standalone + signals, no NgRx |
| ADR-013 | Error envelope, 404 for foreign resources |
| ADR-014 | Testing stack |
| ADR-015 | docker-compose for PostgreSQL only |
| ADR-016 | Explicit non-goals and upgrade paths |

## Conventions

- **Status front-matter:** `draft`, `reviewed`, or `built`. Only reviewed docs may be used
  as a phase's reading.
- **Single source of truth:** requirements in `product/`, API types in
  `packages/contracts`, decisions in ADRs. Other docs link instead of restating.
- **Version claims** carry `verified_against` with a date and are re-checked at phase start.
- **Diagrams are ASCII** and live in the repo.
- **Code snippets** are either exact (path given) or marked illustrative.

## PRD amendments

Recorded in the spec, §11:

| Area | Change |
|---|---|
| Documentation language | English, not Arabic |
| `Message` | adds nullable `sources` JSON |
| Token transport | httpOnly cookie instead of an `Authorization` header |
| Processing | synchronous with a 30 s budget in v1 |

## The honest guarantee

The code enforces owner-scoped access, atomic completion of an upload, and a cited answer
or the exact fallback below. A cited answer is traceable to retrieved text; it is not
guaranteed to be factually correct. When evidence is insufficient, the code returns exactly

```
ليس لدي معلومات كافية للإجابة عن سؤالك.
```

Prompt boundaries and injection checks reduce risk, but do not establish truthfulness.
