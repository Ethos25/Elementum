// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 0,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:3333',
    // Full-viewport screenshots, no animations playing on capture
    screenshot: 'on',
    video: 'off',
    trace: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Spin up `serve` on port 3333 before running tests
  webServer: {
    command: 'npx serve . --listen 3333 --no-clipboard',
    url: 'http://localhost:3333',
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
});
