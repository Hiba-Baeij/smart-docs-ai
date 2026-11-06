# Customer release gate

Status: **not approved for customer data** (2026-11-02). This is a repeatable operator checklist for the first release, not evidence that a production environment has been tested.
Verified against: `apps/api/src/config/env.validation.ts`, `apps/api/src/app.setup.ts`, `apps/api/src/security/security.guard.ts`, `apps/api/package.json`, `apps/web/angular.json`, `docker-compose.yml`, and the 2026-11-02 lint/typecheck/unit/build/frontend-browser/traceability results. Production hosting, restore and database-backed E2E were not verified.

## First deployment shape

Use one public HTTPS origin for Angular and `/api`, with a reverse proxy in front of **one** NestJS process. Serve the Angular `apps/web/dist/web/browser` build as static files and proxy `/api/*` to the private API port without changing the path. Keep PostgreSQL on a private network and restrict the API port so only the proxy can reach it. The API's auth and general rate counters currently live in process memory, so more than one API process requires shared rate-limit storage and a new test before scaling.

The chosen host, domain, TLS operator, PostgreSQL service, AI provider, data region and retention contract must be recorded in the release ticket. Set `CORS_ORIGIN` to the **exact** public origin. Set `COOKIE_SECURE=true` and `TRUST_PROXY_HOPS=1` only when there is exactly one trusted reverse proxy hop. The proxy must replace untrusted forwarded headers and prevent direct public access to the API. Different proxy chains require a tested hop count. Express documents how `trust proxy` affects client IP detection: <https://expressjs.com/en/guide/behind-proxies.html>.

The static server must return `index.html` for Angular deep links such as `/documents/<id>` while sending `/api/*` to the API. Verify `/api/health` through the public origin. Angular documents the SPA fallback requirement: <https://angular.dev/tools/cli/deployment>.

## Required production configuration

- Inject secrets through the host's secret store: `DATABASE_URL`, a fresh 32+ byte `JWT_SECRET`, `LLM_API_KEY`, and the selected provider's `LLM_MODEL`. Never copy the local `.env.example` credentials into production.
- Set `NODE_ENV=production`, `COOKIE_SECURE=true`, `CORS_ORIGIN=https://<customer-domain>`, `TRUST_PROXY_HOPS=1` for the one-proxy design, `LLM_PROVIDER=openai`, and an HTTPS `LLM_BASE_URL`. Confirm the provider's actual contract before using customer documents.
- Preserve the defaults for upload/body limits unless a tested customer need changes them. The application stores extracted text, chunks, messages and accounts in PostgreSQL; original uploads are not retained.
- Restrict database credentials to the application database. Configure encrypted database transport and backups using the selected service's controls.

## Release sequence

1. Pin the reviewed source revision and dependency lockfile; run `npm ci`, `npm run db:generate -w apps/api`, and `npm run build` in an isolated build environment.
2. Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e -w apps/api`, `npm run e2e`, `npm run audit:traceability`, and `npm run test:scripts` against disposable databases. The full browser journey recreates only a database ending in `_e2e`.
3. Back up the production database and verify the archive before migration. Apply committed migrations with `npm run db:deploy -w apps/api` using the production `DATABASE_URL`; do not use `prisma migrate dev` or reset commands in production.
4. Start one API process with `npm run start:prod -w apps/api`. Serve the built Angular files behind the public HTTPS proxy. Verify `/api/health`, a deep-link reload, login cookie attributes, and one complete customer journey with permitted sample documents.
5. Monitor errors and request IDs during the first release window. Roll back the application build if needed; restore the database only after a reviewed recovery decision because a restore replaces newer customer changes.

## Backup and recovery rehearsal

Use PostgreSQL custom-format archives with `pg_dump --format=custom --file=<dated-archive> <database-connection>` and `pg_restore --list <dated-archive>`. Store encrypted copies away from the application host and define retention and restore-point objectives with the customer. On a disposable database, create an empty database, then run `pg_restore --exit-on-error --no-owner --no-acl --dbname=<disposable-connection> <dated-archive>`. Check schema migration history and representative counts of users, documents, chunks, conversations and messages; then test login and retrieval with approved sample data. Never rehearse by overwriting production or the development database. PostgreSQL's `pg_dump` and `pg_restore` documentation describes the custom archive and restore process: <https://www.postgresql.org/docs/current/app-pgdump.html>.

## Open release decisions and checks

| Item | Status / required evidence |
| --- | --- |
| Host, domain, TLS and database service | Not selected in this workspace; record the exact topology and test proxy headers, SPA fallback and private ports. |
| Database restore | Not rehearsed; Docker Desktop engine was unavailable on 2026-11-02. |
| Full-stack tests | API and web unit suites pass; database-backed API E2E and `npm run e2e` remain open until PostgreSQL is available. |
| AI provider | Mock-provider journey is historical evidence only. Record provider contract, region, retention, live cost limit and an answer-quality evaluation with permitted Arabic/English documents. |
| Upload protection | Decide malware scanning/quarantine policy before accepting customer files; current API validates file type/signature, size and processing time. |
| Accessibility | Human keyboard, screen-reader and contrast review remains open in both themes and languages. |
| Operations | Configure health monitoring, error alerts, backup schedule, restore drill and incident owner for the selected host. |

## Verification recorded 2026-11-02

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test` before the proxy setting: 219 API tests and 304 web tests passed; after the proxy setting, the full API suite passed 220 tests. No web code changed after the 304-test web run.
- `npm run build`: passed for contracts, API and web.
- `npm run audit:traceability`: 42 rows checked, 0 problems.
- `npm run test:scripts`: 20 documentation, traceability and secret-scan checks passed after this runbook was added.
- `npm run e2e:frontend`: 4 Chrome tests passed with controlled API responses, covering upload preflight in English/Arabic, cookie-based auth reload, long chat history, deleted source, retry, exact no-evidence answer and 320px RTL overflow.
- `npm audit --omit=dev --json`: 0 production dependency vulnerabilities at the previous frontend gate; rerun before release.
