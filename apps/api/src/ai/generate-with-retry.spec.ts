import type { GenerateInput, LlmProvider } from './llm-provider';
import { generateWithRetry, type ProviderEvent } from './generate-with-retry';
import { ProviderFailure } from './provider-failure';

const input: GenerateInput = {
  system: 'private prompt',
  messages: [{ role: 'user', content: 'private question' }],
  temperature: 0.2,
  maxTokens: 700,
  timeoutMs: 100,
};

const quiet = { log: () => undefined, warn: () => undefined };

function recorder() {
  const logs: ProviderEvent[] = [];
  return {
    logs,
    logger: {
      log: (entry: ProviderEvent) => void logs.push(entry),
      warn: (entry: ProviderEvent) => void logs.push(entry),
    },
  };
}

const ok = (text: string) =>
  Promise.resolve({ text, usage: { inputTokens: 120, outputTokens: 20 } });

describe('generateWithRetry', () => {
  it.each([
    ['timeout', new ProviderFailure('AI_TIMEOUT', true)],
    ['server error', new ProviderFailure('AI_UNAVAILABLE', true, 503)],
  ])(
    'retries %s once and logs only count, status and token usage',
    async (_name, failure) => {
      let calls = 0;
      const provider: LlmProvider = {
        generate: () => {
          calls++;
          return calls === 1
            ? Promise.reject(failure)
            : ok('private completion');
        },
      };
      const { logs, logger } = recorder();
      const result = await generateWithRetry(provider, input, logger, {
        backoffMs: 0,
      });
      expect(result.text).toBe('private completion');
      expect(calls).toBe(2);
      expect(logs).toEqual([
        {
          event: 'llm_retry',
          retryCount: 1,
          code: failure.code,
          ...(failure.upstreamStatus
            ? { upstreamStatus: failure.upstreamStatus }
            : {}),
          fallback: false,
        },
        {
          event: 'llm_usage',
          retryCount: 1,
          inputTokens: 120,
          outputTokens: 20,
        },
      ]);
      expect(JSON.stringify(logs)).not.toMatch(
        /private prompt|private question|private completion/,
      );
    },
  );

  it('sends the retry to the fallback model, not the overloaded one', async () => {
    let primaryCalls = 0;
    const primary: LlmProvider = {
      generate: () => {
        primaryCalls++;
        return Promise.reject(new ProviderFailure('AI_UNAVAILABLE', true, 503));
      },
    };
    const fallback: LlmProvider = { generate: () => ok('from fallback') };
    const { logs, logger } = recorder();
    const result = await generateWithRetry(primary, input, logger, {
      backoffMs: 0,
      fallback,
    });
    expect(result.text).toBe('from fallback');
    expect(primaryCalls).toBe(1);
    expect(logs[0]).toEqual({
      event: 'llm_retry',
      retryCount: 1,
      code: 'AI_UNAVAILABLE',
      upstreamStatus: 503,
      fallback: true,
    });
  });

  it.each([401, 429])(
    'does not retry a %i response, even with a fallback',
    async (status) => {
      let calls = 0;
      let fallbackCalls = 0;
      const provider: LlmProvider = {
        generate: () => {
          calls++;
          return Promise.reject(
            new ProviderFailure('AI_UNAVAILABLE', false, status),
          );
        },
      };
      const fallback: LlmProvider = {
        generate: () => {
          fallbackCalls++;
          return ok('unused');
        },
      };
      const { logs, logger } = recorder();
      await expect(
        generateWithRetry(provider, input, logger, { backoffMs: 0, fallback }),
      ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
      expect(calls).toBe(1);
      expect(fallbackCalls).toBe(0);
      expect(logs).toEqual([
        {
          event: 'llm_failed',
          retryCount: 0,
          code: 'AI_UNAVAILABLE',
          upstreamStatus: status,
        },
      ]);
    },
  );

  it('limits a second failure to two total attempts and logs why it failed', async () => {
    let calls = 0;
    const provider: LlmProvider = {
      generate: () => {
        calls++;
        return Promise.reject(
          calls === 1
            ? new ProviderFailure('AI_TIMEOUT', true)
            : new ProviderFailure('AI_UNAVAILABLE', true, 503),
        );
      },
    };
    const { logs, logger } = recorder();
    await expect(
      generateWithRetry(provider, input, logger, { backoffMs: 0 }),
    ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(calls).toBe(2);
    expect(logs.at(-1)).toEqual({
      event: 'llm_failed',
      retryCount: 1,
      code: 'AI_UNAVAILABLE',
      upstreamStatus: 503,
    });
  });

  it('rethrows an unexpected error without a failure event', async () => {
    const provider: LlmProvider = {
      generate: () => Promise.reject(new Error('boom')),
    };
    await expect(
      generateWithRetry(provider, input, quiet, { backoffMs: 0 }),
    ).rejects.toThrow('boom');
  });
});
