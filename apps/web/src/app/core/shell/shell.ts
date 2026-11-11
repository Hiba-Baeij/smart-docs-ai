import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../auth/auth.store';
import { createMutation } from '../feedback/mutation';
import { LocaleService } from '../i18n/locale.service';
import { PreferencesControls } from '../../shared/preferences-controls';
import { UserMenu } from './user-menu';

/**
 * The frame around every protected page: the navigation bar with the signed-in user and the
 * sign-out button, and the outlet for the feature pages.
 */
@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet, PreferencesControls, UserMenu],
  selector: 'app-shell',
  styleUrl: './shell.scss',
  templateUrl: './shell.html',
})
export class Shell {
  protected readonly auth = inject(AuthStore);
  protected readonly locale = inject(LocaleService);
  private readonly router = inject(Router);

  /**
   * The local state is cleared whatever happens (see AuthStore.logout). What differs is whether
   * the SERVER was told: only then is the session really over. The login page explains a failure
   * (`reason`), so there is no toast here.
   */
  protected readonly signOutAction = createMutation<void, void>(() => this.auth.logout(), {
    error: () => null,
    onSuccess: () => this.router.navigate(['/login']),
    onError: (error) => {
      // A 401 means the session had already ended, which is exactly what the user wanted.
      const queryParams = error.code === 'AUTH_REQUIRED' ? {} : { reason: 'signout-failed' };
      void this.router.navigate(['/login'], { queryParams });
    },
  });

  protected signOut(): void {
    void this.signOutAction.run();
  }
}
