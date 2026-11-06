import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type {
  DocumentDetail,
  DocumentPage,
  DocumentSummary,
} from '@smartdocs/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ValidationFailedError } from '../common/errors/app-error';
import { ListDocumentsQueryDto } from './dto/list-documents-query.dto';
import { DocumentsService } from './documents.service';
import { UploadDocumentService } from './upload-document.service';

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(
    private readonly uploadDocument: UploadDocumentService,
    private readonly documents: DocumentsService,
  ) {}

  /**
   * 201 `DocumentSummary`. The controller only moves bytes from the multipart body to the
   * use case; it knows nothing about extraction or chunks. Guards run before interceptors,
   * so an anonymous caller is rejected before multer reads any of the body.
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() userId: string,
  ): Promise<DocumentSummary> {
    if (!file) {
      throw new ValidationFailedError({ file: ['A file is required.'] });
    }
    return this.uploadDocument.execute({ userId, file });
  }

  /** 200 `DocumentPage`: the caller's documents, newest first. */
  @Get()
  list(
    @CurrentUser() userId: string,
    @Query() query: ListDocumentsQueryDto,
  ): Promise<DocumentPage> {
    return this.documents.list(userId, query);
  }

  /** 200 `DocumentDetail`, or 404 `DOCUMENT_NOT_FOUND` (also for another user's id). */
  @Get(':id')
  detail(
    @CurrentUser() userId: string,
    @Param('id') id: string,
  ): Promise<DocumentDetail> {
    return this.documents.detail(userId, id);
  }

  /** 204, or 404 `DOCUMENT_NOT_FOUND`. The chunks go with the document. */
  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.documents.remove(userId, id);
  }
}
