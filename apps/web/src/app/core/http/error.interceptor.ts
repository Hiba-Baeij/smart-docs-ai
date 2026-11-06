import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthStore } from '../auth/auth.store';
import { API_BASE_URL } from '../config/api-base';
import { toAppError } from './app-error';

/**
 * Turns every failed API call into an `AppError` and handles one cross-cutting case: a session
 * that ended while the user was working.
 *
 * Expiry: a `401 AUTH_REQUIRED` from a feature call means the session is over. The store forgets
 * the user and the browser goes to the login page, remembering where the user was. Components
 * still receive the error, so none of them needs to know about this.
 *
 * What it deliberately does NOT do:
 *  - touch `/auth/*` calls. A 401 from login is a form error ("wrong password"), and a 401 from
 *    `/auth/me` is the normal "not signed in" answer; redirecting on either would loop.
 *  - redirect unless the user was signed in. Two requests that fail together must produce one
 *    redirect, and an anonymous visitor has no session to lose.
 *  - decide any wording. That belongs to the screens.
 */
export const errorInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  const apiBase = inject(API_BASE_URL);

  return next(request).pipe(
    catchError((failure: unknown) => {
      // Only calls to our own API are interpreted; anything else is left exactly as it came.
      if (!request.url.startsWith(apiBase)) {
        return throwError(() => failure);
      }

      const error = toAppError(failure);
      const isAuthCall = request.url.startsWith(`${apiBase}/auth/`);

      if (error.code === 'AUTH_REQUIRED' && !isAuthCall && auth.status() === 'authenticated') {
        const returnUrl = router.url;
        auth.reset();
        void router.navigate(['/login'], { queryParams: { returnUrl, reason: 'expired' } });
      }

      return throwError(() => error);
    }),
  );
};
