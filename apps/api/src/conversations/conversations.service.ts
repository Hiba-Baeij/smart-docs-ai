import { Injectable } from '@nestjs/common';
import type {
  ConversationPage,
  ConversationSummary,
  MessagePage,
} from '@smartdocs/contracts';
import { ResourceNotFoundError } from '../common/errors/app-error';
import type { PageQueryDto } from '../common/pagination/page-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { toConversationSummary, toMessage } from './conversation-mappers';
import type { CreateConversationDto } from './dto/create-conversation.dto';

/**
 * A user's conversations. Every query carries the owner taken from the session, in the same
 * statement as the lookup: another user's conversation is indistinguishable from one that does not
 * exist (404, never 403), so ids cannot be probed.
 *
 * A message has no owner column, only a conversation. So every message query is preceded by
 * `findOwned`: filtering messages by `conversationId` alone looks complete and would return the
 * messages of anyone's conversation to whoever knows its id.
 */
@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    { title }: CreateConversationDto,
  ): Promise<ConversationSummary> {
    const conversation = await this.prisma.conversation.create({
      data: { userId, title: title ?? '' },
    });
    return toConversationSummary(conversation);
  }

  /** The caller's conversations, most recently active first. */
  async list(
    userId: string,
    { page, pageSize }: PageQueryDto,
  ): Promise<ConversationPage> {
    const where = { userId };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.findMany({
        where,
        // The id breaks a tie, so two conversations touched in the same millisecond never swap
        // between pages.
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: rows.map(toConversationSummary), page, pageSize, total };
  }

  /** One page of a conversation's messages, oldest first, or 404 for a conversation that is not theirs. */
  async messages(
    userId: string,
    conversationId: string,
    { page, pageSize }: PageQueryDto,
  ): Promise<MessagePage> {
    await this.findOwned(userId, conversationId);

    const where = { conversationId };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.message.count({ where }),
      this.prisma.message.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: rows.map(toMessage), page, pageSize, total };
  }

  /**
   * Deletes the conversation and, through the foreign key's cascade, its messages. `deleteMany`
   * with the owner in the filter answers "how many rows" in the same round trip: zero is a 404,
   * whether the conversation never existed, belongs to someone else, or was already deleted.
   */
  async remove(userId: string, conversationId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.conversation.deleteMany({
        where: { id: conversationId, userId },
      });
      if (deleted.count === 0) {
        throw new ResourceNotFoundError('CONVERSATION');
      }
    });
  }

  /** The conversation, if it is the caller's: one query with both conditions, not a load and a compare. */
  async findOwned(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (!conversation) {
      throw new ResourceNotFoundError('CONVERSATION');
    }
    return conversation;
  }
}
