import { defineConfig } from '@playwright/test';

const PORT = 4301;

/** Browser checks for the web UI. API responses are controlled inside each spec. */
export default defineConfig({
  testDir: '.',
  testMatch: 'frontend.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  outputDir: './test-results/frontend',
  use: { baseURL: `http://localhost:${PORT}`, channel: 'chrome' },
  webServer: {
    command: `npm run start -w apps/web -- --port ${PORT}`,
    cwd: '..',
    url: `http://localhost:${PORT}`,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
