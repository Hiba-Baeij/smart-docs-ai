import { DOCUMENT } from '@angular/common';
import { DestroyRef, type Signal, effect, inject, untracked } from '@angular/core';

/**
 * Runs `action` every `intervalMs` while `condition()` is true, e.g. refreshing a list while some
 * of its rows are still processing:
 *
 *   pollWhile(this.hasProcessing, () => this.store.refresh({ background: true }), 5_000);
 *
 * It starts and stops by itself as the condition changes, skips a tick while the tab is hidden
 * (nobody is looking), never overlaps two runs of a slow action, and stops when the component is
 * destroyed. Call in an injection context.
 */
export function pollWhile(
  condition: Signal<boolean>,
  action: () => Promise<unknown> | void,
  intervalMs: number,
): void {
  const document = inject(DOCUMENT);
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;

  const stop = () => {
    clearInterval(timer);
    timer = undefined;
  };

  const tick = async () => {
    if (running || document.visibilityState === 'hidden') {
      return;
    }
    running = true;
    try {
      await action();
    } finally {
      running = false;
    }
  };

  effect(() => {
    const active = condition();
    untracked(() => {
      if (active && timer === undefined) {
        timer = setInterval(() => void tick(), intervalMs);
      } else if (!active) {
        stop();
      }
    });
  });

  inject(DestroyRef).onDestroy(stop);
}
