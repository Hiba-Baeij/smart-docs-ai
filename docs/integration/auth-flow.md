# Auth Flow

Status: reviewed
Related: FR-01…FR-05, FR-26, ADR-002, ADR-013
Verified against: `apps/api/src/auth`, `apps/web/src/app/core/auth`, and the Phase 12 browser journey, 2026-11-02

## 1. Registration

```
Angular                         Nest                         PostgreSQL
  form submit
  POST /auth/register  ────────►
                                 validate DTO
                                 normalise email (lowercase, trim)
                                 bcrypt.hash(password, 12)
                                 INSERT user ────────────────►
                                 SELECT user (safe fields)
  ◄──────── 201 { user }
  navigate /login?registered=1
```

The client does not log in automatically after registration in v1. One extra step keeps
the two flows independently testable.

## 2. Login

```
POST /auth/login { email, password }
  → find user by normalised email
  → if none: bcrypt.compare against a dummy hash   ← constant-ish time
  → if mismatch: 401 AUTH_INVALID_CREDENTIALS
  → sign JWT { sub: user.id, iat, exp: +1h }
  → Set-Cookie: sid=<jwt>; HttpOnly; SameSite=Lax; Path=/; Secure in prod
  → 200 { user }
```

Details that matter:

- Comparing against a dummy hash when the user does not exist avoids a timing oracle.
- The same error code and message for both failure kinds.
- `sub` carries only the user id. No email, no role.
- The client stores the user object, never the token.

## 3. Session restore (page reload)

```
app bootstrap
  → AuthStore.restore()
  → GET /auth/me (withCredentials)
      ├─ 200 → status='authenticated', user set
      └─ 401 → status='anonymous'
  → router waits for the first restore before activating guarded routes
```

A guard that calls `/auth/me` on every navigation would hammer the API. The guard invokes
`AuthStore.restore()` on each protected navigation, and the store shares one session probe
per page load. After login or logout, the guard reads the updated local status.

## 4. Guard behaviour

```ts
// illustrative
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.restore();
  return auth.isAuthenticated()
    ? true
    : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
```

- Unauthenticated → `/login?returnUrl=/documents/42`.
- After login, navigate to `returnUrl` if it is an internal path, otherwise `/documents`.
- Never trust `returnUrl` for an external redirect; validate it starts with `/`.

## 5. Authenticated requests

`withCredentials: true` on every API call, set once in an interceptor or in the API base
service. No `Authorization` header is ever constructed.

## 6. Expiry and 401

```
any request → 401 AUTH_REQUIRED
  → interceptor clears AuthStore
  → redirect to /login?returnUrl=<current path>
  → show "your session expired, please sign in again"
```

The interceptor must not loop: `/auth/login` and `/auth/me` failures during restore are
handled by their callers, not by the global redirect.

## 7. Logout

```
POST /auth/logout → 204 (cookie cleared server-side)
  → AuthStore.reset()
  → router.navigate(['/login'])
```

Clearing client state alone is insufficient because the cookie is `HttpOnly`; only the
server can remove it.

## 8. What the frontend guard is and is not

The route guard is a **UX affordance**. Authorization is enforced by the API on every
request. A user who manipulates the client still receives 401 or 404 from the server.
This is stated in the PRD and tested in the ownership matrix.

## 9. Failure matrix

| Scenario | Server | Client |
|---|---|---|
| No cookie | 401 `AUTH_REQUIRED` | redirect to login |
| Expired token | 401 | redirect with "session expired" |
| Tampered signature | 401 | redirect |
| Valid token, foreign document id | 404 | not-found state, no data rendered |
| Login with wrong password | 401 `AUTH_INVALID_CREDENTIALS` | inline form error |
| Register with existing email | 409 `AUTH_EMAIL_TAKEN` | inline field error |
| Rate limited | 429 | temporary message, retry later |
| Server down | network error | "cannot reach the server", retry button |
