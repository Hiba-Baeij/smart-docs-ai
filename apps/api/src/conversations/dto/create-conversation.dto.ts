import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * POST /api/conversations. Only a title, and it is optional. There is no `userId` field: a body
 * that carries one is rejected by the global whitelist, never read and never used as a fallback.
 */
export class CreateConversationDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  title?: string;
}
