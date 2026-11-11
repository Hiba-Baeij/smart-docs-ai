# ADR-019: Angular Material + CDK as the UI foundation

Status: accepted
Date: 2026-11-11
Supersedes: the "no UI component library" clause of ADR-012 (the rest of ADR-012 stands)

## Context

ADR-012 kept the client free of a UI library so the author would learn Angular's component and form mechanics by hand. The app now has to grow beyond three screens, and the hand-built UI layer has become the weak point:

- every page writes its own `<table>` and pager;
- destructive actions are confirmed with an inline card instead of a dialog;
- each request manages its own loading flag, text, and toast.

The plan in `docs/plan/web-ui-architecture-plan.md` adds four shared pieces: a generic data table, a confirm dialog service, global loading, and a small UI kit. These need accessible, RTL-aware primitives: overlay, focus trap, table, sort, paginator, menu, and tabs.

## Decision

- **`@angular/cdk`** provides the headless primitives. It is used for dialog, overlay, table, a11y, and bidi.
- **`@angular/material`** provides the finished pieces: paginator, sort, progress bar, menu, tabs, and tooltip.
  - It is themed from the existing CSS custom properties in `src/styles.scss`, so these stay the single source of colour.
  - Tailwind stays for layout and spacing, as ADR-017 says.
- **`@lucide/angular`** is the icon set, the same family the team uses elsewhere.
- **`ngx-sonner`** stays the toast library.
- App code uses Material through wrappers in `shared/ui` and `shared/data-table`. Material components are not used directly inside feature templates. This means a later library change touches the wrappers only.

## Alternatives considered

- **PrimeNG.** It has a richer table, ConfirmDialog, and Toast out of the box. It was rejected because it is heavier and its theming conflicts with the Tailwind/CSS-variable tokens.
- **SweetAlert2 for confirmations.** It is not Angular-native: it injects DOM outside the theme and handles dark mode, RTL, and i18n poorly.
- **Keep hand-building everything.** This would mean re-implementing focus traps, overlays, and an accessible sortable table in every feature.

## Consequences

- The bundle grows by the Material/CDK modules that are imported. The `initial` budget in `angular.json` must keep being respected.
- Material's typography and density are adjusted to the Readex Pro font and the app's scale in `src/styles/material-theme.scss`.
- `@angular/material` and `@angular/cdk` must be upgraded together with `@angular/core`.
