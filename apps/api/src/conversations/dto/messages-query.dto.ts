import { PageQueryDto } from '../../common/pagination/page-query.dto';

/** A chat page is longer than a list page: 50 messages by default. */
export class MessagesQueryDto extends PageQueryDto {
  override pageSize: number = 50;
}
