# Angular Track

Status: reviewed
Related: ADR-012, FR-05, FR-29, FR-30
Verified against: Angular version is confirmed at Phase 0; no version-specific claim here

## Who this is for

A senior React/Vue developer who has never shipped Angular. These guides skip JavaScript
fundamentals and spend their words on the parts that are genuinely different: dependency
injection, templates, change detection, signals versus observables, and the router.

## Naming note

Angular 22's CLI generates `app.ts` with class `App`, standalone by default and without the
`.component` suffix. The snippets in these guides were written with the older names
(`LoginComponent`, `login.component.ts`, `standalone: true`); behaviour is the same. The code in
this repository follows the CLI's current convention and is strict TypeScript
(`"strict": true`, `strictTemplates`); the guides' snippets are illustrative.

## Reading order

| Guide | Read before | What it unlocks |
|---|---|---|
| `01-mental-model-and-structure.md` | Phase 0 | Where code goes and why Angular feels different |
| `02-components-signals-state.md` | Phase 3 | Building the auth screens and feature stores |
| `03-routing-guards-http.md` | Phase 3 | Protected routes, typed API calls, error interception |
| `04-forms-and-chat-ui.md` | Phase 6 and 10 | Upload and chat interfaces, all their states |

## The one-paragraph translation table

| React | Vue 3 | Angular |
|---|---|---|
| Function component | SFC `<script setup>` | Standalone component class + template |
| `useState` | `ref` | `signal` |
| `useMemo` | `computed` | `computed` |
| `useEffect` | `watchEffect` | `effect` (use sparingly) |
| Props | `defineProps` | `input()` signal inputs |
| Callback props / emits | `defineEmits` | `output()` |
| Context + hooks | `provide/inject` | Dependency injection |
| React Router | Vue Router | `@angular/router` |
| `axios` + interceptors | `axios` | `HttpClient` + functional interceptors |
| Redux/Zustand | Pinia | Signals store (v1), NgRx only if complexity demands |

Three differences that cause real confusion:

1. **Templates are not JSX.** They are compiled HTML with a limited expression language.
   You cannot call arbitrary functions in a template without a performance cost, and
   statements are restricted.
2. **Change detection is a framework concern.** With signals and zoneless-ready patterns,
   you stop thinking about re-renders and start thinking about what is a signal.
3. **DI is the backbone.** Services are not just modules; they are the composition
   mechanism, and the injector hierarchy is a design tool.

## What this track deliberately omits

- NgModules (legacy for new code).
- NgRx (unnecessary at this size; documented as a non-choice in ADR-012).
- Angular Material (the goal is to learn Angular, not a component library).
- Universal/SSR (this is an authenticated app; SEO is irrelevant).

## Practice rule

Each guide ends with a small exercise tied to the project. Do the exercise before reading
the next guide. Reading Angular without writing templates produces false confidence,
because the template language is where the surprises are.
