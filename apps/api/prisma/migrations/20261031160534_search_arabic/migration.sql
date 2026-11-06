-- The Phase 5 spike decided the text-search configuration (ADR-004, amended): 'arabic', not
-- 'simple'. Recall@6 20/20 against 18/20, MRR 0.925 against 0.875 on the spike questions.
-- The generated column cannot change its expression in place, so it is dropped (which drops
-- its GIN index) and added again. PostgreSQL rebuilds it for every existing row.

ALTER TABLE "DocumentChunk" DROP COLUMN "search_vector";

ALTER TABLE "DocumentChunk"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('arabic', coalesce("content", ''))) STORED;

CREATE INDEX "document_chunk_search_idx"
  ON "DocumentChunk" USING GIN ("search_vector");
