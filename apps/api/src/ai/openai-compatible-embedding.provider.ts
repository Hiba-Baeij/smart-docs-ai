import {
  EMBEDDING_DIMENSIONS,
  MAX_EMBEDDING_INPUT_CHARS,
  toUnitLength,
  type EmbeddingProvider,
} from './embedding-provider';
import { ProviderFailure } from './provider-failure';

type EmbeddingResponse = {
  data?: { index?: unknown; embedding?: unknown }[];
};

/** Texts per request; providers cap the batch size (Gemini at 100). */
export const EMBEDDING_BATCH_SIZE = 100;

/**
 * The `/embeddings` endpoint of an OpenAI-compatible API (OpenAI, Gemini's compatibility layer,
 * OpenRouter, ...). Uses the same base URL and key as the chat adapter. Like that adapter, it is
 * the only place that knows the upstream JSON shape, and vendor bodies never leave it.
 */
export class OpenAiCompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly enabled = true;
  private readonly endpoint: string;

  constructor(
    baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    this.endpoint = new URL(
      'embeddings',
      `${baseUrl.replace(/\/+$/, '')}/`,
    ).toString();
  }

  async embed(texts: string[], timeoutMs: number): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let at = 0; at < texts.length; at += EMBEDDING_BATCH_SIZE) {
      vectors.push(
        ...(await this.embedBatch(
          texts.slice(at, at + EMBEDDING_BATCH_SIZE),
          timeoutMs,
        )),
      );
    }
    return vectors;
  }

  private async embedBatch(
    texts: string[],
    timeoutMs: number,
  ): Promise<number[][]> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts.map((text) => text.slice(0, MAX_EMBEDDING_INPUT_CHARS)),
          // Models that produce more numbers (gemini-embedding-001: 3072) shorten their output.
          dimensions: EMBEDDING_DIMENSIONS,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ProviderFailure(
          'AI_UNAVAILABLE',
          response.status >= 500,
          response.status,
        );
      }
      return parseVectors(
        (await response.json()) as EmbeddingResponse,
        texts.length,
      );
    } catch (error) {
      if (timedOut || (error instanceof Error && error.name === 'AbortError')) {
        throw new ProviderFailure('AI_TIMEOUT', true);
      }
      if (error instanceof ProviderFailure) throw error;
      throw new ProviderFailure('AI_UNAVAILABLE', false);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** One valid vector per input, put back in input order (the API reports each one's index). */
function parseVectors(data: EmbeddingResponse, count: number): number[][] {
  const items = data.data;
  if (!Array.isArray(items) || items.length !== count) {
    throw new ProviderFailure('AI_UNAVAILABLE', false);
  }
  const vectors: number[][] = new Array<number[]>(count);
  items.forEach((item, position) => {
    const index =
      typeof item.index === 'number' && Number.isInteger(item.index)
        ? item.index
        : position;
    const vector = item.embedding;
    if (
      index < 0 ||
      index >= count ||
      vectors[index] !== undefined ||
      !Array.isArray(vector) ||
      vector.length !== EMBEDDING_DIMENSIONS ||
      !vector.every((value) => typeof value === 'number' && isFinite(value))
    ) {
      throw new ProviderFailure('AI_UNAVAILABLE', false);
    }
    try {
      // Shortened outputs (dimensions < the model's native size) are not unit length.
      vectors[index] = toUnitLength(vector as number[]);
    } catch {
      throw new ProviderFailure('AI_UNAVAILABLE', false);
    }
  });
  return vectors;
}
