# ADR-016: Explicit v1 non-goals and their upgrade paths

Status: accepted
Date: 2026-10-23

## Context

Every omitted feature is a future argument. Recording the omission and its upgrade path
prevents both scope creep and the false impression that the design forgot something.

## Decision

| Non-goal | Reason | Upgrade path |
|---|---|---|
| pgvector semantic search | Unverified extension/Prisma support; Arabic FTS must be measured first | Implement `ChunkRetriever` with a vector adapter; add `embedding` column and index |
| Streaming answers | Adds SSE, partial persistence, and client complexity | Add `generateStream` to `LlmProvider`; persist on completion |
| Background queue | Synchronous is adequate at this size | Extract processing service; add job table or Redis; status model already exists |
| Refresh tokens | Rotation and revocation design not needed yet | Add token entity, rotation, reuse detection |
| OCR | Large dependency, accuracy cost | New `DocumentExtractor` adapter |
| File storage | PRD forbids retaining originals | Object storage adapter plus signed URLs |
| Sharing and teams | Single-owner is a PRD assumption | Membership table; ownership becomes a policy check |
| Caching | Correctness over speed at this scale | Add only after measuring a real bottleneck |
| Multi-tenancy | Out of product scope | Would require a tenancy column in every table and a policy layer |

## Alternatives considered

- **Build the flexible version now.** Costs weeks and adds failure modes before any
  measured need.
- **Say nothing and decide later.** Invites re-litigation and accidental coupling.

## Consequences

- Each omission has a documented seam, so the upgrade is additive rather than a rewrite.
- A reviewer can distinguish "not built" from "not considered".
- Adding any non-goal to v1 requires a new ADR superseding this one.
