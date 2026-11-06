/** The chunking parameters of ADR-005. Passed in, never read from the environment inside chunking. */
export type ChunkConfig = {
  /** Words of new content a chunk grows to before the next one starts. */
  targetWords: number;
  /** Words repeated from the end of one chunk at the start of the next (text and PDF only). */
  overlapWords: number;
  /** No chunk, prefix and overlap included, has more words than this. */
  maxWords: number;
};

/**
 * Words reserved for the context a chunk may carry in front of its text (the heading path, or the
 * columns line of a split spreadsheet row). It is what lets the hard maximum hold even for a
 * chunk that has a prefix and an overlap.
 */
export const PREFIX_CAP_WORDS = 30;

/**
 * What a chunk may carry besides its new text: a prefix (the heading path, or a spreadsheet's
 * title and columns) and a heading carried over from the end of the previous chunk, each at most
 * PREFIX_CAP_WORDS. Together with the overlap this is what must still fit under the maximum.
 */
export const RESERVED_CONTEXT_WORDS = 2 * PREFIX_CAP_WORDS;

/** The values the application uses when nothing is configured (ADR-005). */
export const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  targetWords: 700,
  overlapWords: 100,
  maxWords: 1200,
};

/**
 * Throws when the parameters cannot honor the maximum: a chunk is at most the new content, the
 * overlap and the reserved context, so those must fit inside it.
 */
export function assertValidChunkConfig(config: ChunkConfig): void {
  const { targetWords, overlapWords, maxWords } = config;
  for (const [name, value] of Object.entries(config)) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(
        `Chunk ${name} must be a positive integer, got ${value}.`,
      );
    }
  }
  if (overlapWords >= targetWords) {
    throw new Error('Chunk overlapWords must be smaller than targetWords.');
  }
  if (targetWords + overlapWords + RESERVED_CONTEXT_WORDS > maxWords) {
    throw new Error(
      `Chunk maxWords must be at least targetWords + overlapWords + ${RESERVED_CONTEXT_WORDS}.`,
    );
  }
}
