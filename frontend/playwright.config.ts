import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for Content Suite E2E tests.
 *
 * Assumes you have BOTH the backend (port 8000) and frontend (port 5173) already running.
 * Run with:   npm run test:e2e
 * View report: npm run test:e2e:report
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // run sequentially so screenshots are numbered in order
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
    locale: 'es-PE',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
