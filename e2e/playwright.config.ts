import { randomBytes } from 'node:crypto';
import { defineConfig } from '@playwright/test';

/**
 * The browser journey runs against its OWN processes and its OWN database, on ports nothing else
 * uses (API 3100, web 4300), so it can run next to the development servers and can never read or
 * write development data. Configuration is passed explicitly: the API reads no `.env` file here
 * (it starts from the repository root), so nothing from a developer's machine leaks in.
 */
const API_PORT = 3100;
const WEB_PORT = 4300;
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgresql://smartdocs:smartdocs@localhost:5433/smartdocs_e2e';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  // One journey, in order, against one database.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  outputDir: './test-results',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    // The Chrome that is already installed, so no browser has to be downloaded.
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // Prepare (empty database, build, migrate), then start the compiled API.
      command: 'node e2e/prepare.mjs && node apps/api/dist/main',
      cwd: '..',
      url: `http://localhost:${API_PORT}/api/health`,
      timeout: 240_000,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        NODE_ENV: 'development',
        PORT: String(API_PORT),
        DATABASE_URL,
        // A fresh secret per run: no fixed credential exists anywhere in the repository.
        JWT_SECRET: randomBytes(32).toString('hex'),
        CORS_ORIGIN: `http://localhost:${WEB_PORT}`,
        COOKIE_SECURE: 'false',
        // The journey signs up and in within seconds; the limits themselves are tested elsewhere.
        AUTH_RATE_LIMIT: '100',
        UPLOAD_RATE_LIMIT: '100',
        MESSAGE_RATE_LIMIT: '100',
        GENERAL_RATE_LIMIT: '1000',
        // The deterministic stand-in: the journey proves the plumbing and the exact fallback text,
        // not the quality of a model.
        LLM_PROVIDER: 'mock',
      },
    },
    {
      command: `npx ng serve --port ${WEB_PORT} --proxy-config proxy.e2e.conf.json`,
      cwd: '../apps/web',
      url: `http://localhost:${WEB_PORT}`,
      timeout: 240_000,
      reuseExistingServer: false,
      env: { PORT: String(WEB_PORT) },
    },
  ],
});
