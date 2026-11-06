# Angular 03 — Routing, Guards, HTTP, and Interceptors

Status: reviewed
Related: FR-04, FR-05, FR-27, ADR-002, ADR-013
Verified against: Angular 22.2 functional guards and interceptors, 2026-10-31 (Phase 3); the guard and interceptor snippets below match `apps/web/src/app/core`

## 1. Route configuration

```ts
export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent) },
  { path: 'register', loadComponent: () => import('./features/auth/register.component').then(m => m.RegisterComponent) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./core/shell/shell.component').then(m => m.ShellComponent),
    children: [
      { path: 'documents', loadComponent: () => import('./features/documents/documents-page.component').then(m => m.DocumentsPageComponent) },
      { path: 'documents/:id', loadComponent: () => import('./features/documents/document-detail.component').then(m => m.DocumentDetailComponent) },
      { path: 'chat', loadComponent: () => import('./features/chat/chat-page.component').then(m => m.ChatPageComponent) },
      { path: 'chat/:id', loadComponent: () => import('./features/chat/chat-page.component').then(m => m.ChatPageComponent) },
      { path: '', pathMatch: 'full', redirectTo: 'documents' },
    ],
  },
  { path: '**', loadComponent: () => import('./shared/not-found.component').then(m => m.NotFoundComponent) },
];
```

- `loadComponent` keeps the initial bundle small and teaches lazy loading with no module
  layer.
- The shell owns navigation and the auth header; feature pages are children.
- `:id` is read with `ActivatedRoute.snapshot.paramMap` for one-shot pages and with
  `toSignal(route.paramMap)` when the page must react to id changes.

## 2. Guards: authentication is not authorization

```ts
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  await auth.restore();

  return auth.isAuthenticated()
    ? true
    : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
```

- `restore()` performs `/auth/me` at most once per page load (a shared promise) and never
  rejects: any failure means `anonymous`, so the guard can always reach a decision. Because it
  asks only once per page, the client's view of the session can be stale until a reload or a
  failing feature call; the server's 401 is the truth.
- The guard is UX. The API enforces ownership on every request.
- A guard cannot check "does this user own document 42" because it does not load data.
  The detail page requests the row and renders a not-found state on 404.

### The `returnUrl` trap

```ts
const target = route.snapshot.queryParamMap.get('returnUrl');
const safe = target?.startsWith('/') && !target.startsWith('//') ? target : '/documents';
router.navigateByUrl(safe);
```

An unvalidated `returnUrl` is an open redirect. The `//` check blocks protocol-relative
URLs.

## 3. HTTP: one API service per feature

```ts
@Injectable({ providedIn: 'root' })
export class DocumentsApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(page = 1, pageSize = 20): Observable<DocumentPage> {
    return this.http.get<DocumentPage>(`${this.base}/documents`, { params: { page, pageSize } });
  }

  upload(file: File): Observable<HttpEvent<DocumentSummary>> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<DocumentSummary>(`${this.base}/documents/upload`, body, {
      reportProgress: true,
      observe: 'events',
    });
  }
}
```

- Types come from `packages/contracts`; the compiler catches drift when the API changes.
- `observe: 'events'` is only for upload progress; everywhere else the default body
  observable is enough.
- No component calls `HttpClient` directly. The boundary is the API service.

## 4. Interceptors

```ts
export const credentialsInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.clone({ withCredentials: true }));

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  return next(req).pipe(
    catchError((response: HttpErrorResponse) => {
      const error = toAppError(response);
      const isAuthCall = req.url.startsWith(`${apiBase}/auth/`);
      // Only a user who WAS signed in has a session to lose. Without this condition, a second
      // 401 that arrives after the redirect reads router.url as /login and nests it in returnUrl.
      if (error.code === 'AUTH_REQUIRED' && !isAuthCall && auth.status() === 'authenticated') {
        const returnUrl = router.url;
        auth.reset();
        router.navigate(['/login'], { queryParams: { returnUrl, reason: 'expired' } });
      }
      return throwError(() => error);
    }),
  );
};
```

Rules:

- `withCredentials` lives in exactly one place.
- The interceptor maps errors; it does not decide UI copy beyond the redirect.
- It excludes `/auth/*` to avoid a redirect loop during login or restore.
- 401 from login is a form error, not a session expiry.

## 5. RxJS and signals at the boundary

```ts
readonly page = toSignal(this.api.list(), { initialValue: null });
```

- HTTP is an observable because it can be cancelled and can emit progress.
- State is a signal because templates read it.
- Convert at the boundary, not in the middle. Do not build an observable store.
- For search-as-you-type, `toObservable(query).pipe(debounceTime(300), switchMap(...))`
  then `toSignal`. `switchMap` cancels the previous request; this is the one place where
  RxJS is clearly the right tool.

## 6. Cancel and race conditions

- Navigating away cancels an in-flight `HttpClient` subscription automatically when it is
  converted with `toSignal` in a destroyed component context? Not always: verify with the
  `takeUntilDestroyed` pattern for manual subscriptions.
- Upload and chat requests must guard against double submits: disable the control while
  `status === 'loading'`.
- A late response for conversation A must never render in conversation B. The chat store
  keys its state by conversation id and ignores a response whose id no longer matches.

## 7. Testing the layer

| Test | What it proves |
|---|---|
| guard returns `UrlTree` when anonymous | redirect works without a real router |
| guard returns `true` when authenticated | happy path |
| interceptor adds `withCredentials` | cookie is sent |
| interceptor redirects on 401 from a feature call | expiry handling |
| interceptor does not redirect on 401 from login | no loop |
| API service builds the right URL and params | contract with the backend |

Use `HttpTestingController`; no network in unit tests.

## 8. Exercise (Phase 3)

Add a fifth route `/documents/:id/not-found`? No. Instead: make the detail page handle a
404 by rendering `app-empty-state` with "This document does not exist or is not yours."
Then confirm that user B never sees a stale document from user A by logging out and back
in with a different account in a second browser profile.
