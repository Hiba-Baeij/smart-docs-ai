# NestJS 02 — Persistence, Migrations, and Transactions

Status: reviewed
Related: ADR-003, ADR-004, ADR-014
Verified against: Prisma 7.10.1 (stable) with `@default(uuid(7))`, 2026-10-30 (Phase 1). Prisma 7 needs a driver adapter (`@prisma/adapter-pg`), a `prisma.config.ts`, and writes the client to `src/generated/prisma`; see `plan/progress/phase-01.md`

## 1. Schema shape

```prisma
model User {
  // @default(uuid(7)) if the installed Prisma supports it; otherwise uuid(). See ADR-003.
  id           String       @id @default(uuid())
  name         String
  email        String       @unique
  passwordHash String
  createdAt    DateTime     @default(now())
  documents    Document[]
  conversations Conversation[]
}

model Document {
  id            String          @id @default(uuid())
  originalName  String
  fileType      String
  extractedText String          @db.Text
  status        DocumentStatus  @default(PROCESSING)
  errorCode     String?
  uploadedBy    String
  createdAt     DateTime        @default(now())
  user          User            @relation(fields: [uploadedBy], references: [id], onDelete: Cascade)
  chunks        DocumentChunk[]

  @@index([uploadedBy, createdAt])
  @@index([uploadedBy, status])
}

model DocumentChunk {
  id          String   @id @default(uuid())
  documentId  String
  chunkIndex  Int
  content     String   @db.Text
  pageNumber  Int?
  sheetName   String?
  document    Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@unique([documentId, chunkIndex])
  @@index([documentId])
}
```

`Conversation` and `Message` follow the same shape; `Message.sources` is `Json?`.

Notes:

- `fileType` is a string plus a check in code; an enum adds a migration for every new
  format, which is a trade-off to revisit if formats grow.
- `errorCode` is nullable and meaningful only when `status = FAILED`.
- The `uploadedBy` index exists because every query filters by it. An index on a column
  you never filter by is a write cost with no benefit.

## 2. Migrations, not `db push`

```
edit schema.prisma
  → npx prisma migrate dev --name add_document_sources --create-only
  → inspect the generated SQL
  → edit if needed (raw SQL, extensions, generated columns)
  → npx prisma migrate dev
  → npx prisma generate
```

Rules:

- `db push` is never used, even locally: it hides drift that production will discover.
- Every migration is reviewed as SQL, not as a schema diff.
- Raw SQL migrations are first-class. ADR-004 requires one for the generated `tsvector`.
- A migration that fails leaves the dev database in a known state; if it does not, reset
  and re-apply rather than patching by hand.

## 3. Generated search column

```sql
-- migration: add_search_vector
ALTER TABLE "DocumentChunk"
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED;

CREATE INDEX document_chunk_search_idx ON "DocumentChunk" USING GIN (search_vector);
```

Prisma does not know this column. That is acceptable: nothing writes it, and retrieval
uses raw SQL. Document the exception in the schema file as a comment so the next reader
does not think it was forgotten.

## 4. Transactions

```ts
await this.prisma.$transaction(async (tx) => {
  await tx.documentChunk.createMany({ data: chunks });
  await tx.document.update({
    where: { id },
    data: { extractedText, status: 'COMPLETED', errorCode: null },
  });
});
```

- One transaction for "chunks + status". If the process dies, neither exists.
- Do not call an external service inside a transaction. The provider call and the
  extraction happen outside; only the writes are transactional.
- The `PROCESSING` insert is a separate, earlier commit by design.
- Interactive transactions have a timeout; the 30 s budget must be shorter than it, or a
  slow extraction turns into a driver error instead of a domain error.

## 5. Projections

Never return a Prisma row directly:

```ts
const user = await tx.user.findUnique({
  where: { id },
  select: { id: true, name: true, email: true, createdAt: true },
});
```

- `passwordHash` cannot leak if it is never selected.
- DTO mapping is explicit and reviewable.
- A `toDocumentSummary(row)` function is the single place that shapes a document response.

## 6. Pagination

```ts
const [items, total] = await this.prisma.$transaction([
  this.prisma.document.findMany({
    where: { uploadedBy: userId },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: summarySelect,
  }),
  this.prisma.document.count({ where: { uploadedBy: userId } }),
]);
```

Offset pagination is fine at this scale. Cursor pagination is the upgrade path when page
depth grows; it is not needed for a company's document list.

## 7. N+1 and counts

`chunkCount` on a document summary needs a count per row. Two options:

- `_count: { select: { chunks: true } }` in the query (one join, readable).
- A denormalised counter (fast, but a second source of truth to maintain).

v1 uses `_count`. Correctness beats a micro-optimisation nobody measured.

## 8. Testing the database layer

- Integration tests run against a real Postgres (`TEST_DATABASE_URL` must end in `_test`).
- Truncate between tests: `TRUNCATE "Message","Conversation","DocumentChunk","Document","User" RESTART IDENTITY CASCADE`.
- Cascade behaviour is asserted, not assumed: create document + chunks, delete document,
  assert zero chunks.
- The unique constraint is asserted: inserting duplicate `(documentId, chunkIndex)` throws.

## 9. Seed

A seed creates one user with a known password and two documents with predictable content,
one Arabic and one English. It exists so the UI can be exercised without uploading during
development. It must never run against anything but a development database.

## 10. Question before moving on

> You add a column to `Message`. List, in order, every command you run and every file you
> touch, and explain why `prisma db push` is not on that list.
