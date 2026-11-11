import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { LoadingService } from '../loading/loading.service';
import { SKIP_GLOBAL_LOADING } from './http-context';

/**
 * Counts every request in `LoadingService` from the moment it is sent until it ends: success,
 * failure, or cancellation (`finalize` covers an unsubscribe too). Requests marked with
 * `SKIP_GLOBAL_LOADING` are not counted.
 */
export const loadingInterceptor: HttpInterceptorFn = (request, next) => {
  if (request.context.get(SKIP_GLOBAL_LOADING)) {
    return next(request);
  }
  const end = inject(LoadingService).start();
  return next(request).pipe(finalize(end));
};
