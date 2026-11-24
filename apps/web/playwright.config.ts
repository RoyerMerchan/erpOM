import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const databaseUrl = process.env.E2E_DATABASE_URL;
const database = databaseUrl && URL.parse(databaseUrl);
if (
  !database ||
  !['postgres:', 'postgresql:'].includes(database.protocol) ||
  !database.pathname.endsWith('_e2e')
) {
  throw new Error(
    'Define E2E_DATABASE_URL con una base PostgreSQL de pruebas que termine en _e2e.',
  );
}

const root = fileURLToPath(new URL('../../', import.meta.url));
const baseURL = 'http://localhost:4173';
const apiPort = '4317';

export default defineConfig({
  testDir: './e2e',
  outputDir: '../../.local/e2e-results',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  reporter: 'list',
  use: {
    baseURL,
    actionTimeout: 12_000,
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    timezoneId: 'America/Caracas',
    viewport: { width: 1366, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      name: 'API',
      cwd: root,
      command: 'pnpm --filter @max-sport/api start',
      env: {
        DATABASE_URL: databaseUrl!,
        NODE_ENV: 'test',
        API_HOST: '127.0.0.1',
        API_PORT: apiPort,
        APP_ORIGIN: baseURL,
        TRUST_PROXY_HOPS: '0',
        LOG_LEVEL: 'warn',
      },
      url: `http://127.0.0.1:${apiPort}/api/v1/health/ready`,
    },
    {
      name: 'Web',
      cwd: root,
      command: 'pnpm --filter @max-sport/web preview --port 4173 --strictPort',
      env: { API_PORT: apiPort },
      url: baseURL,
    },
  ],
});
