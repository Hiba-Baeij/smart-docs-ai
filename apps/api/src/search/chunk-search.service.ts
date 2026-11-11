import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { toEmbeddingLiteral, toUnitLength } from '../ai/embedding-provider';
import { PrismaService } from '../prisma/prisma.service';
import { isStopWord, tokenize } from './query-terms';

export type SearchChunksInput = {
  /**
   * Whose documents to search. Required by the type and applied in the SQL, in the same
   * statement that ranks: there is no way to search "everything".
   */
  userId: string;
  question: string;
  /** How many chunks to return, 1 to MAX_LIMIT. */
  limit: number;
};

export type ChunkHit = {
  id: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string;
  pageNumber: number | null;
  sheetName: string | null;
  /** `ts_rank_cd`: higher is better. Only comparable within one search. */
  score: number;
};

export const MAX_LIMIT = 100;

/**
 * Keyword retrieval (ADR-004, amended by the Phase 5 spike): the chunks of the caller's finished
 * documents that contain the content words of the question, best match first.
 *
 * It returns candidates, not answers: ranking is by cover density, so it finds passages that use
 * the words of the question, and cannot find a paraphrase that shares none (docs/tracks/ai/03).
 */
@Injectable()
export class ChunkSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search({
    userId,
    question,
    limit,
  }: SearchChunksInput): Promise<ChunkHit[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new RangeError(`limit must be an integer from 1 to ${MAX_LIMIT}.`);
    }

    const queryText = contentQuery(question);
    if (queryText === '') {
      // Nothing but stop words or punctuation: an empty query would match everything or nothing.
      return [];
    }

    // Every value is a bound parameter; the SQL text has no interpolation. The owner filter and
    // the status filter are in the same statement as the rank: never rank first and filter later.
    return this.prisma.$queryRaw<ChunkHit[]>(Prisma.sql`
      SELECT c.id,
             c."documentId",
             d."originalName" AS "documentName",
             c."chunkIndex",
             c.content,
             c."pageNumber",
             c."sheetName",
             ts_rank_cd(c.search_vector, q.query)::float8 AS score
        FROM "DocumentChunk" c
        JOIN "Document" d ON d.id = c."documentId"
       CROSS JOIN LATERAL (
             SELECT websearch_to_tsquery('arabic', ${queryText}) AS query
       ) q
       WHERE d."uploadedBy" = ${userId}
         AND d.status = 'COMPLETED'
         AND c.search_vector @@ q.query
       ORDER BY score DESC, d."createdAt" DESC, c."chunkIndex" ASC
       LIMIT ${limit}`);
  }

  /**
   * Semantic retrieval (ADR-018): the caller's chunks whose embedding is closest to `vector`,
   * nearest first. `score` is the cosine similarity (1 = same direction) and `maxDistance` is a
   * cosine distance (1 - similarity). Chunks without an embedding are not candidates here; the
   * keyword search still finds them.
   */
  async searchByVector({
    userId,
    vector,
    limit,
    maxDistance,
  }: {
    userId: string;
    vector: number[];
    limit: number;
    maxDistance: number;
  }): Promise<ChunkHit[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new RangeError(`limit must be an integer from 1 to ${MAX_LIMIT}.`);
    }
    const literal = toEmbeddingLiteral(toUnitLength(vector));
    // Same rule as above: the owner and status filters are in the ranking statement. Both sides
    // are unit length, so the dot product is the cosine similarity. It is an exact scan of the
    // caller's chunks; ADR-018 describes the pgvector index for when that becomes too slow.
    return this.prisma.$queryRaw<ChunkHit[]>(Prisma.sql`
      SELECT id, "documentId", "documentName", "chunkIndex", content, "pageNumber", "sheetName",
             similarity AS score
        FROM (
          SELECT c.id,
                 c."documentId",
                 d."originalName" AS "documentName",
                 c."chunkIndex",
                 c.content,
                 c."pageNumber",
                 c."sheetName",
                 d."createdAt",
                 (SELECT sum(a::float8 * b::float8)
                    FROM unnest(c.embedding, q.embedding) AS pair(a, b))::float8 AS similarity
            FROM "DocumentChunk" c
            JOIN "Document" d ON d.id = c."documentId"
           CROSS JOIN (SELECT ${literal}::real[] AS embedding) q
           WHERE d."uploadedBy" = ${userId}
             AND d.status = 'COMPLETED'
             AND c.embedding IS NOT NULL
        ) ranked
       WHERE 1 - similarity <= ${maxDistance}
       ORDER BY similarity DESC, "createdAt" DESC, "chunkIndex" ASC
       LIMIT ${limit}`);
  }
}

/**
 * The question's content words joined with `or`. websearch_to_tsquery needs every word of a
 * question to match, and a real question carries words the answer does not ("what", "is", "ما",
 * "كم"), so passing the question as typed finds almost nothing (ADR-004, measured). Words are
 * only letters, digits and their marks, so none of them can be a search operator.
 */
export function contentQuery(question: string): string {
  return tokenize(question)
    .filter((token) => !isStopWord(token))
    .join(' or ');
}
