import { describe, expect, it } from 'vitest';
import { createCampaignState } from '@/engine/init';
import { mapOf } from '@/engine/map';
import { clipRoute, detailBlocks, detailFont, placePlaque, type Box } from '@/components/map/MapSvg';
import { playerStats } from '@/components/stats/compute';
import { run, startedCampaign } from './helpers';

const inside = (x: number, y: number, b: Box) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;
const overlaps = (a: Box, b: Box) => Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0);

describe('Detailkarte: Routen und Schilder meiden Datenblöcke', () => {
  const s = createCampaignState({ name: 'T', phaseCount: 5, allianceCount: 3, now: '2026-01-01T00:00:00.000Z' });

  it('liefert je Planet Schild, PL-Raster, Globus, Symbolgruppen und Systemnamen als belegte Flächen', () => {
    const blocks = detailBlocks(s, 1.4);
    for (const def of mapOf(s).planets) expect(blocks.get(def.id)!.length).toBeGreaterThanOrEqual(6);
  });

  it('kürzt eine Route, bis Anfang und Ende außerhalb der Blöcke von Start- und Zielplanet liegen', () => {
    const from: Box[] = [{ x0: 0, y0: -50, x1: 100, y1: 50 }];
    const to: Box[] = [{ x0: 400, y0: -50, x1: 500, y1: 50 }];
    const r = clipRoute(50, 0, 450, 0, from, to, 4, 4);
    expect(r.sx).toBeGreaterThanOrEqual(104);
    expect(r.ex).toBeLessThanOrEqual(396 - 4);
    expect(inside(r.sx, r.sy, from[0])).toBe(false);
    expect(inside(r.ex, r.ey, to[0])).toBe(false);
  });

  it('setzt das Routenschild auf eine freie Stelle statt auf ein PL-Raster', () => {
    const grid: Box = { x0: 180, y0: -30, x1: 320, y1: 30 };
    const spot = placePlaque(0, 0, 500, 0, 120, 24, [grid]);
    expect(overlaps(spot.box, grid)).toBe(false);
  });

  it('hält lesepflichtige Schriften nach der Skalierung bei etwa 14 Bildschirm-px', () => {
    // 1,4 Karteneinheiten je Bildschirmpixel: 15er-Schrift wird auf 19,6 Einheiten angehoben (= 14 px)
    expect(detailFont(15, 1.4)).toBeCloseTo(19.6, 1);
    // höchstens 1,6-fach vergrößert
    expect(detailFont(15, 4)).toBe(24);
    // ohne Maßstab (Druck/PNG) unverändert
    expect(detailFont(15)).toBe(15);
  });
});

describe('Rangliste: kein Rang vor der ersten gewerteten Schlacht', () => {
  it('stellt Spieler ohne Schlacht alphabetisch ans Ende', () => {
    let s = startedCampaign();
    s = run(s, { type: 'PLAYER_UPSERT', data: { nickname: 'Aaron', faction: 'Orks' }, allianceId: s.alliances[0].id });
    const rows = playerStats(s);
    expect(rows.every((r) => r.battles === 0)).toBe(true);
    const names = rows.map((r) => r.nickname);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});
