import { expect, test } from '@playwright/test';
import { login, scenarios, settle } from './helpers';

test('Allianz: Spieler aus anderer Allianz zuweisen und entfernen', async ({ page }) => {
  const { id } = scenarios().bargain;
  await login(page);
  await page.goto(`/admin/c/${id}`);
  await page.getByRole('tab', { name: 'Allianzen & Spieler' }).click();
  await page.getByRole('tab', { name: 'Allianzen', exact: true }).click();
  const cards = page.locator('section:not(.frame)').filter({ has: page.getByLabel('Spieler hinzufügen') });
  const first = cards.first();
  const select = first.getByLabel('Spieler hinzufügen');
  // Kandidaten aus einer anderen Allianz stehen in einer eigenen Gruppe
  const group = select.locator('optgroup[label^="Aus "]').first();
  const value = await group.locator('option').first().getAttribute('value');
  const name = (await group.locator('option').first().textContent())!.replace(/ \(.*\)$/, '').trim();
  await select.selectOption(value!);
  await first.getByRole('button', { name: 'Hinzufügen' }).click();
  await settle(page); // Warnung „wechselt die Allianz“ bestätigen
  await expect(first.getByLabel(`${name} aus der Allianz entfernen`)).toBeVisible();
  // wieder entfernen → Spieler ohne Allianz
  await first.getByLabel(`${name} aus der Allianz entfernen`).click();
  await settle(page);
  await expect(first.getByLabel(`${name} aus der Allianz entfernen`)).toHaveCount(0);
  await expect(first.getByLabel('Spieler hinzufügen').locator('optgroup[label="Ohne Allianz"] option', { hasText: name })).toHaveCount(1);
});
