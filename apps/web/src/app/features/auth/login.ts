import { Component, ElementRef, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { safeReturnUrl } from '../../core/auth/return-url';
import { toAppError } from '../../core/http/app-error';
import { LocaleService } from '../../core/i18n/locale.service';
import { PreferencesControls } from '../../shared/preferences-controls';
import { applyFieldErrors, fieldMessage, focusFirstInvalid, toAuthFailure } from './auth-form';
import { loginSchema, schemaFieldErrors } from './auth-schema';

@Component({
  imports: [ReactiveFormsModule, RouterLink, PreferencesControls],
  selector: 'app-login',
  styleUrl: './auth-form.scss',
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(AuthStore);
  protected readonly locale = inject(LocaleService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(254)],
    }),
    // No minimum here: login must not reveal or enforce the registration policy.
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(128)],
    }),
  });

  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);
  /** Set by the register form after a successful sign-up. */
  protected readonly justRegistered = this.route.snapshot.queryParamMap.get('registered') === '1';
  /** Set by the error interceptor when a signed-in user's session ended. */
  protected readonly sessionExpired = this.route.snapshot.queryParamMap.get('reason') === 'expired';
  /** Set by the shell when signing out could not reach the server, so the session may still be open. */
  protected readonly signOutFailed =
    this.route.snapshot.queryParamMap.get('reason') === 'signout-failed';

  protected message(name: 'email' | 'password', label: string): string | null {
    return fieldMessage(this.form.controls[name], label, this.locale.current());
  }

  protected async submit(): Promise<void> {
    if (this.submitting()) {
      return; // a double click or a second Enter must not send a second request
    }
    this.formError.set(null);

    this.form.controls.email.setValue(this.form.controls.email.value.trim());

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focusFirstInvalid(this.host.nativeElement, this.form);
      return;
    }

    const parsed = loginSchema.safeParse(this.form.getRawValue());
    if (!parsed.success) {
      const unplaced = applyFieldErrors(
        this.form,
        schemaFieldErrors(parsed.error, this.locale.current()),
      );
      this.formError.set(unplaced.length ? unplaced.join(' ') : null);
      focusFirstInvalid(this.host.nativeElement, this.form);
      return;
    }

    this.submitting.set(true);
    try {
      await this.auth.login(parsed.data);
      // Never trust returnUrl: only a path on this site is followed.
      await this.router.navigateByUrl(
        safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')),
      );
    } catch (error) {
      this.showFailure(toAppError(error));
    } finally {
      this.submitting.set(false);
    }
  }

  private showFailure(error: ReturnType<typeof toAppError>): void {
    const failure = toAuthFailure(error, this.locale.current());
    const unplaced = applyFieldErrors(this.form, failure.fieldErrors);

    this.formError.set(failure.formMessage ?? (unplaced.length > 0 ? unplaced.join(' ') : null));

    if (error.code === 'AUTH_INVALID_CREDENTIALS') {
      // Keep the email, drop the password, and put the cursor where the user retypes it.
      this.form.controls.password.reset('');
      this.host.nativeElement.querySelector<HTMLElement>('#login-password')?.focus();
      return;
    }

    focusFirstInvalid(this.host.nativeElement, this.form);
  }
}
