# Phase 3 — Authentication UI

Date started: 2026-10-31
Date finished: 2026-10-31
Time spent:

## Predict (written before building)

Question: on a hard reload of `/documents/42`, list the exact order of: the guard running, the
`/auth/me` call, the component being created, and the redirect decision.

Provenance: **[me]** is my own wording; **[Claude]** is what Claude corrected or added.

**[me]** Redirect decision, then the guard runs, then the component is created, then `/auth/me`.

**[Claude]** Wrong order. The correct sequence on a hard reload of `/documents/42`:
1. The guard runs first, because it sits in front of the route. The auth state is `unknown`: a
   reload wipes memory, and the `HttpOnly` cookie cannot be read by script.
2. The guard calls `GET /auth/me` (once per page load) and waits for it.
3. The redirect decision: 200 means the guard returns `true`, 401 means it returns a `UrlTree` to
   `/login?returnUrl=/documents/42`.
4. Only if it returned `true` is the component created. A blocked route never creates it.
The decision depends on the answer of `/auth/me`, so it cannot come before it; deciding earlier
would send every logged-in user to the login page on each reload.

## What I built

- Before 3.1: `apps/web/tsconfig.json` had no `"strict": true` and no `strictTemplates`, although I
  passed `--strict` to `ng new`. Enabled both; the scaffold still type-checks and builds.
- 3.1 Shell and routes. `app.ts` is now just a router outlet (`app.html`: `<router-outlet />`).
  `core/shell/shell.{ts,html,scss}`: header with the product name and a Documents link, and the
  outlet for the pages. `features/auth/login.ts` and `register.ts`, `features/documents/
  documents-page.ts` and `document-detail.ts` (reads `:id` from the snapshot), `shared/not-found.ts`
  are placeholders for now. `app.routes.ts`: `/login` and `/register` outside the shell; the shell
  at `''` with children `documents`, `documents/:id` and a redirect from `''`; a `**` not-found
  route; every route uses `loadComponent`. The auth guard is added in 3.4, so the shell is not yet
  protected. `app.spec.ts` now asserts a router outlet; `app.routes.spec.ts` (5 tests, a real
  router with `RouterTestingHarness`): `/login` and `/register` render without the shell, the
  documents pages render inside it, `:id` is read from the URL, `/` redirects to `/documents`, an
  unknown URL shows not-found without the shell.
  Checks: web tests 7/7, lint, typecheck (strict), build pass. The build shows lazy loading: the
  main bundle is 218 kB and each page is its own chunk of 300 B to 1 kB. Mutation check: removing
  the root redirect and the wildcard route failed exactly the 2 matching tests; restored.
- 3.2 API base, credentials interceptor, dev proxy. `core/config/api-base.ts`: `API_BASE_URL`, an
  `InjectionToken` whose default is the relative path `/api` (one origin: no CORS, first-party
  cookie, no secret in the bundle). `core/http/credentials.interceptor.ts`: adds `withCredentials`
  only to requests whose URL starts with the API base, so the cookie is never sent anywhere else,
  and never builds an `Authorization` header. `app.config.ts` registers it with
  `provideHttpClient(withInterceptors([...]))`. `apps/web/proxy.conf.json` (`/api` to
  `http://localhost:3000`) wired in `angular.json` `serve.options.proxyConfig`.
  Tests: `credentials.interceptor.spec.ts` (4) and `app.config.spec.ts` (1, the REAL application
  providers through `HttpClientTesting`).
  Checks: web tests 12/12, lint, typecheck, build pass. Real run: the actual `ng serve` and the
  built API; through port 4200 `GET /api/health` gave 200, `/` and `/documents/42` gave 200 (SPA
  fallback), a login through the proxy returned the cookie `HttpOnly; SameSite=Lax; Path=/;
  Max-Age=3600` with no `Domain`, and `/api/auth/me` through the proxy gave 200 with the cookie and
  401 without. This used curl, not a browser; a real browser check comes with the login form (3.5).
  Mutation checks: the interceptor removed from `app.config.ts` failed ONLY the app-config test
  (the interceptor's own tests stayed green, which is exactly why that test exists); credentials sent
  to every URL failed the "anywhere else" test; restored.
  Mistakes of mine, caught by the checks: my first write of `app.config.ts` silently did not apply
  (the file had been reformatted since I read it), so the interceptor was unregistered while its own
  unit tests passed; a spec that left a request unconsumed when an assertion failed made an
  unrelated test fail too (now every request is consumed before any assertion); and a start command
  with a doubled relative path made the API exit, so the first proxy check returned 502.
- 3.3 AuthStore. `RegisterRequest`, `LoginRequest` and `AuthResponse` added to contracts;
  `@smartdocs/contracts` declared in `apps/web/package.json` (linked offline) and imported with
  `import type` only, so the web bundle has no runtime dependency on contracts' build output.
  `core/auth/auth.api.ts`: the only place that knows the auth endpoints (`register`, `login`,
  `logout`, `me`; login and register unwrap `{ user }`, `me` is a bare user as the contract says);
  4 URL/body tests. `core/auth/auth.store.ts`: private writable signals, public read-only
  `status` (`unknown | anonymous | authenticated`), `user`, and `isAuthenticated`;
  `restore()` asks `/auth/me` at most once per page load (shared promise), never rejects, and any
  failure means `anonymous` (fail closed); a restore answer that arrives after a login finished is
  ignored; `login()` rejects and leaves the state unchanged on failure; `logout()` always clears the
  local state and rethrows a server error; `reset()` for the 401 interceptor (3.6).
  `auth.store.spec.ts` (12 tests, a fake API): the three status transitions, the failure paths, the
  single request, the late-restore race, and that the signals have no `set`.
  Checks: web tests 28/28, unit 15/15 for api, lint, typecheck, build pass. Mutation checks:
  group A (no single-flight, no late-restore guard, no `finally` in logout, a writable signal
  exposed) failed exactly the 4 matching tests; group B (restore allowed to reject) failed 5, one
  more than I predicted: the race test also awaits the restore, which now rejects, so that failure
  is legitimate and my count was the incomplete part. All restored.
  Decision (not in the guide): when `/auth/me` cannot be answered at all (server down), the user is
  treated as `anonymous` and lands on the login page rather than seeing a broken page.
- 3.4 Guard and returnUrl. `core/auth/auth.guard.ts` (`authGuard`): awaits `AuthStore.restore()`,
  then returns `true` or a `UrlTree` to `/login?returnUrl=<state.url>` (path, query and fragment
  kept). `core/auth/return-url.ts` (`safeReturnUrl`): accepts only a path on this site, in two
  stages: a string check (must start with `/`, not `//`), then parse the value as a browser does
  (`new URL(value, base)`) and require the same origin, because browsers read `\` as `/` and drop
  tabs and newlines, so `/\evil.example` and `/<tab>/evil.example` mean `//evil.example`. The guard
  is on the shell route in `app.routes.ts`.
  Tests (30 new, web 58/58): `return-url.spec.ts` (accepted paths; 11 kinds of attempt; null and
  undefined; the fallback); `auth.guard.spec.ts` with a stand-in store (true when signed in; a
  `UrlTree` with the wanted page when not; query and fragment kept; the decision really waits for
  the answer; `restore` called on every run) and with the REAL store and router (an events log):
  signed in gives `guard runs`, `GET /auth/me`, `component created`; signed out gives `guard runs`,
  `GET /auth/me`, `login page created` and the protected page is never created; only one
  `/auth/me` across three navigations. These two event lists are the corrected Predict answer, now
  executable. `app.routes.spec.ts` now covers signed-in and anonymous behaviour.
  Checks: web 58/58, lint, typecheck, build pass. Mutation checks: the guard not waiting for
  `restore()` failed 5 (the wait test and all the event-order tests); a constant `returnUrl` failed
  4; removing the origin check failed exactly the 3 backslash, tab and newline cases; removing the
  string `//` check failed NOTHING, because the origin check already rejects `//evil.example`. I keep
  both on purpose (the guide asks for the explicit check and it is the readable one); no test can
  tell them apart. All restored.
  Note: `safeReturnUrl` is not called anywhere yet; the login form (3.5) uses it after a successful
  sign-in.
- 3.5 Login and register forms. `core/http/app-error.ts`: `AppError` and an idempotent
  `toAppError` (status 0 is `NETWORK`; an API envelope keeps its code, details and request id;
  anything else is `UNKNOWN`; a foreign body is never copied into the message). `features/auth/
  auth-form.ts`: `toAuthFailure` (the wording is chosen from the stable `code`, never from the
  server's `message`), `applyFieldErrors` (server messages onto the matching controls; a message for
  a field the form does not have goes to the form-level alert instead of being lost), `fieldMessage`,
  `focusFirstInvalid`. `login.{ts,html}` and `register.{ts,html}` with typed reactive forms
  (`nonNullable` controls), `novalidate`, labels with `for`, `aria-invalid`/`aria-describedby`,
  `role="alert"` for the form error, `role="status"` for the "account created" notice,
  `autocomplete` hints, a submit button that is disabled and `aria-busy` while pending, and a
  guard against a second submit. Login: one generic message for a wrong email or password; the email
  is kept, the password is cleared and refocused; success follows `safeReturnUrl(returnUrl)`.
  Register: limits mirror the API DTO (name 1-100, email, password 10-128), the hint says that only
  the first 72 bytes of a password are used (the Phase 2 open concern), a taken email goes on the
  email field, and success goes to `/login?registered=1` without signing in. Shared styles in
  `auth-form.scss`.
  Tests (web 108/108 in total; 50 new): `app-error.spec.ts` (7), `auth-form.spec.ts` (13),
  `login.spec.ts` (19) and `register.spec.ts` (12) with a real router and a stand-in store/API.
  Checks: web tests 108/108, lint, typecheck, build pass.
  A bug the tests found: `focusFirstInvalid` first looked for the `ng-invalid` CSS class, which only
  updates on the next change-detection pass, so it focused the Name field when the Password was the
  invalid one (a failing register test). It now reads the form model, which is always current, and
  the `ChangeDetectorRef.detectChanges()` calls it needed are gone.
  Mutation checks in three batches, each with its count computed first: (1) returnUrl trusted as is,
  the password kept after a failure, the server's text shown, no password minimum: 7 failed, 7
  predicted; (2) no double-submit guard in both forms and no focus on the first invalid field: 8
  failed, 8 predicted; (3) the button never disabled: exactly 1 failed. All restored.
  Real browser check (built-in browser, real `ng serve` and API, a throwaway account): an anonymous
  visit to `/documents` redirected to `/login?returnUrl=%2Fdocuments` without the shell; an empty
  submit showed both messages, focused Email and made no request; a 9-character password showed
  "must be at least 10 characters", focused Password and made no request; registration landed on
  `/login?registered=1` with the notice and exactly one register request; a wrong password showed
  "Invalid email or password.", kept the email, cleared the password and focused it; with
  `returnUrl=//evil.example` a correct login ended on `http://localhost:4200/documents` (same
  origin) with the shell visible; `localStorage`, `sessionStorage` and `document.cookie` were all
  empty; a full load of `/documents/42` made one API call, `/api/auth/me`, and showed "Document 42"
  inside the shell with no redirect. This is the Predict scenario, observed.
  Left behind: one throwaway row in the dev database, `browser-check-ugqtac@example.com`, created
  by that check. It is dev data and harmless; delete it when convenient.
  Mistakes of mine: `ng test` takes a filter as `--include`, not a bare name; one test timing
  assumed `whenStable()` covers a promise that has not been scheduled yet (needed one event-loop
  turn); the first browser typing attempt ran before the page had painted, so it sent an empty email
  (the app behaved correctly and the step was repeated); and I printed the generated throwaway
  password in a tool result when generating it.
- 3.6 Error interceptor. `core/http/error.interceptor.ts`: for requests to the API base only, every
  failure becomes an `AppError` (via `toAppError`) and is rethrown, so components receive one shape.
  One cross-cutting case: a `401 AUTH_REQUIRED` from a feature call, when the user was signed in,
  makes the store forget the user (`reset()`) and sends the browser to
  `/login?returnUrl=<where the user was>&reason=expired`. It does NOT act on `/auth/*` calls (a 401
  from login is a form error and from `/auth/me` is the normal "not signed in"; redirecting would
  loop), does not redirect unless the status was `authenticated` (an anonymous visitor has nothing
  to lose, and a late failure must not redirect again), and chooses no wording. The prefix test is
  `startsWith(apiBase + '/auth/')`, stricter than the guide's `includes('/auth/')`, which would also
  match any URL that merely contains that text. Registered in `app.config.ts` after the credentials
  interceptor. The login page shows "Your session expired. Please sign in again." for
  `reason=expired` (a status notice) and still follows `returnUrl`.
  Tests (web 124/124 in total; 16 new): `error.interceptor.spec.ts` (15, real store and router):
  the 401 on a feature call resets the store, redirects with the right `returnUrl` and `reason`
  and still delivers an `AppError` to the caller; several simultaneous failures redirect once; a
  LATE failure after the redirect does not redirect again or nest `returnUrl=/login...`; a visitor
  who was never signed in is untouched; `/auth/login`, `/auth/me` and `/auth/logout` 401s never
  redirect (the no-loop case); 404, 429 and 500 only become `AppError`; a status-0 failure is
  `NETWORK` and a 422 keeps its details; a proxy HTML error page is `UNKNOWN`; successes pass
  through; failures of non-API URLs are left as `HttpErrorResponse`. `app.config.spec.ts` gained a
  test that the REAL providers translate an API failure; `login.spec.ts` gained the expired notice.
  Checks: web 124/124, lint, typecheck, build pass. Mutation checks: batch A (the `/auth/*`
  exclusion removed, a redirect on any error, foreign URLs interpreted, the interceptor removed from
  the app config) failed 9, 9 predicted; batch B (the "was signed in" condition removed, the store
  not reset) failed only 2 where I predicted 3: my "redirects once" test sent all failures in the
  same tick, and the router merges navigations to the same URL, so it could not tell the guard from
  its absence. I added the late-failure test, which does (3 failed). All restored.
  NOT verified in a real browser: the expiry redirect. The interceptor only acts on `HttpClient`
  calls to `/api/*` outside `/auth/`, and the UI has no such call yet (the documents API arrives in
  Phase 6). The unit tests use the real router and store; a browser check belongs to Phase 6.
  Mistakes of mine: a spec helper typed `unknown` for a `flush` body (a type error); and the
  concurrency test that could not discriminate (above).
- 3.7 Header and sign-out. `core/shell/shell.{ts,html,scss}`: the header shows the signed-in user's
  name (interpolation, so HTML in a name is shown as text) and a Sign out button. `signOut()`
  clears the local state whatever happens (the store guarantees it), then goes to `/login`: with no
  warning if the server answered, or if it answered 401 (the session had already ended, which is
  what the user wanted); with `reason=signout-failed` if the server could not be reached or
  errored, and the login page then shows an alert that the session may still be open. The button is
  disabled while it works. `login.ts/html` show that alert. `app.routes.spec.ts`'s stand-in store
  gained `user` and `logout`.
  Tests (web 133/133 in total; 9 new): `shell.spec.ts` (name shown, none when there is no user, an
  HTML name shown as text with no element created, one logout request and the redirect, the
  disabled button during the request, 401 as a normal sign-out, a network failure and a server
  error as `signout-failed`) and one in `login.spec.ts` for the alert.
  Checks: web 133/133, lint, typecheck, build pass. Mutation checks: an already-ended session
  reported as a failure, no redirect on failure, the name rendered with `innerHTML`, and the button
  never disabled failed 5, 5 predicted; removing the handler's own double-submit guard failed 0,
  also predicted, because the disabled button already guards (two overlapping defences, kept).
  Real browser: after signing in the header showed "Browser Check" and "Sign out"; clicking Sign out
  sent exactly one `/api/auth/logout` and landed on `/login` without the shell; a full load of
  `/documents` afterwards called `/api/auth/me`, got 401 and went to
  `/login?returnUrl=%2Fdocuments`, proving the SERVER ended the session.

## Gate output

```
npm run lint        api eslint clean; web "All files pass linting."             exit 0
npm run typecheck   contracts built; api, web (strict), contracts tsc          exit 0
npm run test        api unit 15 passed; web Test Files 14 passed, Tests 133 passed   exit 0
npm run test:e2e -w api   Test Suites 12 passed, Tests 79 passed            exit 0
npm run build       contracts, api (dist/main.js present), web (Initial total 257.79 kB)   exit 0

Manual journey from the plan, run in the built-in browser against the real dev server and API:
  register -> /login?registered=1 with the notice
  login (with returnUrl=//evil.example) -> /documents on localhost:4200, not the other site
  reload /documents/42 -> one call, /api/auth/me, then the page inside the shell
  logout -> /login; load /documents -> /login?returnUrl=%2Fdocuments
Storage inspected: localStorage, sessionStorage and document.cookie were all empty.
```

## Failure drill

What I broke: the session, under a signed-in browser tab. The plan says to delete the cookie in
devtools; the cookie is HttpOnly so script cannot delete it, so I restarted the API with a
different `JWT_SECRET` while the tab was open, which makes the cookie invalid in the same way
(the Phase 2 drill's method). Then I clicked a link inside the app, and then reloaded.
What I expected: to be redirected to the login page with a message.
What actually happened: the click inside the app made NO request and the page kept showing the
shell and my name, although the session was dead on the server. Only the full reload noticed:
it called `/api/auth/me`, got 401, and went to `/login?returnUrl=%2Fdocuments%2F42`. No "session
expired" message appeared, because that message belongs to the error interceptor, which only acts
on a failing feature call, and the UI has none yet.
Why: **[Claude, at my request; not my own words]** The route guard asks the server who the user is
once per page load, not on every navigation (otherwise it would call the API on every click), so
inside one page the client's idea of the session can be stale. Three layers can notice, at
different moments: the server, which verifies the cookie on every API request and is the only one
that is authoritative; the guard, which re-asks only on a full load; and the error interceptor,
which reacts to the first feature call that gets a 401. Until the documents API exists, only the
reload path is live. The client state is a convenience; the server's 401 is the truth.

## Explain back

Provenance for this whole section: I asked Claude to write these answers. They are
**[Claude, at my request]**, not my own words, and they have not been checked against my own
understanding. My own attempt at the Predict question is in the Predict section.

1. When the page is reloaded, why does the guard have to wait for `/auth/me` before deciding,
   and what would happen if it did not?

   **[Claude, at my request]** A reload wipes the browser's memory, so the store starts as
   `unknown`, and script cannot read the `HttpOnly` cookie to find out whether a session exists.
   The only way to know who the user is, is to ask the server. If the guard decided before the
   answer it would have to guess: treating `unknown` as anonymous sends every signed-in user to
   the login page on every reload; treating it as signed in lets an anonymous visitor into the
   protected page until the server says otherwise. Waiting is the only correct option, and the
   store makes it cheap by asking at most once per page load. This was observed in a real
   browser: a full load of `/documents/42` made one call, `/api/auth/me`, and only then showed the
   page.

2. Why is the route guard only a UX affordance, and what actually protects the data?

   **[Claude, at my request]** The guard runs in the user's browser, which the user controls:
   with devtools they can edit the store, skip the guard or call the API directly, so nothing it
   decides can be a security boundary. It also loads no data, so it cannot know whether the user
   owns document 42. What protects the data is the API, which checks the cookie on every request
   (401 without a valid session) and filters every query by the owner (404 for someone else's
   row, as built in Phases 1 and 2). The guard only chooses which page to show. The failure drill
   showed the same thing from the other side: with the session dead on the server, the screen
   still showed the shell and the user's name until a reload, so the client's view is a
   convenience and the server's answer is the truth.

3. Why must the 401 interceptor skip `/auth/*` calls, and what is the unvalidated `returnUrl`
   attack?

   **[Claude, at my request]** A 401 from `/auth/login` means "wrong password": it is a form
   error the login screen must show. A 401 from `/auth/me` is the normal answer to "am I signed
   in?" while the session is being restored. If the interceptor treated either as "the session
   expired" it would reset the store and redirect to the login page, which on a reload asks
   `/auth/me` again, gets 401 again and redirects again: a loop, and the form error would never
   be seen. So only a 401 from a feature call, made while the user was signed in, means a session
   ended. The `returnUrl` attack: `returnUrl` is read from the query string, so an attacker can
   send a link such as `/login?returnUrl=//evil.example`. If the app navigated to it after a
   successful login, a user who trusts this site would land on the attacker's page right after
   typing their password (an open redirect, a phishing helper). `safeReturnUrl` accepts only a
   path on this site, and checks it twice because browsers read `\` as `/` and drop tabs and
   newlines, so `/\evil.example` also means `//evil.example`. It was tested with those cases and
   confirmed in a real browser, where the login with `returnUrl=//evil.example` ended on the
   same origin.

## Where I was wrong

- My Predict answer had the order wrong (see the Predict section).
- The Angular guides use the pre-20 naming (`LoginComponent`, `login.component.ts`,
  `app.component.ts`, `standalone: true`). Angular 22's CLI generates `app.ts` with class `App`,
  standalone by default, no suffix. I follow the CLI's convention; the guides' behaviour is
  unchanged. Docs to correct in the Phase 12 truth pass.
- The scaffold was not strict (see "What I built"); the plan assumed it was.
- With `RouterTestingHarness`, `navigateByUrl(url, Type)` returns the OUTERMOST routed component,
  so for a page inside the shell the expected type is `Shell`, not the page. I got this wrong the
  first time (3 failing tests) and fixed the test, not the code.
- `tracks/angular/03` §4 shows an interceptor that redirects on every `AUTH_REQUIRED` outside
  `/auth/`. With two requests failing at different moments, the second one would read
  `router.url` as `/login?...` and redirect with `returnUrl=/login...`. I added the condition "the
  user was signed in" and a test for the late failure. The same section matches `/auth/` with
  `includes`; I use `startsWith(apiBase + '/auth/')`.
- The guides name `ensureResolved()` and `restore()` as two methods; one memoised `restore()` does
  both jobs.
- The plan's failure drill says to delete the cookie in devtools. An HttpOnly cookie cannot be
  deleted by script (that is its purpose), so I invalidated it by restarting the API with another
  secret. Its second step, "click a protected link", does not test the server at all, because the
  guard asks only once per page load; the drill therefore showed that the client's view can be
  stale until a reload or a failing feature call.
- `api-contract.md` returns `{ user }` from login and register but a bare user from `me`. The
  client's `AuthApi` unwraps one and not the other; a single shape would be simpler for a client.

## Open questions

- The session-expired redirect (the error interceptor) is covered by unit tests with a real router
  and store but has NOT been seen in a browser. It needs a feature call that can return 401: Phase 6.
- The "Create one" link on the login page does not carry `returnUrl` to the register page, so a
  visitor who registers after being bounced from `/documents/42` ends up on `/documents`.
- One throwaway user, `browser-check-ugqtac@example.com`, is left in the dev database.
- There are no global styles or design tokens yet; the screens use plain component styles.
- The UI is English only and left-to-right. The product's refusal sentence and many documents are
  Arabic; text direction (`dir="auto"`) must be decided for the chat in Phase 10.
- The explain-back answers and the failure drill's Why were written by Claude at my request (see
  the provenance notes). They record the correct reasoning, not my own understanding. The Predict
  answer was my own attempt and was wrong.

## Next phase readiness

- [x] Gate commands run and seen
- [x] Failure drill observed (a real browser; the cookie invalidated by rotating the API secret)
- [x] Explain-back filled (by Claude at my request, not verified as my own understanding)
- [x] Traceability updated (FR-05 and FR-27 name the real web tests)
- [x] Docs updated with anything that changed (angular/03 guard and interceptor snippets and
      verified-against line, angular README naming note, local-setup proxy; the other guides'
      snippets keep the old names, flagged in the README for the Phase 12 truth pass)
