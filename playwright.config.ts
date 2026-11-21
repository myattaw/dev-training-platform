import { defineConfig, devices } from '@playwright/test';

// Uncommon port so the tests never attach to an unrelated local dev server.
const PORT = 4317;

/**
 * End-to-end tests run against the production build (not `ng serve`), so they
 * catch problems that only appear in optimized output.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // Tests paste code into Monaco (typing would trigger auto-closing brackets).
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: '**/*.mobile.e2e.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      testMatch: '**/*.mobile.e2e.ts',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: `npm run build && node e2e/support/static-server.mjs dist/pracstack/browser ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
