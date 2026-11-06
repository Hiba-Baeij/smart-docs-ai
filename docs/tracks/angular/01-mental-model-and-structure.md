# Angular 01 — Mental Model and Project Structure

Status: reviewed
Related: ADR-012
Verified against: Angular version confirmed at Phase 0; CLI output may differ by version

## 1. Bootstrapping

Angular starts from `main.ts`, which bootstraps a root component with an application
configuration:

```ts
// illustrative — confirm against the installed version
bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([credentialsInterceptor, errorInterceptor])),
  ],
});
```

Compare with React's `createRoot(...).render(...)` and Vue's `createApp(...).mount(...)`.
The difference is that Angular's configuration is a dependency-injection provider list,
not a tree of components.

`app.config.ts` is where cross-cutting providers live: router, HTTP, and any app-wide
tokens.

## 2. Standalone components

```ts
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
})
export class LoginComponent {}
```

There is no `NgModule`. A component declares what it uses in `imports`. This is closer to
a Vue SFC importing its children than to the old Angular module system.

**Rule for this project:** every component is standalone; no `NgModule` is created.

## 3. Dependency injection, concretely

```ts
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(AuthApi);
}
```

- `providedIn: 'root'` means one instance for the application (a singleton).
- `inject()` works in constructors, field initialisers, guards, and interceptors.
- A service is just a class with a lifetime. There is no magic beyond the injector.

Why it matters here: `AuthStore` is shared by the guard, the interceptor, and the header
component without prop drilling or a global variable. That is the Angular answer to
context, and it is the reason the auth flow stays small.

### Provider scope as a design tool

| Scope | Use here |
|---|---|
| `root` | `AuthStore`, API services, interceptors |
| route-level `providers` | feature store that should reset when leaving the feature |
| component `providers` | a stateful widget used in multiple places |

In v1, feature stores are root-provided for simplicity, except the chat store, which is
provided at the chat route so switching conversations does not leak state.

## 4. Folder structure and why

```
src/app/
├── core/
│   ├── auth/            auth.store.ts, auth.guard.ts, auth.api.ts
│   ├── http/            credentials.interceptor.ts, error.interceptor.ts
│   └── config/          api-base.ts
├── features/
│   ├── auth/            login, register
│   ├── documents/       list, upload, detail
│   └── chat/            conversation list, thread, composer
├── shared/              button, input, spinner, empty-state, error-banner, status-badge
├── app.routes.ts
├── app.config.ts
└── app.component.ts
```

- `core` is imported by everything and imports no feature.
- `features` never import each other; navigation between them goes through the router.
- `shared` contains presentational components with no API knowledge.

This mirrors the backend's dependency rule: dependencies point inward, and a feature
cannot reach into another feature's internals.

## 5. Templates versus JSX

```html
@if (documents().length === 0) {
  <app-empty-state message="No documents yet" />
} @else {
  @for (doc of documents(); track doc.id) {
    <app-document-row [document]="doc" />
  }
}
```

- `@if` / `@for` are built-in control flow; `track` is required for stable identity.
- `{{ value }}` escapes HTML. `[innerHTML]` does not; this project never uses it for
  document or model text.
- Expressions are cheap and side-effect free. Call a `computed()` instead of a method in a
  template when the value is derived.

## 6. Change detection in one paragraph

Historically Angular re-checked everything after any event. Signals change that: a signal
read in a template creates a dependency, and updating it marks exactly that view dirty.
You do not need to understand the internals to write correct code, but you must follow the
rule: **state lives in signals; templates read signals; never mutate a signal's value in
place.** `signal([...]).update(list => [...list, item])`, not `list.push(item)`.

## 7. Exercise (before Phase 3)

1. Create a `CounterComponent` with one `signal(0)`, an increment button, and a
   `computed` that reports "even"/"odd".
2. Inject a `LoggerService` into it and log every increment.
3. Delete the service and watch the compile error; this is how DI failure looks.

If all three feel obvious, you are ready for components and signals.
