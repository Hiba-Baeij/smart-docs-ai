import { HttpContext, HttpContextToken } from '@angular/common/http';

/**
 * Leaves a request out of the global progress bar. Use it for a request that shows its own
 * progress (an upload with a percentage) or runs in the background (polling). A request the
 * person is waiting for should stay tracked.
 */
export const SKIP_GLOBAL_LOADING = new HttpContextToken<boolean>(() => false);

/** A context with `SKIP_GLOBAL_LOADING` set, for `http.get(url, { context: skipGlobalLoading() })`. */
export function skipGlobalLoading(context = new HttpContext()): HttpContext {
  return context.set(SKIP_GLOBAL_LOADING, true);
}
