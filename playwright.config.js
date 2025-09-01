import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: false, // Hearts game tests should run sequentially
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : 1, // Hearts game needs single worker
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html'],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }]
  ],
  /* Shared settings for all the projects below. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'https://kl-pi.tail9f5728.ts.net',
    
    /* Collect trace when retrying the failed test. */
    trace: 'on-first-retry',
    
    /* Take screenshots on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on retry */
    video: 'retry-with-video',
    
    /* Global timeout for each test */
    actionTimeout: 30000,
    
    /* Navigation timeout */
    navigationTimeout: 45000
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  /* Hearts Game specific configuration */
  timeout: 180000, // 3 minutes per test (Hearts games can take time)
  expect: {
    timeout: 10000 // 10 seconds for assertions
  },

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'echo "Hearts game server should be running at https://kl-pi.tail9f5728.ts.net"',
    url: 'https://kl-pi.tail9f5728.ts.net',
    reuseExistingServer: true,
    timeout: 5000,
  },
});
