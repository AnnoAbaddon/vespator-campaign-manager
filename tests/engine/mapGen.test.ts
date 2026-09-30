import { describe, expect, it } from 'vitest';
import { generateMap, normalizeGenOptions, DEFAULT_MAP_GEN } from '@/engine/mapGen';
import { MAP_LIMITS, validateMap } from '@/engine/map';

let n = 0;
const seqId = () => `t-${++n}`;

describe('Karten-Generator (NTH2 3.4)', () => {
  it('100 Seeds ergeben gültige, zusammenhängende Karten innerhalb der Grenzen', () => {
    for (let i = 0; i < 100; i++) {
      const planets = 8 + (i % 13);
      const opts = { seed: `seed-${i}`, planets, density: (i % 11) / 10, theatreMix: (i % 7) / 6, slotMin: 1 + (i % 3), slotMax: 3 + (i % 4) };
      const m = generateMap(opts, seqId);
      expect(validateMap(m), `Seed ${i}`).toEqual([]);
      expect(m.planets).toHaveLength(planets);
      const o = normalizeGenOptions(opts);
      for (const p of m.planets) {
        expect(p.slots).toBeGreaterThanOrEqual(o.slotMin);
        expect(p.slots).toBeLessThanOrEqual(o.slotMax);
        expect(p.theatres.length).toBeGreaterThanOrEqual(MAP_LIMITS.minTheatres);
        expect(p.theatres.length).toBeLessThanOrEqual(MAP_LIMITS.maxTheatres);
      }
    }
  });

  it('ist deterministisch: gleicher Seed, gleiche Karte (bis auf die IDs)', () => {
    const strip = (m: ReturnType<typeof generateMap>) => {
      const idx = new Map(m.planets.map((p, i) => [p.id, i]));
      return { planets: m.planets.map((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== 'id'))), connections: m.connections.map(([a, b]) => [idx.get(a), idx.get(b)]) };
    };
    const a = generateMap({ ...DEFAULT_MAP_GEN, seed: 'ABC123' }, seqId);
    const b = generateMap({ ...DEFAULT_MAP_GEN, seed: 'ABC123' });
    expect(strip(a)).toEqual(strip(b));
    const c = generateMap({ ...DEFAULT_MAP_GEN, seed: 'ABC124' });
    expect(strip(c)).not.toEqual(strip(a));
  });

  it('Dichte steuert die Zahl der Verbindungen, der Mix die Theatre-Arten', () => {
    const sparse = generateMap({ ...DEFAULT_MAP_GEN, planets: 16, density: 0, seed: 'd' });
    const dense = generateMap({ ...DEFAULT_MAP_GEN, planets: 16, density: 1, seed: 'd' });
    expect(sparse.connections).toHaveLength(15);
    expect(dense.connections.length).toBeGreaterThan(sparse.connections.length);
    const kinds = (m: ReturnType<typeof generateMap>) => new Set(m.planets.flatMap((p) => p.theatres)).size;
    expect(kinds(generateMap({ ...DEFAULT_MAP_GEN, planets: 20, theatreMix: 0, seed: 'm' }))).toBeLessThanOrEqual(3);
    expect(kinds(generateMap({ ...DEFAULT_MAP_GEN, planets: 20, theatreMix: 1, seed: 'm' }))).toBeGreaterThan(5);
  });

  it('klemmt Regler auf die Grenzen', () => {
    const o = normalizeGenOptions({ seed: '', planets: 99, density: 5, theatreMix: -1, slotMin: 9, slotMax: 0 });
    expect(o).toMatchObject({ seed: '1', planets: 20, density: 1, theatreMix: 0, slotMin: 1, slotMax: 6 });
  });
});

describe('Ein-Bildschirm-Routen des Blocks P3', () => {
  it('Liga, Betrieb, Ruhmeshalle der Saison und Druckbogen ohne globalen Seitenfuß', async () => {
    const { isShellRoute, isAppRoute } = await import('@/components/appRoutes');
    for (const p of ['/admin/liga', '/admin/betrieb', '/liga/abcdefghijklmnopqrstuvwx', '/admin/c/abc123/crusade/pl_1']) expect(isShellRoute(p), p).toBe(true);
    expect(isAppRoute('/p/abcdefghijklmnopqrstuvwxyz0123/crusade')).toBe(true);
  });
});
