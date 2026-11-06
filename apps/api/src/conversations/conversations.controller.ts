import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  ConversationPage,
  ConversationSummary,
  MessagePage,
} from '@smartdocs/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PageQueryDto } from '../common/pagination/page-query.dto';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { MessagesQueryDto } from './dto/messages-query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import {
  SendMessageService,
  type SendMessageResult,
} from './send-message.service';

/** Conversation and message endpoints, scoped to the authenticated user. */
@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly sendMessage: SendMessageService,
  ) {}

  /** 201 `ConversationSummary`. */
  @Post()
  create(
    @CurrentUser() userId: string,
    @Body() dto: CreateConversationDto,
  ): Promise<ConversationSummary> {
    return this.conversations.create(userId, dto);
  }

  /** 200 `ConversationPage`: the caller's conversations, most recently active first. */
  @Get()
  list(
    @CurrentUser() userId: string,
    @Query() query: PageQueryDto,
  ): Promise<ConversationPage> {
    return this.conversations.list(userId, query);
  }

  /** 200 `MessagePage`, oldest first, or 404 `CONVERSATION_NOT_FOUND` (also for another user's id). */
  @Get(':id/messages')
  messages(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Query() query: MessagesQueryDto,
  ): Promise<MessagePage> {
    return this.conversations.messages(userId, id, query);
  }

  @Post(':id/messages')
  send(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ): Promise<SendMessageResult> {
    return this.sendMessage.execute({
      userId,
      conversationId: id,
      content: dto.content,
    });
  }

  /** 204, or 404 `CONVERSATION_NOT_FOUND`. The messages go with the conversation. */
  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.conversations.remove(userId, id);
  }
}
