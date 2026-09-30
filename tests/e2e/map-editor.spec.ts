import { expect, test } from '@playwright/test';
import { login, settle } from './helpers';

test('Karteneditor: Planet hinzufügen, verbinden und übernehmen', async ({ page }) => {
  await login(page);
  await page.goto('/admin');
  await page.fill('input[name="name"]', 'Karten-Test');
  await page.locator('form button.btn-primary').first().click();
  await page.waitForURL(/\/admin\/c\//);
  await page.getByRole('button', { name: 'Karte bearbeiten' }).click();
  const ed = page.getByRole('dialog', { name: 'Karteneditor' });
  await expect(ed.getByText('Karte ist spielbar')).toBeVisible();

  // Planet hinzufügen (freie Stelle oben rechts)
  await ed.getByRole('button', { name: 'Planet hinzufügen' }).click();
  const svg = ed.locator('svg').first();
  const box = (await svg.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.82, box.y + box.height * 0.12);
  // Neue Welten starten ohne Theatre → Prüfung schlägt an
  await expect(ed.getByText(/Neue Welt 14: 1–3 Theatres erlaubt/)).toBeVisible();
  await expect(ed.getByRole('button', { name: 'Übernehmen' })).toBeDisabled();
  await ed.getByRole('button', { name: 'Dead Lands' }).click();
  // Noch nicht verbunden → Prüfung schlägt weiter an
  await expect(ed.getByText(/Nicht alle Planeten sind verbunden: Neue Welt 14/)).toBeVisible();
  await expect(ed.getByRole('button', { name: 'Übernehmen' })).toBeDisabled();

  // Umbenennen und verbinden
  await ed.getByLabel('Name', { exact: true }).fill('Grimwald');
  await ed.getByRole('button', { name: 'Verbinden' }).click();
  await ed.locator('svg g').filter({ hasText: 'Grimwald' }).first().click();
  await ed.locator('svg g').filter({ hasText: 'Jawardet' }).first().click();
  await expect(ed.getByText('Karte ist spielbar')).toBeVisible();

  await ed.getByRole('button', { name: 'Übernehmen' }).click();
  await settle(page);
  await expect(ed).toHaveCount(0);
  await expect(page.getByText(/14 Planeten · 19 Verbindungen/)).toBeVisible();
  await expect(page.getByText('eigene Karte')).toBeVisible();
  // Neuer Planet steht auf der Übersichtskarte
  // Namen werden zuletzt (über Routen) gezeichnet und stehen daher außerhalb der Planetengruppe
  await expect(page.locator('svg text').filter({ hasText: 'Grimwald' }).first()).toBeVisible();
});
