import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Trims surrounding whitespace before validation; leaves non-strings for the validators. */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Describes the HTTP boundary only (nestjs guide §4). Limits come from api-contract.md:
 * the password maximum matters because bcrypt silently truncates beyond 72 bytes, so a
 * generous cap with an honest UI hint is better than pretending longer passwords help.
 */
export class RegisterDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // Never trimmed: leading and trailing spaces are part of the password.
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;
}
