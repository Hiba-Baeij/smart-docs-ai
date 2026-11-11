import { normalizeSearchText } from '../search/normalize-search-text';
import { isStopWord, tokenize } from '../search/query-terms';
import {
  EMBEDDING_DIMENSIONS,
  type EmbeddingProvider,
} from './embedding-provider';

/**
 * Deterministic local stand-in for an embedding model, used with the mock LLM. Each content word
 * adds weight to one hashed position, so texts that share words are close and texts that share
 * none are not. It knows nothing about meaning: it exercises the vector path, not its quality.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly enabled = true;

  embed(texts: string[]): Promise<number[][]> {
    return Promise.resolve(texts.map(mockVector));
  }
}

export function mockVector(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const token of tokenize(text)) {
    if (isStopWord(token)) continue;
    vector[hash(normalizeSearchText(token)) % EMBEDDING_DIMENSIONS] += 1;
  }
  const length = Math.hypot(...vector);
  // An empty text still needs a valid vector; one fixed position keeps it far from real text.
  if (length === 0) {
    vector[0] = 1;
    return vector;
  }
  return vector.map((value) => value / length);
}

/** FNV-1a: small, stable across runs and platforms. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (const char of text) {
    value ^= char.codePointAt(0)!;
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  // Position 0 is reserved for empty texts.
  return (value % (EMBEDDING_DIMENSIONS - 1)) + 1;
}
