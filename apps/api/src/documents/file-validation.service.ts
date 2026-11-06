import { Injectable } from '@nestjs/common';
import type { FileType } from '@smartdocs/contracts';
import JSZip from 'jszip';
import { extname } from 'node:path';
import {
  UnsupportedFileTypeError,
  ValidationFailedError,
} from '../common/errors/app-error';

type UploadedFile = Pick<
  Express.Multer.File,
  'originalname' | 'mimetype' | 'buffer'
>;

const MIME_TYPES: Record<FileType, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const PDF_SIGNATURE = Buffer.from('%PDF-');
/** Local file header of a ZIP archive. An empty archive starts with a different signature. */
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/**
 * Entries an OOXML package must contain. Word and Excel always write these two parts, so a
 * plain ZIP, or a DOCX renamed to .xlsx, fails here.
 */
const REQUIRED_ZIP_ENTRIES: Record<'docx' | 'xlsx', string[]> = {
  docx: ['[Content_Types].xml', 'word/document.xml'],
  xlsx: ['[Content_Types].xml', 'xl/workbook.xml'],
};

/**
 * Upload validation steps 2-5 of ADR-007 (step 1, size, is the multipart parser's). The name
 * and MIME type come from the client, so they are only claims; the bytes decide. Cheap checks
 * run first and each rejection says which check failed, never what the file contained.
 */
@Injectable()
export class FileValidationService {
  /** Resolves with the verified type, or throws the specific rejection. */
  async validate(file: UploadedFile): Promise<FileType> {
    const type = this.typeFromExtension(file.originalname);
    this.checkDeclaredMime(type, file.mimetype);
    // Before the signature check: an empty file has no signature, but it is a malformed
    // request (422), not an unsupported type (415).
    this.checkNotEmpty(file.buffer);
    await this.checkContent(type, file.buffer);
    return type;
  }

  private typeFromExtension(originalName: string): FileType {
    const extension = extname(originalName).slice(1).toLowerCase();
    if (extension === 'pdf' || extension === 'docx' || extension === 'xlsx') {
      return extension;
    }
    throw new UnsupportedFileTypeError(
      'Unsupported file extension. Allowed: .pdf, .docx, .xlsx.',
    );
  }

  private checkDeclaredMime(type: FileType, declared: string): void {
    // "application/pdf; charset=binary" is the same type as "application/pdf".
    const mime = declared.split(';')[0].trim().toLowerCase();
    if (mime !== MIME_TYPES[type]) {
      throw new UnsupportedFileTypeError(
        'The declared content type does not match the file extension.',
      );
    }
  }

  private checkNotEmpty(buffer: Buffer): void {
    if (buffer.length === 0) {
      throw new ValidationFailedError({ file: ['The file is empty.'] });
    }
  }

  private async checkContent(type: FileType, buffer: Buffer): Promise<void> {
    const valid =
      type === 'pdf'
        ? buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)
        : await this.isOoxmlPackage(type, buffer);

    if (!valid) {
      throw new UnsupportedFileTypeError(
        `The file content is not a valid ${type.toUpperCase()} file.`,
      );
    }
  }

  private async isOoxmlPackage(
    type: 'docx' | 'xlsx',
    buffer: Buffer,
  ): Promise<boolean> {
    if (!buffer.subarray(0, ZIP_SIGNATURE.length).equals(ZIP_SIGNATURE)) {
      return false;
    }
    try {
      // Reads the archive's table of contents only; nothing is decompressed here.
      const archive = await JSZip.loadAsync(buffer);
      return REQUIRED_ZIP_ENTRIES[type].every(
        (name) => archive.file(name) !== null,
      );
    } catch {
      // Starts like a ZIP but is not one (truncated or corrupt).
      return false;
    }
  }
}
