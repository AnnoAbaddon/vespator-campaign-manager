import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { login } from './helpers';

const demo = () => JSON.parse(fs.readFileSync('.e2e/demo.json', 'utf8')) as { id: string; token: string };

test('Codex, Zeitraffer, Präsentation und Druckbögen laden ohne Fehler', async ({ page }) => {
  const { id, token } = demo();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  for (const [url, text] of [
    [`/admin/c/${id}/sheets/orders`, 'Befehlsbogen'],
    [`/admin/c/${id}/sheets/moves`, 'Bewegungsbogen'],
    [`/admin/c/${id}/sheets/results`, 'Ergebnisbögen'],
    [`/admin/c/${id}/codex`, 'Ehrenliste'],
    [`/admin/c/${id}/zeitraffer`, 'Kampagnenstart'],
    [`/v/${token}/codex`, 'Inhalt'],
    [`/v/${token}/zeitraffer`, 'Abspielen'],
    // rechte Spalte wechselt je nach Lage (Schlachten/Meldungen) – das Meldungs-Laufband ist immer da
    [`/v/${token}/present?t=10`, 'Meldungen'],
  ] as const) {
    const res = await page.goto(url);
    expect(res?.status(), url).toBe(200);
    // sichtbares Vorkommen (das Inhaltsverzeichnis gibt es für Mobil zusätzlich als eingeklappte Kopie)
    await expect(page.getByText(text).filter({ visible: true }).first(), url).toBeVisible();
  }
  // Zeitraffer: Schieberegler bis zum Ende
  await page.goto(`/v/${token}/zeitraffer`);
  await page.getByLabel('Zeitpunkt').fill('1');
  expect(errors).toEqual([]);
});
