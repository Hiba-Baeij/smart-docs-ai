import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GenerateInput } from './llm-provider';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

const input: GenerateInput = {
  system: 'private prompt evidence',
  messages: [{ role: 'user', content: 'private question' }],
  temperature: 0.2,
  maxTokens: 700,
  timeoutMs: 100,
};

describe('OpenAI-compatible adapter contract', () => {
  const fetchOriginal = global.fetch;
  afterEach(() => {
    global.fetch = fetchOriginal;
  });
  const provider = () =>
    new OpenAiCompatibleProvider(
      'https://provider.example/v1/',
      'private-key',
      'test-model',
    );

  it('sends the chat request shape and maps text plus measured usage', async () => {
    const fixture = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        'test',
        'fixtures',
        'openai-chat-success.json',
      ),
      'utf8',
    );
    const calls: { url: string; init: RequestInit }[] = [];
    global.fetch = (url, init) => {
      calls.push({
        url:
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.href
              : url.url,
        init: init!,
      });
      return Promise.resolve(new Response(fixture, { status: 200 }));
    };

    const output = await provider().generate(input);

    expect(output).toEqual({
      text: 'Invoices are paid in thirty days [S1].',
      usage: { inputTokens: 120, outputTokens: 20 },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://provider.example/v1/chat/completions');
    expect(calls[0].init.headers).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer private-key',
    });
    expect(typeof calls[0].init.body).toBe('string');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      model: 'test-model',
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        { role: 'system', content: 'private prompt evidence' },
        { role: 'user', content: 'private question' },
      ],
    });
  });

  it.each([401, 429, 500, 503])(
    'maps HTTP %i without leaking the upstream body',
    async (status) => {
      global.fetch = () =>
        Promise.resolve(new Response('private vendor body', { status }));
      const failure = await provider()
        .generate(input)
        .catch((error: unknown) => error);
      expect(failure).toMatchObject({
        code: 'AI_UNAVAILABLE',
        retryable: status >= 500,
      });
      expect(JSON.stringify(failure)).not.toContain('private vendor body');
      expect((failure as Error).message).not.toContain('private vendor body');
    },
  );

  it('aborts a stalled request at the configured timeout and maps AI_TIMEOUT', async () => {
    let aborted = false;
    global.fetch = (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    const failure = await provider()
      .generate({ ...input, timeoutMs: 10 })
      .catch((error: unknown) => error);
    expect(aborted).toBe(true);
    expect(failure).toMatchObject({ code: 'AI_TIMEOUT' });
  });

  it('maps malformed success responses and network errors to AI_UNAVAILABLE', async () => {
    global.fetch = () => Promise.resolve(new Response('{bad', { status: 200 }));
    await expect(provider().generate(input)).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    });
    global.fetch = () =>
      Promise.reject(new TypeError('network contained private text'));
    const failure = await provider()
      .generate(input)
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'AI_UNAVAILABLE', retryable: false });
    expect((failure as Error).message).not.toContain('private text');
  });
});
