import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:3100';

/**
 * Credentials live only in .env.local. We parse the file here (never log it)
 * and expose the values to workers through environment variables that are
 * prefixed for the test suite.
 */
function loadLocalAdminCredentials(): void {
  let contents: string;
  try {
    contents = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  } catch {
    return;
  }

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (key !== 'ADMIN_EMAIL' && key !== 'ADMIN_PASSWORD') continue;

    const target = key === 'ADMIN_EMAIL' ? 'E2E_ADMIN_EMAIL' : 'E2E_ADMIN_PASSWORD';
    if (process.env[target]) continue;

    let value = rawValue.trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    process.env[target] = value;
  }
}

loadLocalAdminCredentials();

const webServerEnv: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (value !== undefined) webServerEnv[key] = value;
}
webServerEnv.DATA_MODE = 'local';
// The E2E harness intentionally builds with local persistence over plain HTTP.
// This opt-in is harness-only; normal production builds still fail closed.
webServerEnv.DG_ALLOW_LOCAL_IN_PRODUCTION = '1';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // A single worker keeps the shared local SQLite fixture deterministic and
  // avoids dev-server compilation races between browser contexts.
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    extraHTTPHeaders: { Origin: BASE_URL },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Build then serve the production bundle: Next dev rewrites .next during a
    // run, which can invalidate already-requested RSC payloads mid-test.
    command: 'node node_modules/next/dist/bin/next build && node node_modules/next/dist/bin/next start -p 3100',
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 300000,
    env: webServerEnv,
  },
});
