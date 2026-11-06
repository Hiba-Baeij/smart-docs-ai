import type {
  DocumentStatus,
  ErrorCode,
  DocumentSummary,
  FileType,
} from '@smartdocs/contracts';

type DocumentRow = {
  id: string;
  originalName: string;
  fileType: string;
  status: DocumentStatus;
  errorCode: string | null;
  createdAt: Date;
};

/** The single place that shapes a document for the outside world (never `uploadedBy`, never the text). */
export function toDocumentSummary(
  row: DocumentRow,
  chunkCount: number,
): DocumentSummary {
  return {
    id: row.id,
    originalName: row.originalName,
    // Written only by the upload use case from a verified FileType (see the schema comment).
    fileType: row.fileType as FileType,
    status: row.status,
    // Written only from ErrorCode values (see the schema comment).
    errorCode: row.errorCode as ErrorCode | null,
    chunkCount,
    createdAt: row.createdAt.toISOString(),
  };
}
