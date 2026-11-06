# NestJS Track

Status: reviewed
Related: ADR-003, ADR-006, ADR-008, ADR-013
Verified against: NestJS version confirmed at Phase 0

## Who this is for

Someone comfortable with NestJS who wants the architecture discipline this project
depends on: thin controllers, explicit layers, ownership at the service boundary,
transactional writes, and ports that make the AI replaceable.

## Reading order

| Guide | Read before | What it unlocks |
|---|---|---|
| `01-request-lifecycle-and-layers.md` | Phase 0 | Where logic belongs and how a request flows |
| `02-persistence-and-migrations.md` | Phase 1 | Schema, migrations, raw SQL, transactions |
| `03-auth-and-ownership.md` | Phase 2 | JWT cookies, guards, the 404 rule, rate limits |
| `04-ingestion-uploads-and-transactions.md` | Phase 4 | Buffers, validation, extraction, chunk writes |
| `05-testing.md` | Phase 2 onward | Unit versus integration, real Postgres, fixtures |

## The three rules this project enforces

1. **A controller never touches Prisma.** If it does, ownership checks get duplicated and
   eventually missed.
2. **A guard never authorizes a row.** It knows the caller, not the resource.
3. **A domain service never imports infrastructure.** Chunking and prompt building take
   values and return values.

## What is deliberately absent

- No generic repository layer over Prisma (it adds indirection without portability).
- No CQRS, no event bus, no microservices.
- No `@nestjs/passport` in v1; a small guard is easier to understand and to test.
- No Swagger in v1; `integration/api-contract.md` is the contract. Add OpenAPI when a
  second consumer exists.

## Practice rule

Each guide ends with a question you must answer before moving on. If the answer is "the
framework does it", you have not understood the boundary yet.
