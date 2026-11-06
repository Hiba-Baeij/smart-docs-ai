# ADR-001: Repository layout — npm workspaces, no monorepo tooling

Status: accepted
Date: 2026-10-23

## Context

The project needs an API, a web client, and shared TypeScript types. Types duplicated
across two apps drift silently, and drift in API shapes is the most common integration
bug in this kind of project.

## Decision

One repository with three npm workspaces:

```
apps/api              NestJS
apps/web              Angular
packages/contracts    types, enums, error codes
```

No Nx, no Turborepo, no Lerna. Workspace scripts at the root orchestrate the few
commands that need both apps.

## Alternatives considered

- **Two repositories.** Cleanest CI separation, but shared types must be published or
  copied. Rejected: drift is a bigger cost than CI tidiness at this size.
- **Nx.** Powerful generators and caching, but adds a build system to learn alongside
  Angular and Nest. Rejected for a learning project.
- **Types duplicated manually.** Cheapest to start, most expensive to maintain.

## Consequences

- `packages/contracts` must remain type-only plus plain constants; runtime logic there
  would create a fourth deployable.
- Angular's build must be able to resolve the workspace package; verify at Phase 0.
- `packages/contracts` is compiled to `dist` (CommonJS + `.d.ts`) before either app builds,
  because Node cannot load its `.ts` source at runtime. Root `build`, `typecheck` and `dev`
  run `build:contracts` first (decided in Phase 0, task 0.3).
- Root scripts become the documented entry point (`ops/commands.md`).
