import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { MatProgressBar } from '@angular/material/progress-bar';
import { Router } from '@angular/router';
import { LocaleService } from '../i18n/locale.service';
import { LoadingService } from './loading.service';

/** A wait shorter than this never shows the bar, so fast requests do not flicker it. */
export const SHOW_DELAY_MS = 150;
/** Once shown, the bar stays at least this long, so it never blinks on and off. */
export const MIN_VISIBLE_MS = 300;

/**
 * The one loading indicator for the whole app: a thin bar on top of the page. It is shown
 * while an API request is running (`LoadingService`) or a route is being loaded (a lazy chunk).
 */
@Component({
  imports: [MatProgressBar],
  selector: 'app-top-progress',
  template: `
    @if (visible()) {
      <mat-progress-bar
        class="top-progress"
        mode="indeterminate"
        animate.enter="top-progress-enter"
        animate.leave="top-progress-leave"
        [attr.aria-label]="locale.t('common.loading')"
      />
    }
  `,
  styles: `
    .top-progress {
      position: fixed;
      inset-block-start: 0;
      inset-inline: 0;
      z-index: 1100;
      --mat-progress-bar-active-indicator-height: 3px;
      --mat-progress-bar-track-height: 3px;
      --mat-progress-bar-track-color: transparent;
    }
    .top-progress-enter {
      animation: top-progress-fade 0.15s ease-out;
    }
    .top-progress-leave {
      animation: top-progress-fade 0.25s ease-in reverse;
    }
    @keyframes top-progress-fade {
      from {
        opacity: 0;
      }
    }
  `,
})
export class TopProgress {
  protected readonly locale = inject(LocaleService);
  private readonly loading = inject(LoadingService);
  private readonly router = inject(Router);

  private readonly busy = computed(
    () => this.loading.active() || this.router.currentNavigation() !== null,
  );
  protected readonly visible = signal(false);

  private showTimer: ReturnType<typeof setTimeout> | undefined;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private shownAt = 0;

  constructor() {
    effect(() => {
      const busy = this.busy();
      untracked(() => (busy ? this.onBusy() : this.onIdle()));
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.showTimer);
      clearTimeout(this.hideTimer);
    });
  }

  private onBusy(): void {
    clearTimeout(this.hideTimer);
    this.hideTimer = undefined;
    if (this.visible() || this.showTimer !== undefined) {
      return;
    }
    this.showTimer = setTimeout(() => {
      this.showTimer = undefined;
      this.shownAt = Date.now();
      this.visible.set(true);
    }, SHOW_DELAY_MS);
  }

  private onIdle(): void {
    clearTimeout(this.showTimer);
    this.showTimer = undefined;
    if (!this.visible()) {
      return;
    }
    const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - this.shownAt));
    this.hideTimer = setTimeout(() => {
      this.hideTimer = undefined;
      this.visible.set(false);
    }, remaining);
  }
}
