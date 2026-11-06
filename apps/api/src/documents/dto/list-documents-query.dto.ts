import type { DocumentStatus } from '@smartdocs/contracts';
import { IsIn, IsOptional } from 'class-validator';
import { PageQueryDto } from '../../common/pagination/page-query.dto';

const STATUSES: DocumentStatus[] = ['PROCESSING', 'COMPLETED', 'FAILED'];

/** Query string of GET /api/documents: the page, and optionally only one status. */
export class ListDocumentsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: DocumentStatus;
}
