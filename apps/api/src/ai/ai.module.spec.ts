import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AiModule } from './ai.module';
import {
  DisabledEmbeddingProvider,
  EMBEDDING_PROVIDER,
} from './embedding-provider';
import { LLM_PROVIDER } from './llm-provider';
import { MockEmbeddingProvider } from './mock-embedding.provider';
import { MockLlmProvider } from './mock-llm.provider';
import { OpenAiCompatibleEmbeddingProvider } from './openai-compatible-embedding.provider';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

describe('AiModule provider selection', () => {
  it.each([
    ['mock', MockLlmProvider],
    ['openai', OpenAiCompatibleProvider],
  ] as const)(
    'boots the %s adapter from configuration',
    async (kind, expectedClass) => {
      const moduleRef = await Test.createTestingModule({
        imports: [ConfigModule.forRoot({ ignoreEnvFile: true }), AiModule],
      })
        .overrideProvider(ConfigService)
        .useValue({
          get: (key: string) =>
            (
              ({
                LLM_PROVIDER: kind,
                LLM_BASE_URL: 'https://provider.example/v1',
                LLM_API_KEY: 'private-key',
                LLM_MODEL: 'test-model',
              }) as Record<string, string>
            )[key],
        })
        .compile();
      expect(moduleRef.get(LLM_PROVIDER)).toBeInstanceOf(expectedClass);
      await moduleRef.close();
    },
  );

  it.each([
    ['mock', '', MockEmbeddingProvider],
    ['openai', 'embed-model', OpenAiCompatibleEmbeddingProvider],
    // A real provider without an embedding model: keyword-only retrieval.
    ['openai', '', DisabledEmbeddingProvider],
  ] as const)(
    'selects the embedding adapter for %s with model "%s"',
    async (kind, embeddingModel, expectedClass) => {
      const moduleRef = await Test.createTestingModule({
        imports: [ConfigModule.forRoot({ ignoreEnvFile: true }), AiModule],
      })
        .overrideProvider(ConfigService)
        .useValue({
          get: (key: string) =>
            (
              ({
                LLM_PROVIDER: kind,
                LLM_BASE_URL: 'https://provider.example/v1',
                LLM_API_KEY: 'private-key',
                LLM_MODEL: 'test-model',
                EMBEDDING_MODEL: embeddingModel,
              }) as Record<string, string>
            )[key],
        })
        .compile();
      expect(moduleRef.get(EMBEDDING_PROVIDER)).toBeInstanceOf(expectedClass);
      await moduleRef.close();
    },
  );
});
