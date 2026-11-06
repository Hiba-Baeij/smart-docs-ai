import { InjectionToken } from '@angular/core';

/**
 * Where the API lives, as seen from the browser. It is a relative path on purpose: in
 * development the dev server proxies `/api` to the Nest process, and in production a reverse
 * proxy serves both from one origin. One origin means the session cookie is first-party
 * (SameSite=Lax works) and CORS is not involved. It holds no secret: the Angular bundle is public.
 *
 * Override it in a test with `{ provide: API_BASE_URL, useValue: '...' }`.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api',
});
