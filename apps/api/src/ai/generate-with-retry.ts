import type { GenerateInput, LlmProvider } from './llm-provider';
import { ProviderFailure } from './provider-failure';

export type ProviderEvent =
  | {
      event: 'llm_retry';
      retryCount: number;
      code: string;
      upstreamStatus?: number;
      fallback: boolean;
    }
  | {
      event: 'llm_failed';
      retryCount: number;
      code: string;
      upstreamStatus?: number;
    }
  | {
      event: 'llm_usage';
      retryCount: number;
      inputTokens?: number;
      outputTokens?: number;
    };

type EventLogger = {
  log(event: ProviderEvent): void;
  warn(event: ProviderEvent): void;
};

export type RetryOptions = {
  backoffMs?: number;
  /** Used for the retry instead of the first provider, so one overloaded model does not fail twice. */
  fallback?: LlmProvider | null;
};

/** One retry for timeout or 5xx; per-attempt timeout is enforced by the adapter. */
export async function generateWithRetry(
  provider: LlmProvider,
  input: GenerateInput,
  logger: EventLogger,
  { backoffMs = 300, fallback = null }: RetryOptions = {},
): ReturnType<LlmProvider['generate']> {
  let retryCount = 0;
  try {
    const result = await provider.generate(input);
    recordUsage(result.usage, retryCount, logger);
    return result;
  } catch (error) {
    if (!(error instanceof ProviderFailure) || !error.retryable) {
      recordFailure(error, retryCount, logger);
      throw error;
    }
    retryCount = 1;
    logger.log({
      event: 'llm_retry',
      retryCount,
      code: error.code,
      ...status(error),
      fallback: fallback !== null,
    });
  }
  if (backoffMs > 0)
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  try {
    const result = await (fallback ?? provider).generate(input);
    recordUsage(result.usage, retryCount, logger);
    return result;
  } catch (error) {
    recordFailure(error, retryCount, logger);
    throw error;
  }
}

function status(error: ProviderFailure): { upstreamStatus?: number } {
  return error.upstreamStatus === undefined
    ? {}
    : { upstreamStatus: error.upstreamStatus };
}

/** The upstream status code says why: 503 overloaded, 429 quota, 404 unknown model, 401 bad key. */
function recordFailure(
  error: unknown,
  retryCount: number,
  logger: EventLogger,
): void {
  if (!(error instanceof ProviderFailure)) return;
  logger.warn({
    event: 'llm_failed',
    retryCount,
    code: error.code,
    ...status(error),
  });
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
