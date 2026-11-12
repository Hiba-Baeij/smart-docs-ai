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

/** A second model for the retry when the first times out or the provider is overloaded; null when unset. */
export const LLM_FALLBACK_PROVIDER = Symbol('LLM_FALLBACK_PROVIDER');
