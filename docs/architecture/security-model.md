# Security Model

Status: reviewed
Related: FR-26…FR-28, NFR-01…NFR-03, NFR-07, ADR-002, ADR-007, ADR-011, ADR-013
Verified against: Phase 11 threat checklist and security tests, 2026-11-02

## 1. Assets

| Asset | Impact if exposed |
|---|---|
| Document text and chunks | Confidential company content; the highest-value asset |
| Password hashes | Offline cracking; credential reuse elsewhere |
| Session token | Full account takeover for its lifetime |
| Provider API key | Financial loss, abuse, possible data exposure |
| Conversation history | Reveals what the company is investigating |

## 2. Actors and trust zones

| Zone | Trust |
|---|---|
| Browser | Untrusted. Can be modified; JS can be injected via XSS. |
| API | Trusted boundary. Enforces every rule. |
| Database | Trusted, private network only. |
| LLM provider | Untrusted third party. Receives only what the API chooses to send. |
| Uploaded file | Untrusted input. May be malformed, huge, or adversarial. |

## 3. Threats and controls

| # | Threat | Control | Verified by |
|---|---|---|---|
| T1 | Reading another user's document | Every query filtered by `uploadedBy` from the token; foreign ids → 404 | ownership matrix (Phase 7) |
| T2 | Forging a user id in a body or query | `userId` is never accepted from input; DTOs reject unknown fields | validation tests (Phase 2) |
| T3 | Token theft via XSS | `HttpOnly` cookie; no token in `localStorage`; Angular escapes by default; CSP later if needed | cookie flag test (Phase 2) |
| T4 | CSRF against cookie auth | `SameSite=Lax` + `Origin` check on state-changing requests; CORS allowlist | Phase 11 checklist |
| T5 | Password cracking | bcrypt cost 12, no plaintext, no password in logs or responses | Phase 2 |
| T6 | Malicious upload (wrong type, polyglot, zip bomb) | Extension + MIME + magic bytes + size + extracted-text cap; parse in memory, no disk | Phase 4 |
| T7 | Resource exhaustion via uploads or chat | Rate limits, size limit, 30 s extraction budget, provider timeout, token budget | Phase 11 |
| T8 | Prompt injection from document content | Delimiters, explicit rule, sentinel policy, injection fixtures | Phase 8 |
| T9 | Provider key leakage | Backend-only config; never in `environment.ts`; never logged | Phase 9 |
| T10 | Over-sharing with the provider | Only selected excerpts and recent history; evidence headers contain citation ids only, no automatic filename or user identity | Phase 11 |
| T11 | Secret leakage in logs | Central redaction: `authorization`, `cookie`, `password`, `apiKey`, request bodies | Phase 11 |
| T12 | Enumeration of other users' resources | 404 for foreign resources; login uses one response for unknown email and wrong password | Phase 7 |
| T13 | SQL injection | Prisma parameterisation; raw SQL only with bound parameters | Phase 5 |
| T14 | Stale session after logout | Cookie cleared server-side; short expiry | Phase 2 |

## 4. Authentication

- JWT signed with a secret from the environment; `HS256` is sufficient for a single
  service.
- Claims: `sub` (user id), `iat`, `exp`. No email, no name, no role in the token.
- Lifetime: 1 hour. No refresh token in v1; expiry means re-login.
- Transport: `HttpOnly`, `SameSite=Lax`, `Secure` in non-local environments.
- Logout: clear the cookie; the client drops its in-memory user.
- Passwords: bcrypt, cost 12. Registration and login return the same error code and
  message for "unknown email" and "wrong password".

## 5. Authorization rule

```
1. Guard proves identity.
2. Service loads the row with `WHERE id = :id AND <ownerColumn> = :userId`.
3. Zero rows → 404 RESOURCE_NOT_FOUND (specific code for the resource type).
```

There is no `403` for ownership failures, because a `403` confirms the row exists. The
only `403` in v1 is for a disallowed request origin at the HTTP edge.

### Ownership matrix (must be fully green before Phase 8 exits)

Automated in `apps/api/test/ownership.e2e-spec.ts`, parameterised with the victim's real ids
and checked at the HTTP boundary. The message route is present and covered there.

| Endpoint | Attacker input | Expected |
|---|---|---|
| `GET /documents/:id` | B's document id | 404 |
| `DELETE /documents/:id` | B's document id | 404 |
| `GET /documents` | — | only A's rows |
| `GET /conversations/:id/messages` | B's conversation id | 404 |
| `POST /conversations/:id/messages` | B's conversation id | 404, no message row |
| `DELETE /conversations/:id` | B's conversation id | 404 |
| any endpoint | no cookie | 401 |
| any endpoint | expired or tampered cookie | 401 |

## 6. Upload security

- Maximum size enforced by the multipart parser before full buffering.
- Allowlist, not denylist: `pdf`, `docx`, `xlsx` only.
- Magic bytes must agree with the declared type; a `.pdf` containing a ZIP signature is
  rejected.
- Parsers run on an in-memory buffer; nothing is written to disk, so there is no path
  traversal or public static directory to protect.
- Extraction output is capped (character limit) to prevent a decompression bomb from
  becoming an unbounded database row.
- Extracted text is never rendered as HTML by the client. Angular interpolation only.

## 7. AI-specific security

- Document text is untrusted data. The system prompt says so; the delimiters mark it;
  the tests prove it.
- The API does not automatically put user ids, email addresses or filenames in evidence
  headers. Citations are mapped to document names on the server after generation. User
  questions and recent history are still sent verbatim and may themselves mention filenames.
- No tool use, no code execution, no browsing in the provider call.
- Responses are treated as text, never as JSON to be executed or as HTML to be rendered.

### Data-handling note for the provider

Send the minimum: the question, the six excerpts, and the recent history. Do not log the
request body. Document, in the deployment README, which provider is configured and
whether it retains data for training; the choice is the operator's, and it must be
explicit rather than accidental.

### What prompting does and does not guarantee

The system reduces the chance of a fabricated answer. It does not guarantee factual
accuracy. The only hard guarantee is the sentinel path: when the model reports
insufficient evidence, the exact fallback is emitted by code. Tests assert the
mechanism, not a general claim of truthfulness.

## 8. Logging and observability

Allowed: `requestId`, method, path, status, duration, error code, user id (as an opaque
id, not email), document id.

Forbidden: passwords, tokens, cookies, provider keys, full document content, full prompts
and completions.

Redaction is centralised in the logger configuration and tested, because redaction
scattered across call sites is redaction that eventually misses one.

## 9. Rate limits

| Scope | Limit | Response |
|---|---|---|
| `POST /auth/login`, `/auth/register` | 5 / minute / IP | 429 `RATE_LIMITED` |
| `POST /documents/upload` | 10 / minute / user | 429 |
| `POST /conversations/:id/messages` | 20 / minute / user | 429 |
| Everything else | 120 / minute / user | 429 |

Limits are configuration, not constants, so they can be tuned without a code change.
The counters are process-local in v1; deployments with multiple API replicas need a shared
rate-limit store at the edge.

## 10. Out of scope for v1 (stated, not hidden)

- No CSRF token; `SameSite=Lax` plus `Origin` checking is the chosen trade-off.
- No 2FA, no email verification, no password reset.
- No encryption at rest beyond the database's own configuration.
- No audit trail of who read what.
- No secret rotation procedure.

Each is a real gap for a production system and is listed so nobody mistakes this design
for a complete security program.
