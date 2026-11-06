# Phase 2 — Authentication API

Date started: 2026-10-30
Date finished: 2026-10-31
Time spent:

## Predict (written before building)

Question: which of these is a guard's job: rejecting a request with no cookie, or rejecting a
request for someone else's document? Why can it not be both?

Provenance: **[me]** is my own wording; **[Claude]** is what Claude corrected or added.

**[me]** The guard must handle both together.

**[Claude]** Wrong. The guard only authenticates: it rejects a request with no valid cookie
(who are you?). Ownership is the service's job (may you touch this resource?). The guard runs
before pipes and the controller and knows only the cookie, i.e. the caller's identity. It
does not know which row will be requested; only the service queries row 42, so only the
service can prove row 42 belongs to the caller. A guard that checked ownership would have to
know every resource type and query the database for each, duplicating every service.

## What I built

- Declared `@smartdocs/contracts` as a dependency of `apps/api` (first real import; linked
  offline, nothing downloaded). Root `lint` and `test` now build `contracts` first, because
  ESLint's typed rules and Jest read its `dist`.
- 2.1 Error infrastructure.
  `src/common/errors/app-error.ts`: `errorStatus` (a full `Record<ErrorCode, number>`, so a new
  code without a status does not compile), the `AppError` base (code, message, details,
  `statusCode`), and `ResourceNotFoundError(kind)`, `UnauthorizedError`, `ValidationFailedError`.
  `src/common/errors/all-exceptions.filter.ts`: one `@Catch()` filter that builds the envelope
  from contracts' `ApiError`; unexpected errors become `INTERNAL` with a generic message and the
  real error goes to the server log with the requestId; framework `HttpException`s are mapped by
  status (401, 404, 429, 400/422, 413, 415). `src/common/request-id.middleware.ts`: a server-
  generated UUID in `res.locals`, the `X-Request-Id` header and every error body.
  `configureApp()` registers both, so the e2e tests use the production setup.
  `test/errors.e2e-spec.ts` (7 tests, no database): an unexpected error gives `INTERNAL`, exactly
  the seven envelope keys and nothing from the original message or any stack; domain errors map to
  their codes; `details` only on `VALIDATION_FAILED`; unknown route gives `NOT_FOUND` without
  echoing the URL; the requestId is generated server-side and a client-supplied one is ignored;
  `path` has no query string.
  Checks: e2e 18/18, lint (no warnings), typecheck, build, unit tests all pass. Mutation check: with
  the filter changed to return `exception.message`, the "nothing from the original error" test
  failed showing `"message": "boom: SELECT secret ..."`; reverted and re-verified green.
- 2.2 Users service. `UserSummary` added to contracts (`id`, `name`, `email`, `createdAt`; the only
  shape a user leaves the API in) and `EmailTakenError` (`AUTH_EMAIL_TAKEN`, 409).
  `src/users/email.ts`: `normalizeEmail` (trim + lowercase) with 5 unit tests.
  `src/users/users.service.ts` + `users.module.ts`: `create` normalises the email and relies on the
  database's unique constraint (Prisma `P2002`) to raise `EmailTakenError`, so there is no
  look-up-then-insert window; `findById` and `findCredentialsByEmail` (the only method that
  returns the hash, for login). Every normal query uses one `select` without `passwordHash`, and a
  single `toUserSummary` shapes the output.
  `test/users.e2e-spec.ts` (7 tests, real database): normalised storage and exactly the four safe
  keys; a duplicate that differs only in case or padding is rejected; of two simultaneous
  registrations exactly one succeeds; lookup by any spelling; unknown email and id give null; the
  hash never appears in `findById`.
  `createPrismaTestModule` now accepts extra imports.
  Checks: unit 6/6, e2e 25/25, lint, typecheck, build pass. Mutation check: with normalisation
  removed from `create`, 3 tests failed (stored in mixed case, the duplicate was accepted, both
  racing registrations succeeded); restored and re-verified.
  Note on the Phase 1 open question: `findById` uses `findUnique` on the id from the verified
  token. That is fine because the id is the caller's own identity, not client input, and a user
  has no owner column. Ownership-checked resources (documents, conversations) must still use
  `findFirst({ where: { id, uploadedBy } })`.
- 2.3 Register. Installed `class-validator` 0.15.1 and `class-transformer` 0.5.1 (exact).
  `configureApp` now registers a global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`,
  `transform`, rejected values excluded) whose `exceptionFactory` builds a `ValidationFailedError`
  from `toValidationDetails` (`src/common/validation/validation-details.ts`, 4 unit tests): field
  path -> messages, never the rejected value. `src/auth/`: `RegisterDto` (name trimmed, 1-100;
  email trimmed, valid, max 254; password 10-128 and never trimmed), `password.ts`
  (`BCRYPT_COST = 12`, `hashPassword`), `AuthService.register`, `AuthController`
  (`POST /api/auth/register` -> 201 `{ user }`), `AuthModule` in `AppModule`.
  `test/auth-register.e2e-spec.ts` (10 tests, full app, real database): 201 with exactly
  `{ user: { id, name, email, createdAt } }`, no password or hash anywhere in the response; the
  stored hash starts with `$2b$12$` and matches the password; email normalised; duplicate email in
  another case gives 409 `AUTH_EMAIL_TAKEN`; 9 characters rejected, 10 and 128 accepted, 129
  rejected; invalid email; all missing fields reported at once; blank name; unknown fields (`id`,
  `userId`) rejected and nothing created; malformed JSON gives the standard envelope.
  Checks: unit 10/10, e2e 35/35, lint, typecheck, build pass. Mutation checks, one guarantee each:
  cost 12 -> 10 failed the hash-prefix test; `forbidNonWhitelisted: false` failed the unknown-field
  test; `MinLength(6)` failed the short-password test; all restored.
  Measured: one `bcrypt.hashSync` at cost 12 took about 420 ms on this machine (task 1.4 check).
  Open concern (documented in the guide, not changed): bcrypt truncates at 72 bytes, so the DTO's
  128-character cap is looser than the effective limit, especially for multi-byte characters. The UI
  must state it.
- 2.4 Login. Installed `@nestjs/jwt` 12.0.3, `cookie-parser` 1.4.7 and `@types/cookie-parser`
  1.4.10 (exact; `cookie-parser` is registered in task 2.5, where the guard needs it).
  `src/auth/password.ts`: `verifyPassword` and `DUMMY_HASH` (a real cost-12 hash of 32 random bytes
  nobody knows). `LoginDto` (email trimmed and valid; password non-empty, max 128, no minimum so
  login does not reveal the registration policy). `InvalidCredentialsError`
  (`AUTH_INVALID_CREDENTIALS`, 401). `AuthService.login`: look up by normalised email, ALWAYS run one
  bcrypt comparison (against `DUMMY_HASH` when the user is unknown), throw the same error for both
  failures, sign `{ sub }` with HS256, and return the token's lifetime computed from `exp - iat`.
  `src/auth/session-cookie.ts`: cookie name `sid` and one `baseCookieOptions` (HttpOnly, SameSite
  Lax, Path `/`, `secure` from config) shared by setting and clearing, so the two cannot drift.
  `AuthController`: `POST /api/auth/login` -> 200 `{ user }` plus the cookie, token never in the body;
  a failed login clears any existing `sid` with the same attributes. `JwtModule.registerAsync` reads
  `JWT_SECRET` and `JWT_EXPIRES_IN` from the validated config.
  `test/auth-login.e2e-spec.ts` (9 tests, full app, real database): 200 with exactly `{ user }` and
  the token only in the cookie; `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=3600`, no `Secure` locally;
  claims are exactly `sub`, `iat`, `exp` with `sub` = user id, `exp - iat = 3600`, `alg` HS256, and the
  signature verifies; any case/spacing of the email works; wrong password and unknown email give 401
  bodies identical apart from `requestId` and `timestamp`; a failed login sends `sid=;` with an
  epoch `Expires` and the same flags; an unknown email takes more than 100 ms (the dummy comparison
  runs); missing fields, an empty password and unknown fields give 422.
  Checks: e2e 44/44, unit 10/10, lint, typecheck, build pass. Mutation checks, four guarantees: no
  dummy comparison, `httpOnly: false`, the token returned in the body, and a different error for an
  unknown email. Exactly 5 tests failed (`httpOnly` breaks both the set-cookie and the clear-cookie
  test because they share one options function); all restored.
- 2.5 Guard and `@CurrentUser()`. `cookie-parser` registered in `configureApp`.
  `src/auth/jwt-auth.guard.ts`: reads the `sid` cookie, verifies with `algorithms: ['HS256']`
  pinned, requires a non-empty string `sub`, sets `request.user = { id }` and nothing else; every
  failure is the same `UnauthorizedError` (`AUTH_REQUIRED`). `src/auth/current-user.decorator.ts`:
  `@CurrentUser()` returns the verified id and FAILS CLOSED (throws `AUTH_REQUIRED`) on a route with
  no guard. `src/auth/authenticated-user.ts` holds the types. `AuthModule` now exports
  `JwtAuthGuard` and `JwtModule`; feature modules import `AuthModule` and use `@UseGuards`.
  `test/auth-guard.e2e-spec.ts` (14 tests, full app, a test-only controller): a valid cookie works,
  also one issued by a real login; each of no cookie, empty value, a non-JWT, a tampered payload with
  the old signature, a token signed with another secret, an expired token, an HS512 token with the
  right secret, an `alg: none` token, and a signed token without `sub` gives 401 `AUTH_REQUIRED`; all
  of those bodies are identical apart from `requestId` and `timestamp`; a valid token in an
  `Authorization` header is not accepted; `@CurrentUser()` without a guard gives 401 even with a
  valid cookie.
  Checks: e2e 58/58, unit 10/10, lint, typecheck, build pass. Mutation checks: no algorithm pin,
  no `sub` check, and a decorator that returns a default instead of failing: exactly 4 tests failed
  (HS512, no subject, "failures indistinguishable", "fails closed"); restored. Note: the `alg: none`
  case did NOT fail without the pin, because `jsonwebtoken` rejects `none` by default; the pin
  protects against switching between HMAC algorithms, not against `none`.
  Design note: guards are applied explicitly with `@UseGuards(JwtAuthGuard)` (as the guide shows),
  so a forgotten guard leaves a route open. `@CurrentUser()` failing closed limits that for any
  route that needs an identity, and the Phase 7 ownership matrix calls every endpoint without a
  cookie. A global guard with an opt-out `@Public()` would make the safe behaviour the default; it
  is a possible later hardening, not done here.
- 2.6 Logout and me. `POST /api/auth/logout` (guarded): 204, empty body, removes `sid` with the same
  attributes it was set with. `GET /api/auth/me` (guarded): the flat profile `{ id, name, email,
  createdAt }` exactly as api-contract.md specifies (note: login returns `{ user }` but `me` is flat).
  `AuthService.me` treats a valid token whose user no longer exists as `AUTH_REQUIRED`, not a
  crash and not 404. `src/auth/clear-session-cookie.filter.ts`: a route-level exception filter on
  `AuthController` that, for any `UnauthorizedError`, also clears the `sid` cookie and then delegates
  to the shared `AllExceptionsFilter` for the body. It has to be a filter because a guard failure
  happens before any interceptor. So a stale or invalid cookie is removed on `me` and `logout`.
  `test/auth-session.e2e-spec.ts` (9 tests): with a cookie-keeping `agent` (like a browser), login,
  `me` 200, logout 204, then `me` 401; the flat profile has exactly four keys and no hash or
  password; `me` without a cookie, with an invalid cookie, and for a deleted user is 401 and clears
  the cookie; logout is 204 with an empty body and a cleared cookie, and 401 plus a cleared cookie
  without a session; `GET /logout` is 404. One test documents a limitation on purpose: a token copied
  before logout still authenticates until it expires, because sessions are stateless and v1 has no
  revocation list (ADR-002; the one-hour lifetime is the mitigation).
  Checks: e2e 67/67, unit 10/10, lint, typecheck, build pass. Mutation checks: logout that does not
  clear, a `me` that leaks a `passwordHash` field, no clear-cookie filter, and a `me` that returns
  `null` for a deleted user. Exactly 7 tests failed and 2 passed as predicted; restored.
- 2.7 Rate limiting. Installed `@nestjs/throttler` 6.7.1 (exact). New config `AUTH_RATE_LIMIT`
  (default 5) and `AUTH_RATE_WINDOW_MS` (default 60000) in the Joi schema, `.env.example` and
  `ops/local-setup.md`. `AuthModule` configures one limiter named `default` (so the standard
  `Retry-After` header is used) from those values; `ThrottlerGuard` is applied only on `login` and
  `register`. The client is identified by the connection address: Express does not trust
  `X-Forwarded-For` unless `trust proxy` is set, and it is not set. Counters are per route and in
  process memory. `test/setup-env.ts` sets `AUTH_RATE_LIMIT=1000` for every spec;
  `test/rate-limit.e2e-spec.ts` imports `test/support/rate-limit-env.ts` FIRST (it sets 5 before
  `AppModule` loads, because configuration is validated at import) and builds a fresh app per test so
  each starts with empty counters.
  `test/rate-limit.e2e-spec.ts` (8 tests): five logins pass and the sixth is 429 `RATE_LIMITED` with
  the standard envelope; the correct password is also blocked after five failures and no cookie is
  issued; successful logins count too; register is limited the same way; `Retry-After` is an integer
  between 1 and 60; a forged `X-Forwarded-For` cannot reset the counter; counters are separate per
  route (a blocked login does not block register: a documented trade-off); health and `me` are
  never throttled.
  Checks: e2e 75/75, unit 10/10, lint, typecheck, build pass. Mutation checks, three groups: both
  guards removed (7 failed, 1 passed), the limit off by one (6 instead of 5: the same 7 failed), and
  `trust proxy` enabled (exactly one failed, the forged-header test); all restored.
  Mistakes of mine worth noting: a dynamic `import()` of `AppModule` did not type-check under
  `nodenext` (replaced by the import-order side-effect module above), and restoring the last
  mutation left one formatting error that `lint:fix` cleaned.
  Deployment note: behind a real reverse proxy, set `trust proxy` explicitly to the exact number of
  hops. Trusting the header blindly lets an attacker reset the limiter by changing it.
- 2.8 Secure cookie. `src/auth/session-cookie.spec.ts` (4 unit tests, 5 cases): `secure` passes
  through to both setting and clearing; HttpOnly, SameSite=Lax and Path=/ are always present; the
  clearing options are exactly the setting options minus `maxAge`. `test/cookie-secure.e2e-spec.ts`
  (4 tests; `test/support/cookie-secure-env.ts` sets `COOKIE_SECURE=true` before `AppModule` loads,
  the same first-import technique as the rate-limit spec): with `COOKIE_SECURE=true` the cookie is
  `Secure` (plus HttpOnly, SameSite=Lax, Path=/, Max-Age=3600) when issued at login, and the
  clearing cookie is `Secure` after a failed login, on logout, and when a stale session is rejected.
  Locally (`false`) the login spec already asserts there is no `Secure`.
  Checks: unit 15/15, e2e 79/79, lint, typecheck, build pass. Mutation checks: a clearing cookie that
  drops `Secure` failed 2 unit and 3 e2e tests (the login test still passed, as predicted); `Secure`
  never applied failed 1 unit and all 4 e2e tests; both restored. Why the clearing case matters: a
  browser will not remove a `Secure` cookie from a clearing header that lacks `Secure`.
  Not done on purpose (belongs to Phase 11, task 11.1): refusing to boot in production when
  `COOKIE_SECURE=false`.

## Gate output

```
npm run test:e2e -w apps/api
  Test Suites: 12 passed, 12 total
  Tests:       79 passed, 79 total

The Phase 2 test table in tracks/nestjs/03-auth-and-ownership.md §8 (all 11 rows exist and pass):
  register valid body, 201, row exists, hash `$2b$12$`   auth-register  "creates the user ..."
  register duplicate email, 409 AUTH_EMAIL_TAKEN          auth-register  "rejects a duplicate email ..."
  register short password, 422 with details.password      auth-register  "rejects a password shorter ..."
  login correct, HttpOnly and SameSite=Lax                auth-login     "sets the session cookie ..."
  login wrong password, 401 AUTH_INVALID_CREDENTIALS      auth-login     "answers a wrong password ..."
  login unknown email, same body                          auth-login     (same test, compared field by field)
  protected route without cookie, 401 AUTH_REQUIRED       auth-guard     "rejects no cookie at all"
  protected route with tampered cookie, 401               auth-guard     "rejects a tampered payload ..."
  logout then protected route, 401                        auth-session   "login, me, logout, then me is 401"
  6th login in a minute, 429 RATE_LIMITED                 rate-limit     "lets five logins through ..."
  /auth/me has no passwordHash                            auth-session   "returns the flat profile ..."

global gate
  npm run lint        exit 0 (no warnings)
  npm run typecheck   exit 0
  npm run test        api 15 passed; web 2 passed          exit 0
  npm run build       contracts, api (dist/main.js present), web        exit 0
```

## Failure drill

What I broke: ran the real built API twice against the dev database with two different
`JWT_SECRET` values (A, then B), reusing a session cookie issued under A. (Plan text: change the
secret while the server runs; a restart with a new secret is the same effect.)
What I expected: the old cookie stops working, with a 401 that looks like any other failure.
What actually happened: under secret A the cookie gave `GET /api/auth/me` 200 with the profile;
under secret B the same cookie gave 401 `AUTH_REQUIRED` "Authentication required."; back on A it
worked again (200); a copy tampered in its last three characters gave the identical 401 body. The
wrong-secret and tampered responses matched in status, code and message. No secret or token was
printed during the drill, and the environment variables were restored afterwards.
Why: **[Claude, to be replaced by my own words]** The guard only checks that the signature verifies
with the current secret and the token has not expired; it has no memory of tokens. A token signed
under another secret, an expired one and a forged one all fail the same check, and the guard
deliberately throws one error for all of them. The consequence is that rotating the secret logs
everybody out at once, and the client cannot tell why: it can only treat every 401 as "sign in
again", clear its user state and redirect to the login page with `returnUrl`.

## Explain back

Provenance for this whole section: I asked Claude to write these answers because I had already
answered the Predict question and been corrected, and did not want to answer again. They are
**[Claude, at my request]**, not my own words, and they have not been checked against my own
understanding. My own earlier attempt is in the Predict section.

1. Which of the two is the guard's job (no cookie, or someone else's document), and why can
   the guard not do both?

   **[Claude, at my request]** Rejecting a request with no valid cookie is the guard's job: it
   answers "who is calling?" from the session cookie alone. Rejecting a request for someone
   else's document is the service's job: "may this caller touch this row?". The guard cannot do
   both because it runs before pipes and the controller and knows only the caller's identity,
   never which row will be requested; only the service queries row 42, so only the service can
   prove row 42 belongs to the caller. A guard that checked ownership would have to know every
   resource type and query the database for each, duplicating every service.

2. User B sends `GET /documents/<A's id>` with a valid cookie. Which query runs, what does it
   return, and which status does the client see? Why not 403?

   **[Claude, at my request]** The guard accepts B's cookie and puts B's id in `request.user`.
   The service then runs `findFirst({ where: { id: <A's document id>, uploadedBy: <B's id> } })`.
   The owner is part of the query, so the row is never loaded for B: the result is `null`,
   exactly as for an id that does not exist at all. The service throws
   `ResourceNotFoundError('DOCUMENT')`, the exception filter maps it to 404 `DOCUMENT_NOT_FOUND`,
   and that is all the client sees. It is not 403 because a 403 would say "this exists but is not
   yours", confirming that the id is real and letting B probe for other users' documents; with
   404 an unknown id and someone else's id look identical (ADR-013). This is also why the owner
   is inside the query and not in an `if` after `findUnique`: the Phase 1 open question. A
   `findUnique` loads the row first and checks afterwards, so the check can be forgotten, skipped
   on one code path, or answer differently from "not found". Note: the documents endpoint does
   not exist yet (Phase 6); what Phase 2 built and tested is the machinery around it (the
   guard, `@CurrentUser()` and the `ResourceNotFoundError` to 404 mapping), and the Phase 7
   ownership matrix will test this exact request.

3. The client cannot tell an expired token from a tampered one. Why is that intentional, and
   what must the client do in both cases?

   **[Claude, at my request]** Every verification failure is the same 401 `AUTH_REQUIRED`
   with the same body (tested in `auth-guard.e2e-spec.ts`, and seen in the failure drill: a
   wrong-secret cookie and a tampered cookie produced identical responses). It is intentional
   because a more specific answer ("expired" versus "bad signature") tells an attacker how close
   a forgery came and what is worth trying next, while giving a legitimate client nothing it can
   act on differently. In both cases the client does the same thing: treat the session as over,
   clear its user state (`AuthStore`), redirect to `/login?returnUrl=<current path>` and show
   "your session expired, please sign in again". It must not loop: the redirect is skipped for
   `/auth/*` calls, which their callers handle themselves.

## Where I was wrong

- My Predict answer was wrong (I said the guard handles both authentication and ownership). The
  correction is in the Predict section.
- `docs/tracks/nestjs/03` §6 showed `@Throttle({ ... })` with fixed numbers. A decorator takes its
  values when the class is defined, so it cannot read configuration. Implemented a named limiter
  configured in `AuthModule` from `AUTH_RATE_LIMIT` and `AUTH_RATE_WINDOW_MS`; the guide is corrected.
- The plan's drill says to change the secret while the server runs. The secret is read once at
  start-up, so the equivalent (and what I did) is to restart with a different secret.
- I expected pinning `algorithms: ['HS256']` to block an `alg: none` token. The mutation test
  showed the library already rejects `none`; the pin protects against switching between HMAC
  algorithms (HS512 with the right secret).
- `api-contract.md` is inconsistent on purpose-or-accident: login returns `{ user }` but `me` is
  the flat user. I followed the contract; the Angular `AuthStore` must handle both shapes.
- Tooling slips of mine, all caught by the checks: a dynamic `import()` that did not type-check
  under `nodenext` (replaced by an import-order side-effect module); a log edit whose search text I
  rebuilt from memory and that failed; a formatting error left after restoring a mutation.
- bcrypt truncates at 72 bytes, so the DTO's 128-character cap is looser than the real limit.
  Left as the guide specifies; the UI must say so.

## Open questions

- Carried over from Phase 1: why the owner belongs inside the query (`findFirst` with
  `uploadedBy`) and not in an `if` after `findUnique`. It is now explained in Explain back 2, but
  that text was written by Claude; I have not yet shown that I can say it myself. The Phase 7
  ownership matrix is the place to test it for real.
- The explain-back answers and the failure drill's Why are Claude's, written at my request. They
  record the correct reasoning; they are not evidence of my own understanding.
- Decision left open: apply the guard globally with an opt-out `@Public()` instead of
  `@UseGuards` per route (see task 2.5). Revisit in Phase 11.
- Production should refuse to boot with `COOKIE_SECURE=false` (task 11.1).
- Behind a reverse proxy, set `trust proxy` explicitly before deploying.

## Next phase readiness

- [x] Gate commands run and seen
- [x] Failure drill observed (secret rotated under a live cookie; reason written by Claude)
- [x] Explain-back filled (by Claude at my request, not verified as my own understanding)
- [x] Traceability updated (FR-01 to FR-04 and NFR-02 now name the real test files)
- [x] Docs updated with anything that changed (nestjs/03, error-model, local-setup, .env.example)
