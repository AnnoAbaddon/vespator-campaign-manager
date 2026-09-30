import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { login } from './helpers';

const demo = () => JSON.parse(fs.readFileSync('.e2e/demo.json', 'utf8')) as { id: string; token: string };

test('Englische Oberfläche: Leseansicht per Umschalter, Verwaltung je Konto', async ({ page, browser }) => {
  const { id, token } = demo();
  // Leseansicht: Umschalter setzt das Cookie
  const ctx = await browser.newContext({ locale: 'de-DE' });
  const p = await ctx.newPage();
  await p.goto(`/v/${token}`);
  await expect(p.getByText('Kampagnenpunkte').first()).toBeVisible();
  await p.getByRole('button', { name: 'EN', exact: true }).first().click();
  await expect(p.getByText('Campaign points').first()).toBeVisible();
  await expect(p.locator('html')).toHaveAttribute('lang', 'en');
  await p.goto(`/v/${token}/faq`);
  await expect(p.getByText('F-1').first()).toBeVisible();
  await expect(p.getByRole('heading', { name: /Which value determines the build order/i }).first()).toBeVisible();
  await ctx.close();

  // Verwaltung: Sprache des Kontos
  await login(page);
  await page.goto('/admin/settings');
  const langForm = page.locator('form').filter({ has: page.getByLabel('Sprache der Verwaltung') });
  await langForm.getByLabel('Sprache der Verwaltung').selectOption('en');
  await langForm.getByRole('button').click();
  await page.waitForLoadState('networkidle');
  await page.goto(`/admin/c/${id}`);
  await expect(page.getByText('Undo').first()).toBeVisible();
  // zurückstellen, damit andere Tests Deutsch sehen
  await page.goto('/admin/settings');
  const enForm = page.locator('form').filter({ has: page.getByLabel('Language of the admin area') });
  await enForm.getByLabel('Language of the admin area').selectOption('de');
  await enForm.getByRole('button').click();
  await page.waitForLoadState('networkidle');
  await page.goto(`/admin/c/${id}`);
  await expect(page.getByText('Rückgängig').first()).toBeVisible();
});

test('Sprachschalter: Ersteinrichtung, Anmeldung und Kopfzeile der Verwaltung', async ({ page, browser }) => {
  const { id } = demo();
  const ctx = await browser.newContext({ locale: 'de-DE' });
  const p = await ctx.newPage();
  // Ersteinrichtung nur, solange noch kein Konto existiert (sonst leitet die Seite zur Anmeldung um)
  await p.goto('/setup-admin');
  if (p.url().includes('/setup-admin')) {
    await expect(p.getByRole('heading', { name: 'Spielleiter-Konto' })).toBeVisible();
    // Einmal-Token der Ersteinrichtung ist Pflichtfeld
    await expect(p.getByLabel('Setup-Token')).toBeVisible();
    await expect(p.locator('input[name=locale][value=de]')).toBeChecked();
    await p.getByText('English', { exact: true }).click();
    await expect(p.getByRole('heading', { name: 'Warmaster account' })).toBeVisible();
    await expect(p.getByLabel('Setup token')).toBeVisible();
    await expect(p.locator('html')).toHaveAttribute('lang', 'en');
    await p.getByText('Deutsch', { exact: true }).click();
    await expect(p.getByRole('heading', { name: 'Spielleiter-Konto' })).toBeVisible();
  }
  await login(page);

  // Anmeldung: Schalter setzt das Cookie und lädt neu
  await p.goto('/login');
  await expect(p.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
  await p.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(p.getByRole('heading', { name: 'Log in' })).toBeVisible();
  await expect(p.locator('html')).toHaveAttribute('lang', 'en');
  await p.getByRole('button', { name: 'DE', exact: true }).click();
  await expect(p.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
  await ctx.close();

  // Kopfzeile der Verwaltung: Schalter ändert Kontosprache und Cookie
  await page.goto(`/admin/c/${id}`);
  await pickLang(page, 'EN');
  await expect(page.getByText('Undo').first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.goto('/admin/settings');
  await expect(page.getByLabel('Language of the admin area')).toHaveValue('en');
  await pickLang(page, 'DE');
  await expect(page.getByLabel('Sprache der Verwaltung')).toHaveValue('de');
  await page.goto(`/admin/c/${id}`);
  await expect(page.getByText('Rückgängig').first()).toBeVisible();
});

/** Sprachschalter der Kopfzeile: Knopfleiste (breit) oder kompakte Auswahl (schmaler als 2xl) */
async function pickLang(page: import('@playwright/test').Page, code: 'DE' | 'EN') {
  const sw = page.locator('[data-lang-switch]:visible').first();
  const select = sw.locator('select:visible');
  if (await select.count()) await select.selectOption({ label: code });
  else await sw.getByRole('button', { name: code, exact: true }).click();
}
