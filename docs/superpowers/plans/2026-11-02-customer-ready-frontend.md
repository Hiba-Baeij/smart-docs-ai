# SmartDocs AI Customer-Ready Frontend Implementation Plan

> **For agentic workers:** Implement one task at a time and verify its gate before starting the next. Follow `docs/product/PRD.md` and the existing ADRs; record any decision that supersedes an ADR.

**Goal:** Upgrade the working Angular application into an accessible Arabic/English customer interface, then verify the entire system for a production launch.

**Architecture:** Keep the current standalone Angular application, lazy routes, feature APIs, and signal stores. Add a small presentation layer for theme and language, and evolve the existing screens in place. Keep the JWT in the existing HttpOnly cookie; the API remains the authority for authentication and ownership.

**Tech Stack:** Installed Angular 22, TypeScript 6, SCSS, proposed Tailwind CSS, Angular Signals, Reactive Forms, proposed Zod, proposed `ngx-sonner`, and Angular CDK only if the message history warrants virtual scrolling.

**Spec:** `docs/product/PRD.md`; additional UI requirements in the user's 2026-11-02 request. Existing decisions: `docs/architecture/decisions/ADR-002-auth-cookie.md`, `ADR-012-angular-architecture.md`, and `docs/product/scope.md`.

## Current state (inspection on 2026-11-02)

- The API and web application already exist. The web app has login/register, a guarded shell, documents/upload/detail, chat/conversations, functional interceptors, and signal stores.
- `AuthStore` restores the session with `/auth/me`; `credentialsInterceptor` sends an HttpOnly cookie to the API. Do not add bearer tokens to browser storage.
- Upload displays actual HTTP transfer progress and a distinct server-processing phase. Do not replace this with simulated percentages.
- Chat already has optimistic messages, citations, pagination, and conditional auto-scroll. The backend's first version has no streamed answer endpoint, so only a waiting/typing state is currently truthful.
- `docs/plan/progress/phase-12.md` records passing checks on 2026-11-02. Those are historical results, not a fresh run for this plan. Manual screen-reader/contrast review and real provider evaluation remain open.
- This workspace did not expose a `.git` repository during inspection (`git status` failed). Do not include commit commands as an executable gate until the repository is available.

## Design choices for review

1. **Recommended: incrementally restyle the existing app.** Tailwind utilities for layout and spacing; CSS custom properties for semantic design tokens; small SCSS files for complex component states. This preserves tested behavior and needs an ADR update because ADR-012 currently specifies SCSS without a UI library.
2. Rebuild the Angular frontend from scratch. This offers a clean visual start but repeats working auth, upload, chat, and tests; reject unless the current architecture proves blocking.
3. Keep SCSS alone. This minimizes dependencies, but does not meet the explicit Tailwind request.

Runtime language switching is a requirement. Prefer typed English/Arabic message dictionaries behind a signal-based locale service, with `lang` and `dir` on the root document. Angular compile-time localization would produce separate locale builds and require navigation/reload to switch. Keep server error codes and the exact insufficient-evidence answer unchanged; translate only UI copy.

For forms, keep Angular typed Reactive Forms and the API's validation. If Zod is added, use shared client schemas for submit validation and field messages without maintaining two conflicting rule sets. Check installed Angular/package compatibility before adding Zod, Tailwind, `ngx-sonner`, or CDK.

## Global constraints

- Single-company, single-owner data model. The API must enforce user ownership; route guards are a UX boundary only.
- `PDF`, `DOCX`, `XLSX` only. The API remains the final authority on size, MIME, signature, and malformed files.
- AI keys and document processing stay on the server.
- The exact Arabic insufficient-evidence answer is never translated or altered.
- Use logical CSS properties and `dir="auto"` for user-supplied names and message content; test both RTL and LTR.
- Respect reduced motion, keyboard operation, visible focus, and readable contrast in both themes.
- Keep a recoverable error message in the page even when a toast is shown. Toasts are transient feedback, not the only error channel.

## File map

| Area | Existing files to evolve | New focused files (proposed) |
| --- | --- | --- |
| Theme/tokens | `apps/web/src/styles.scss`, `apps/web/src/app/app.ts`, `app.html` | `core/presentation/theme.service.ts`, `shared/theme-toggle.ts` |
| Language/RTL | `apps/web/src/app/app.ts`, shell/auth/document/chat templates | `core/i18n/locale.service.ts`, `core/i18n/messages.en.ts`, `messages.ar.ts`, `shared/locale-switch.ts` |
| Shell/routing | `app.routes.ts`, `core/shell/shell.*` | `features/dashboard/dashboard-page.*` only if dashboard has distinct summary content |
| Auth | `features/auth/login.*`, `register.*`, `auth-form.*`, `core/auth/*` | `features/auth/auth-schema.ts` if Zod adds value |
| Feedback | `app.config.ts`, upload/document/chat components | `core/notifications/notification.service.ts` |
| Upload/documents | `features/documents/*` | `features/documents/file-selection.ts` for client checks |
| Chat | `features/chat/*` | `shared/assistant-markdown.ts` if safe Markdown rendering is added |
| Deployment | `docs/ops/*`, root scripts/config | Deployment runbook and environment-specific proxy configuration |

## Review focus

1. A browser reload with a valid or expired cookie must restore or redirect correctly, with no flash of another account's data. Pin in Task 2 auth tests.
2. Mixed Arabic/English filenames and citation labels must remain readable in both directions. Pin in Tasks 1 and 4 UI tests.
3. An unsupported, empty, or oversized upload must fail before HTTP submission; server rejection must still be shown accurately. Pin in Task 3 tests.
4. Long, variable-height Markdown messages must not jump, lose citations, or steal scroll position. Pin in Task 4 tests before enabling virtual scroll.
5. Failed requests and page reloads must not produce duplicate or stale toasts; important failures remain in the page. Pin in Tasks 2–4 tests.

## Task 1 — Core layout, tokens, theme, and language

**Deliverable:** Responsive shell and auth layout with runtime light/dark and English/Arabic controls.

- [x] Record the approved Tailwind/token/runtime-locale decision in a new ADR superseding the relevant styling part of ADR-012; pin compatible package versions after checking local and official package documentation.
- [x] Add focused tests for `ThemeService`: system preference on first visit, persisted explicit choice, and updates to `data-theme`/`color-scheme` without a flash of the wrong theme.
- [x] Add focused tests for `LocaleService`: English and Arabic lookup, fallback for missing keys, persistence, and immediate `document.documentElement.lang/dir` update.
- [x] Implement semantic CSS tokens for surface, text, border, accent, focus, status, and overlay in both themes; add Tailwind for layout utilities without duplicating token values.
- [x] Refactor the shell and auth pages into responsive layouts. Keep source order logical for screen readers; use CSS logical properties instead of left/right assumptions.
- [x] Translate shell and auth UI copy, validation messages, and accessible labels; use direction isolation for email, filenames, and mixed-language content.
- [x] Verify: `npm run test -w apps/web`, `npm run typecheck -w apps/web`, `npm run lint -w apps/web`, `npm run build -w apps/web`; manually inspect 320px/mobile and desktop, each theme and language.

## Task 2 — Routing and authentication polish

**Deliverable:** Coherent login/register flow and protected dashboard entry, preserving the current cookie security model.

- [x] Add route tests for anonymous, valid-cookie, and expired-cookie navigation, including sanitized `returnUrl` and reload of a protected deep link.
- [x] Add client form-schema tests for blank, malformed, and valid inputs. Keep login password checks different from registration policy; map server field errors to controls.
- [x] Rework login/register as split-screen views on desktop and a single-column view on mobile, with correct error focus, disabled submit state, and theme/language controls.
- [x] Make `/` a dashboard overview only if it has meaningful distinct summary data; otherwise retain `/documents` as the landing page and label it clearly. Reuse `DocumentsStore` rather than creating a second document cache.
- [x] Keep `/auth/me` session restoration and the existing credential/error interceptors; add no token-reading JavaScript. Ensure user-specific state resets on logout/session expiry.
- [x] Verify auth tests, route tests, web typecheck/lint/build, and a browser login/logout/reload journey.

## Task 3 — Documents, upload, and notifications

**Deliverable:** Clear document overview with honest upload progress and safe deletion.

- [x] Add client file-selection tests for extension, size, empty file, and drag/drop keyboard fallback. Mirror API limits from a documented UI configuration, but let the API decide final validity.
- [x] Add drag/drop upload affordance and use the existing actual HTTP progress. Show an indeterminate processing state after bytes arrive; never invent an extraction percentage.
- [x] Add type icons, localized dates/status labels, responsive card/table treatment, loading/empty/error states, and an accessible delete confirmation with focus return.
- [x] Integrate `ngx-sonner` through one notification service for upload/create/delete success and error, with loading-to-result transitions and deduplication. Keep persistent inline errors and reference IDs where available.
- [x] Verify document/upload tests, web typecheck/lint/build, and browser checks for PDF/DOCX/XLSX plus rejected files in both directions.

## Task 4 — Chat, citations, and long-history behavior

**Deliverable:** Responsive conversation view with readable AI answers and source navigation.

- [x] Test create/select/delete and late-response isolation when switching conversations; retain current ownership checks and state reset.
- [x] Improve narrow-screen navigation, composer, loading/typing state, conditional auto-scroll, and localized copy. Do not imply live model streaming until the API exposes a streamed endpoint.
- [x] Add Markdown rendering only with a reviewed sanitizer/allowlist. Test links, code blocks, HTML injection, and mixed RTL/LTR text. Keep citation chips separate from model-generated Markdown and link only to authorized document routes.
- [ ] Measure real customer history sizes and variable message heights before using Angular CDK Virtual Scrolling. The current 100-message browser case supports DOM pagination, but production measurements and manual reading-order review remain open.
- [x] Verify chat tests, web typecheck/lint/build, and browser checks for long conversations, deleted sources, retry, and no-evidence answer.

## Task 5 — Customer deployment gate (full stack)

**Deliverable:** A deployable release with a runbook and evidence from a production-like environment.

- [ ] Choose the customer hosting topology and domain. Document TLS, same-origin `/api` proxy, `Secure` cookies, CORS origin, trusted proxy headers, SPA fallback, and separate production secrets.
- [ ] Add repeatable migration/startup and database backup/restore procedures. Verify a restore in a disposable environment; never reset customer data to test it.
- [ ] Confirm rate limiting works for the chosen replica count; existing in-process counters need shared storage if the API scales beyond one replica.
- [ ] Review upload malware policy, resource/time limits, structured logs without secrets/document text, request IDs, health checks, alerts, and incident rollback.
- [ ] Evaluate the selected AI provider's contract, data region/retention, cost limits, and answer quality on real permitted Arabic/English documents. Do not use mock-provider test success as evidence of live answer quality.
- [ ] Complete human screen-reader/contrast review and a production-like end-to-end run: register → login → upload each type → cited answer → exact fallback → delete → logout → unauthorized redirect.
- [ ] Run fresh gates: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e -w api`, `npm run e2e`, `npm run build`, and `npm run audit:traceability`; record actual outputs and unresolved risks in the release checklist.

## Definition of done

Every task has its own passing gate and its required manual checks recorded. The release gate additionally requires a tested deployment topology, data recovery rehearsal, real-provider and privacy decisions, and a verified customer journey. A visually complete frontend alone is not a deployable customer product.

## Execution note — 2026-11-02

Task 1 completed. Theme and locale services, controls, auth/shell layouts, tokenized colors, early preference bootstrap, Arabic auth feedback, and Tailwind/PostCSS are implemented. `ADR-017-frontend-presentation.md` records the approved architecture and package versions. The final web suite passed with 281 tests; web typecheck, lint, and production build passed. `scripts/visual-smoke.mjs` used installed Chrome to inspect login/register at 320, 390, and 1280px with both themes and languages; all tested combinations had no horizontal overflow. Desktop light/English and mobile dark/Arabic screenshots were visually reviewed. The standalone Playwright CLI browser download was unnecessary because the script uses local Chrome.

Task 2 completed for the frontend: Zod validates login and registration submissions while typed Reactive Forms retain live validation. The existing cookie and guard architecture is unchanged; `/documents` remains the landing page because it already provides the document overview and upload action.

Task 2 browser gate completed: `npm run e2e:frontend` now covers an anonymous protected deep link, login with an HttpOnly cookie, reload and `/auth/me` restoration, logout, and a renewed redirect from the protected route. The API is controlled by the browser test, so this validates frontend behavior and browser cookie handling rather than the live API session implementation.

Task 3 completed for the frontend: upload preflight checks `.pdf`, `.docx`, `.xlsx`, zero-byte and >10 MiB files before HTTP; drag/drop and file input share one code path. Real HTTP progress remains visible, followed by an indeterminate processing state. `ngx-sonner` is installed and wrapped by `NotificationService` with stable operation IDs. Upload and document deletion show success/error toasts while preserving inline failures. The document list now has type symbols, localized labels/status/dates and mobile cards; detail and delete confirmation have Arabic/English labels and focus return on cancel. Stored processing failure notes have Arabic copy. The three-format browser upload check passed in both directions with a controlled API response.

Task 4 in progress: conversations and composer labels, send failures, and source labels are localized. Creation/deletion use the central notification service and keep inline action errors. Assistant responses use `marked` with raw HTML escaped and a restrictive DOMPurify tag/attribute allowlist; Angular also sanitizes the bound HTML. Citation links remain separate Angular router links. Tests cover formatting, code blocks, safe and unsafe links, image and HTML injection, and Arabic/English text. Existing message pagination remains in place pending a measured need for CDK virtual scrolling. The latest production dependency audit (`npm audit --omit=dev --json`) reported zero vulnerabilities; the full install audit reported 19 moderate development-dependency findings that need review before the release gate.

Long-history correction: the API numbers message pages from oldest to newest. The chat store now reads page 1 for the total, opens the last page, and prepends preceding pages when requested. The browser test covers 100 messages, a deleted source, failed send and retry, the exact no-evidence answer, and a 320px Arabic/RTL reload without horizontal overflow. This keeps the simple DOM pagination for the measured 100-message case; revisit CDK only if real customer histories reveal a performance problem.

Latest verification after the chat and Markdown changes: 303 web tests passed, web typecheck and lint passed, and the web production build completed. Browser upload and full-stack release gates remain open.

Frontend browser gate: `npm run e2e:frontend` passed 4 Chrome tests. Both English/LTR and Arabic/RTL uploaded real PDF, DOCX and XLSX fixtures through the file picker with a controlled API response; unsupported, empty and >10 MiB selections made no upload request. The auth test covered protected deep-link login, cookie restoration on reload and logout. The chat test covered long history and the edge cases above. Docker Desktop's engine was unavailable (`docker compose ps` could not connect), so the database-backed `npm run e2e` remains open.

Release preparation: `docs/ops/customer-release.md` records a provisional single-process API topology, exact production configuration, migration command, backup/restore rehearsal and open customer decisions. `TRUST_PROXY_HOPS` defaults to 0 and can be set to 1 behind one trusted private proxy; unauthenticated rate limiting now reads Express's configured client IP. Fresh repository-wide lint, typecheck, unit tests (219 API + 304 web), production build and traceability audit (42 rows, 0 problems) passed. Database-backed tests and restore rehearsal still require a running PostgreSQL service.

After the proxy setting, the API suite passed 220 tests, API lint/typecheck/build passed, and `npm run test:scripts` passed all 20 checks. The full-stack database-dependent gates remain open.
