# NestJS 03 — Authentication and Ownership

Status: reviewed
Related: FR-01…FR-05, FR-26, ADR-002, ADR-013
Verified against: cookie and JWT library APIs confirmed at Phase 2

## 1. Password handling

```ts
const hash = await bcrypt.hash(password, 12);
const ok = await bcrypt.compare(password, user.passwordHash);
```

- Cost 12 is a deliberate latency/security trade-off; measure login latency once and
  record it.
- bcrypt truncates at 72 bytes. The DTO caps password length at 128 characters and the UI
  states the effective limit, rather than pretending longer passwords help.
- Never log the password, the hash, or the comparison result.

## 2. Token issuance

```ts
const token = await this.jwt.signAsync(
  { sub: user.id },
  { secret: config.jwtSecret, expiresIn: config.jwtExpiresIn },
);
```

- `sub` only. No email, no role, nothing that goes stale.
- Signing secret comes from config; startup fails if it is missing or shorter than 32
  characters.

## 3. Cookie transport

```ts
response.cookie('sid', token, {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.cookieSecure,
  path: '/',
  maxAge: 60 * 60 * 1000,
});
```

- `httpOnly` is the whole point: XSS cannot read it.
- `sameSite: 'lax'` is the CSRF mitigation; state-changing endpoints additionally check
  `Origin` against the allowlist.
- `secure` is off only for local HTTP.
- Logout and failed login both clear the cookie with the same attributes.

## 4. The guard

```ts
@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.cookies?.sid;
    if (!token) throw new UnauthorizedError();
    try {
      const payload = await this.jwt.verifyAsync(token, { secret: this.config.jwtSecret });
      request.user = { id: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedError();
    }
  }
}
```

- The guard sets `request.user` with an id and nothing else.
- Any verification failure is `AUTH_REQUIRED`; the client cannot distinguish expired from
  tampered, which is intentional.
- `@CurrentUser()` is a parameter decorator that reads `request.user.id`. There is no
  other way to obtain a user id in a controller.

## 5. Ownership: the only pattern allowed

```ts
async findOwned(userId: string, id: string) {
  const document = await this.prisma.document.findFirst({
    where: { id, uploadedBy: userId },
    select: documentSelect,
  });
  if (!document) throw new ResourceNotFoundError('DOCUMENT');
  return document;
}
```

- `findFirst` with both conditions, not `findUnique` then compare in code. One query, no
  window in which a row is loaded and then rejected.
- Every read, update, and delete goes through an owned query. There is no "admin" path.
- The 404 decision is in ADR-013 and is tested by the ownership matrix.

### The pattern that must never appear

```ts
// FORBIDDEN
const userId = body.userId ?? request.user.id;
```

Client-supplied identity is not a fallback. It is a vulnerability.

## 6. Rate limiting

```ts
// AuthModule: one limiter named "default", limit and window read from config
ThrottlerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    throttlers: [{
      name: 'default',
      limit: config.getOrThrow<number>('AUTH_RATE_LIMIT'),   // 5
      ttl: config.getOrThrow<number>('AUTH_RATE_WINDOW_MS'), // 60000
    }],
  }),
});

// AuthController: a route opts in by using the guard
@Post('login')
@UseGuards(ThrottlerGuard)
```

- `@Throttle({...})` takes its values when the class is defined, so it cannot read config; a
  named limiter configured in the module can. Only routes that use `ThrottlerGuard` are limited.
- Counters are per route and kept in process memory (one server in v1): login and register each
  allow `AUTH_RATE_LIMIT` requests per window.
- The throttle key is IP for auth and user id for authenticated routes. A shared IP
  behind a proxy must be handled by trusting the proxy explicitly, not by trusting
  `X-Forwarded-For` blindly.
- 429 responses use the standard envelope with `RATE_LIMITED`.

## 7. Registration details that matter

- Normalise email: trim and lowercase before storing and before lookup. Two accounts
  differing only in case is a bug, not a feature.
- `AUTH_EMAIL_TAKEN` on conflict. This does reveal that an email is registered, which is
  an accepted trade-off for usability; it is documented, not accidental.
- Do not auto-login after registration in v1; it keeps the flows separately testable.

## 8. Tests that must exist before Phase 2 exits

| Test | Asserts |
|---|---|
| register with a valid body | 201, row exists, hash starts with `$2b$12$` |
| register with duplicate email | 409 `AUTH_EMAIL_TAKEN` |
| register with short password | 422 `VALIDATION_FAILED` with `details.password` |
| login with correct password | 200, `Set-Cookie` contains `HttpOnly` and `SameSite=Lax` |
| login with wrong password | 401 `AUTH_INVALID_CREDENTIALS` |
| login with unknown email | same body as wrong password |
| protected route without cookie | 401 `AUTH_REQUIRED` |
| protected route with tampered cookie | 401 |
| logout then protected route | 401 |
| 6th login in a minute | 429 `RATE_LIMITED` |
| `/auth/me` | no `passwordHash` in the body |

## 9. Question before moving on

> User B sends `GET /documents/<A's id>` with a valid cookie. Which query runs, what does
> it return, and which status code does the client see? Explain why not 403.
