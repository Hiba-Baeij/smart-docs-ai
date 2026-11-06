import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router, provideRouter } from '@angular/router';
import type { ApiError, ErrorCode, UserSummary } from '@smartdocs/contracts';
import { Observable, of } from 'rxjs';
import { AuthApi } from '../auth/auth.api';
import { AuthStore } from '../auth/auth.store';
import { AppError } from './app-error';
import { errorInterceptor } from './error.interceptor';

const USER: UserSummary = {
  id: 'u1',
  name: 'Sara Ahmed',
  email: 'sara@example.com',
  createdAt: '2026-10-31T00:00:00.000Z',
};

@Component({ template: '' })
class Blank {}

class FakeAuthApi {
  login(): Observable<UserSummary> {
    return of(USER);
  }
}

const envelope = (
  code: ErrorCode,
  statusCode: number,
  extra: Partial<ApiError> = {},
): ApiError => ({
  statusCode,
  code,
  message: 'a message from the server',
  details: null,
  requestId: 'req-1',
  timestamp: '2026-10-31T00:00:00.000Z',
  path: '/api/anything',
  ...extra,
});

describe('errorInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let router: Router;
  let auth: AuthStore;
  let navigations: string[];

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'login', component: Blank },
          { path: '**', component: Blank },
        ]),
        { provide: AuthApi, useClass: FakeAuthApi },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    auth = TestBed.inject(AuthStore);

    await router.navigateByUrl('/documents/42?tab=text'); // where the user is working
    navigations = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) navigations.push(event.urlAfterRedirects);
    });
  });

  afterEach(() => backend.verify());

  const signIn = () => auth.login({ email: USER.email, password: 'a long password' });

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await TestBed.inject(ApplicationRef).whenStable();
  }

  /** Starts a request and records how it ends. */
  function call(url: string): { value?: unknown; error?: unknown } {
    const outcome: { value?: unknown; error?: unknown } = {};
    http.get(url).subscribe({
      next: (value) => (outcome.value = value),
      error: (error) => (outcome.error = error),
    });
    return outcome;
  }

  function fail(url: string, status: number, body: ApiError | string): void {
    backend.expectOne(url).flush(body, { status, statusText: 'error' });
  }

  describe('a session that ended (401 AUTH_REQUIRED on a feature call)', () => {
    it('forgets the user and goes to /login, remembering the page and saying why', async () => {
      await signIn();
      const outcome = call('/api/documents');

      fail('/api/documents', 401, envelope('AUTH_REQUIRED', 401));
      await settle();

      expect(auth.status()).toBe('anonymous');
      expect(auth.user()).toBeNull();
      expect(router.url).toBe('/login?returnUrl=%2Fdocuments%2F42%3Ftab%3Dtext&reason=expired');
      // The caller still receives the failure, as an AppError.
      expect(outcome.error).toBeInstanceOf(AppError);
      expect((outcome.error as AppError).code).toBe('AUTH_REQUIRED');
    });

    it('redirects once even when several requests fail together', async () => {
      await signIn();
      call('/api/documents');
      call('/api/conversations');
      call('/api/documents/42');

      fail('/api/documents', 401, envelope('AUTH_REQUIRED', 401));
      fail('/api/conversations', 401, envelope('AUTH_REQUIRED', 401));
      fail('/api/documents/42', 401, envelope('AUTH_REQUIRED', 401));
      await settle();

      expect(navigations).toHaveLength(1);
      expect(router.url).toContain('/login?returnUrl=%2Fdocuments%2F42');
      expect(router.url).not.toContain('returnUrl=%2Flogin');
    });

    it('does not redirect again, nor nest returnUrl, when a late failure arrives after the redirect', async () => {
      await signIn();
      call('/api/documents');
      call('/api/conversations');

      fail('/api/documents', 401, envelope('AUTH_REQUIRED', 401));
      await settle(); // the browser is now on the login page
      const afterFirst = router.url;

      // A slower request fails afterwards; router.url is now /login, which must not become a returnUrl.
      fail('/api/conversations', 401, envelope('AUTH_REQUIRED', 401));
      await settle();

      expect(navigations).toHaveLength(1);
      expect(router.url).toBe(afterFirst);
    });

    it('does nothing to a visitor who was never signed in', async () => {
      call('/api/documents');

      fail('/api/documents', 401, envelope('AUTH_REQUIRED', 401));
      await settle();

      expect(navigations).toHaveLength(0);
      expect(router.url).toBe('/documents/42?tab=text');
    });
  });

  describe('the /auth/* calls never redirect (this is what prevents a loop)', () => {
    it.each([
      ['login with the wrong password', '/api/auth/login', 'AUTH_INVALID_CREDENTIALS' as const],
      ['the session probe', '/api/auth/me', 'AUTH_REQUIRED' as const],
      ['logout without a session', '/api/auth/logout', 'AUTH_REQUIRED' as const],
    ])('%s', async (_label, url, code) => {
      await signIn();
      const outcome = call(url);

      fail(url, 401, envelope(code, 401));
      await settle();

      expect(navigations).toHaveLength(0);
      expect(auth.status()).toBe('authenticated'); // left for the caller to decide
      expect((outcome.error as AppError).code).toBe(code);
    });
  });

  describe('other failures are only translated', () => {
    it.each([
      ['a not-found answer', 404, envelope('DOCUMENT_NOT_FOUND', 404)],
      ['a rate limit', 429, envelope('RATE_LIMITED', 429)],
      ['a server error', 500, envelope('INTERNAL', 500)],
    ])('%s becomes an AppError and nobody is redirected', async (_label, status, body) => {
      await signIn();
      const outcome = call('/api/documents');

      fail('/api/documents', status, body);
      await settle();

      const error = outcome.error as AppError;
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe(body.code);
      expect(error.status).toBe(status);
      expect(error.requestId).toBe('req-1');
      expect(navigations).toHaveLength(0);
      expect(auth.status()).toBe('authenticated');
    });

    it('tells "the server did not answer" apart from "the server said no"', async () => {
      await signIn();
      const unreachable = call('/api/documents');
      const refused = call('/api/conversations');

      backend.expectOne('/api/documents').error(new ProgressEvent('error'), { status: 0 });
      fail(
        '/api/conversations',
        422,
        envelope('VALIDATION_FAILED', 422, { details: { x: ['bad'] } }),
      );
      await settle();

      expect((unreachable.error as AppError).code).toBe('NETWORK');
      expect((refused.error as AppError).code).toBe('VALIDATION_FAILED');
      expect((refused.error as AppError).details).toEqual({ x: ['bad'] });
      expect(navigations).toHaveLength(0);
    });

    it('an answer that is not the API envelope (a proxy error page) becomes UNKNOWN', async () => {
      const outcome = call('/api/documents');

      fail('/api/documents', 502, '<html>Bad Gateway</html>');
      await settle();

      const error = outcome.error as AppError;
      expect(error.code).toBe('UNKNOWN');
      expect(error.status).toBe(502);
      expect(error.message).not.toContain('Bad Gateway');
    });
  });

  describe('leaves everything else alone', () => {
    it('passes a successful response through unchanged', async () => {
      const outcome = call('/api/documents');

      backend.expectOne('/api/documents').flush({ items: [] });
      await settle();

      expect(outcome.value).toEqual({ items: [] });
      expect(outcome.error).toBeUndefined();
    });

    it('does not interpret failures of requests that are not to our API', async () => {
      await signIn();
      const outcome = call('https://example.com/data');

      fail('https://example.com/data', 401, envelope('AUTH_REQUIRED', 401));
      await settle();

      expect(outcome.error).toBeInstanceOf(HttpErrorResponse); // untouched, not an AppError
      expect(navigations).toHaveLength(0);
      expect(auth.status()).toBe('authenticated');
    });
  });
});
