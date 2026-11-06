# ADR-015: Local infrastructure — docker-compose for PostgreSQL only

Status: accepted
Date: 2026-10-23

## Context

The app needs PostgreSQL with specific extensions available for the search spike. Node
and Angular run most productively on the host.

## Decision

- `docker-compose.yml` defines one service: PostgreSQL, with a named volume, a port
  mapping, and a healthcheck.
- API and web run on the host with `npm` scripts.
- Two databases are created by the init script: the app database and `<app>_test`.
- Environment is supplied by `.env` (API) and the Angular environment file (API base URL
  only).
- No Dockerfile for the apps in v1; containerising the API is a deployment concern, not a
  learning goal.

## Alternatives considered

- **Everything in Docker.** Reproducible, but rebuild loops slow down the learning cycle
  and obscure what runs where.
- **Host-installed PostgreSQL.** Works, but version and extension drift are the user's
  problem.
- **Kubernetes / cloud from day one.** Premature.

## Consequences

- `docker compose up -d db` is the first command of every session.
- Extensions (`unaccent`, `pg_trgm`) are created by a **migration**, not only by an init
  script, because "available in the image" is not the same as "installed in the database"
  and because an existing volume never re-runs the init script. The init script may create
  them for convenience; the migration is the guarantee.
- The test database guard from ADR-014 depends on the naming convention here.
