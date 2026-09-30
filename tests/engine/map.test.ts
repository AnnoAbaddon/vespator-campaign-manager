import { describe, expect, it } from 'vitest';
import { createCampaignState } from '@/engine/init';
import { distance, mapOf, planetName, validateMap, VESPATOR_MAP, type MapDef } from '@/engine/map';
import { connectedFor } from '@/engine/graph';
import { migrateState } from '@/engine/migrate';
import { validateState } from '@/engine/schema';
import type { CampaignState } from '@/engine/types';
import { run, tryRun } from './helpers';

/** Ring aus 9 Planeten mit einer Sehne 0–4 */
function ringMap(n = 9): MapDef {
  const planets = Array.from({ length: n }, (_, i) => ({
    id: `ring-${i}`,
    name: `Welt ${i}`,
    system: 'Testsystem',
    slots: 2 + (i % 3),
    theatres: ['DEAD_LANDS' as const, 'SPACEPORT' as const],
    x: 50 + 40 * Math.cos((i / n) * Math.PI * 2),
    y: 50 + 40 * Math.sin((i / n) * Math.PI * 2),
  }));
  const connections: [string, string][] = planets.map((p, i) => [p.id, planets[(i + 1) % n].id]);
  connections.push(['ring-0', 'ring-4']);
  return { name: 'Ring', template: null, background: null, planets, connections };
}

function w0(map?: MapDef): CampaignState {
  return createCampaignState({ name: 'Test', phaseCount: 3, allianceCount: 2, now: '2026-01-01T00:00:00Z', map });
}

describe('Karteneditor (N5.5)', () => {
  it('Validierung: zusammenhängend, Mindestgröße, eindeutige Namen, Grenzen', () => {
    expect(validateMap(VESPATOR_MAP)).toEqual([]);
    expect(validateMap(ringMap())).toEqual([]);
    const small = ringMap(5);
    expect(validateMap(small).join(' ')).toMatch(/Mindestens 6 Planeten/);
    const split = ringMap();
    split.connections = split.connections.filter(([a, b]) => ![a, b].includes('ring-8') || [a, b].includes('ring-9'));
    expect(validateMap(split).join(' ')).toMatch(/Nicht alle Planeten sind verbunden: Welt 8/);
    const dup = ringMap();
    dup.planets[1].name = 'welt 0';
    expect(validateMap(dup).join(' ')).toMatch(/mehrfach/);
    const bad = ringMap();
    bad.planets[2].slots = 7;
    bad.planets[3].theatres = [];
    expect(validateMap(bad).length).toBe(2);
  });

  it('neue Kampagne nutzt die Vespator-Karte, Migration ergänzt sie für alte Stände', () => {
    const s = w0();
    expect(s.map.template).toBe('vespator');
    expect(s.planets).toHaveLength(13);
    const old = structuredClone(s) as Partial<CampaignState>;
    delete old.map;
    old.schemaVersion = 1;
    const m = migrateState(old);
    expect(m.map.planets).toHaveLength(13);
    expect(m.schemaVersion).toBe(2);
    expect(validateState(m)).toBeNull();
  });

  it('eigene Karte: Planetenzustand, Namen und Graph folgen der Karte', () => {
    let s = w0();
    s = run(s, { type: 'MAP_SET', map: ringMap() });
    expect(s.map.template).toBeNull();
    expect(s.planets.map((p) => p.id)).toEqual(ringMap().planets.map((p) => p.id));
    expect(s.planets[2].slots).toHaveLength(4);
    expect(planetName('ring-3')).toBe('Welt 3');
    expect(distance('ring-0', 'ring-4')).toBe(1);
    expect(distance('ring-0', 'ring-6')).toBe(3);
    expect(connectedFor(s, 'x', 'ring-1', 'ring-2', null)).toBe(true);
    expect(connectedFor(s, 'x', 'ring-1', 'ring-3', null)).toBe(false);
    expect(validateState(s)).toBeNull();
  });

  it('veränderte Vespator-Karte bekommt eigene IDs, unveränderte behält sie', () => {
    let s = w0();
    s = run(s, { type: 'PLANET_TEXT', planetId: 'norallus', lore: 'Alte Legende' });
    s = run(s, { type: 'MAP_SET', map: structuredClone(VESPATOR_MAP) });
    expect(s.map.template).toBe('vespator');
    expect(s.planets[0].id).toBe('norallus');
    const moved = structuredClone(VESPATOR_MAP);
    moved.planets[0].x = 30;
    s = run(s, { type: 'MAP_SET', map: moved });
    expect(s.map.template).toBeNull();
    const nor = s.map.planets.find((p) => p.name === 'Norallus')!;
    expect(nor.id).toMatch(/^norallus\./);
    expect(s.planets.find((p) => p.id === nor.id)!.lore).toBe('Alte Legende');
    // Das Original bleibt unverändert nachschlagbar
    expect(mapOf({ map: VESPATOR_MAP }).planets[0].x).toBe(18.5);
    expect(s.map.connections.every(([a, b]) => s.map.planets.some((p) => p.id === a) && s.map.planets.some((p) => p.id === b))).toBe(true);
  });

  it('Karte ist nach W0 gesperrt und ungültige Karten werden abgelehnt', () => {
    let s = w0();
    const r = tryRun(s, { type: 'MAP_SET', map: ringMap(4) });
    expect(r.ok).toBe(false);
    s = run(s, { type: 'ALLIANCE_UPSERT', name: 'Rot', color: '#ff0000' });
    s = run(s, { type: 'ALLIANCE_UPSERT', name: 'Blau', color: '#0000ff' });
    for (const a of s.alliances) s = run(s, { type: 'FLEET_SET_COUNT', allianceId: a.id, count: 1 });
    s = run(s, { type: 'SETUP_W0_DONE' });
    const late = tryRun(s, { type: 'MAP_SET', map: ringMap() });
    expect(late.ok).toBe(false);
  });

  it('kleine Karte warnt wegen der Setup-Zahlen', () => {
    const s = w0();
    const r = tryRun(s, { type: 'MAP_SET', map: ringMap(7) });
    // tryRun erzwingt Warnungen (force) – die Warnung steht trotzdem im Ergebnis
    expect(r.ok && r.warnings.join(' ')).toMatch(/Unter 9 Planeten/);
  });

  it('komplette Kampagne auf eigener Karte bis zum Start', () => {
    let s = w0();
    s = run(s, { type: 'MAP_SET', map: ringMap() });
    s = run(s, { type: 'ALLIANCE_UPSERT', name: 'Rot', color: '#ff0000' });
    s = run(s, { type: 'ALLIANCE_UPSERT', name: 'Blau', color: '#0000ff' });
    const [a, b] = s.alliances.map((x) => x.id);
    for (const id of [a, b]) s = run(s, { type: 'FLEET_SET_COUNT', allianceId: id, count: 1 });
    s = run(s, { type: 'SETUP_W0_DONE' });
    const r = (i: number) => `ring-${i}`;
    s = run(s, { type: 'SETUP_STRONGHOLDS', allianceId: a, strongholdPlanetId: r(0), pl3: [r(1), r(2), r(3)], pl2: [r(4), r(5), r(6), r(7)] });
    s = run(s, { type: 'SETUP_STRONGHOLDS', allianceId: b, strongholdPlanetId: r(5), pl3: [r(6), r(7), r(8)], pl2: [r(0), r(1), r(2), r(3)] });
    s = run(s, { type: 'SETUP_REVEAL_STRONGHOLDS' });
    s = run(s, { type: 'SETUP_W2_DONE' });
    s = run(s, { type: 'SETUP_INFRA', allianceId: a, items: [{ type: 'FORTIFICATION_LINE', planetId: r(1) }, { type: 'SUPPORT_FACILITY', planetId: r(2) }, { type: 'STAGING_GROUNDS', planetId: r(3) }, { type: 'STAGING_GROUNDS', planetId: r(4) }] });
    s = run(s, { type: 'SETUP_INFRA', allianceId: b, items: [{ type: 'FORTIFICATION_LINE', planetId: r(6) }, { type: 'SUPPORT_FACILITY', planetId: r(7) }, { type: 'STAGING_GROUNDS', planetId: r(8) }, { type: 'STAGING_GROUNDS', planetId: r(3) }] });
    s = run(s, { type: 'SETUP_REVEAL_INFRA' });
    s = run(s, { type: 'SETUP_W3_DONE' });
    const [fa, fb] = s.fleets.map((f) => f.id);
    s = run(s, { type: 'SETUP_FLEET_STARTS', starts: { [fa]: r(0), [fb]: r(5) } });
    s = run(s, { type: 'SETUP_REVEAL_FLEETS' });
    s = run(s, { type: 'SETUP_W4_DONE' });
    s = run(s, { type: 'SETUP_START' });
    expect(s.stage).toEqual({ kind: 'PHASE', phase: 1, step: 'OPS' });
    expect(s.planets.find((p) => p.id === r(0))!.power[a]).toBe(4);
  });
});
