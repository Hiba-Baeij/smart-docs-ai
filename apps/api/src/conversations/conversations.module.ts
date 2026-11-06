import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SearchModule } from '../search/search.module';
import { ANSWER_STEP } from './answer-step';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { SendMessageService } from './send-message.service';
import { RagAnswerStep } from './rag-answer.step';

@Module({
  imports: [AuthModule, PrismaModule, SearchModule, AiModule],
  controllers: [ConversationsController],
  providers: [
    ConversationsService,
    SendMessageService,
    RagAnswerStep,
    { provide: ANSWER_STEP, useExisting: RagAnswerStep },
  ],
  exports: [ConversationsService, SendMessageService],
})
export class ConversationsModule {}
