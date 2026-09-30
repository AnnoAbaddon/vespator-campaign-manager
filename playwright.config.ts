import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  // Deutscher Browser: die Ersteinrichtung ist damit auf Deutsch vorbelegt (Standardsprache Deutsch, helpers.login()).
  // Die Suite erwartet Deutsch auch in einem Build mit der Standardsprache Englisch (NEXT_PUBLIC_DEFAULT_LOCALE ohne
  // Angabe): Accept-Language zusätzlich als Kopfzeile, damit auch reine Anfragen (request-Fixture) Deutsch bekommen.
  use: {
    baseURL: 'http://localhost:3200',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1500, height: 1000 },
    locale: 'de-DE',
    extraHTTPHeaders: { 'Accept-Language': 'de-DE,de;q=0.9' },
  },
  webServer: { command: 'node scripts/e2e-server.mjs', url: 'http://localhost:3200/api/health', reuseExistingServer: false, timeout: 120_000 },
});
