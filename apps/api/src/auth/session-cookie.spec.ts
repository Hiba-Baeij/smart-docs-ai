import {
  SESSION_COOKIE_NAME,
  clearSessionCookieOptions,
  sessionCookieOptions,
} from './session-cookie';

describe('session cookie options', () => {
  it('uses the name "sid"', () => {
    expect(SESSION_COOKIE_NAME).toBe('sid');
  });

  it.each([true, false])(
    'passes secure=%s through to both setting and clearing',
    (secure) => {
      expect(sessionCookieOptions(secure, 1000).secure).toBe(secure);
      expect(clearSessionCookieOptions(secure).secure).toBe(secure);
    },
  );

  it('always sets HttpOnly, SameSite=Lax and Path=/', () => {
    for (const options of [
      sessionCookieOptions(false, 1000),
      sessionCookieOptions(true, 1000),
      clearSessionCookieOptions(false),
      clearSessionCookieOptions(true),
    ]) {
      expect(options).toMatchObject({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });
    }
  });

  it('gives the clearing options exactly the setting options minus maxAge', () => {
    // A cookie is only removed if the clearing header matches the one that set it, so the
    // two must never drift apart.
    for (const secure of [true, false]) {
      const { maxAge, ...settingWithoutMaxAge } = sessionCookieOptions(
        secure,
        3_600_000,
      );

      expect(maxAge).toBe(3_600_000);
      expect(clearSessionCookieOptions(secure)).toEqual(settingWithoutMaxAge);
    }
  });
});
