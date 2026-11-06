import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LLM_PROVIDER } from './llm-provider';
import { MockLlmProvider } from './mock-llm.provider';
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
  ],
  exports: [LLM_PROVIDER],
})
export class AiModule {}
