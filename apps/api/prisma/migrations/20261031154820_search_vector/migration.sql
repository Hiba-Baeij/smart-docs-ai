-- Full-text search over chunks (ADR-004, docs/tracks/ai/03-retrieval-with-postgres.md).
-- Raw SQL because Prisma's schema language cannot describe a generated tsvector column.
--
-- Extensions: unaccent (Latin accents) and pg_trgm (similarity for short queries and typos) are
-- candidates in the Phase 5 spike; creating them here makes the spike runnable. The text-search
-- configuration is 'simple' (no stemming, no stop words) until the spike decides otherwise.

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Maintained by PostgreSQL from "content": nothing in the application writes it.
ALTER TABLE "DocumentChunk"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce("content", ''))) STORED;

CREATE INDEX "document_chunk_search_idx"
  ON "DocumentChunk" USING GIN ("search_vector");
