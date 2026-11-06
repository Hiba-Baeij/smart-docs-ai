# Commands

Status: reviewed
Related: NFR-11, ADR-001, ADR-015
Verified against: root and workspace `package.json` scripts, 2026-11-01 (Phase 12 truth pass, checked by `scripts/docs-truth.test.mjs`)

Every command used in this project, what it does, and when to run it. If a script is
missing, create it and update this file in the same change.

## Root

| Command | What it does | When |
|---|---|---|
| `npm install` | installs all workspaces | after pulling, after changing dependencies |
| `npm run dev` | runs API and web together | daily development |
| `npm run lint` | lints all workspaces (check only, never edits files) | before every commit |
| `npm run lint:fix -w api` | lints and auto-fixes the API | when `lint` reports fixable issues |
| `npm run typecheck` | `tsc --noEmit` in each workspace | before every commit |
| `npm run build` | production build of API and web | before pushing, at phase gates |
| `npm run test` | all test suites | at phase gates |
| `npm run format` | formats with Prettier | before commit if the editor did not |
| `npm run e2e` | one Playwright journey in Chrome (register, upload, ask with a citation, ask without evidence, sign out) against its own API, web server and empty database `smartdocs_e2e` | at phase gates, before a release |
| `npm run e2e:frontend` | Chrome checks for document upload and client rejection in English and Arabic with controlled API responses; no database required | during frontend work |
| `npm run test:scripts` | the repository checks: secret scan of the source and of the built web bundle (run `npm run build` first), the traceability audit, the documentation checks | at phase gates |
| `npm run test:secrets` | only the secret scan | after changing configuration or the web build |
| `npm run audit:traceability` | prints every requirement whose test or document does not exist | after adding or renaming a test |

## Database

| Command | What it does | When |
|---|---|---|
| `docker compose up -d db` | starts PostgreSQL | start of session |
| `docker compose down` | stops the container, keeps data | end of session |
| `docker compose down -v` | **deletes the volume** | only when you intend to reset |
| `npm run db:generate -w apps/api` | regenerates the Prisma client in `src/generated/prisma` | after `npm install`, after editing `schema.prisma` |
| `npm run db:validate -w apps/api` | checks the schema without touching the DB | after editing `schema.prisma` |
| `npm run db:migrate -w apps/api` | applies migrations | after pulling schema changes |
| `npm run db:deploy -w apps/api` | applies committed migrations without creating new ones | production startup or release |
| `npm run db:migrate -- --name <name> -w apps/api` | creates a migration | after editing `schema.prisma` |
| `npm run db:reset -w apps/api` | drops, recreates, reapplies | local only, destructive |
| `npm run db:seed -w apps/api` | inserts development data | after a reset |
| `npx prisma studio -w apps/api` | database browser | inspecting rows |

## Backend tests

| Command | What it does | When |
|---|---|---|
| `npm run test -w apps/api` | unit tests | fast loop |
| `npm run test:e2e -w apps/api` | Supertest integration tests | before a phase gate |
| `npm run test -w apps/api -- --watch` | watch mode | while implementing |
| `npm run test -w apps/api -- <pattern>` | one file or test | debugging |

Integration tests require the database. They refuse to run if `TEST_DATABASE_URL` does
not end in `_test`.

## Frontend

| Command | What it does | When |
|---|---|---|
| `npm run start -w apps/web` | dev server with proxy | UI work |
| `npm run test -w apps/web` | TestBed unit tests | while implementing |
| `npm run build -w apps/web` | production bundle | phase gates |
| `npx playwright test` | end-to-end journey | Phase 12 |

## Useful one-offs

| Command | What it does |
|---|---|
| `npx prisma validate -w apps/api` | checks the schema without touching the DB |
| `npx prisma format -w apps/api` | formats `schema.prisma` |
| `npm ls <package>` | verifies an installed version before writing version-specific code |
| `git diff --stat` | review scope of a change |

## Rules

- Never run `db:reset` or `docker compose down -v` against anything but local data.
- Never run a migration against the test database manually; the test bootstrap owns it.
- Prefer workspace scripts over `cd apps/api && ...`; the scripts are the documented
  interface.
