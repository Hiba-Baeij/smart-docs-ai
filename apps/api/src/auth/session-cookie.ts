import type { CookieOptions } from 'express';

/** The session cookie carries the JWT and nothing else (ADR-002). */
export const SESSION_COOKIE_NAME = 'sid';

/**
 * Attributes shared by setting and clearing. A cookie is only cleared if the clearing
 * Set-Cookie uses the same name, path and flags as the one that was set, so both go through
 * this one function.
 *
 *  - httpOnly: injected script cannot read the token (the whole point of using a cookie).
 *  - sameSite lax: the CSRF mitigation; an Origin check on state-changing routes adds to it.
 *  - secure: off only for local plain HTTP.
 */
function baseCookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
  };
}

export function sessionCookieOptions(
  secure: boolean,
  maxAgeMs: number,
): CookieOptions {
  return { ...baseCookieOptions(secure), maxAge: maxAgeMs };
}

export function clearSessionCookieOptions(secure: boolean): CookieOptions {
  return baseCookieOptions(secure);
}
