import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  DisabledEmbeddingProvider,
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from './embedding-provider';
import { LLM_PROVIDER } from './llm-provider';
import { MockEmbeddingProvider } from './mock-embedding.provider';
import { MockLlmProvider } from './mock-llm.provider';
import { OpenAiCompatibleEmbeddingProvider } from './openai-compatible-embedding.provider';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        if (config.get<string>('LLM_PROVIDER') !== 'openai')
          return new MockLlmProvider();
        const baseUrl = config.get<string>('LLM_BASE_URL');
        const apiKey = config.get<string>('LLM_API_KEY');
        const model = config.get<string>('LLM_MODEL');
        if (!baseUrl || !apiKey || !model)
          throw new Error('OpenAI provider configuration is incomplete.');
        return new OpenAiCompatibleProvider(baseUrl, apiKey, model);
      },
    },
    {
      provide: EMBEDDING_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): EmbeddingProvider => {
        if (config.get<string>('LLM_PROVIDER') !== 'openai')
          return new MockEmbeddingProvider();
        // A real provider with no embedding model keeps keyword-only retrieval (ADR-018).
        const model = config.get<string>('EMBEDDING_MODEL');
        if (!model) return new DisabledEmbeddingProvider();
        const baseUrl = config.get<string>('LLM_BASE_URL');
        const apiKey = config.get<string>('LLM_API_KEY');
        if (!baseUrl || !apiKey)
          throw new Error('Embedding provider configuration is incomplete.');
        return new OpenAiCompatibleEmbeddingProvider(baseUrl, apiKey, model);
      },
    },
  ],
  exports: [LLM_PROVIDER, EMBEDDING_PROVIDER],
})
export class AiModule {}
