import { packEvidence } from './evidence';
import type { ChunkHit } from '../search/chunk-search.service';

const hit = (id: string, content: string): ChunkHit => ({
  id,
  documentId: 'doc',
  documentName: 'file.pdf',
  chunkIndex: Number(id),
  content,
  pageNumber: 1,
  sheetName: null,
  score: 1,
});

describe('packEvidence', () => {
  it('keeps rank order, skips a nonfitting chunk, and cites only included chunks', () => {
    const result = packEvidence(
      [hit('1', 'one'), hit('2', 'x'.repeat(400)), hit('3', 'three')],
      45,
      3,
    );
    expect(result.chunks.map((c) => c.id)).toEqual(['1', '3']);
    expect(result.usedSources.map((s) => s.chunkIndex)).toEqual([1, 3]);
  });

  it('truncates a single oversized chunk at a sentence boundary within budget', () => {
    const result = packEvidence(
      [hit('1', 'First sentence. Second sentence. '.repeat(30))],
      22,
      6,
    );
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].content).toContain('First sentence.');
    expect(result.chunks[0].content).toMatch(/[.!?؟。]$/);
    expect(result.usedTokens).toBeLessThanOrEqual(22);
  });
});
