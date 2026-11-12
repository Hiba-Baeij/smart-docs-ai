import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@smartdocs/contracts';
import type { DocumentSummary, FileType } from '@smartdocs/contracts';
import {
  EMBEDDING_PROVIDER,
  toEmbeddingLiteral,
  type EmbeddingProvider,
} from '../ai/embedding-provider';
import { Prisma } from '../generated/prisma/client';
import {
  AppError,
  EmptyExtractionError,
  ExtractedTextTooLargeError,
  ExtractionFailedError,
  ProcessingTimeoutError,
} from '../common/errors/app-error';
import type { ChunkConfig } from '../chunking/chunk-config';
import {
  CHUNK_DOCUMENT,
  type ChunkDocument,
} from '../chunking/chunk-document.token';
import type { ChunkDraft } from '../chunking/chunker';
import {
  describeError,
  noteDiagnostic,
} from '../common/diagnostics/diagnostics';
import { PrismaService } from '../prisma/prisma.service';
import { toDocumentSummary } from './document-summary';
import {
  DOCUMENT_EXTRACTORS,
  type DocumentExtractor,
} from './extraction/document-extractor';
import { toStorableDocument } from './extracted-text';
import { FileValidationService } from './file-validation.service';
import { sanitizeOriginalName } from './original-name';

export type UploadDocumentInput = {
  userId: string;
  file: Express.Multer.File;
};

/**
 * The upload use case (ADR-006): validate, record `PROCESSING`, extract, then record the
 * outcome. Nothing here is one big transaction on purpose: the `PROCESSING` row is committed
 * before the slow extraction, so a failure always leaves a row that says what happened, and no
 * database connection is held while a parser runs.
 */
@Injectable()
export class UploadDocumentService {
  private readonly logger = new Logger(UploadDocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: FileValidationService,
    @Inject(DOCUMENT_EXTRACTORS)
    private readonly extractors: DocumentExtractor[],
    @Inject(CHUNK_DOCUMENT)
    private readonly chunkDocument: ChunkDocument,
    private readonly config: ConfigService,
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddings: EmbeddingProvider,
  ) {}

  async execute({
    userId,
    file,
  }: UploadDocumentInput): Promise<DocumentSummary> {
    // Rejections here create no row: there is nothing worth recording about a bad request.
    const fileType = await this.validation.validate(file);

    const document = await this.prisma.document.create({
      data: {
        originalName: sanitizeOriginalName(file.originalname),
        fileType,
        extractedText: '',
        status: 'PROCESSING',
        uploadedBy: userId,
      },
    });

    noteDiagnostic({
      event: 'document_created',
      documentId: document.id,
      fileType,
    });
    try {
      const { text, chunks } = await this.extractAndChunk(fileType, file);
      // Before the transaction: a network call must not hold a database connection open.
      const vectors = await this.embedChunks(chunks);

      // The one place that needs atomicity (ADR-006): the chunks and the COMPLETED status are
      // written together or not at all, so "COMPLETED without chunks" and "chunks of a document
      // that never completed" cannot exist. The unique (documentId, chunkIndex) constraint is
      // the backstop against a chunker that numbers wrongly.
      const completed = await this.prisma.$transaction(
        async (tx) => {
          await tx.documentChunk.createMany({
            data: chunks.map((chunk) => ({
              documentId: document.id,
              chunkIndex: chunk.chunkIndex,
              content: chunk.content,
              pageNumber: chunk.pageNumber,
              sheetName: chunk.sheetName,
            })),
          });
          if (vectors) {
            // createMany cannot write an Unsupported column; one UPDATE sets every embedding.
            // Each vector is a bound parameter cast in SQL, never text in the statement.
            await tx.$executeRaw(Prisma.sql`
              UPDATE "DocumentChunk" AS c
                 SET embedding = v.embedding::real[]
                FROM unnest(
                       ${chunks.map((chunk) => chunk.chunkIndex)}::int[],
                       ${vectors.map(toEmbeddingLiteral)}::text[]
                     ) AS v("chunkIndex", embedding)
               WHERE c."documentId" = ${document.id}
                 AND c."chunkIndex" = v."chunkIndex"`);
          }
          return tx.document.update({
            where: { id: document.id },
            data: { extractedText: text, status: 'COMPLETED' },
          });
        },
        // The transaction has its own limit. UPLOAD_TIMEOUT_MS covers extraction and chunking,
        // which have finished before it opens, so the two never overlap.
        { maxWait: 5_000, timeout: 15_000 },
      );
      return toDocumentSummary(completed, chunks.length);
    } catch (error) {
      // Anything that is not an AppError is unexpected (a database error, a bug): the client
      // sees INTERNAL and the stack goes to the log through the exception filter.
      await this.markFailed(
        document.id,
        error instanceof AppError ? error.code : ErrorCode.INTERNAL,
      );
      throw error;
    }
  }

  /** Everything between the bytes and the rows to store, inside the time budget. */
  private async extractAndChunk(
    fileType: FileType,
    file: Express.Multer.File,
  ): Promise<{ text: string; chunks: ChunkDraft[] }> {
    const extractor = this.extractors.find((candidate) =>
      candidate.supports(fileType),
    );
    if (!extractor) {
      // Validation only returns types we support, so this is a wiring bug, not a bad upload.
      throw new Error(`No extractor is registered for "${fileType}".`);
    }

    return this.withinBudget(
      extractor
        .extract({ buffer: file.buffer, originalName: file.originalname })
        .catch((error: unknown) => {
          this.logger.warn(`extraction failed (${fileType})`);
          // The parser's own error is the real reason; the client only ever sees EXTRACTION_FAILED.
          noteDiagnostic({
            event: 'extraction_failed',
            fileType,
            parserError: describeError(error),
          });
          throw new ExtractionFailedError();
        })
        .then((extracted) => {
          const document = toStorableDocument(extracted);
          noteDiagnostic({
            event: 'extracted',
            fileType,
            characters: document.text.length,
          });

          if (document.text.trim() === '') {
            throw new EmptyExtractionError();
          }
          if (
            document.text.length >
            this.config.getOrThrow<number>('MAX_EXTRACTED_CHARS')
          ) {
            throw new ExtractedTextTooLargeError();
          }

          const chunks = this.chunkDocument(document, this.chunkConfig());
          noteDiagnostic({ event: 'chunked', chunks: chunks.length });
          if (chunks.length === 0) {
            throw new EmptyExtractionError();
          }
          return { text: document.text, chunks };
        }),
    );
  }

  /**
   * One vector per chunk, or null when semantic retrieval is off or the provider failed. A failure
   * does not fail the upload: the document is still found by keyword, and `npm run db:embed -w api`
   * adds the missing embeddings later (ADR-018).
   */
  private async embedChunks(chunks: ChunkDraft[]): Promise<number[][] | null> {
    if (!this.embeddings.enabled) return null;
    try {
      return await this.embeddings.embed(
        chunks.map((chunk) => chunk.content),
        this.config.get<number>('EMBEDDING_TIMEOUT_MS', 10_000),
      );
    } catch (error) {
      const event = {
        event: 'chunk_embedding_skipped',
        chunks: chunks.length,
        code: error instanceof AppError ? error.code : 'ERROR',
      };
      this.logger.warn(event);
      noteDiagnostic(event);
      return null;
    }
  }

  private chunkConfig(): ChunkConfig {
    return {
      targetWords: this.config.getOrThrow<number>('CHUNK_TARGET_WORDS'),
      overlapWords: this.config.getOrThrow<number>('CHUNK_OVERLAP_WORDS'),
      maxWords: this.config.getOrThrow<number>('CHUNK_MAX_WORDS'),
    };
  }

  /**
   * Stops waiting after UPLOAD_TIMEOUT_MS. The parser itself cannot be cancelled, so it may keep
   * running after the client has its 504; its late result is ignored and never changes the row.
   */
  private withinBudget<T>(work: Promise<T>): Promise<T> {
    const budgetMs = this.config.getOrThrow<number>('UPLOAD_TIMEOUT_MS');
    let timer: NodeJS.Timeout | undefined;
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ProcessingTimeoutError()), budgetMs);
    });
    return Promise.race([work, expired]).finally(() => clearTimeout(timer));
  }

  /**
   * Records the failure. If that write fails too (the database is the problem), the row stays
   * `PROCESSING`, which is honest evidence of a crash mid-request, and the original error
   * is still the one reported.
   */
  private async markFailed(id: string, errorCode: ErrorCode): Promise<void> {
    try {
      await this.prisma.document.update({
        where: { id },
        data: { status: 'FAILED', errorCode },
      });
    } catch (error) {
      this.logger.error(
        `could not mark document ${id} as FAILED (${errorCode})`,
      );
      noteDiagnostic({
        event: 'mark_failed_failed',
        documentId: id,
        error: describeError(error),
      });
    }
  }
}
