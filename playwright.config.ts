import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './web/e2e',
  timeout: 30000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4100',
    channel: 'msedge',
    headless: true,
    screenshot: 'only-on-failure',
  },
  outputDir: 'test-results/browser',
  webServer: {
    command: 'npm run db:migrate && npm run db:seed && npm start',
    url: 'http://127.0.0.1:4100/api/health',
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      PORT: '4100',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ||
        'postgresql://bedss:bedss_local@127.0.0.1:55432/bedss_test',
    },
  },
});
