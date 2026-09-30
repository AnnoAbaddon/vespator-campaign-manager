import { describe, expect, it } from 'vitest';
import { VESPATOR_MAP } from '@/engine/map';
import { compactLayout, compactSize, labelBox, MAP_H, MAP_W, type Extent } from '@/components/map/MapSvg';
import { mixHex, muted } from '@/components/map/color';
import { frameDate } from '@/components/public/Timelapse';

const planets = VESPATOR_MAP.planets;
const ext: Extent = { l: 90, r: 90, t: 100, b: 110 };

describe('Übersicht: Einpassung auf die Inhaltsgrenzen', () => {
  it('passt die Zeichenfläche an das Seitenverhältnis der Anzeige an', () => {
    expect(compactSize(false)).toEqual({ w: MAP_W, h: MAP_H });
    expect(compactSize(true)).toEqual({ w: MAP_H, h: MAP_W });
    expect(compactSize(false, 1.1)).toEqual({ w: MAP_W, h: Math.round(MAP_W * 1.1) });
    // unsinnige Seitenverhältnisse werden begrenzt
    expect(compactSize(false, 10).h).toBeLessThanOrEqual(MAP_W * 2.4);
  });

  it('verteilt die Planeten über fast die ganze Höhe und hält alle Marken in der Fläche', () => {
    const W = MAP_W;
    const H = Math.round(MAP_W * 1.1);
    const pos = compactLayout(planets, false, W, H, () => ext);
    const ys = planets.map((p) => pos.get(p.id)!.y);
    const xs = planets.map((p) => pos.get(p.id)!.x);
    for (let i = 0; i < planets.length; i++) {
      expect(xs[i] - ext.l).toBeGreaterThanOrEqual(11.9);
      expect(xs[i] + ext.r).toBeLessThanOrEqual(W - 11.9);
      expect(ys[i] - ext.t).toBeGreaterThanOrEqual(11.9);
      expect(ys[i] + ext.b).toBeLessThanOrEqual(H - 11.9);
    }
    // genutzte Höhe samt Marken: mindestens 85 % der Fläche (vorher schwebte das Netz mittig)
    const used = Math.max(...ys) + ext.b - (Math.min(...ys) - ext.t);
    expect(used / H).toBeGreaterThan(0.85);
  });

  it('behält Orientierung und Reihenfolge der Weltkoordinaten', () => {
    const pos = compactLayout(planets, false, MAP_W, MAP_W, () => ext);
    for (const a of planets)
      for (const b of planets) {
        if (a.x < b.x) expect(pos.get(a.id)!.x).toBeLessThan(pos.get(b.id)!.x);
        if (a.y < b.y) expect(pos.get(a.id)!.y).toBeLessThan(pos.get(b.id)!.y);
      }
  });

  it('begrenzt die Streckung einer Achse gegenüber der anderen', () => {
    const pos = compactLayout(planets, false, MAP_W, MAP_W * 2.4, () => ext, 1.5);
    const a = planets[0];
    const b = planets.find((p) => p.y !== a.y && p.x !== a.x)!;
    const sx = (pos.get(b.id)!.x - pos.get(a.id)!.x) / (((b.x - a.x) / 100) * MAP_W);
    const sy = (pos.get(b.id)!.y - pos.get(a.id)!.y) / (((b.y - a.y) / 100) * MAP_H);
    expect(sy / sx).toBeLessThanOrEqual(1.5 + 1e-9);
  });

  it('hält eine reservierte Ecke frei (Kartenschmuck mit Kenndaten)', () => {
    const W = MAP_W;
    const H = MAP_W;
    const free = compactLayout(planets, false, W, H, () => ext);
    const res = compactLayout(planets, false, W, H, () => ext, 1.5, 12, [{ corner: 'bl', w: 500, h: 250 }]);
    for (const p of planets) {
      const q = res.get(p.id)!;
      if (q.x - ext.l < 500) expect(q.y + ext.b).toBeLessThanOrEqual(H - 12 - 250 + 1e-6);
    }
    // ohne Reserve reichte mindestens ein Planet links unten in die Ecke
    expect(planets.some((p) => free.get(p.id)!.x - ext.l < 500 && free.get(p.id)!.y + ext.b > H - 12 - 250)).toBe(true);
  });

  it('liefert Namensflächen je Ausrichtung', () => {
    expect(labelBox({ x: 100, y: 50, anchor: 'middle' }, 40, 10)).toEqual({ x0: 80, x1: 120, y0: 42, y1: 52.2 });
    expect(labelBox({ x: 100, y: 50, anchor: 'start' }, 40, 10).x0).toBe(100);
    expect(labelBox({ x: 100, y: 50, anchor: 'end' }, 40, 10).x1).toBe(100);
  });
});

describe('Gedeckte Allianzfarben', () => {
  it('mischt Farben und lässt unbekannte Formate unverändert', () => {
    expect(mixHex('#ffffff', '#000000', 0.5)).toBe('#808080');
    expect(mixHex('#3b82f6', '#141817', 1)).toBe('#3b82f6');
    expect(mixHex('#3b82f6', '#141817', 0)).toBe('#141817');
    expect(mixHex('#fff', '#000', 1)).toBe('#ffffff');
    expect(mixHex('rebeccapurple', '#000', 0.5)).toBe('rebeccapurple');
  });

  it('gedeckte Füllung ist dunkler als die Allianzfarbe', () => {
    const lum = (h: string) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
    expect(lum(muted('#ef4444'))).toBeLessThan(lum('#ef4444'));
  });
});

describe('Zeitraffer: Datum je Stand', () => {
  it('formatiert in der Zeitzone der Kampagne, kurz ohne Jahr', () => {
    expect(frameDate('2026-09-28T23:30:00.000Z', 'de', 'Europe/Berlin')).toBe('29.09.2026');
    expect(frameDate('2026-09-28T23:30:00.000Z', 'de', 'Europe/Berlin', true)).toBe('29.09.');
    expect(frameDate('2026-09-28T23:30:00.000Z', 'en', 'Europe/Berlin')).toBe('29/09/2026');
    expect(frameDate(undefined, 'de')).toBe('');
    expect(frameDate('kein Datum', 'de')).toBe('');
    // ungültige Zeitzone: kein Absturz
    expect(frameDate('2026-09-28T12:00:00.000Z', 'de', 'Nirgendwo/Stadt')).toMatch(/2026/);
  });
});
