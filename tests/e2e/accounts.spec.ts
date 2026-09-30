import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { login } from './helpers';

const demo = () => JSON.parse(fs.readFileSync('.e2e/demo.json', 'utf8')) as { id: string; token: string };

test('Co-Warmaster: Einladung annehmen, nur freigegebene Kampagne sichtbar', async ({ page, browser }) => {
  const { id } = demo();
  await login(page);
  await page.goto('/admin/settings');
  // Kontoverwaltung liegt im Register „Administration“
  await page.getByRole('tab', { name: 'Administration' }).click();
  const panel = page.locator('section:not(.frame)').filter({ hasText: 'Konten und Rollen' });
  await panel.getByLabel('Rolle').selectOption('COWARMASTER');
  await page.getByRole('button', { name: 'Einladungslink erzeugen' }).click();
  const url = await panel.locator('input[readonly]').inputValue();
  expect(url).toContain('/einladung/');

  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(new URL(url).pathname);
  await p.fill('input[name="username"]', 'helfer');
  await p.fill('input[name="password"]', 'helfer-passwort-1');
  await p.fill('input[name="password2"]', 'helfer-passwort-1');
  await p.getByRole('button', { name: 'Konto anlegen' }).click();
  await p.waitForURL('**/admin');
  // noch keine Kampagne freigegeben
  await expect(p.getByRole('link', { name: /Demo/ })).toHaveCount(0);
  expect((await p.request.get(`/api/c/${id}/export`)).status()).toBe(403);
  await p.goto(`/admin/c/${id}`);
  await p.waitForURL('**/admin');
  // Einladung ist verbraucht
  expect((await p.request.get(new URL(url).pathname)).status()).toBe(404);

  // Freigabe durch den Admin
  await page.reload();
  await page.getByRole('tab', { name: 'Administration' }).click();
  const row = page.locator('li').filter({ hasText: 'helfer' });
  await row.getByLabel(/Demo/).click();
  await expect(row.getByLabel(/Demo/)).toBeChecked();
  await p.goto('/admin');
  await expect(p.getByRole('link', { name: /Demo/ })).toHaveCount(1);
  expect((await p.request.get(`/api/c/${id}/export`)).status()).toBe(200);
  // Kontoverwaltung bleibt Admins vorbehalten
  await p.goto('/admin/settings');
  await expect(p.getByText('Konten und Rollen')).toHaveCount(0);
  await ctx.close();
});
