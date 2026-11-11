import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { CHUNK_DOCUMENT } from '../chunking/chunk-document.token';
import { chunkDocument } from '../chunking/chunker';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import {
  DOCUMENT_EXTRACTORS,
  type DocumentExtractor,
} from './extraction/document-extractor';
import { DocxExtractor } from './extraction/docx.extractor';
import { PdfExtractor } from './extraction/pdf.extractor';
import { XlsxExtractor } from './extraction/xlsx.extractor';
import { FileValidationService } from './file-validation.service';
import { UploadDocumentService } from './upload-document.service';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    AiModule,
    // FileInterceptor reads these options. Memory storage: the file lives only as a Buffer for
    // the length of the request and never touches the disk (ADR-006). `fileSize` makes multer
    // stop reading and discard the rest of an oversized body (413, nothing stored). A second
    // file is rejected by FileInterceptor's single('file'), so no file-count limit is needed.
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        storage: memoryStorage(),
        // Browsers send file names as UTF-8; multer's default (latin1) would garble Arabic names.
        defParamCharset: 'utf8',
        limits: { fileSize: config.getOrThrow<number>('MAX_UPLOAD_BYTES') },
      }),
    }),
  ],
  controllers: [DocumentsController],
  providers: [
    FileValidationService,
    PdfExtractor,
    DocxExtractor,
    XlsxExtractor,
    {
      provide: DOCUMENT_EXTRACTORS,
      inject: [PdfExtractor, DocxExtractor, XlsxExtractor],
      useFactory: (...extractors: DocumentExtractor[]) => extractors,
    },
    { provide: CHUNK_DOCUMENT, useValue: chunkDocument },
    DocumentsService,
    UploadDocumentService,
  ],
})
export class DocumentsModule {}
