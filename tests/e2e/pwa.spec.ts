import { expect, test } from '@playwright/test';
import fs from 'node:fs';

const demo = () => JSON.parse(fs.readFileSync('.e2e/demo.json', 'utf8')) as { id: string; token: string };

test('PWA: Manifest, Service Worker und Leseansicht offline', async ({ browser }) => {
  const { token } = demo();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.status()).toBe(200);
  expect((await manifest.json()).short_name).toBe('Vespator Front');
  expect((await page.request.get('/sw.js')).status()).toBe(200);

  await page.goto(`/v/${token}`);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // einmal neu laden, damit der Service Worker die Seite kontrolliert und zwischenspeichert
  await page.reload();
  await page.waitForLoadState('networkidle');
  await ctx.setOffline(true);
  await page.reload();
  await expect(page.getByText('Kampagnenpunkte').first()).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible();
  // Verwaltung wird nie zwischengespeichert
  const admin = await page.goto('/admin').catch(() => null);
  expect(admin === null || admin.status() !== 200 || !(await page.content()).includes('Kampagnen')).toBe(true);
  await ctx.close();
});
