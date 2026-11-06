import type { ChatMessage } from './prompt';

export type GenerateInput = {
  system: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
};

export interface LlmProvider {
  generate(input: GenerateInput): Promise<{
    text: string;
    usage?: { inputTokens?: number; outputTokens?: number };
  }>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
