// Hilfsskript: Screenshots für die Entwicklung. Nutzung: node scripts/shot.mjs <url> <datei> [breite] [höhe]
// Optional: STATE=<storageState.json>, MOBILE=1 (Touch-Gerät), FULL=1 (ganze Seite), CLICK="sel1|sel2" (vorher anklicken)
import { chromium } from '@playwright/test';
const [, , url, out, w = '1500', h = '1000'] = process.argv;
const browser = await chromium.launch();
const mobile = process.env.MOBILE === '1';
const ctx = await browser.newContext({ viewport: { width: Number(w), height: Number(h) }, storageState: process.env.STATE || undefined, isMobile: mobile, hasTouch: mobile });
const page = await ctx.newPage();
page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
for (const sel of (process.env.CLICK ?? '').split('|').filter(Boolean)) {
  await page.locator(sel).first().click({ force: true });
  await page.waitForTimeout(500);
}
await page.screenshot({ path: out, fullPage: process.env.FULL === '1' });
await browser.close();
