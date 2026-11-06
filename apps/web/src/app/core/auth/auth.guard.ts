import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from './auth.store';

/**
 * Keeps anonymous visitors out of the protected pages.
 *
 * On a reload nothing is known about the user yet (the cookie is HttpOnly), so the guard first
 * waits for the store to ask the server who the user is, and only then decides. Deciding earlier
 * would send every signed-in user to the login page on every reload. The store asks at most once
 * per page load, so this does not hammer the API.
 *
 * This is a UX affordance, not security: the API enforces authentication and ownership on every
 * request, and a guard cannot know whether the user owns document 42 because it loads no data.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  await auth.restore();

  return auth.isAuthenticated()
    ? true
    : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
