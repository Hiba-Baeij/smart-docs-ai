# ADR-002: JWT in an httpOnly cookie, no refresh token in v1

Status: accepted
Date: 2026-10-23

## Context

The PRD requires JWT access tokens and forbids exposing secrets to Angular. A token has
to survive a page reload and must not be readable by injected JavaScript.

## Decision

- Issue a JWT signed with `HS256`, claims `sub`, `iat`, `exp`, lifetime 1 hour.
- Deliver it in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` outside localhost).
- No refresh token, no token in `localStorage` or `sessionStorage`.
- Logout clears the cookie server-side.
- Authenticated state on the client comes from `GET /auth/me`, not from decoding a token.

## Alternatives considered

- **Bearer token in `sessionStorage`.** Simple and familiar, but any XSS reads it.
  Rejected: the app renders user-supplied document text, so XSS is a realistic concern.
- **Bearer token in memory only.** Safest against persistence, but every reload logs the
  user out.
- **Refresh token with rotation.** Better UX and shorter access tokens, but adds
  revocation, storage, and reuse-detection design. Deferred.

## Consequences

- CORS must allow credentials with an explicit origin.
- CSRF becomes relevant; mitigated by `SameSite=Lax` plus an `Origin` check on
  state-changing requests. Documented as a trade-off in `security-model.md`.
- Angular must set `withCredentials`; the dev proxy should make the app same-origin.
- Session expiry is visible to the user; 401 handling redirects to login with
  `returnUrl`.
