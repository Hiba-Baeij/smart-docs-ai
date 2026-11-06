import { Injectable, computed, inject, signal } from '@angular/core';
import type { LoginRequest, UserSummary } from '@smartdocs/contracts';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from './auth.api';

/**
 * `unknown` only exists between page load and the answer of `GET /auth/me`. A reload wipes
 * memory and script cannot read the HttpOnly cookie, so the only way to learn who the user is
 * is to ask the server.
 */
export type AuthStatus = 'unknown' | 'anonymous' | 'authenticated';

/**
 * The session, as the browser knows it. It holds the user object and never a token: the token
 * lives in an HttpOnly cookie that script cannot read.
 *
 * This is a UX convenience. Authorization is enforced by the API on every request; a user who
 * edits this state in devtools still gets 401 or 404 from the server.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(AuthApi);

  private readonly _status = signal<AuthStatus>('unknown');
  private readonly _user = signal<UserSummary | null>(null);

  readonly status = this._status.asReadonly();
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._status() === 'authenticated');

  /** The single in-flight or finished restore, shared by every caller. */
  private restoration: Promise<void> | null = null;

  /**
   * Asks the server who the user is, at most once per page load: the first call starts the
   * request and every later call (a second guard run, a concurrent one) shares its result.
   *
   * It never rejects. If the session cannot be proven for ANY reason (401, server down,
   * malformed answer) the user is `anonymous`: failing closed is the safe default, and the
   * route guard must always be able to reach a decision.
   */
  restore(): Promise<void> {
    this.restoration ??= this.loadSession();
    return this.restoration;
  }

  /** Signs in. A failure rejects and leaves the state unchanged, for the form to display. */
  async login(request: LoginRequest): Promise<void> {
    const user = await firstValueFrom(this.api.login(request));
    this.setSession(user);
  }

  /**
   * Signs out. The local state is cleared whatever the server answers, because the user's
   * intent is to leave; an error is still rethrown so the UI can say the server was not
   * reached and the session may still be open.
   */
  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.api.logout());
    } finally {
      this.reset();
    }
  }

  /** Forgets the session locally, e.g. when any API call answers 401. */
  reset(): void {
    this._user.set(null);
    this._status.set('anonymous');
  }

  private async loadSession(): Promise<void> {
    const user = await firstValueFrom(this.api.me()).catch(() => null);

    // A login or logout that finished while this request was in flight is newer information.
    if (this._status() !== 'unknown') {
      return;
    }

    if (user) {
      this.setSession(user);
    } else {
      this.reset();
    }
  }

  private setSession(user: UserSummary): void {
    this._user.set(user);
    this._status.set('authenticated');
  }
}
