-- Semantic retrieval (ADR-018): one embedding per chunk, compared by cosine similarity.
--
-- Stored as real[] (4 bytes per number), not as a pgvector column: the pgvector image could not
-- be downloaded on 2026-11-10, and at this size (hundreds to a few thousand chunks per user) an
-- exact comparison in SQL is fast enough. ADR-018 describes the upgrade to pgvector.
--
-- Vectors are stored at unit length, so cosine similarity is the dot product.
-- Nullable on purpose: a chunk stored before this migration, by the seed, or while the provider
-- was down still has its keyword search; `npm run db:embed -w api` fills it later.
-- 768 must equal EMBEDDING_DIMENSIONS in src/ai/embedding-provider.ts.

ALTER TABLE "DocumentChunk" ADD COLUMN "embedding" real[];

ALTER TABLE "DocumentChunk"
  ADD CONSTRAINT "document_chunk_embedding_size"
  CHECK ("embedding" IS NULL OR (array_ndims("embedding") = 1 AND cardinality("embedding") = 768));
