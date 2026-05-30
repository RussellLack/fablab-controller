import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the Fablab Controller smoke tests.
 *
 * Tests run sequentially (parallel: 1) because they mutate shared DB state
 * via Supabase. Each test is responsible for cleaning up after itself or
 * using unique identifiers per run.
 *
 * In CI: tests run against `npm run dev` started by the webServer config.
 * Locally: same, or you can run `npm run dev` separately and skip webServer.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,                                                   // sequential — DB state matters
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],

  // Start the dev server before running tests (unless E2E_BASE_URL is set externally)
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'ENABLE_TEST_LOGIN=1 npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ENABLE_TEST_LOGIN: '1' }
  }
});
