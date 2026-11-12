import Joi from 'joi';
import {
  ChunkConfig,
  DEFAULT_CHUNK_CONFIG,
  assertValidChunkConfig,
} from '../chunking/chunk-config';

const requiredWhenOpenAi = Joi.string().when('LLM_PROVIDER', {
  is: 'openai',
  then: Joi.required(),
  otherwise: Joi.string().allow('').optional(),
});

/**
 * Validates every variable listed in docs/ops/local-setup.md.
 * A missing or malformed required value stops the process before it listens.
 */
export const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(5).default(0),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  TEST_DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .pattern(/_test$/)
    .allow('')
    .optional(),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string()
    .pattern(/^\d+[smhd]$/)
    .default('1h'),
  COOKIE_SECURE: Joi.boolean().default(false),
  // Login and register: at most AUTH_RATE_LIMIT requests per client per AUTH_RATE_WINDOW_MS.
  AUTH_RATE_LIMIT: Joi.number().integer().min(1).default(5),
  AUTH_RATE_WINDOW_MS: Joi.number().integer().min(1000).default(60_000),
  UPLOAD_RATE_LIMIT: Joi.number().integer().min(1).default(10),
  MESSAGE_RATE_LIMIT: Joi.number().integer().min(1).default(20),
  GENERAL_RATE_LIMIT: Joi.number().integer().min(1).default(120),
  RATE_WINDOW_MS: Joi.number().integer().min(1000).default(60_000),
  MAX_JSON_BYTES: Joi.number().integer().min(1).default(102_400),
  CORS_ORIGIN: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),

  MAX_UPLOAD_BYTES: Joi.number().integer().min(1).default(10_485_760),
  UPLOAD_TIMEOUT_MS: Joi.number().integer().min(1).default(30_000),
  // Ceiling on the text extracted from one file, so a small archive that unpacks to gigabytes
  // cannot become an unbounded database row.
  MAX_EXTRACTED_CHARS: Joi.number().integer().min(1).default(2_000_000),

  LLM_PROVIDER: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.valid('openai').required(),
    otherwise: Joi.valid('mock', 'openai').default('mock'),
  }),
  LLM_BASE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .when('LLM_PROVIDER', {
      is: 'openai',
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
  LLM_API_KEY: requiredWhenOpenAi,
  LLM_MODEL: requiredWhenOpenAi,
  // Optional second model on the same endpoint, used for the one retry after a timeout or 5xx.
  LLM_FALLBACK_MODEL: Joi.string().allow('').optional(),
  LLM_TEMPERATURE: Joi.number().min(0).max(0.2).default(0.2),
  LLM_MAX_OUTPUT_TOKENS: Joi.number().integer().min(1).default(700),
  LLM_TIMEOUT_MS: Joi.number().integer().min(1).default(20_000),

  // Folder (relative to the API's working directory) for chat-errors.log and upload-errors.log.
  // Empty: no failure log files.
  ERROR_LOG_DIR: Joi.string().allow('').default('logs'),

  // Semantic retrieval (ADR-018). Empty with the openai provider: keyword-only retrieval.
  EMBEDDING_MODEL: Joi.string().allow('').optional(),
  EMBEDDING_TIMEOUT_MS: Joi.number().integer().min(1).default(10_000),
  // Cosine distance (0 = same meaning, 2 = opposite) above which a vector match is dropped.
  VECTOR_MAX_DISTANCE: Joi.number().min(0).max(2).default(0.5),

  RETRIEVAL_TOP_K: Joi.number().integer().min(1).default(6),
  RETRIEVAL_CANDIDATES: Joi.number()
    .integer()
    .min(Joi.ref('RETRIEVAL_TOP_K'))
    .default(20),
  RETRIEVAL_TOKEN_BUDGET: Joi.number().integer().min(1).default(3000),
  CHAT_HISTORY_MESSAGES: Joi.number().integer().min(0).default(6),

  // Chunking (ADR-005). Their relation to each other is checked below, not per variable.
  CHUNK_TARGET_WORDS: Joi.number()
    .integer()
    .min(1)
    .default(DEFAULT_CHUNK_CONFIG.targetWords),
  CHUNK_OVERLAP_WORDS: Joi.number()
    .integer()
    .min(1)
    .default(DEFAULT_CHUNK_CONFIG.overlapWords),
  CHUNK_MAX_WORDS: Joi.number()
    .integer()
    .min(1)
    .default(DEFAULT_CHUNK_CONFIG.maxWords),
}).custom((env: Record<string, number>, helpers) => {
  try {
    assertValidChunkConfig(chunkConfigFrom(env));
  } catch (error) {
    return helpers.message({
      custom: error instanceof Error ? error.message : String(error),
    });
  }
  return env;
});

/** The chunking parameters out of validated configuration. */
function chunkConfigFrom(env: Record<string, number>): ChunkConfig {
  return {
    targetWords: env.CHUNK_TARGET_WORDS,
    overlapWords: env.CHUNK_OVERLAP_WORDS,
    maxWords: env.CHUNK_MAX_WORDS,
  };
}

/**
 * Passed to ConfigModule's `validate` option. Collects every problem, ignores
 * unrelated variables already in the environment (PATH, ...), and returns the
 * converted values (numbers, booleans) with defaults applied.
 */
export function validateEnv(config: Record<string, unknown>) {
  const result = envSchema.validate(config, {
    abortEarly: false,
    allowUnknown: true,
  });
  if (result.error) {
    const problems = result.error.details
      .map((d) => `  - ${d.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const validated = result.value as Record<string, unknown>;
  const allowedOrigin = validated.CORS_ORIGIN as string;
  if (new URL(allowedOrigin).origin !== allowedOrigin) {
    throw new Error(
      'Invalid environment configuration: CORS_ORIGIN must be one exact origin.',
    );
  }
  if (validated.NODE_ENV === 'production' && validated.COOKIE_SECURE !== true) {
    throw new Error(
      'Invalid environment configuration: COOKIE_SECURE must be true in production.',
    );
  }
  if (
    validated.NODE_ENV === 'production' &&
    validated.LLM_PROVIDER === 'openai' &&
    new URL(validated.LLM_BASE_URL as string).protocol !== 'https:'
  ) {
    throw new Error(
      'Invalid environment configuration: LLM_BASE_URL must use HTTPS in production.',
    );
  }
  return validated;
}
