import { Injectable, computed, signal } from '@angular/core';

/**
 * Counts the work the whole app is waiting for: API requests, through `loadingInterceptor`.
 * The top progress bar reads `active`. No component keeps its own "loading" flag for this.
 */
@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly _pending = signal(0);

  /** How many tracked operations are still running. */
  readonly pending = this._pending.asReadonly();
  readonly active = computed(() => this._pending() > 0);

  /**
   * Marks one operation as started. Returns the function that ends it. Calling that function
   * twice is harmless, so a `finalize` and an error path cannot drive the count below the truth.
   */
  start(): () => void {
    this._pending.update((count) => count + 1);
    let ended = false;
    return () => {
      if (!ended) {
        ended = true;
        this._pending.update((count) => Math.max(0, count - 1));
      }
    };
  }
}
