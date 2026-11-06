import type { GenerateInput, LlmProvider } from './llm-provider';
import { generateWithRetry } from './generate-with-retry';
import { ProviderFailure } from './provider-failure';

const input: GenerateInput = {
  system: 'private prompt',
  messages: [{ role: 'user', content: 'private question' }],
  temperature: 0.2,
  maxTokens: 700,
  timeoutMs: 100,
};

describe('generateWithRetry', () => {
  it.each([
    ['timeout', new ProviderFailure('AI_TIMEOUT', true)],
    ['server error', new ProviderFailure('AI_UNAVAILABLE', true)],
  ])(
    'retries %s once and logs only count and token usage',
    async (_name, failure) => {
      let calls = 0;
      const provider: LlmProvider = {
        generate: () => {
          calls++;
          return calls === 1
            ? Promise.reject(failure)
            : Promise.resolve({
                text: 'private completion',
                usage: { inputTokens: 120, outputTokens: 20 },
              });
        },
      };
      const logs: unknown[] = [];
      const result = await generateWithRetry(
        provider,
        input,
        {
          log: (entry: unknown) => {
            logs.push(entry);
          },
        },
        0,
      );
      expect(result.text).toBe('private completion');
      expect(calls).toBe(2);
      expect(logs).toEqual([
        { event: 'llm_retry', retryCount: 1, code: failure.code },
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

  it.each([401, 429])('does not retry a %i response', async (status) => {
    let calls = 0;
    const provider: LlmProvider = {
      generate: () => {
        calls++;
        return Promise.reject(
          new ProviderFailure('AI_UNAVAILABLE', false, status),
        );
      },
    };
    await expect(
      generateWithRetry(provider, input, { log: () => undefined }, 0),
    ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(calls).toBe(1);
  });

  it('limits a second failure to two total attempts', async () => {
    let calls = 0;
    const provider: LlmProvider = {
      generate: () => {
        calls++;
        return Promise.reject(new ProviderFailure('AI_TIMEOUT', true));
      },
    };
    await expect(
      generateWithRetry(provider, input, { log: () => undefined }, 0),
    ).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
    expect(calls).toBe(2);
  });
});
