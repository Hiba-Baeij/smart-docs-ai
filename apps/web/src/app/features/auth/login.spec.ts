import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { ApiError, LoginRequest } from '@smartdocs/contracts';
import { AuthStore } from '../../core/auth/auth.store';
import { AppError } from '../../core/http/app-error';
import { LocaleService } from '../../core/i18n/locale.service';
import { Login } from './login';

@Component({ template: 'a page after login' })
class AnyPage {}

/** Stands in for the store: records the credentials and lets the test decide the outcome. */
class FakeAuthStore {
  calls: LoginRequest[] = [];
  outcome: () => Promise<void> = () => Promise.resolve();

  login(request: LoginRequest): Promise<void> {
    this.calls.push(request);
    return this.outcome();
  }
}

describe('Login', () => {
  afterEach(() => {
    localStorage.removeItem('smartdocs.locale');
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
  });
  let store: FakeAuthStore;
  let harness: RouterTestingHarness;

  beforeEach(() => {
    store = new FakeAuthStore();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'login', component: Login },
          { path: '**', component: AnyPage },
        ]),
        { provide: AuthStore, useValue: store },
      ],
    });
  });

  async function open(url = '/login'): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, Login);
  }

  const root = () => harness.routeNativeElement as HTMLElement;
  const q = <T extends HTMLElement>(selector: string) => root().querySelector<T>(selector);
  const email = () => q<HTMLInputElement>('#login-email')!;
  const password = () => q<HTMLInputElement>('#login-password')!;
  const button = () => q<HTMLButtonElement>('button[type="submit"]')!;
  const url = () => TestBed.inject(Router).url;

  function type(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  async function settle(): Promise<void> {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  async function submit(): Promise<void> {
    q<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await settle();
  }

  async function fillAndSubmit(): Promise<void> {
    type(email(), 'sara@example.com');
    type(password(), 'a long password');
    await submit();
  }

  const rejectWith = (error: unknown) => () => Promise.reject(error);

  it('has a labelled email field, a labelled password field and a submit button', async () => {
    await open();

    expect(q('label[for="login-email"]')?.textContent).toContain('Email');
    expect(email().type).toBe('email');
    expect(email().autocomplete).toBe('username');
    expect(q('label[for="login-password"]')?.textContent).toContain('Password');
    expect(password().type).toBe('password');
    expect(password().autocomplete).toBe('current-password');
    expect(button().textContent).toContain('Sign in');
  });

  it('shows Arabic labels after changing language on the page', async () => {
    await open();
    TestBed.inject(LocaleService).set('ar');
    harness.detectChanges();
    expect(q('h1')?.textContent).toContain('تسجيل الدخول');
    expect(q('label[for="login-email"]')?.textContent).toContain('البريد الإلكتروني');
    expect(button().textContent).toContain('تسجيل الدخول');
  });

  describe('validation', () => {
    it('does not send an empty form, says what is missing, and focuses the first problem', async () => {
      await open();

      await submit();

      expect(store.calls).toHaveLength(0);
      expect(root().textContent).toContain('Email is required.');
      expect(root().textContent).toContain('Password is required.');
      expect(email().getAttribute('aria-invalid')).toBe('true');
      expect(document.activeElement).toBe(email());
    });

    it('rejects a malformed email without calling the server', async () => {
      await open();
      type(email(), 'not-an-email');
      type(password(), 'a long password');

      await submit();

      expect(store.calls).toHaveLength(0);
      expect(root().textContent).toContain('Enter a valid email address.');
    });

    it('shows nothing before the user has touched anything', async () => {
      await open();

      expect(q('.field-error')).toBeNull();
      expect(email().getAttribute('aria-invalid')).toBeNull();
    });
  });

  describe('a successful sign-in', () => {
    it('sends what was typed and goes to /documents by default', async () => {
      await open();

      await fillAndSubmit();

      expect(store.calls).toEqual([{ email: 'sara@example.com', password: 'a long password' }]);
      expect(url()).toBe('/documents');
    });

    it('goes back to the page the user wanted (returnUrl)', async () => {
      await open('/login?returnUrl=%2Fdocuments%2F42');

      await fillAndSubmit();

      expect(url()).toBe('/documents/42');
    });

    it.each([
      ['a protocol-relative URL', '%2F%2Fevil.example'],
      ['an absolute URL', 'https%3A%2F%2Fevil.example'],
      ['a backslash trick', '%2F%5Cevil.example'],
    ])('ignores a malicious returnUrl: %s', async (_label, encoded) => {
      await open(`/login?returnUrl=${encoded}`);

      await fillAndSubmit();

      expect(url()).toBe('/documents');
    });

    it('tells a user who has just registered that the account exists', async () => {
      await open('/login?registered=1');

      expect(q('[role="status"]')?.textContent).toContain('Account created');
    });

    it('tells a user whose session ended why they are here, and still follows returnUrl', async () => {
      await open('/login?returnUrl=%2Fdocuments%2F42&reason=expired');

      expect(q('[role="status"]')?.textContent).toContain('Your session expired');

      await fillAndSubmit();

      expect(url()).toBe('/documents/42');
    });

    it('warns a user whose sign-out did not reach the server that the session may still be open', async () => {
      await open('/login?reason=signout-failed');

      expect(q('[role="alert"]')?.textContent).toContain('session may still be open');
    });

    it('shows no such notice otherwise', async () => {
      await open();

      expect(q('[role="status"]')).toBeNull();
    });
  });

  describe('failures', () => {
    it('wrong credentials: one generic message, the email is kept, the password is cleared and refocused', async () => {
      store.outcome = rejectWith(
        new AppError('AUTH_INVALID_CREDENTIALS', 'Invalid email or password.', 401),
      );
      await open();

      await fillAndSubmit();

      expect(q('[role="alert"]')?.textContent).toContain('Invalid email or password.');
      expect(email().value).toBe('sara@example.com');
      expect(password().value).toBe('');
      expect(document.activeElement).toBe(password());
      expect(url()).toBe('/login'); // still here
    });

    it('also understands a raw HTTP error, as it arrives before the error interceptor exists', async () => {
      const envelope: ApiError = {
        statusCode: 401,
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
        details: null,
        requestId: 'r1',
        timestamp: '2026-10-31T00:00:00.000Z',
        path: '/api/auth/login',
      };
      store.outcome = rejectWith(new HttpErrorResponse({ status: 401, error: envelope }));
      await open();

      await fillAndSubmit();

      expect(q('[role="alert"]')?.textContent).toContain('Invalid email or password.');
    });

    it('server unreachable: says so and keeps everything the user typed', async () => {
      store.outcome = rejectWith(new AppError('NETWORK', 'Cannot reach the server.', 0));
      await open();

      await fillAndSubmit();

      expect(q('[role="alert"]')?.textContent).toContain('Cannot reach the server');
      expect(email().value).toBe('sara@example.com');
      expect(password().value).toBe('a long password');
    });

    it('rate limited: asks the user to wait', async () => {
      store.outcome = rejectWith(new AppError('RATE_LIMITED', 'Too many requests.', 429));
      await open();

      await fillAndSubmit();

      expect(q('[role="alert"]')?.textContent).toContain('Too many attempts');
    });

    it('an unexpected error: a generic message with the reference, never the server text', async () => {
      store.outcome = rejectWith(
        new AppError('INTERNAL', 'stack trace and SQL here', 500, null, 'req-77'),
      );
      await open();

      await fillAndSubmit();

      const text = q('[role="alert"]')?.textContent ?? '';
      expect(text).toContain('Reference: req-77');
      expect(text).not.toContain('SQL');
    });

    it('server-side field errors land on their fields', async () => {
      store.outcome = rejectWith(
        new AppError('VALIDATION_FAILED', 'Validation failed.', 422, {
          email: ['email must be an email'],
        }),
      );
      await open();

      await fillAndSubmit();

      expect(q('#login-email-error')?.textContent).toContain('email must be an email');
      expect(document.activeElement).toBe(email());
    });
  });

  describe('while the request is in flight', () => {
    it('disables the button, shows progress, and ignores a second submit', async () => {
      let finish: () => void = () => undefined;
      store.outcome = () => new Promise<void>((resolve) => (finish = resolve));
      await open();
      type(email(), 'sara@example.com');
      type(password(), 'a long password');

      await submit(); // the request is now pending
      expect(button().disabled).toBe(true);
      expect(button().textContent).toContain('Signing in');
      expect(button().getAttribute('aria-busy')).toBe('true');

      await submit(); // a second Enter or click
      expect(store.calls).toHaveLength(1);

      finish();
      // Let the component's `await` continue and start the navigation before waiting for it.
      await new Promise((resolve) => setTimeout(resolve));
      await settle();
      expect(url()).toBe('/documents');
    });

    it('enables the button again after a failure', async () => {
      store.outcome = rejectWith(new AppError('NETWORK', 'Cannot reach the server.', 0));
      await open();

      await fillAndSubmit();

      expect(button().disabled).toBe(false);
      expect(button().hasAttribute('aria-busy')).toBe(false); // idle: no aria-busy at all
    });
  });
});
