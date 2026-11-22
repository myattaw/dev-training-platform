import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Uncommon port so the tests never attach to an unrelated local dev server.
const PORT = 4317;
// A fresh progress file per run, so Skill Mastery tests start from zero.
const DATA_FILE = join(tmpdir(), `pracstack-e2e-${Date.now()}.json`);

/**
 * End-to-end tests run against the production build (not `ng serve`), served
 * by the local API server, so they exercise the real stack and catch problems
 * that only appear in optimized output.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  // CI runners are slower than developer machines (cold browser, fewer CPUs).
  expect: { timeout: process.env['CI'] ? 15_000 : 5_000 },
  timeout: process.env['CI'] ? 90_000 : 30_000,
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
    // Rate limits are raised: every test runs as the same local user, in parallel.
    command: `npm run build && npx tsx services/api/src/local/server.ts --port ${PORT} --static dist/web/browser --data "${DATA_FILE}" --requests-per-minute 100000 --sql-per-minute 100000 --code-per-minute 100000`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    // The command rebuilds everything: content build (~85 s, engine-checked
    // questions), Angular (~20 s) and the private-content leak check (~90 s,
    // which builds the content again). That reached 191 s on a developer
    // machine and overran the previous 180 s limit before any test ran.
    timeout: 480_000,
  },
});
