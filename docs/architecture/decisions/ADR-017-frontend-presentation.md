# ADR-017: Runtime language and theme preferences

Status: accepted (implementation in progress)
Date: 2026-11-02
Supersedes: the SCSS-only presentation choice in ADR-012

## Context

The working Angular app has auth, documents, and chat, but its UI is English-only and uses fixed light colors. The customer-facing requirement adds English/Arabic switching, RTL, light/dark themes, and Tailwind CSS. Rebuilding the app would duplicate tested behavior.

## Decision

- Keep the existing standalone components, routes, feature stores, API services, and HttpOnly-cookie session flow.
- Use CSS custom properties for semantic colors, SCSS for focused component styling, and Tailwind utilities for layout and spacing. Do not replace the token source with duplicated Tailwind color values.
- Use a signal-based `LocaleService` with typed English and Arabic UI messages for immediate switching. Set `lang` and `dir` on the root element. User-supplied text keeps its own direction where needed.
- Use a signal-based `ThemeService`, persisting an explicit choice and otherwise following the system preference on first load. A small static script applies saved preferences before Angular starts.
- Translate UI copy and stable client error codes. The API's exact insufficient-evidence answer remains unchanged.

## Consequences

- Angular's build-time locale bundles are not used for the runtime language toggle. Translation dictionaries must be kept complete as features are upgraded.
- Existing feature styles must move from fixed colors to semantic tokens so both themes remain legible.
- Tailwind and its PostCSS adapter are installed in the web workspace. The build uses the Angular-supported PostCSS integration.

## Implementation versions and reference

The web workspace pins `tailwindcss@4.3.3`, `@tailwindcss/postcss@4.3.3`, and `postcss@8.5.32`. The integration follows Angular's official [Tailwind guide](https://angular.dev/guide/tailwind): a project-level PostCSS configuration and an import in `src/styles.scss`.
