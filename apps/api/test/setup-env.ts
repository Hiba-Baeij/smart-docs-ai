/**
 * Runs before every e2e test file (jest `setupFiles`). Points the app at the test database;
 * the guard itself lives in support/test-database.ts.
 */
import { getTestDatabaseUrl } from './support/test-database';

process.env.DATABASE_URL = getTestDatabaseUrl();

// Never a real AI service from a developer's .env: uploads would call the embedding API and chat
// the model, which is slow, costs money and makes results depend on the network. Specs that test
// a provider adapter replace LLM_PROVIDER or EMBEDDING_PROVIDER with an override.
process.env.LLM_PROVIDER = 'mock';

// Most specs log in or register many times within a minute; only the rate-limit spec
// (which sets its own value before importing the app) exercises the real limit.
process.env.AUTH_RATE_LIMIT = '1000';
process.env.UPLOAD_RATE_LIMIT = '1000';
process.env.MESSAGE_RATE_LIMIT = '1000';
process.env.GENERAL_RATE_LIMIT = '1000';
