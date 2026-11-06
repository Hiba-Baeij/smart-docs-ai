import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  UserSummary,
} from '@smartdocs/contracts';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../config/api-base';

/**
 * The only place that knows the auth endpoints. No component and no store calls `HttpClient`
 * directly; the types come from `packages/contracts`, so an API change is a compile error here.
 */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  /** 201 `{ user }`. No session is created: the user logs in as a separate step. */
  register(request: RegisterRequest): Observable<UserSummary> {
    return this.http
      .post<AuthResponse>(`${this.base}/auth/register`, request)
      .pipe(map((response) => response.user));
  }

  /** 200 `{ user }` and the session cookie, which the browser keeps; script never sees it. */
  login(request: LoginRequest): Observable<UserSummary> {
    return this.http
      .post<AuthResponse>(`${this.base}/auth/login`, request)
      .pipe(map((response) => response.user));
  }

  /** 204. Only the server can remove an HttpOnly cookie. */
  logout(): Observable<void> {
    return this.http.post<void>(`${this.base}/auth/logout`, {});
  }

  /** The caller's profile, or 401. Note that it is a bare user, not `{ user }`. */
  me(): Observable<UserSummary> {
    return this.http.get<UserSummary>(`${this.base}/auth/me`);
  }
}
