import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { API_BASE_URL } from '../config/api-base';

/**
 * The one place that makes the browser send the session cookie to the API.
 * It applies only to requests aimed at the API base, so the cookie is never sent to any
 * other address. No `Authorization` header is ever built: the token lives in an HttpOnly
 * cookie that script cannot read.
 */
export const credentialsInterceptor: HttpInterceptorFn = (request, next) => {
  const apiBase = inject(API_BASE_URL);

  return request.url.startsWith(apiBase)
    ? next(request.clone({ withCredentials: true }))
    : next(request);
};
