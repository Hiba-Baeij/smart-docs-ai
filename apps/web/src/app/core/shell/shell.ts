import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../auth/auth.store';
import { toAppError } from '../http/app-error';
import { LocaleService } from '../i18n/locale.service';
import { PreferencesControls } from '../../shared/preferences-controls';

/**
 * The frame around every protected page: the navigation bar with the signed-in user and the
 * sign-out button, and the outlet for the feature pages.
 */
@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet, PreferencesControls],
  selector: 'app-shell',
  styleUrl: './shell.scss',
  templateUrl: './shell.html',
})
export class Shell {
  protected readonly auth = inject(AuthStore);
  protected readonly locale = inject(LocaleService);
  private readonly router = inject(Router);

  protected readonly signingOut = signal(false);

  protected async signOut(): Promise<void> {
    if (this.signingOut()) {
      return; // a double click must not send two requests
    }
    this.signingOut.set(true);

    // The local state is cleared whatever happens (see AuthStore.logout). What differs is whether
    // the SERVER was told: only then is the session really over.
    let reason: string | undefined;
    try {
      await this.auth.logout();
    } catch (error) {
      // A 401 means the session had already ended, which is exactly what the user wanted.
      reason = toAppError(error).code === 'AUTH_REQUIRED' ? undefined : 'signout-failed';
    }

    try {
      await this.router.navigate(['/login'], { queryParams: reason ? { reason } : {} });
    } finally {
      this.signingOut.set(false);
    }
  }
}
