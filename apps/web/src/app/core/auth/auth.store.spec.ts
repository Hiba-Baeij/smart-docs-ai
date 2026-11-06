import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { LoginRequest, UserSummary } from '@smartdocs/contracts';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AuthApi } from './auth.api';
import { AuthStore } from './auth.store';

const USER: UserSummary = {
  id: 'u1',
  name: 'Sara Ahmed',
  email: 'sara@example.com',
  createdAt: '2026-10-31T00:00:00.000Z',
};

const CREDENTIALS: LoginRequest = { email: 'sara@example.com', password: 'a long password' };

const unauthorized = () => new HttpErrorResponse({ status: 401, error: { code: 'AUTH_REQUIRED' } });
const networkDown = () => new HttpErrorResponse({ status: 0 });

/** A stand-in for the HTTP layer: each call is counted and its outcome is set by the test. */
class FakeAuthApi {
  meCalls = 0;
  logoutCalls = 0;
  me$: () => Observable<UserSummary> = () => of(USER);
  login$: () => Observable<UserSummary> = () => of(USER);
  logout$: () => Observable<void> = () => of(undefined);

  me(): Observable<UserSummary> {
    this.meCalls++;
    return this.me$();
  }
  login(): Observable<UserSummary> {
    return this.login$();
  }
  logout(): Observable<void> {
    this.logoutCalls++;
    return this.logout$();
  }
}

describe('AuthStore', () => {
  let api: FakeAuthApi;
  let store: AuthStore;

  beforeEach(() => {
    api = new FakeAuthApi();
    TestBed.configureTestingModule({ providers: [{ provide: AuthApi, useValue: api }] });
    store = TestBed.inject(AuthStore);
  });

  it('starts unknown, with no user', () => {
    expect(store.status()).toBe('unknown');
    expect(store.user()).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
  });

  describe('restore', () => {
    it('unknown -> authenticated when the server knows the session', async () => {
      await store.restore();

      expect(store.status()).toBe('authenticated');
      expect(store.user()).toEqual(USER);
      expect(store.isAuthenticated()).toBe(true);
    });

    it('unknown -> anonymous on 401', async () => {
      api.me$ = () => throwError(unauthorized);

      await store.restore();

      expect(store.status()).toBe('anonymous');
      expect(store.user()).toBeNull();
    });

    it('unknown -> anonymous, without throwing, when the server cannot be reached', async () => {
      api.me$ = () => throwError(networkDown);

      await expect(store.restore()).resolves.toBeUndefined();

      expect(store.status()).toBe('anonymous');
    });

    it('asks the server once, however many callers there are, and later ones too', async () => {
      await Promise.all([store.restore(), store.restore(), store.restore()]);
      await store.restore();

      expect(api.meCalls).toBe(1);
    });
  });

  describe('login', () => {
    it('anonymous -> authenticated with the returned user', async () => {
      api.me$ = () => throwError(unauthorized);
      await store.restore();

      await store.login(CREDENTIALS);

      expect(store.status()).toBe('authenticated');
      expect(store.user()).toEqual(USER);
    });

    it('rejects and leaves the state unchanged when the credentials are wrong', async () => {
      api.me$ = () => throwError(unauthorized);
      api.login$ = () => throwError(() => new HttpErrorResponse({ status: 401 }));
      await store.restore();

      await expect(store.login(CREDENTIALS)).rejects.toBeInstanceOf(HttpErrorResponse);

      expect(store.status()).toBe('anonymous');
      expect(store.user()).toBeNull();
    });
  });

  describe('logout', () => {
    it('authenticated -> anonymous, and the server is told', async () => {
      await store.restore();

      await store.logout();

      expect(store.status()).toBe('anonymous');
      expect(store.user()).toBeNull();
      expect(api.logoutCalls).toBe(1);
    });

    it('still clears the local state when the server cannot be reached, and reports the error', async () => {
      await store.restore();
      api.logout$ = () => throwError(networkDown);

      await expect(store.logout()).rejects.toBeInstanceOf(HttpErrorResponse);

      expect(store.status()).toBe('anonymous');
      expect(store.user()).toBeNull();
    });
  });

  describe('reset', () => {
    it('authenticated -> anonymous without calling the server', async () => {
      await store.restore();

      store.reset();

      expect(store.status()).toBe('anonymous');
      expect(store.user()).toBeNull();
      expect(api.logoutCalls).toBe(0);
    });
  });

  describe('a restore that is still in flight', () => {
    it('does not overwrite a login that finished first', async () => {
      const pending = new Subject<UserSummary>();
      api.me$ = () => pending;
      const restoring = store.restore(); // the request is open, status is still unknown

      await store.login(CREDENTIALS);
      expect(store.status()).toBe('authenticated');

      pending.error(unauthorized()); // the late answer says "no session"
      await restoring;

      expect(store.status()).toBe('authenticated');
      expect(store.user()).toEqual(USER);
    });
  });

  describe('the public surface', () => {
    it('exposes read-only signals: nothing outside the store can set the state', () => {
      expect('set' in store.status).toBe(false);
      expect('set' in store.user).toBe(false);
      expect('set' in store.isAuthenticated).toBe(false);
    });
  });
});
