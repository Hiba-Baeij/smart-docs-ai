import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ChunkSearchService } from './chunk-search.service';
import {
  CHUNK_RETRIEVER,
  HybridChunkRetriever,
  KeywordChunkRetriever,
} from './chunk-retriever';

@Module({
  imports: [PrismaModule, AiModule],
  providers: [
    ChunkSearchService,
    KeywordChunkRetriever,
    HybridChunkRetriever,
    // Hybrid behaves exactly like keyword-only when no embedding model is configured (ADR-018).
    { provide: CHUNK_RETRIEVER, useExisting: HybridChunkRetriever },
  ],
  exports: [ChunkSearchService, CHUNK_RETRIEVER],
})
export class SearchModule {}
