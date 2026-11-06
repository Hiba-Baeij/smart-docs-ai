import { Injectable } from '@nestjs/common';
import type { UserSummary } from '@smartdocs/contracts';
import { EmailTakenError } from '../common/errors/app-error';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeEmail } from './email';

/** The only columns a normal query selects, so the password hash cannot leak by accident. */
const userSelect = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
} as const;

type UserRow = { id: string; name: string; email: string; createdAt: Date };

/** The single place that shapes a user for the outside world. */
function toUserSummary(row: UserRow): UserSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.createdAt.toISOString(),
  };
}

export type UserCredentials = { user: UserSummary; passwordHash: string };

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a user. The email is normalised first. A duplicate is detected by the database's
   * unique constraint, not by a prior lookup, so two simultaneous registrations cannot both
   * succeed.
   */
  async create(input: {
    name: string;
    email: string;
    passwordHash: string;
  }): Promise<UserSummary> {
    try {
      const row = await this.prisma.user.create({
        data: {
          name: input.name,
          email: normalizeEmail(input.email),
          passwordHash: input.passwordHash,
        },
        select: userSelect,
      });
      return toUserSummary(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new EmailTakenError();
      }
      throw error;
    }
  }

  /** The caller's own profile. The id comes from the verified token, never from input. */
  async findById(id: string): Promise<UserSummary | null> {
    const row = await this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });
    return row ? toUserSummary(row) : null;
  }

  /**
   * The only method that returns the password hash. It exists for login and must not be used
   * to build a response.
   */
  async findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    const row = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
      select: { ...userSelect, passwordHash: true },
    });
    return row
      ? { user: toUserSummary(row), passwordHash: row.passwordHash }
      : null;
  }
}
