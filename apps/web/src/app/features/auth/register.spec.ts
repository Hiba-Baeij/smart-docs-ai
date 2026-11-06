import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { RegisterRequest, UserSummary } from '@smartdocs/contracts';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AuthApi } from '../../core/auth/auth.api';
import { AppError } from '../../core/http/app-error';
import { Register } from './register';

const USER: UserSummary = {
  id: 'u1',
  name: 'Sara Ahmed',
  email: 'sara@example.com',
  createdAt: '2026-10-31T00:00:00.000Z',
};

@Component({ template: 'the login page' })
class LoginStub {}

/** Stands in for the HTTP layer: records the request and lets the test decide the outcome. */
class FakeAuthApi {
  calls: RegisterRequest[] = [];
  result: () => Observable<UserSummary> = () => of(USER);

  register(request: RegisterRequest): Observable<UserSummary> {
    this.calls.push(request);
    return this.result();
  }
}

describe('Register', () => {
  let api: FakeAuthApi;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    api = new FakeAuthApi();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'register', component: Register },
          { path: 'login', component: LoginStub },
        ]),
        { provide: AuthApi, useValue: api },
      ],
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/register', Register);
  });

  const root = () => harness.routeNativeElement as HTMLElement;
  const q = <T extends HTMLElement>(selector: string) => root().querySelector<T>(selector);
  const name = () => q<HTMLInputElement>('#register-name')!;
  const email = () => q<HTMLInputElement>('#register-email')!;
  const password = () => q<HTMLInputElement>('#register-password')!;
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
    type(name(), 'Sara Ahmed');
    type(email(), 'sara@example.com');
    type(password(), 'a long password');
    await submit();
  }

  it('has labelled name, email and password fields with the right autocomplete hints', () => {
    expect(q('label[for="register-name"]')?.textContent).toContain('Name');
    expect(name().autocomplete).toBe('name');
    expect(q('label[for="register-email"]')?.textContent).toContain('Email');
    expect(email().autocomplete).toBe('email');
    expect(q('label[for="register-password"]')?.textContent).toContain('Password');
    expect(password().type).toBe('password');
    expect(password().autocomplete).toBe('new-password');
  });

  it('states the real password limits, including that only 72 bytes are used', () => {
    const hint = q('#register-password-hint')?.textContent ?? '';

    expect(hint).toContain('10 to 128');
    expect(hint).toContain('72 bytes');
    expect(password().getAttribute('aria-describedby')).toBe('register-password-hint');
  });

  describe('validation', () => {
    it('rejects a name made only of spaces before sending a request', async () => {
      type(name(), '   ');
      type(email(), 'sara@example.com');
      type(password(), 'a long password');
      await submit();
      expect(api.calls).toHaveLength(0);
      expect(root().textContent).toContain('Name is required.');
      expect(document.activeElement).toBe(name());
    });

    it('sends trimmed name and email while preserving password spaces', async () => {
      type(name(), ' Sara Ahmed ');
      type(email(), ' sara@example.com ');
      type(password(), ' password with spaces ');
      await submit();
      expect(api.calls).toEqual([
        { name: 'Sara Ahmed', email: 'sara@example.com', password: ' password with spaces ' },
      ]);
    });
    it('does not send an empty form, lists every missing field, and focuses the first', async () => {
      await submit();

      expect(api.calls).toHaveLength(0);
      expect(root().textContent).toContain('Name is required.');
      expect(root().textContent).toContain('Email is required.');
      expect(root().textContent).toContain('Password is required.');
      expect(document.activeElement).toBe(name());
    });

    it('wants at least 10 characters in the password', async () => {
      type(name(), 'Sara Ahmed');
      type(email(), 'sara@example.com');
      type(password(), 'short-123'); // 9 characters

      await submit();

      expect(api.calls).toHaveLength(0);
      expect(root().textContent).toContain('Password must be at least 10 characters.');
      expect(document.activeElement).toBe(password());
    });

    it('accepts exactly 10 and exactly 128 characters, refuses 129', async () => {
      type(name(), 'Sara Ahmed');
      type(email(), 'sara@example.com');

      type(password(), 'x'.repeat(10));
      await submit();
      expect(api.calls).toHaveLength(1);

      await harness.navigateByUrl('/register', Register);
      type(name(), 'Sara Ahmed');
      type(email(), 'sara@example.com');
      type(password(), 'x'.repeat(129));
      await submit();

      expect(api.calls).toHaveLength(1); // the 129-character attempt was not sent
      expect(root().textContent).toContain('Password must be at most 128 characters.');
    });

    it('rejects a malformed email', async () => {
      type(name(), 'Sara Ahmed');
      type(email(), 'nope');
      type(password(), 'a long password');

      await submit();

      expect(api.calls).toHaveLength(0);
      expect(root().textContent).toContain('Enter a valid email address.');
    });
  });

  describe('a successful registration', () => {
    it('sends what was typed and goes to the login page, without signing in', async () => {
      await fillAndSubmit();

      expect(api.calls).toEqual([
        { name: 'Sara Ahmed', email: 'sara@example.com', password: 'a long password' },
      ]);
      expect(url()).toBe('/login?registered=1');
    });
  });

  describe('failures', () => {
    it('a taken email is shown on the email field, which gets the focus', async () => {
      api.result = () =>
        throwError(() => new AppError('AUTH_EMAIL_TAKEN', 'Email already registered.', 409));

      await fillAndSubmit();

      expect(q('#register-email-error')?.textContent).toContain(
        'This email is already registered.',
      );
      expect(email().getAttribute('aria-invalid')).toBe('true');
      expect(document.activeElement).toBe(email());
      expect(url()).toBe('/register');
      // Nothing the user typed is lost.
      expect(name().value).toBe('Sara Ahmed');
      expect(password().value).toBe('a long password');
    });

    it('server-side validation messages land on their fields', async () => {
      api.result = () =>
        throwError(
          () =>
            new AppError('VALIDATION_FAILED', 'Validation failed.', 422, {
              password: ['password must be longer than or equal to 10 characters'],
            }),
        );

      await fillAndSubmit();

      expect(q('#register-password-error')?.textContent).toContain('longer than or equal to 10');
      expect(document.activeElement).toBe(password());
    });

    it('a field the form does not have is not lost: it appears in the form message', async () => {
      api.result = () =>
        throwError(
          () =>
            new AppError('VALIDATION_FAILED', 'Validation failed.', 422, {
              userId: ['property userId should not exist'],
            }),
        );

      await fillAndSubmit();

      expect(q('[role="alert"]')?.textContent).toContain('property userId should not exist');
    });

    it('server unreachable: says so and keeps everything', async () => {
      api.result = () => throwError(() => new AppError('NETWORK', 'Cannot reach the server.', 0));

      await fillAndSubmit();

      expect(q('[role="alert"]')?.textContent).toContain('Cannot reach the server');
      expect(email().value).toBe('sara@example.com');
      expect(button().disabled).toBe(false);
    });
  });

  describe('while the request is in flight', () => {
    it('disables the button, shows progress, and sends only one request', async () => {
      const pending = new Subject<UserSummary>();
      api.result = () => pending;
      type(name(), 'Sara Ahmed');
      type(email(), 'sara@example.com');
      type(password(), 'a long password');

      await submit();
      expect(button().disabled).toBe(true);
      expect(button().textContent).toContain('Creating account');
      expect(button().getAttribute('aria-busy')).toBe('true');

      await submit(); // a second Enter or click
      expect(api.calls).toHaveLength(1);

      pending.next(USER);
      pending.complete();
      await new Promise((resolve) => setTimeout(resolve));
      await settle();
      expect(url()).toBe('/login?registered=1');
    });
  });
});
