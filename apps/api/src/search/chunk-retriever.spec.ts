import type { ConfigService } from '@nestjs/config';
import {
  DisabledEmbeddingProvider,
  type EmbeddingProvider,
} from '../ai/embedding-provider';
import { ProviderFailure } from '../ai/provider-failure';
import type { ChunkHit, ChunkSearchService } from './chunk-search.service';
import {
  HybridChunkRetriever,
  RRF_K,
  fuseByReciprocalRank,
} from './chunk-retriever';

const hit = (id: string): ChunkHit => ({
  id,
  documentId: 'doc',
  documentName: 'doc.pdf',
  chunkIndex: 0,
  content: id,
  pageNumber: null,
  sheetName: null,
  score: 0,
});

const ids = (hits: ChunkHit[]) => hits.map((h) => h.id);

describe('fuseByReciprocalRank', () => {
  it('ranks a chunk found by both searches above chunks found by one', () => {
    const fused = fuseByReciprocalRank(
      [
        [hit('a'), hit('b')],
        [hit('c'), hit('b')],
      ],
      10,
    );
    expect(ids(fused)).toEqual(['b', 'a', 'c']);
    expect(fused[0].score).toBeCloseTo(2 / (RRF_K + 2));
  });

  it('breaks ties by the keyword list first, then the semantic list', () => {
    expect(ids(fuseByReciprocalRank([[hit('k1')], [hit('s1')]], 10))).toEqual([
      'k1',
      's1',
    ]);
  });

  it('cuts to the limit and handles empty lists', () => {
    expect(
      ids(fuseByReciprocalRank([[hit('a'), hit('b'), hit('c')], []], 2)),
    ).toEqual(['a', 'b']);
    expect(fuseByReciprocalRank([[], []], 5)).toEqual([]);
  });
});

describe('HybridChunkRetriever', () => {
  const config = {
    get: (_key: string, fallback: unknown) => fallback,
  } as unknown as ConfigService;
  const input = { userId: 'user', question: 'remote work', limit: 5 };

  const searchWith = (keyword: ChunkHit[], semantic: ChunkHit[]) => {
    const calls = { vector: 0 };
    const search = {
      search: () => Promise.resolve(keyword),
      searchByVector: () => {
        calls.vector++;
        return Promise.resolve(semantic);
      },
    } as unknown as ChunkSearchService;
    return { search, calls };
  };

  it('fuses keyword and semantic results', async () => {
    const { search } = searchWith([hit('k')], [hit('s'), hit('k')]);
    const embeddings: EmbeddingProvider = {
      enabled: true,
      embed: () => Promise.resolve([[0.1]]),
    };
    const result = await new HybridChunkRetriever(
      search,
      embeddings,
      config,
    ).retrieve(input);
    expect(ids(result)).toEqual(['k', 's']);
  });

  it('is keyword-only when no embedding model is configured', async () => {
    const { search, calls } = searchWith([hit('k')], [hit('s')]);
    const result = await new HybridChunkRetriever(
      search,
      new DisabledEmbeddingProvider(),
      config,
    ).retrieve(input);
    expect(ids(result)).toEqual(['k']);
    expect(calls.vector).toBe(0);
  });

  it('falls back to keyword results when the question cannot be embedded', async () => {
    const { search, calls } = searchWith([hit('k')], [hit('s')]);
    const failing: EmbeddingProvider = {
      enabled: true,
      embed: () => Promise.reject(new ProviderFailure('AI_TIMEOUT', true)),
    };
    const result = await new HybridChunkRetriever(
      search,
      failing,
      config,
    ).retrieve(input);
    expect(ids(result)).toEqual(['k']);
    expect(calls.vector).toBe(0);
  });
});
