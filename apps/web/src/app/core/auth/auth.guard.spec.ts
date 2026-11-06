import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { UserSummary } from '@smartdocs/contracts';
import { Observable, of, throwError } from 'rxjs';
import { AuthApi } from './auth.api';
import { authGuard } from './auth.guard';
import { AuthStore } from './auth.store';

const USER: UserSummary = {
  id: 'u1',
  name: 'Sara Ahmed',
  email: 'sara@example.com',
  createdAt: '2026-10-31T00:00:00.000Z',
};

const route = {} as ActivatedRouteSnapshot;
const stateFor = (url: string) => ({ url }) as RouterStateSnapshot;

describe('authGuard (store replaced by a stand-in)', () => {
  const signedIn = signal(false);
  let restoreCalls: number;
  let finishRestore: () => void;
  let restoring: Promise<void>;

  beforeEach(() => {
    signedIn.set(false);
    restoreCalls = 0;
    restoring = Promise.resolve();
    finishRestore = () => undefined;

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthStore,
          useValue: {
            restore: () => {
              restoreCalls++;
              return restoring;
            },
            isAuthenticated: signedIn,
          },
        },
      ],
    });
  });

  const run = (url: string) =>
    TestBed.runInInjectionContext(() => authGuard(route, stateFor(url))) as Promise<
      boolean | UrlTree
    >;

  const serialized = (result: boolean | UrlTree) =>
    TestBed.inject(Router).serializeUrl(result as UrlTree);

  it('lets an authenticated user through', async () => {
    signedIn.set(true);

    expect(await run('/documents')).toBe(true);
  });

  it('sends an anonymous user to /login and remembers the page they wanted', async () => {
    const result = await run('/documents/42');

    expect(result).toBeInstanceOf(UrlTree);
    expect(serialized(result)).toBe('/login?returnUrl=%2Fdocuments%2F42');
  });

  it('keeps the query string and fragment of the wanted page', async () => {
    const result = await run('/documents/42?tab=text#top');

    expect(serialized(result)).toBe('/login?returnUrl=%2Fdocuments%2F42%3Ftab%3Dtext%23top');
  });

  it('waits for the server to say who the user is before deciding', async () => {
    restoring = new Promise<void>((resolve) => (finishRestore = resolve));
    const decision = run('/documents');

    // While /auth/me is still in flight nothing is decided: it must not bounce a signed-in user.
    const early = await Promise.race([decision, Promise.resolve('still waiting')]);
    expect(early).toBe('still waiting');

    signedIn.set(true); // the answer arrives: the session is valid
    finishRestore();

    expect(await decision).toBe(true);
  });

  it('asks the store to restore the session on every run (the store is what limits it to once)', async () => {
    await run('/documents');
    await run('/documents/42');

    expect(restoreCalls).toBe(2);
  });
});

/** Records what happens and in which order, to show the sequence on a page reload. */
const events: string[] = [];

@Component({ template: '' })
class SecretPage {
  constructor() {
    events.push('component created');
  }
}

@Component({ template: '' })
class LoginPage {
  constructor() {
    events.push('login page created');
  }
}

class RecordingAuthApi {
  meCalls = 0;
  signedIn = true;

  me(): Observable<UserSummary> {
    events.push('GET /auth/me');
    this.meCalls++;
    return this.signedIn
      ? of(USER)
      : throwError(() => new HttpErrorResponse({ status: 401, error: { code: 'AUTH_REQUIRED' } }));
  }
}

describe('authGuard on a page reload (real store, real router)', () => {
  let api: RecordingAuthApi;
  let harness: RouterTestingHarness;

  const recordingGuard: CanActivateFn = (activated, state) => {
    events.push('guard runs');
    return TestBed.runInInjectionContext(() => authGuard(activated, state));
  };

  beforeEach(async () => {
    events.length = 0;
    api = new RecordingAuthApi();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'login', component: LoginPage },
          { path: 'secret', canActivate: [recordingGuard], component: SecretPage },
        ]),
        { provide: AuthApi, useValue: api },
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  it('signed in: the guard runs, then /auth/me, then the page is created', async () => {
    await harness.navigateByUrl('/secret', SecretPage);

    expect(events).toEqual(['guard runs', 'GET /auth/me', 'component created']);
    expect(TestBed.inject(Router).url).toBe('/secret');
  });

  it('signed out: the guard runs, then /auth/me, then the login page; the protected page is never created', async () => {
    api.signedIn = false;

    await harness.navigateByUrl('/secret', LoginPage);

    expect(events).toEqual(['guard runs', 'GET /auth/me', 'login page created']);
    expect(TestBed.inject(Router).url).toBe('/login?returnUrl=%2Fsecret');
  });

  it('asks the server only once per page load, however many protected pages are visited', async () => {
    await harness.navigateByUrl('/secret', SecretPage);
    await harness.navigateByUrl('/login', LoginPage);
    await harness.navigateByUrl('/secret', SecretPage);

    expect(api.meCalls).toBe(1);
    expect(TestBed.inject(AuthStore).status()).toBe('authenticated');
  });
});
