import type { chunkDocument } from './chunker';

/**
 * Injection token for the chunking function. It is a pure function, so it could be imported
 * directly; being injectable lets a test hand the use case a faulty chunker, which is the only
 * honest way to prove that the unique (documentId, chunkIndex) constraint and the transaction are
 * the backstop against a chunker bug.
 */
export const CHUNK_DOCUMENT = Symbol('CHUNK_DOCUMENT');

export type ChunkDocument = typeof chunkDocument;
