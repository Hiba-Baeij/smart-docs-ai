import { validateEnv } from './env.validation';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5433/smartdocs',
  JWT_SECRET: 'x'.repeat(32),
  CORS_ORIGIN: 'http://localhost:4200',
};

describe('validateEnv, chunking parameters', () => {
  it('defaults to 700 / 100 / 1200', () => {
    const env = validateEnv(base);

    expect(env).toMatchObject({
      CHUNK_TARGET_WORDS: 700,
      CHUNK_OVERLAP_WORDS: 100,
      CHUNK_MAX_WORDS: 1200,
    });
  });

  it('converts values given as strings, as environment variables are', () => {
    const env = validateEnv({
      ...base,
      CHUNK_TARGET_WORDS: '500',
      CHUNK_OVERLAP_WORDS: '50',
      CHUNK_MAX_WORDS: '900',
    });

    expect(env).toMatchObject({
      CHUNK_TARGET_WORDS: 500,
      CHUNK_OVERLAP_WORDS: 50,
      CHUNK_MAX_WORDS: 900,
    });
  });

  it.each([
    [
      'an overlap not smaller than the target',
      { CHUNK_TARGET_WORDS: '100', CHUNK_OVERLAP_WORDS: '100' },
    ],
    [
      'a maximum with no room for overlap and context',
      { CHUNK_MAX_WORDS: '800' },
    ],
    ['a value that is not a number', { CHUNK_TARGET_WORDS: 'many' }],
    ['a value below 1', { CHUNK_OVERLAP_WORDS: '0' }],
  ])('refuses %s, before the server listens', (_label, extra) => {
    expect(() => validateEnv({ ...base, ...extra })).toThrow(
      /Invalid environment configuration/,
    );
  });
});

describe('real provider configuration', () => {
  it('accepts temperatures up to 0.2 and rejects a higher value', () => {
    expect(
      validateEnv({ ...base, LLM_TEMPERATURE: '0.2' }).LLM_TEMPERATURE,
    ).toBe(0.2);
    expect(() => validateEnv({ ...base, LLM_TEMPERATURE: '0.21' })).toThrow(
      /LLM_TEMPERATURE/,
    );
  });

  it('defaults to mock in development and requires explicit OpenAI settings in production', () => {
    expect(validateEnv(base).LLM_PROVIDER).toBe('mock');
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      /LLM_PROVIDER/,
    );
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', LLM_PROVIDER: 'openai' }),
    ).toThrow(/LLM_API_KEY/);
    expect(
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        LLM_PROVIDER: 'openai',
        LLM_BASE_URL: 'https://provider.example/v1',
        LLM_API_KEY: 'private-key',
        LLM_MODEL: 'model',
        COOKIE_SECURE: true,
      }).LLM_PROVIDER,
    ).toBe('openai');
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        LLM_PROVIDER: 'openai',
        LLM_BASE_URL: 'http://provider.example/v1',
        LLM_API_KEY: 'private-key',
        LLM_MODEL: 'model',
        COOKIE_SECURE: true,
      }),
    ).toThrow(/LLM_BASE_URL/);
  });
});

describe('production HTTP security configuration', () => {
  it('trusts no proxy by default and accepts an explicit hop count', () => {
    expect(validateEnv(base).TRUST_PROXY_HOPS).toBe(0);
    expect(
      validateEnv({ ...base, TRUST_PROXY_HOPS: '1' }).TRUST_PROXY_HOPS,
    ).toBe(1);
    expect(() => validateEnv({ ...base, TRUST_PROXY_HOPS: '-1' })).toThrow(
      /TRUST_PROXY_HOPS/,
    );
  });
  const production = {
    ...base,
    NODE_ENV: 'production',
    LLM_PROVIDER: 'openai',
    LLM_BASE_URL: 'https://provider.example/v1',
    LLM_API_KEY: 'private-key',
    LLM_MODEL: 'model',
  };

  it('requires Secure cookies in production', () => {
    expect(() => validateEnv(production)).toThrow(/COOKIE_SECURE/);
    expect(
      validateEnv({ ...production, COOKIE_SECURE: 'true' }).COOKIE_SECURE,
    ).toBe(true);
  });

  it('requires one exact CORS origin without a path', () => {
    expect(() =>
      validateEnv({ ...base, CORS_ORIGIN: 'http://localhost:4200/path' }),
    ).toThrow(/CORS_ORIGIN/);
  });
});
