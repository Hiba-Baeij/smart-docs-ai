import { Inject, Injectable } from '@nestjs/common';
import type { Message } from '@smartdocs/contracts';
import {
  ResourceNotFoundError,
  ValidationFailedError,
} from '../common/errors/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { ANSWER_STEP, type Answer, type AnswerStep } from './answer-step';
import { toMessage } from './conversation-mappers';
import { defaultTitle } from './conversation-title';

export const MESSAGE_MAX_CHARACTERS = 4000;

export type SendMessageInput = {
  userId: string;
  conversationId: string;
  content: string;
};

export type SendMessageResult = {
  userMessage: Message;
  message: Message;
};

/**
 * Checks the text of a question and returns it trimmed. The same rules apply wherever a question
 * enters, so they live here and not only in a request DTO. Length is counted in characters (code
 * points), not UTF-16 units.
 */
export function validateMessageContent(content: unknown): string {
  if (typeof content !== 'string') {
    throw new ValidationFailedError({ content: ['Message must be text.'] });
  }
  const trimmed = content.trim();
  if (trimmed === '') {
    throw new ValidationFailedError({
      content: ['Message must not be empty.'],
    });
  }
  if (Array.from(trimmed).length > MESSAGE_MAX_CHARACTERS) {
    throw new ValidationFailedError({
      content: [
        `Message must be at most ${MESSAGE_MAX_CHARACTERS} characters.`,
      ],
    });
  }
  return trimmed;
}

/**
 * Sends a question and records the exchange (ADR-006 applied to chat).
 *
 * Two commits, deliberately:
 *  1. the question is saved (and the conversation touched and titled) BEFORE the answer step runs,
 *     so a failure there, a timeout, an outage, a bug, still leaves the person's question in the
 *     conversation instead of losing it;
 *  2. the answer is saved only if the step produced one. A failure saves nothing, so there is never
 *     an assistant message that was not really produced.
 *
 * The HTTP message endpoint delegates here; the persistence rules are also tested independently.
 */
@Injectable()
export class SendMessageService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ANSWER_STEP) private readonly answerStep: AnswerStep,
  ) {}

  async execute({
    userId,
    conversationId,
    content,
  }: SendMessageInput): Promise<SendMessageResult> {
    const question = validateMessageContent(content);
    const userMessage = await this.saveQuestion(
      userId,
      conversationId,
      question,
    );

    // Outside any transaction: it can take seconds, and a held transaction would also undo the
    // question if it failed.
    const answer = await this.answerStep.answer({
      userId,
      conversationId,
      question,
    });

    const assistantMessage = await this.saveAnswer(
      userId,
      conversationId,
      answer,
    );
    return {
      userMessage: toMessage(userMessage),
      message: toMessage(assistantMessage),
    };
  }

  /** Ownership, the user message, the default title and `updatedAt`, in one transaction. */
  private saveQuestion(
    userId: string,
    conversationId: string,
    question: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: conversationId, userId },
      });
      if (!conversation) {
        throw new ResourceNotFoundError('CONVERSATION');
      }

      const message = await tx.message.create({
        data: { conversationId, role: 'user', content: question },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          // A title the person gave is never overwritten; an empty one becomes the first question.
          ...(conversation.title === ''
            ? { title: defaultTitle(question) }
            : {}),
          // @updatedAt only fires when the row changes by itself, so the touch is explicit; it is
          // what moves the conversation to the top of the list.
          updatedAt: new Date(),
        },
      });
      return message;
    });
  }

  /** The conversation may have been deleted while the answer was being produced: that is a 404, not an orphan row. */
  private saveAnswer(userId: string, conversationId: string, answer: Answer) {
    return this.prisma.$transaction(async (tx) => {
      const touched = await tx.conversation.updateMany({
        where: { id: conversationId, userId },
        data: { updatedAt: new Date() },
      });
      if (touched.count === 0) {
        throw new ResourceNotFoundError('CONVERSATION');
      }
      return tx.message.create({
        data: {
          conversationId,
          role: 'assistant',
          content: answer.content,
          sources: answer.sources,
        },
      });
    });
  }
}
