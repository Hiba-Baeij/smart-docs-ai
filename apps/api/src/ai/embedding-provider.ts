/**
 * Turns text into vectors whose distance reflects meaning (ADR-018). Two texts that say the same
 * thing in different words, or in different languages, get vectors that are close together.
 */
export interface EmbeddingProvider {
  /** False when no embedding model is configured: retrieval then stays keyword-only. */
  readonly enabled: boolean;
  /**
   * One vector of EMBEDDING_DIMENSIONS numbers per input text, in the same order, each of unit
   * length (so cosine similarity is a plain dot product in SQL).
   */
  embed(texts: string[], timeoutMs: number): Promise<number[][]>;
}

export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');

/**
 * The size of every stored vector. A CHECK constraint on the column enforces it, and changing it
 * needs new embeddings for every chunk: it is a constant, not configuration.
 */
export const EMBEDDING_DIMENSIONS = 768;

/**
 * Embedding models read a limited number of tokens. A chunk can reach 1200 words, so the text sent
 * for embedding is cut to its start; the full chunk is still stored, searched by keyword and sent
 * to the model as evidence.
 */
export const MAX_EMBEDDING_INPUT_CHARS = 6000;

/** Scales a vector to length 1. A zero vector cannot be compared and is rejected. */
export function toUnitLength(vector: number[]): number[] {
  const length = Math.hypot(...vector);
  if (!Number.isFinite(length) || length === 0) {
    throw new RangeError('An embedding must have a finite, non-zero length.');
  }
  return vector.map((value) => value / length);
}

/**
 * The PostgreSQL array text form, `{0.1,0.2,...}`, cast to real[] in SQL. Bound as a parameter,
 * never interpolated into the statement. (With pgvector it would be `[...]`: see ADR-018.)
 */
export function toEmbeddingLiteral(vector: number[]): string {
  if (
    vector.length !== EMBEDDING_DIMENSIONS ||
    vector.some((value) => !Number.isFinite(value))
  ) {
    throw new RangeError(
      `An embedding must have ${EMBEDDING_DIMENSIONS} finite numbers.`,
    );
  }
  return `{${vector.join(',')}}`;
}

/** Used when no model is configured. Nothing calls `embed` on it: callers check `enabled`. */
export class DisabledEmbeddingProvider implements EmbeddingProvider {
  readonly enabled = false;

  embed(): Promise<number[][]> {
    return Promise.reject(new Error('No embedding model is configured.'));
  }
}
