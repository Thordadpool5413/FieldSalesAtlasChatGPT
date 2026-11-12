import { defineConfig, devices } from '@playwright/test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDirectory = mkdtempSync(join(tmpdir(), 'atlas-browser-'));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  ['/usr/bin/chromium', '/repl/tools/bin/chromium'].find(existsSync);

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: join(tmpdir(), 'field-atlas-browser-results'),
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    launchOptions: { executablePath },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', testMatch: 'app.spec.ts', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', testMatch: 'app.spec.ts', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    { name: 'laptop', testMatch: 'layout.spec.ts', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
  ],
  webServer: {
    command: 'node tests/support/start-e2e.mjs',
    url: 'http://127.0.0.1:5174/api/_healthcheck',
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
    env: { PORT: '5174', ATLAS_API_PORT: '5175', ATLAS_DATA_DIR: dataDirectory, ATLAS_DATABASE_ENGINE:'sqlite' },
  },
});
