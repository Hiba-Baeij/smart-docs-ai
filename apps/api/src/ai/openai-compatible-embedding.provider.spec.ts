import { EMBEDDING_DIMENSIONS } from './embedding-provider';
import {
  EMBEDDING_BATCH_SIZE,
  OpenAiCompatibleEmbeddingProvider,
} from './openai-compatible-embedding.provider';
import { ProviderFailure } from './provider-failure';

const vector = (value: number) =>
  new Array<number>(EMBEDDING_DIMENSIONS).fill(value);

/** A vector pointing along one axis, scaled by `length`. */
const axis = (position: number, length = 3) => {
  const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  v[position] = length;
  return v;
};

describe('OpenAI-compatible embedding adapter', () => {
  const fetchOriginal = global.fetch;
  afterEach(() => {
    global.fetch = fetchOriginal;
  });
  const provider = () =>
    new OpenAiCompatibleEmbeddingProvider(
      'https://provider.example/v1/',
      'private-key',
      'embed-model',
    );

  const respond = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));

  /** The adapter always sends a URL string and a JSON string body. */
  const urlOf = (url: string | URL | Request) =>
    typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
  const bodyOf = <T>(init?: RequestInit) =>
    JSON.parse(init!.body as string) as T;

  it('sends the embeddings request and returns vectors in input order', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    global.fetch = (url, init) => {
      calls.push({
        url: urlOf(url),
        body: bodyOf<Record<string, unknown>>(init),
      });
      // Out of order on purpose: the adapter must use `index`.
      return respond({
        data: [
          { index: 1, embedding: axis(1) },
          { index: 0, embedding: axis(0) },
        ],
      });
    };

    const vectors = await provider().embed(['first', 'second'], 1000);

    // In input order, and scaled to unit length (the API returned length 3).
    expect(vectors[0][0]).toBe(1);
    expect(vectors[1][1]).toBe(1);
    expect(Math.hypot(...vectors[0])).toBeCloseTo(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://provider.example/v1/embeddings');
    expect(calls[0].body).toEqual({
      model: 'embed-model',
      input: ['first', 'second'],
      dimensions: EMBEDDING_DIMENSIONS,
    });
  });

  it('splits large inputs into batches', async () => {
    const sizes: number[] = [];
    global.fetch = (_url, init) => {
      const { input } = bodyOf<{ input: string[] }>(init);
      sizes.push(input.length);
      return respond({ data: input.map(() => ({ embedding: vector(1) })) });
    };
    const texts = new Array<string>(EMBEDDING_BATCH_SIZE + 1).fill('t');

    const vectors = await provider().embed(texts, 1000);

    expect(sizes).toEqual([EMBEDDING_BATCH_SIZE, 1]);
    expect(vectors).toHaveLength(EMBEDDING_BATCH_SIZE + 1);
  });

  it.each([
    ['a wrong vector size', { data: [{ embedding: [1, 2, 3] }] }],
    ['a missing vector', { data: [] }],
    ['a non-numeric value', { data: [{ embedding: vector(Number.NaN) }] }],
    ['a zero vector', { data: [{ embedding: vector(0) }] }],
  ])('rejects %s as AI_UNAVAILABLE', async (_name, body) => {
    global.fetch = () => respond(body);
    await expect(provider().embed(['t'], 1000)).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    });
  });

  it('marks 5xx as retryable and 4xx as not, without the vendor body', async () => {
    global.fetch = () => respond({ error: 'private vendor detail' }, 503);
    const server = await provider()
      .embed(['t'], 1000)
      .catch((e: unknown) => e);
    expect(server).toBeInstanceOf(ProviderFailure);
    expect(server).toMatchObject({ retryable: true, upstreamStatus: 503 });
    expect(JSON.stringify(server)).not.toContain('private vendor detail');

    global.fetch = () => respond({}, 400);
    await expect(provider().embed(['t'], 1000)).rejects.toMatchObject({
      retryable: false,
    });
  });

  it('turns a slow provider into AI_TIMEOUT', async () => {
    global.fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    await expect(provider().embed(['t'], 10)).rejects.toMatchObject({
      code: 'AI_TIMEOUT',
    });
  });
});
