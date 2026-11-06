/**
 * Decides where to go after login. `returnUrl` arrives in the query string, so it is
 * attacker-controlled: a link such as `/login?returnUrl=//evil.example` would, if trusted, send a
 * freshly signed-in user to another site (an open redirect, a phishing helper).
 *
 * Only a path on THIS site is accepted. The check is two-stage because the string and the browser
 * can disagree: browsers read `\` as `/` and silently drop tabs and newlines, so `/\evil.example`
 * and `/<tab>/evil.example` both mean `//evil.example`. Parsing the value the way a browser does
 * and comparing the origin catches those.
 */
const PLACEHOLDER_ORIGIN = 'http://app.invalid';

export function safeReturnUrl(target: string | null | undefined, fallback = '/documents'): string {
  if (!target?.startsWith('/') || target.startsWith('//')) {
    return fallback;
  }

  try {
    if (new URL(target, PLACEHOLDER_ORIGIN).origin !== PLACEHOLDER_ORIGIN) {
      return fallback;
    }
  } catch {
    return fallback;
  }

  return target;
}
