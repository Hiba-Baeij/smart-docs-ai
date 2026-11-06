import type { SourceReference } from '@smartdocs/contracts';
import type { ChunkHit } from '../search/chunk-search.service';

export type PackedEvidence = {
  chunks: ChunkHit[];
  usedSources: SourceReference[];
  usedTokens: number;
};

export const estimateTokens = (text: string): number =>
  Math.ceil(text.length / 4);

export function sourceOf(chunk: ChunkHit): SourceReference {
  return {
    documentId: chunk.documentId,
    documentName: chunk.documentName,
    chunkIndex: chunk.chunkIndex,
    pageNumber: chunk.pageNumber,
    sheetName: chunk.sheetName,
  };
}

export function evidenceHeader(index: number): string {
  return `[S${index}]`;
}

/** Preserve search ranking and cite only passages actually sent to the model. */
export function packEvidence(
  candidates: ChunkHit[],
  budgetTokens: number,
  topK: number,
): PackedEvidence {
  if (
    !Number.isInteger(budgetTokens) ||
    budgetTokens < 1 ||
    !Number.isInteger(topK) ||
    topK < 1
  ) {
    throw new RangeError('Evidence budget and topK must be positive integers.');
  }
  const chunks: ChunkHit[] = [];
  const usedSources: SourceReference[] = [];
  let usedTokens = 0;
  for (const chunk of candidates) {
    if (chunks.length >= topK) break;
    const headerCost = estimateTokens(evidenceHeader(chunks.length + 1));
    const cost = headerCost + estimateTokens(chunk.content);
    if (usedTokens + cost > budgetTokens) {
      if (chunks.length > 0 || headerCost >= budgetTokens) continue;
      const maxChars = (budgetTokens - headerCost) * 4;
      const prefix = chunk.content.slice(0, maxChars);
      const boundaries = [...prefix.matchAll(/[.!?؟。](?:\s|$)/g)];
      const last = boundaries.at(-1);
      const content = (
        last ? prefix.slice(0, last.index + 1) : prefix
      ).trimEnd();
      if (!content) continue;
      const shortened = { ...chunk, content };
      chunks.push(shortened);
      usedSources.push({ ...sourceOf(chunk), truncated: true });
      usedTokens += headerCost + estimateTokens(content);
      continue;
    }
    chunks.push(chunk);
    usedSources.push(sourceOf(chunk));
    usedTokens += cost;
  }
  return { chunks, usedSources, usedTokens };
}
