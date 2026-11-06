# ADR-014: Testing stack — Jest, Supertest, real PostgreSQL, TestBed, one E2E

Status: accepted
Date: 2026-10-23

## Context

The riskiest behaviours are database-dependent (full-text search, constraints, cascades)
and AI-dependent (sentinel, injection resistance). Mocking those layers would test the
mocks.

## Decision

| Level | Tool | Environment |
|---|---|---|
| Backend unit | Jest | pure functions, no I/O |
| Backend integration | Jest + Supertest | real PostgreSQL from docker-compose, truncated between tests |
| Contract | Jest | response shapes against `packages/contracts` |
| Frontend component | Angular TestBed on Vitest (Angular 22 CLI default) | jsdom |
| End-to-end | Playwright | one journey, final phase |

- The LLM is always the mock provider in tests. The real adapter gets a small set of
  contract tests with recorded fixtures, skipped when no key is configured.
- Tests run against a dedicated database name; the test bootstrap refuses to run if the
  URL does not end in `_test`.
- Fixtures live in `apps/api/test/fixtures/` and are versioned: one PDF, one DOCX, one
  XLSX, one scanned PDF, one empty file, one Arabic document, one injection document.

## Alternatives considered

- **SQLite for tests.** Cannot test `tsvector`, `GIN`, or PostgreSQL constraint
  behaviour. Rejected.
- **Testcontainers.** Excellent isolation, slower startup, more moving parts. Acceptable
  later; docker-compose is enough now.
- **Frontend Jest/Vitest migration.** Config work with no learning payoff at this size.
  Keep the CLI default until it hurts.
- **Playwright for everything.** Slow feedback for unit-level logic.

## Consequences

- The database must be running to execute integration tests; `ops/commands.md` documents
  the single command.
- Truncation between tests is explicit (`TRUNCATE ... RESTART IDENTITY CASCADE`), so
  tests cannot pass by accident on leftover rows.
- The `_test` suffix guard prevents the worst possible mistake.
- `@nestjs/config` is ESM-only, so the API's Jest scripts run through
  `node --experimental-vm-modules` (found in Phase 0, task 0.7).
