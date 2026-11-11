import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { safeReturnUrl } from '../../core/auth/return-url';
import { LocaleService } from '../../core/i18n/locale.service';
import { AppField, AppForm, createSchemaForm, loginSchema } from '../../shared/forms';
import { AuthLayout } from './auth-layout';

@Component({
  imports: [RouterLink, AuthLayout, AppForm, AppField],
  selector: 'app-login',
  styleUrl: './auth-page.scss',
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(AuthStore);
  protected readonly locale = inject(LocaleService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly query = this.route.snapshot.queryParamMap;

  protected readonly form = createSchemaForm({
    id: 'login',
    schema: loginSchema,
    initial: { email: '', password: '' },
    submit: (data) => this.auth.login(data),
    // Never trust returnUrl: only a path on this site is followed.
    onSuccess: () => this.router.navigateByUrl(safeReturnUrl(this.query.get('returnUrl'))),
    onFailure: (error, form) => {
      if (error.code !== 'AUTH_INVALID_CREDENTIALS') return false;
      // Keep the email, drop the password, and put the cursor where the user retypes it.
      form.resetAndFocus('password');
      return true;
    },
  });

  /** Set by the register form after a successful sign-up. */
  protected readonly justRegistered = this.query.get('registered') === '1';
  /** Set by the error interceptor when a signed-in user's session ended. */
  protected readonly sessionExpired = this.query.get('reason') === 'expired';
  /** Set by the shell when signing out could not reach the server, so the session may still be open. */
  protected readonly signOutFailed = this.query.get('reason') === 'signout-failed';
}
