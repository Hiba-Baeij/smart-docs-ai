import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { UserSummary } from '@smartdocs/contracts';
import { AuthStore } from '../auth/auth.store';
import { AppError } from '../http/app-error';
import { LocaleService } from '../i18n/locale.service';
import { Shell } from './shell';

const USER: UserSummary = {
  id: 'u1',
  name: 'Sara Ahmed',
  email: 'sara@example.com',
  createdAt: '2026-10-31T00:00:00.000Z',
};

@Component({ template: '<h1>a protected page</h1>' })
class PageStub {}

@Component({ template: 'the login page' })
class LoginStub {}

/** Stands in for the store: a controllable user, and a sign-out the test can make fail or wait. */
class FakeAuthStore {
  readonly user = signal<UserSummary | null>(USER);
  logoutCalls = 0;
  outcome: () => Promise<void> = () => Promise.resolve();

  logout(): Promise<void> {
    this.logoutCalls++;
    return this.outcome();
  }
}

describe('Shell', () => {
  afterEach(() => {
    localStorage.removeItem('smartdocs.locale');
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
  });
  let store: FakeAuthStore;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    store = new FakeAuthStore();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'login', component: LoginStub },
          { path: '', component: Shell, children: [{ path: 'documents', component: PageStub }] },
        ]),
        { provide: AuthStore, useValue: store },
      ],
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/documents', Shell);
  });

  const root = () => harness.routeNativeElement as HTMLElement;
  const q = <T extends HTMLElement>(selector: string) => root().querySelector<T>(selector);
  const button = () => q<HTMLButtonElement>('button.sign-out')!;
  const url = () => TestBed.inject(Router).url;

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  async function clickSignOut(): Promise<void> {
    button().click();
    await settle();
  }

  const rejectWith = (error: unknown) => () => Promise.reject(error);

  describe('the header', () => {
    it('switches navigation copy and direction to Arabic', () => {
      TestBed.inject(LocaleService).set('ar');
      harness.detectChanges();
      expect(q('nav')?.textContent).toContain('المستندات');
      expect(button().textContent).toContain('تسجيل الخروج');
      expect(document.documentElement.dir).toBe('rtl');
    });
    it('shows the signed-in user and a Sign out button, around the page', () => {
      expect(q('.user-name')?.textContent).toBe('Sara Ahmed');
      expect(button().textContent).toContain('Sign out');
      expect(q('main')?.textContent).toContain('a protected page');
    });

    it('shows no name when there is no user, but still offers Sign out', () => {
      store.user.set(null);
      harness.detectChanges();

      expect(q('.user-name')).toBeNull();
      expect(button()).not.toBeNull();
    });

    it('shows a name that contains HTML as plain text, never as markup', () => {
      store.user.set({ ...USER, name: '<img src=x onerror="alert(1)">' });
      harness.detectChanges();

      expect(q('.user-name')?.textContent).toBe('<img src=x onerror="alert(1)">');
      expect(q('.shell-header img')).toBeNull();
    });
  });

  describe('Sign out', () => {
    it('tells the server once and goes to the login page', async () => {
      await clickSignOut();

      expect(store.logoutCalls).toBe(1);
      expect(url()).toBe('/login');
    });

    it('disables the button while it works, so a double click sends one request', async () => {
      let finish: () => void = () => undefined;
      store.outcome = () => new Promise<void>((resolve) => (finish = resolve));

      button().click();
      await settle();
      expect(button().disabled).toBe(true);

      button().click(); // ignored: the button is disabled and the handler also guards
      await settle();
      expect(store.logoutCalls).toBe(1);

      finish();
      await settle();
      expect(url()).toBe('/login');
    });

    it('treats "already signed out" (401) as a normal sign-out, with no warning', async () => {
      store.outcome = rejectWith(new AppError('AUTH_REQUIRED', 'Authentication required.', 401));

      await clickSignOut();

      expect(url()).toBe('/login');
    });

    it('still goes to the login page when the server cannot be reached, and says the session may be open', async () => {
      store.outcome = rejectWith(new AppError('NETWORK', 'Cannot reach the server.', 0));

      await clickSignOut();

      expect(url()).toBe('/login?reason=signout-failed');
    });

    it('does the same for an unexpected server error', async () => {
      store.outcome = rejectWith(new AppError('INTERNAL', 'Internal server error.', 500));

      await clickSignOut();

      expect(url()).toBe('/login?reason=signout-failed');
    });
  });
});
