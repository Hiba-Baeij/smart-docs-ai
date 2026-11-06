import type { GenerateInput, LlmProvider } from './llm-provider';
import { ProviderFailure } from './provider-failure';

export type ProviderEvent =
  | { event: 'llm_retry'; retryCount: number; code: string }
  | {
      event: 'llm_usage';
      retryCount: number;
      inputTokens?: number;
      outputTokens?: number;
    };

type EventLogger = { log(event: ProviderEvent): void };

/** One retry for timeout or 5xx; per-attempt timeout is enforced by the adapter. */
export async function generateWithRetry(
  provider: LlmProvider,
  input: GenerateInput,
  logger: EventLogger,
  backoffMs = 300,
): ReturnType<LlmProvider['generate']> {
  let retryCount = 0;
  try {
    const result = await provider.generate(input);
    recordUsage(result.usage, retryCount, logger);
    return result;
  } catch (error) {
    if (!(error instanceof ProviderFailure) || !error.retryable) throw error;
    retryCount = 1;
    logger.log({ event: 'llm_retry', retryCount, code: error.code });
  }
  if (backoffMs > 0)
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  const result = await provider.generate(input);
  recordUsage(result.usage, retryCount, logger);
  return result;
}

function recordUsage(
  usage: { inputTokens?: number; outputTokens?: number } | undefined,
  retryCount: number,
  logger: EventLogger,
): void {
  if (!usage) return;
  logger.log({
    event: 'llm_usage',
    retryCount,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  });
}
