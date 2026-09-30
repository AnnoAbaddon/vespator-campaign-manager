// Legt (falls nötig) den Admin an, meldet an und speichert den Browser-Zustand. Nutzung: node scripts/login.mjs <baseUrl> <statefile>
import { chromium } from '@playwright/test';
const [, , base, stateFile] = process.argv;
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(base + '/admin');
if (page.url().includes('/setup-admin')) {
  await page.fill('#username', 'warmaster');
  await page.fill('#password', 'test-passwort-123');
  await page.fill('#password2', 'test-passwort-123');
  await page.click('button');
  await page.waitForURL('**/admin');
} else if (page.url().includes('/login')) {
  await page.fill('#username', 'warmaster');
  await page.fill('#password', 'test-passwort-123');
  await page.click('button');
  await page.waitForURL('**/admin');
}
await ctx.storageState({ path: stateFile });
console.log('ok', page.url());
await browser.close();
