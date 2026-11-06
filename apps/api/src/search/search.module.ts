import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ChunkSearchService } from './chunk-search.service';
import { CHUNK_RETRIEVER, KeywordChunkRetriever } from './chunk-retriever';

@Module({
  imports: [PrismaModule],
  providers: [
    ChunkSearchService,
    KeywordChunkRetriever,
    { provide: CHUNK_RETRIEVER, useExisting: KeywordChunkRetriever },
  ],
  exports: [ChunkSearchService, CHUNK_RETRIEVER],
})
export class SearchModule {}
