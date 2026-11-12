import { Inject, Injectable, Logger } from '@nestjs/common';
import { noteDiagnostic } from '../common/diagnostics/diagnostics';
import { ConfigService } from '@nestjs/config';
import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from '../ai/embedding-provider';
import {
  ChunkHit,
  ChunkSearchService,
  SearchChunksInput,
} from './chunk-search.service';

export interface ChunkRetriever {
  retrieve(input: SearchChunksInput): Promise<ChunkHit[]>;
}

export const CHUNK_RETRIEVER = Symbol('CHUNK_RETRIEVER');

@Injectable()
export class KeywordChunkRetriever implements ChunkRetriever {
  constructor(private readonly search: ChunkSearchService) {}

  retrieve(input: SearchChunksInput): Promise<ChunkHit[]> {
    return this.search.search(input);
  }
}

/** The constant of Reciprocal Rank Fusion. 60 is the value from the original paper. */
export const RRF_K = 60;

/**
 * Reciprocal Rank Fusion: each list gives a chunk 1 / (RRF_K + rank). A chunk found by both
 * searches adds both shares, so it rises above one found by only one. Ranks are used, not raw
 * scores, because a keyword rank and a cosine similarity are not on the same scale.
 * Ties keep the order of the first list (keyword), then of the second.
 */
export function fuseByReciprocalRank(
  lists: ChunkHit[][],
  limit: number,
): ChunkHit[] {
  const fused = new Map<
    string,
    { hit: ChunkHit; score: number; first: number }
  >();
  let seen = 0;
  for (const list of lists) {
    list.forEach((hit, rank) => {
      const share = 1 / (RRF_K + rank + 1);
      const entry = fused.get(hit.id);
      if (entry) {
        entry.score += share;
      } else {
        fused.set(hit.id, { hit, score: share, first: seen++ });
      }
    });
  }
  return [...fused.values()]
    .sort((a, b) => b.score - a.score || a.first - b.first)
    .slice(0, limit)
    .map(({ hit, score }) => ({ ...hit, score }));
}

/**
 * Keyword and semantic retrieval together (ADR-018). Keyword search finds exact words, numbers
 * and names; semantic search finds the same meaning in other words or another language. If the
 * question cannot be embedded (no model, timeout, outage) the answer still has keyword results.
 */
@Injectable()
export class HybridChunkRetriever implements ChunkRetriever {
  private readonly logger = new Logger(HybridChunkRetriever.name);

  constructor(
    private readonly search: ChunkSearchService,
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProvider,
    private readonly config: ConfigService,
  ) {}

  async retrieve(input: SearchChunksInput): Promise<ChunkHit[]> {
    const [keyword, semantic] = await Promise.all([
      this.search.search(input),
      this.semantic(input),
    ]);
    const event = {
      event: 'retrieval',
      keywordHits: keyword.length,
      semanticHits: semantic?.length ?? null,
    };
    this.logger.log(event);
    noteDiagnostic(event);
    if (!semantic) return keyword;
    return fuseByReciprocalRank([keyword, semantic], input.limit);
  }

  /** Null when semantic retrieval is off or failed: the caller falls back to keyword only. */
  private async semantic(input: SearchChunksInput): Promise<ChunkHit[] | null> {
    if (!this.embeddings.enabled) return null;
    try {
      const [vector] = await this.embeddings.embed(
        [input.question],
        this.config.get<number>('EMBEDDING_TIMEOUT_MS', 10_000),
      );
      return await this.search.searchByVector({
        userId: input.userId,
        vector,
        limit: input.limit,
        maxDistance: this.config.get<number>('VECTOR_MAX_DISTANCE', 0.5),
      });
    } catch (error) {
      // The question text never enters the log, only that this path was skipped and why.
      const event = {
        event: 'semantic_retrieval_skipped',
        code: error instanceof Error && 'code' in error ? error.code : 'ERROR',
      };
      this.logger.warn(event);
      noteDiagnostic(event);
      return null;
    }
  }
}
