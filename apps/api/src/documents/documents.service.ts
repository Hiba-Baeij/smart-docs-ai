import { Injectable } from '@nestjs/common';
import type {
  ChunkPreview,
  DocumentDetail,
  DocumentPage,
} from '@smartdocs/contracts';
import { ResourceNotFoundError } from '../common/errors/app-error';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toDocumentSummary } from './document-summary';
import type { ListDocumentsQueryDto } from './dto/list-documents-query.dto';

const PREVIEW_CHARACTERS = 200;

/**
 * Reading and deleting a user's documents. Every query carries the owner taken from the session,
 * in the same statement as the lookup: another user's document is indistinguishable from one that
 * does not exist (404, never 403), so ids cannot be probed.
 */
@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of the caller's documents, newest first. `chunkCount` comes from `_count` in the
   * same query as the rows: one statement for the page, however many documents it holds (no N+1).
   */
  async list(
    userId: string,
    { page, pageSize, status }: ListDocumentsQueryDto,
  ): Promise<DocumentPage> {
    const where: Prisma.DocumentWhereInput = {
      uploadedBy: userId,
      ...(status ? { status } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.document.count({ where }),
      this.prisma.document.findMany({
        where,
        // The id breaks a tie between two uploads in the same millisecond, so pages never overlap.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          originalName: true,
          fileType: true,
          status: true,
          errorCode: true,
          createdAt: true,
          _count: { select: { chunks: true } },
        },
      }),
    ]);

    return {
      items: rows.map((row) => toDocumentSummary(row, row._count.chunks)),
      page,
      pageSize,
      total,
    };
  }

  /** The document with its text and a preview of each chunk, or 404 for any id that is not theirs. */
  async detail(userId: string, id: string): Promise<DocumentDetail> {
    const document = await this.prisma.document.findFirst({
      where: { id, uploadedBy: userId },
    });
    if (!document) {
      throw new ResourceNotFoundError('DOCUMENT');
    }

    // The preview is cut in the database: the full text of every chunk would roughly double the
    // payload of a large document for something the page only shows the start of.
    const chunks = await this.prisma.$queryRaw<ChunkPreview[]>(Prisma.sql`
      SELECT "chunkIndex",
             "pageNumber",
             "sheetName",
             left("content", ${PREVIEW_CHARACTERS}) AS preview
        FROM "DocumentChunk"
       WHERE "documentId" = ${document.id}
       ORDER BY "chunkIndex" ASC`);

    return {
      ...toDocumentSummary(document, chunks.length),
      extractedText: document.extractedText,
      chunks,
    };
  }

  /**
   * Deletes the document and, through the foreign key's cascade, its chunks, in one statement's
   * transaction. `deleteMany` with the owner in the filter answers "how many rows" in the same
   * round trip, so ownership and deletion cannot drift apart: zero rows is a 404, whether the
   * document never existed, belongs to someone else, or was already deleted.
   */
  async remove(userId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.document.deleteMany({
        where: { id, uploadedBy: userId },
      });
      if (deleted.count === 0) {
        throw new ResourceNotFoundError('DOCUMENT');
      }
    });
  }
}
