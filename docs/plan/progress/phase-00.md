# Phase 0 — Foundations

Date started: 2026-10-30
Date finished: 2026-10-30
Time spent:

## Predict (written before building)

Question: if `packages/contracts` contains a function with a runtime dependency, what
breaks and when?

Honest note: this was answered after the build, not before, so it is not a real prediction.
Provenance: **[me]** is my own wording; **[Claude]** is what Claude added or corrected at my
request.

**[me]** It breaks at start-up or first run. Two cases: the library may end up loaded from
both `api` and `web`, which causes package problems; or `api` and `web` may each resolve a
different version of the library.

**[Claude]** The most direct failure: the app that does not have the library fails with
`Cannot find module` at build time or first run. The silent failure: the Angular bundle grows
because the library is pulled in. That is why `contracts` holds types and plain constants
only.

## What I built

Done (tasks 0.1–0.5):

- 0.1 Toolchain verified: Node v24.15.0, npm 11.12.1, Docker 28.5.1, Git 2.50.1.
- 0.2 Workspaces: root `package.json` (`workspaces`, `engines`), `apps/api` (NestJS 11),
  `apps/web` (Angular 22, SCSS, no SSR), `packages/contracts`. `npm ls` shows all three.
- 0.3 Contracts: `ErrorCode` (16 codes) and `ApiError` in `errors.ts`; `DocumentStatus`,
  `FileType`, `MessageRole`, `DocumentSummary`, `DocumentPage`, `SourceReference`, `Message`,
  `MessagePage` in `types.ts`. Typechecks on TypeScript 5.9.3 and 6.0.3. Builds to `dist`
  (CommonJS + `.d.ts`); `require('@smartdocs/contracts')` works from `apps/api`.
- 0.4 Configuration: Joi schema in `apps/api/src/config/env.validation.ts`, wired through
  `ConfigModule.forRoot({ validate })`, `.env.example`, `apps/api/.env`, root `.gitignore`.
- 0.5 Database: `docker-compose.yml` (postgres:17-alpine, volume, healthcheck, loopback
  port **5433**), init script creating `smartdocs_test`. Container healthy, `SELECT 1` ok.

- 0.6 Quality scripts: root `build`, `typecheck`, `lint`, `test`, `format`, `dev`
  (`concurrently` runs api and web; contracts is built first). `angular-eslint` added to
  `apps/web`. `lint` in `api` no longer auto-fixes; `lint:fix` does. `typecheck` added to
  `api` and `web`. All four gate commands pass.

- 0.7 Health endpoint: `GET /api/health` returns `{"status":"ok"}`. `configureApp()` in
  `src/app.setup.ts` (global prefix `api`) is shared by `main.ts` and the e2e test.
  `HealthModule`/`HealthController` with a unit test and two e2e tests (exact body; 404
  without the prefix). Verified with curl: 200 and exact body; `/` and `/health` are 404.
  The scaffold `AppController`/`AppService`/spec were removed (with permission).

Remaining: 0.8 ADR acceptance pass.

## ADR acceptance pass (task 0.8)

All 16 accepted on 2026-10-30, with these notes:

| ADR | Verdict |
|---|---|
| 001 workspaces | agree; Angular resolving `contracts` is verified in Phase 0 (see "Where I was wrong") |
| 002 cookie JWT | agree |
| 003 data model | agree; `uuid(7)` support is checked in task 1.1, not Phase 0 |
| 004 full-text search | agree; `unaccent` is not immutable, so the spike needs a wrapper function or app-side normalisation (task 5.4) |
| 005 chunking | agree with a concern: 700-word chunks (~1000–1200 estimated tokens) against a 3000-token budget fit only 2–3 chunks, so `RETRIEVAL_TOP_K=6` never fills. Decide by measurement in Phase 5/8 |
| 006 synchronous upload | agree |
| 007 upload validation | agree; prefer a hand-written magic-byte check (`%PDF-`, `PK`) over an ESM-only library |
| 008 LlmProvider port | agree |
| 009 retrieval budget | agree with the same concern as ADR-005 |
| 010 NO_EVIDENCE sentinel | agree (the most important decision in the project) |
| 011 prompt injection | agree |
| 012 Angular architecture | agree |
| 013 error envelope | agree; example `path` corrected to include `/api` |
| 014 testing stack | agree; document corrected: Angular 22 uses Vitest + jsdom, not Karma |
| 015 local infrastructure | agree (implemented; host port 5433) |
| 016 non-goals | agree |

## Gate output

```
npm run lint        api: eslint clean; web: "All files pass linting."        exit 0
npm run typecheck   contracts built; api, web, contracts tsc --noEmit        exit 0
npm run test        api: Tests 1 passed; web: Test Files 1 passed, Tests 2   exit 0
npm run build       contracts, api (nest build), web (main 217.09 kB)        exit 0
npm run test:e2e -w api   Tests: 2 passed (health body, 404 without prefix)  exit 0

npm run dev         [api] Nest application successfully started
                    [web] Local: http://localhost:4200/
curl :3000/api/health  {"status":"ok"}   HTTP 200
curl :4200/            HTTP 200

docker compose ps   smart-docs-ai-db-1  postgres:17-alpine  Up (healthy)
                    127.0.0.1:5433->5432/tcp
psql                SELECT 1 -> 1; databases: smartdocs, smartdocs_test
```

## Failure drill

What I broke: `JWT_SECRET` (missing, then empty) — observed during task 0.4.
What I expected: the process refuses to boot.
What actually happened: exit code 1 with
`Invalid environment configuration: - "JWT_SECRET" is not allowed to be empty`;
with no `.env` at all it listed `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` together.
Why: **[Claude, at my request]** A misconfigured server that boots is worse than one that
does not: the failure shows up for the developer immediately, with a clear message, instead
of for a user later with an obscure one.

## Explain back

1. Why does the API refuse to boot with a missing `JWT_SECRET` instead of throwing on first
   login?

   **[me]** No application should be reachable without `JWT_SECRET`. It is essential: it
   identifies the user who logged in and prevents illegitimate access.

   **[Claude]** The point of the question is timing. Failing at boot shows the problem to the
   developer at once instead of to a user later; the message is clear
   (`"JWT_SECRET" is not allowed to be empty`) instead of an obscure error from the JWT
   library; and a server that refused to start accepts no requests, so it can never run in a
   half-working state. Observed in task 0.4: exit code 1.

2. What exactly is a workspace in npm, and why is it not a monorepo tool?

   **[me]** It lets you put several projects together and share between them.
   (I also said it is "like Nx, differing in speed and dev tools". That part was wrong.)

   **[Claude]** A workspace is an npm feature: the root `package.json` lists
   `"workspaces": ["apps/*", "packages/*"]`, `npm install` puts all packages in one
   `node_modules`, links the local packages to each other (we saw `@smartdocs/contracts`
   resolve from `api` and `web`), and `npm run x -w api` runs a script in one package. It is
   not a monorepo tool because it does not orchestrate builds or cache results. It does not
   know `contracts` must build before the apps, so we wrote `build:contracts` by hand and put
   it first in the root scripts. Nx and Turborepo do that automatically; ADR-001 rejected
   them for a learning project.

3. Name the three trust zones and one rule that protects each boundary.

   **[me]**
   1. Browser: `userId` is taken from the token, and extra fields are rejected.
   2. LLM: the API is responsible for sending each user's own chunks.
   3. Uploaded file: be careful with harmful, corrupt or empty files so extraction does not
      break.

   **[Claude]** Additions: the provider key stays backend-only and no user identity is sent
   to the provider (T9, T10). For uploads the rule is three independent checks (extension,
   declared MIME, magic bytes) plus a size limit, and the file's text is treated as data, not
   instructions, inside the prompt (ADR-007, ADR-011).

## Where I was wrong

- `contracts` pointed at `src/index.ts`; Node cannot load that at runtime. Resolved by
  building to `dist` before the apps (ADR-001 "verify at Phase 0"). Root scripts must build
  it first (task 0.6).
- `docs/tracks/nestjs/01` says `validationSchema`. `@nestjs/config` 12 routes that option
  through Standard Schema (no `abortEarly`, Joi rejects unknown env vars). Used `validate`
  with `validateEnv` instead. Implementation detail; fix the doc in the Phase 12 truth pass.
- Port 5432 was already taken by a host PostgreSQL, so the container uses 5433. Docs and
  `.env.example` updated.
- ADR-001 check done: a temporary `import { ErrorCode } from '@smartdocs/contracts'` in
  `apps/web/src/main.ts` built and the constant appeared in the bundle; type imports also
  compiled. Resolution works through the workspace symlink without a declared dependency.
  The temporary code was removed. Declare the dependency at the first real import.
- `ng new` with `--skip-install` failed until `typescript` was supplied to `npx`.
- Nest scaffold files were CRLF and failed Prettier (LF); fixed with `lint:fix`. Consider a
  `.gitattributes` with `* text=auto eol=lf` before the first commit.
- `ng test` first failed: rolldown's Windows native binding was in the lockfile but not in
  `node_modules` (npm optional-dependency bug). It appeared after later `npm install` runs;
  if it recurs, install `@rolldown/binding-win32-x64-msvc` at the locked version.
- `web` uses ESLint 10 (via angular-eslint) while `api` uses ESLint 9.
- `@nestjs/config` 12 is ESM-only; Jest (CommonJS) failed with "Must use import to load ES
  Module". Fixed by running Jest through `node --experimental-vm-modules` in the `api`
  test scripts. Revisit if Jest or Nest change module format.
- The health response carries `X-Powered-By: Express`. Not a body leak, but it names the
  framework. Candidate for Phase 11 (disable it or add Helmet).

## Open questions

- `npm audit` reports 10 vulnerabilities (2 high). Reviewed in task 11.6, not before.
- `@smartdocs/contracts` is not yet declared as a dependency in `api` and `web`
  `package.json`; add it at the first real import.
- Angular 22 ships Vitest; the plan mentions TestBed with Jest-style tooling. Check ADR-014
  before Phase 3.

## Next phase readiness

- [x] Gate commands run and seen
- [x] Failure drill observed (task 0.4; reason written with Claude's help)
- [x] Explain-back answered (partly in my own words, completed and corrected by Claude)
- [x] Traceability updated (no Phase 0 rows exist; nothing to add)
- [x] Docs updated with anything that changed (commands, local-setup, ADR-001/013/014)
