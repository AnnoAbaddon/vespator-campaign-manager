import { expect, test } from '@playwright/test';
import { act, exportState, expectStage, login, scenarios } from './helpers';

/** Events mit Entscheidungen über die Oberfläche anwenden (Szenarien aus scripts/seed-scenarios.ts) */
test.describe('Events mit Entscheidungen', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Xenobeast Migration: jede Flotte weicht auf einen nicht verbundenen Planeten aus', async ({ page }) => {
    const { xeno } = scenarios();
    await page.goto(`/admin/c/${xeno.id}`);
    await expectStage(page, 'Punkte & Events');
    const box = page.locator('div.border.p-3').filter({ hasText: 'Xenobeast Migration' });
    await expect(box).toBeVisible();
    // Kryndaer → Jawardet, Novamagnor → Masnet, Caltus Novem → Felgris Secundas
    await box.locator('label').filter({ hasText: 'Imperium Flotte I' }).locator('select').selectOption('jawardet');
    await box.locator('label').filter({ hasText: 'Chaos Flotte I' }).locator('select').selectOption('masnet');
    await box.locator('label').filter({ hasText: 'Xenos Flotte I' }).locator('select').selectOption('felgris-secundas');
    // verbundene Planeten werden gar nicht angeboten
    await expect(box.locator('label').filter({ hasText: 'Imperium Flotte I' }).locator('option[value="karabas"]')).toHaveCount(0);
    await act(page, 'Anwenden', box);
    await expect(box.getByText('angewendet')).toBeVisible();

    const s = await exportState(page, xeno.id);
    const pos = Object.fromEntries(s.fleets.map((f) => [f.name, f.planetId]));
    expect(pos['Imperium Flotte I']).toBe('jawardet');
    expect(pos['Chaos Flotte I']).toBe('masnet');
    expect(pos['Xenos Flotte I']).toBe('felgris-secundas');
    expect(s.events.find((e) => e.code === 'FW_31')?.status).toBe('APPLIED');
  });

  test('Machinations of Fate: ein Spieler läuft ab der nächsten Phase über', async ({ page }) => {
    const { fate } = scenarios();
    await page.goto(`/admin/c/${fate.id}`);
    await expectStage(page, 'Punkte & Events');
    const box = page.locator('div.border.p-3').filter({ hasText: 'Machinations of Fate' });
    await expect(box).toBeVisible();
    const sel = box.locator('label').filter({ hasText: 'Konrad' }).first().locator('select');
    const chaosValue = await sel.locator('option', { hasText: '→ Chaos' }).getAttribute('value');
    await sel.selectOption(chaosValue!);
    await act(page, 'Anwenden', box);
    await expect(box.getByText('angewendet')).toBeVisible();

    const s = await exportState(page, fate.id);
    const chaos = s.alliances.find((a) => a.name === 'Chaos')!.id;
    const konrad = s.players.find((p) => p.nickname === 'Konrad')!;
    expect(konrad.memberships.at(-1)).toEqual({ allianceId: chaos, fromPhase: 2, toPhase: null });
    expect(konrad.memberships[0].toPhase).toBe(1);
  });

  test('A Costly Bargain: zurückliegende Allianz tauscht ihr Power Level', async ({ page }) => {
    const { bargain } = scenarios();
    await page.goto(`/admin/c/${bargain.id}`);
    await expectStage(page, 'Punkte & Events');
    const before = await exportState(page, bargain.id);
    const xenos = before.alliances.find((a) => a.name === 'Xenos')!.id;
    const chaos = before.alliances.find((a) => a.name === 'Chaos')!.id;
    const masnet = (s: typeof before) => s.planets.find((p) => p.id === 'masnet')!.power;
    expect(before.events.find((e) => e.code === 'DM_1')?.allianceId).toBe(xenos);
    const [plX, plC] = [masnet(before)[xenos], masnet(before)[chaos]];
    expect(plX).not.toBe(plC);

    const box = page.locator('div.border.p-3').filter({ hasText: 'A Costly Bargain' });
    await expect(box).toBeVisible();
    const selects = box.locator('select');
    await selects.nth(0).selectOption('masnet');
    await selects.nth(1).selectOption(chaos);
    await act(page, 'Anwenden', box);
    await expect(box.getByText('angewendet')).toBeVisible();

    const after = await exportState(page, bargain.id);
    expect(masnet(after)[xenos]).toBe(plC);
    expect(masnet(after)[chaos]).toBe(plX);
  });
});
