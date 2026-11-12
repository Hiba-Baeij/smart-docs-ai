import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { noteDiagnostic } from '../common/diagnostics/diagnostics';
import { packEvidence } from '../ai/evidence';
import { generateWithRetry } from '../ai/generate-with-retry';
import { noEvidenceAnswer, policeAnswer } from '../ai/evidence-policy';
import {
  LLM_FALLBACK_PROVIDER,
  LLM_PROVIDER,
  type LlmProvider,
} from '../ai/llm-provider';
import { buildPrompt, type ChatMessage } from '../ai/prompt';
import { smallTalkReply } from '../ai/small-talk';
import { PrismaService } from '../prisma/prisma.service';
import {
  CHUNK_RETRIEVER,
  type ChunkRetriever,
} from '../search/chunk-retriever';
import { Answer, AnswerInput, AnswerStep } from './answer-step';

@Injectable()
export class RagAnswerStep implements AnswerStep {
  private readonly logger = new Logger(RagAnswerStep.name);

  constructor(
    @Inject(CHUNK_RETRIEVER) private readonly retriever: ChunkRetriever,
    @Inject(LLM_PROVIDER) private readonly provider: LlmProvider,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional()
    @Inject(LLM_FALLBACK_PROVIDER)
    private readonly fallback: LlmProvider | null = null,
  ) {}

  async answer({
    userId,
    conversationId,
    question,
  }: AnswerInput): Promise<Answer> {
    // Greetings and pleasantries need no retrieval or model call.
    const greeting = smallTalkReply(question);
    if (greeting) return { content: greeting, sources: [] };
    const candidates = await this.retriever.retrieve({
      userId,
      question,
      limit: this.config.get<number>('RETRIEVAL_CANDIDATES', 20),
    });
    if (candidates.length === 0) return noEvidenceAnswer();
    const packed = packEvidence(
      candidates,
      this.config.get<number>('RETRIEVAL_TOKEN_BUDGET', 3000),
      this.config.get<number>('RETRIEVAL_TOP_K', 6),
    );
    if (packed.chunks.length === 0) return noEvidenceAnswer();
    const historyLimit = this.config.get<number>('CHAT_HISTORY_MESSAGES', 6);
    const rows =
      historyLimit > 0
        ? await this.prisma.message.findMany({
            where: { conversationId, conversation: { userId } },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: historyLimit + 1,
          })
        : [];
    const history: ChatMessage[] = rows
      .reverse()
      .map((row) => ({ role: row.role, content: row.content }));
    // The write service committed this question immediately before calling us.
    if (history.at(-1)?.role === 'user' && history.at(-1)?.content === question)
      history.pop();
    const prompt = buildPrompt({
      question,
      history,
      historyLimit,
      chunks: packed.chunks,
    });
    const result = await generateWithRetry(
      this.provider,
      {
        ...prompt,
        temperature: this.config.get<number>('LLM_TEMPERATURE', 0.2),
        maxTokens: this.config.get<number>('LLM_MAX_OUTPUT_TOKENS', 700),
        timeoutMs: this.config.get<number>('LLM_TIMEOUT_MS', 20_000),
      },
      // Each retry, failure and usage line also goes to the request's diagnostic trail.
      {
        log: (event) => {
          this.logger.log(event);
          noteDiagnostic(event);
        },
        warn: (event) => {
          this.logger.warn(event);
          noteDiagnostic(event);
        },
      },
      { fallback: this.fallback },
    );
    return policeAnswer(result.text, packed.usedSources);
  }
}
