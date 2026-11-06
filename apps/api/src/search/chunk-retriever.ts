import { Injectable } from '@nestjs/common';
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
