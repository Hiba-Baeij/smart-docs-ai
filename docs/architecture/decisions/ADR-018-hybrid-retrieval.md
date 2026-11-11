# ADR-018: Hybrid retrieval with chunk embeddings

Status: accepted
Date: 2026-11-10
Amends: ADR-004 (keyword search stays, now one of two lists), ADR-016 (semantic search leaves the non-goals)

## Context

With a real model behind `LlmProvider`, answer quality was bounded by keyword retrieval, as
ADR-004 predicted:

- A question in another language than the document finds nothing ("كم يوماً أستطيع العمل من
  البيت؟" against an English remote-work policy). Measured on 2026-11-10: no chunk retrieved,
  so the model is never called.
- A synonym finds nothing ("راتب" does not match "أجر").

The PRD allowed semantic retrieval once storage, migrations and the retrieval strategy were
verified. This ADR records that.

## Decision

1. **Storage:** `DocumentChunk.embedding real[]`, nullable, with a CHECK that it has exactly 768
   numbers (migration `chunk_embedding`). Vectors are stored at unit length, so cosine similarity
   is a dot product. Prisma declares the column as `Unsupported("real[]")` so the 768 numbers are
   never part of an ordinary read; it is written and read only with raw SQL and bound parameters.
   768 is the constant `EMBEDDING_DIMENSIONS`.
2. **No extension.** pgvector was the first choice, but its image could not be downloaded on
   2026-11-10 (18 attempts, the connection to Docker Hub dropped every time). An exact scan in
   SQL needs no extension and is fast enough at this size. See "Upgrade to pgvector" below.
3. **Port:** `EmbeddingProvider` next to `LlmProvider` in `AiModule`.
   - `LLM_PROVIDER=mock`: `MockEmbeddingProvider`, hashed bag of words, deterministic, no network.
   - `LLM_PROVIDER=openai` with `EMBEDDING_MODEL`: `OpenAiCompatibleEmbeddingProvider`, the
     `/embeddings` endpoint on the same base URL and key (`dimensions: 768`), scaled to unit length.
   - `LLM_PROVIDER=openai` without `EMBEDDING_MODEL`: disabled, keyword-only retrieval.
4. **Upload:** chunks are embedded after extraction, before the transaction, and written in the
   same transaction as the chunks. If embedding fails or times out (`EMBEDDING_TIMEOUT_MS`), the
   upload still completes without embeddings; `npm run db:embed -w api` fills them later.
5. **Retrieval:** `HybridChunkRetriever` is bound to `CHUNK_RETRIEVER`. It runs the keyword search
   and a vector search in parallel and merges them with Reciprocal Rank Fusion (k = 60). Vector
   matches farther than `VECTOR_MAX_DISTANCE` (cosine distance, default 0.5) are dropped. If the
   question cannot be embedded, the result is the keyword list alone.
6. **Owner filter:** the vector query filters by owner and status in the same statement that
   ranks, like the keyword query (ADR-004).

## Measurements (2026-11-10, gemini-embedding-001, 768 dimensions)

| Question | Best match | Cosine similarity |
|---|---|---|
| كم يوماً أستطيع العمل من البيت؟ | English remote-work passage (correct) | 0.737 |
| same question | unrelated Arabic leave passages | 0.644 to 0.656 |
| كم راتبي الشهري؟ (not in the documents) | best unrelated passage | 0.602 |

The gap between a right and a wrong match is small (about 0.08), so no distance threshold can
separate them. The threshold only drops clear noise; the evidence rule (ADR-010) and the
`NO_EVIDENCE` sentinel still decide whether there is an answer.

## Upgrade to pgvector

When a user's chunk count makes the exact scan slow (thousands of chunks per question), or once
the image can be downloaded:

1. Image `pgvector/pgvector:<version>-pg17`. It is Debian-based, unlike `postgres:17-alpine`, so
   use a new volume: text ordering differs between the two C libraries and would invalidate
   indexes in a moved data directory.
2. Migration: `CREATE EXTENSION vector;` then
   `ALTER TABLE "DocumentChunk" ALTER COLUMN embedding TYPE vector(768) USING embedding::vector(768);`
   then `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops);`. Drop the CHECK constraint
   (the type enforces the size). Existing embeddings are kept; nothing is re-embedded.
3. Code: `toEmbeddingLiteral` returns `[...]` instead of `{...}`, the casts become `::vector`, and
   the similarity becomes `1 - (c.embedding <=> q)`. Retrieval, fusion and upload stay the same.
4. `prisma migrate dev` does not know the HNSW index type: create migrations with `--create-only`
   and check they do not drop it.

## Alternatives considered

- **Semantic only.** Weak on exact numbers, names and article references, where keyword search
  is strong. Rejected.
- **Score blending (weighted sum).** A `ts_rank_cd` value and a cosine similarity are not on the
  same scale; ranks are. Rejected for RRF.
- **Similarity in Node instead of SQL.** Would load every vector of the user per question and
  move the owner filter out of the ranking statement. Rejected.
- **Gemini native `embedContent` with `taskType`.** Slightly better retrieval quality, but ties
  the adapter to one vendor (ADR-008). Revisit if measured quality requires it.
- **A separate vector database.** One more service to run and secure for a few thousand chunks.

## Consequences

- Chunk text is sent to the embedding provider at upload time, not only at question time.
- Each question adds one embedding call (latency measured from 1 s to 15 s on the free tier).
  It runs in parallel with the keyword search and falls back to it on timeout.
- The vector query compares every embedded chunk of the caller: cost grows linearly with the
  user's chunks. No index until the pgvector upgrade.
- Changing the embedding model or the dimension means re-embedding every chunk.
