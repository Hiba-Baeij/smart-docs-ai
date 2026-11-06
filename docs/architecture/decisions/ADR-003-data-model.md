# ADR-003: Data model — UUIDv7, ownership columns, cascade rules, message sources

Status: accepted
Date: 2026-10-23

## Context

Five entities are specified by the PRD. Three details are left open: identifier type,
deletion behaviour, and how an answer keeps its citations after a reload.

## Decision

- Primary keys: UUIDv7 (`uuid(7)` if the installed Prisma supports it, otherwise
  `uuid()`); verify at Phase 0 and record the result.
  **Verified 2026-10-30:** Prisma 7.10.1 (stable; npm's `latest` tag pointed at the
  8.0.0-rc.29 release candidate, which was avoided) supports `@default(uuid(7))`, and the
  schema validates with it. All five models use it. Keys are plain `String` (PostgreSQL
  `text`), not `@db.Uuid`, matching the persistence guide.
- Ownership is a direct column: `Document.uploadedBy`, `Conversation.userId`.
  No join tables.
- Deletion:
  - `Document` → `DocumentChunk` cascade.
  - `Conversation` → `Message` cascade.
  - `User` → documents and conversations cascade (account deletion path, not exposed in
    v1 UI).
- `Message` gains a nullable `sources` JSON column:
  `{ documentId, documentName, chunkIndex, pageNumber, sheetName }[]`.
- Indexes: `Document(uploadedBy, createdAt)`, `DocumentChunk(documentId)`,
  `Conversation(userId, updatedAt)`, `Message(conversationId, createdAt)`.
- Unique: `DocumentChunk(documentId, chunkIndex)`.

## Alternatives considered

- **CUID or autoincrement.** Autoincrement leaks volume and complicates future merges;
  CUID is fine but adds a dependency. UUIDv7 keeps time ordering without one.
- **Citations embedded in message content.** No schema change, but pollutes text, breaks
  copy/paste, and cannot be rendered structurally. Rejected.
- **Soft deletes everywhere.** Useful for recovery, adds `deletedAt` filtering to every
  query. Deferred.

## Consequences

- PRD §5 is amended: `sources` is an additive column.
- Cascade behaviour must be proven by a test, not assumed from schema syntax.
- Deleting a document does not delete conversations that cited it; citations remain
  with a dangling id by design, and the UI renders the stored filename.
