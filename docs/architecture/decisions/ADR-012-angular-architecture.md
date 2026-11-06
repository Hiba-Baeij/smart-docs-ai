# ADR-012: Angular architecture — standalone, signals, no NgRx

Status: accepted
Date: 2026-10-23

## Context

The author is senior in React and Vue and new to Angular. The client is a medium-sized
authenticated SPA with three features. The architecture should teach current Angular
without importing patterns that exist only to manage large-team complexity.

## Decision

- **Standalone components** everywhere; no `NgModule` for features.
- **Signals** for state, with `computed` for derived values and `effect` sparingly.
- **Functional guards and interceptors**, not class-based.
- **Typed reactive forms** for auth and upload; template-driven forms only for trivial
  inputs.
- **One signal store per feature** (`AuthStore`, `DocumentsStore`, `ChatStore`) exposed as
  injectable services. No global store, no Redux devtools requirement.
- **`HttpClient`** wrapped by one `ApiService` per feature; no generated client in v1.
- **SCSS** with about six presentational components; no UI component library.
- **Lazy-loaded routes** for documents and chat.

## Alternatives considered

- **NgModules.** Still supported, but teaches a mental model the framework is moving away
  from. Rejected for a new project.
- **NgRx.** Appropriate for large teams with complex shared state; here it adds ceremony
  and a second state model. Rejected.
- **Angular Material.** Solves accessibility and styling quickly, but the goal is to learn
  Angular, and a library hides the component and form mechanics.
- **TanStack Query for Angular.** Interesting, but adds a third state concept beside
  signals and RxJS. Deferred.

## Consequences

- RxJS remains where it is natural: HTTP observables converted with `toSignal`, and
  debounced inputs.
- The learner must understand both signals and observables; the Angular track explains the
  boundary explicitly rather than hiding it.
- Feature stores stay small and testable; cross-feature communication goes through the
  router or a narrow shared service.
