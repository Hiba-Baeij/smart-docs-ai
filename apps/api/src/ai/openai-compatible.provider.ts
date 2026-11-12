import type { GenerateInput, LlmProvider } from './llm-provider';
import { ProviderFailure } from './provider-failure';
import {
  noteBadResponse,
  noteTransportFailure,
  noteUpstreamError,
} from './provider-diagnostics';

type ProviderResponse = {
  choices?: { message?: { content?: unknown }; finish_reason?: string }[];
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
};

/** The only module that knows the upstream HTTP and JSON shape. */
export class OpenAiCompatibleProvider implements LlmProvider {
  private readonly endpoint: string;

  constructor(
    baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    this.endpoint = new URL(
      'chat/completions',
      `${baseUrl.replace(/\/+$/, '')}/`,
    ).toString();
  }

  async generate(input: GenerateInput): Promise<{
    text: string;
    usage?: { inputTokens?: number; outputTokens?: number };
  }> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, input.timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: input.temperature,
          max_tokens: input.maxTokens,
          messages: [
            { role: 'system', content: input.system },
            ...input.messages,
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        await noteUpstreamError('llm', this.model, response);
        throw new ProviderFailure(
          'AI_UNAVAILABLE',
          response.status >= 500,
          response.status,
        );
      }
      const data = (await response.json()) as ProviderResponse;
      const text = data.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || text.trim() === '') {
        noteBadResponse(
          'llm',
          this.model,
          `empty answer (finish_reason: ${data.choices?.[0]?.finish_reason ?? 'none'})`,
        );
        throw new ProviderFailure('AI_UNAVAILABLE', false);
      }
      const inputTokens = safeTokenCount(data.usage?.prompt_tokens);
      const outputTokens = safeTokenCount(data.usage?.completion_tokens);
      return {
        text,
        ...(inputTokens !== undefined || outputTokens !== undefined
          ? { usage: { inputTokens, outputTokens } }
          : {}),
      };
    } catch (error) {
      if (timedOut || (error instanceof Error && error.name === 'AbortError')) {
        noteTransportFailure('llm', this.model, error, true, input.timeoutMs);
        throw new ProviderFailure('AI_TIMEOUT', true);
      }
      if (error instanceof ProviderFailure) throw error;
      noteTransportFailure('llm', this.model, error, false, input.timeoutMs);
      throw new ProviderFailure('AI_UNAVAILABLE', false);
    } finally {
      clearTimeout(timer);
    }
  }
}

function safeTokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}
