import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCampaignState } from '@/engine/init';
import { migrateState } from '@/engine/migrate';
import { toPublicView } from '@/engine/publicView';
import { ATTACK_TYPES } from '@/engine/data/vespator';
import { PHASE_STEPS, SETUP_STEPS, type CampaignState } from '@/engine/types';
import { DEFAULT_MODULE_ID, getModule, hasModule, listModules, moduleOf, registerModule, unregisterModule } from '@/engine/modules/registry';
import { vespatorModule } from '@/engine/modules/vespator';
import { translateMessage } from '@/i18n/core';
import { validateState } from '@/engine/schema';
import { run, startedCampaign, tryRun } from './helpers';
import { demoModule, demoState, DEMO_MAP } from './demoModule';

beforeAll(() => registerModule(demoModule));
afterAll(() => unregisterModule(demoModule.id));

describe('Regelmodul-Registry (NTH2 3.3)', () => {
  it('Vespator ist fest angemeldet und Standard', () => {
    expect(DEFAULT_MODULE_ID).toBe('vespator');
    expect(getModule()).toBe(vespatorModule);
    expect(listModules()[0]).toBe(vespatorModule);
    expect(hasModule('demo')).toBe(true);
  });

  it('unbekannte Module und doppelte IDs werden abgewiesen', () => {
    expect(() => getModule('gibt-es-nicht')).toThrow('Unbekanntes Regelmodul');
    expect(() => registerModule({ ...demoModule })).toThrow('bereits angemeldet');
    // dasselbe Objekt erneut anmelden ist unschädlich
    expect(() => registerModule(demoModule)).not.toThrow();
    // das Standardmodul lässt sich nicht abmelden
    unregisterModule('vespator');
    expect(hasModule('vespator')).toBe(true);
  });

  it('moduleOf: Zustände ohne Angabe laufen mit Vespator', () => {
    const s = createCampaignState({ name: 'X', phaseCount: 3, allianceCount: 2 });
    expect(s.meta.module).toBe('vespator');
    delete s.meta.module;
    expect(moduleOf(s)).toBe(vespatorModule);
  });

  it('Vespator-Modul bündelt die bestehenden Stammdaten und Abläufe', () => {
    expect(vespatorModule.data.attackTypes).toBe(ATTACK_TYPES);
    expect(vespatorModule.setupSteps.map((x) => x.id)).toEqual(SETUP_STEPS);
    expect(vespatorModule.phaseSteps.map((x) => x.id)).toEqual(PHASE_STEPS);
    expect(vespatorModule.phaseSteps[0].label).toContain('Operationen');
    expect(vespatorModule.houseRules.length).toBeGreaterThan(0);
    expect(vespatorModule.defaultMap().template).toBe('vespator');
  });
});

describe('migrateState: meta.module', () => {
  it('ältere Stände bekommen „vespator“', () => {
    const s = createCampaignState({ name: 'Alt', phaseCount: 3, allianceCount: 2 }) as CampaignState & { stellarStormsUsed?: boolean };
    delete s.meta.module;
    delete (s as { stellarStormsUsed?: boolean }).stellarStormsUsed;
    const m = migrateState(structuredClone(s));
    expect(m.meta.module).toBe('vespator');
    // modul-eigene Migration von Vespator läuft weiterhin
    expect(m.stellarStormsUsed).toBe(false);
  });

  it('vorhandene Modulangabe bleibt, unbekannte Module werden abgewiesen', () => {
    const d = createCampaignState({ name: 'Demo', phaseCount: 1, allianceCount: 2, module: 'demo' });
    const raw = structuredClone(d) as Partial<CampaignState>;
    delete raw.map;
    const m = migrateState(raw);
    expect(m.meta.module).toBe('demo');
    // fehlende Karte kommt vom Modul
    expect(m.map.name).toBe(DEMO_MAP.name);
    const bad = structuredClone(d);
    bad.meta.module = 'unbekannt';
    expect(() => migrateState(bad)).toThrow('Unbekanntes Regelmodul');
  });
});

describe('Import-Prüfung: meta.module', () => {
  it('bekannte Module sind gültig, unbekannte nicht', () => {
    expect(validateState(createCampaignState({ name: 'V', phaseCount: 3, allianceCount: 2 }))).toBeNull();
    const d = createCampaignState({ name: 'D', phaseCount: 1, allianceCount: 2, module: 'demo' });
    expect(validateState(d)).toBeNull();
    d.meta.module = 'unbekannt';
    expect(validateState(d)).toBe('meta.module: Unbekanntes Regelmodul „unbekannt“');
  });
});

describe('Vespator hinter der Schnittstelle', () => {
  it('eigene Modul-Aktionen gibt es bei Vespator nicht', () => {
    const s = startedCampaign();
    const r = tryRun(s, { type: 'MODULE_ACTION', action: 'RESULT' });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'error') expect(r.error).toBe('Das Regelmodul Vespator Front hat keine eigenen Aktionen');
  });

  it('unbekannte Angriffsart wird abgewiesen statt abzustürzen', () => {
    const s = startedCampaign();
    const f = s.fleets[0];
    const r = tryRun(s, { type: 'OP_SET', fleetId: f.id, slot: 1, op: { type: 'BATTLE', attackType: 'RAID', targetPlanetId: f.planetId!, targetAllianceId: s.alliances[1].id } });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'error') expect(r.error).toBe('Unbekannte Angriffsart');
  });
});

describe('Demo-Modul läuft durch den generischen Kern', () => {
  function demoCampaign() {
    let s = createCampaignState({ name: 'Demo', phaseCount: 1, allianceCount: 2, module: 'demo', now: '2026-01-01T00:00:00Z' });
    s = run(s, { type: 'ALLIANCE_UPSERT', name: 'Rot', color: '#ff0000' });
    s = run(s, { type: 'ALLIANCE_UPSERT', name: 'Blau', color: '#0000ff' });
    const [a, b] = s.alliances.map((x) => x.id);
    s = run(s, { type: 'PLAYER_UPSERT', data: { nickname: 'P1' }, allianceId: a });
    s = run(s, { type: 'PLAYER_UPSERT', data: { nickname: 'P2' }, allianceId: b });
    s = run(s, { type: 'FLEET_SET_COUNT', allianceId: a, count: 1 });
    s = run(s, { type: 'FLEET_SET_COUNT', allianceId: b, count: 1 });
    return s;
  }

  it('neue Kampagne übernimmt Karte, Regel-Schalter und Startschritt des Moduls', () => {
    const s = demoCampaign();
    expect(s.meta.module).toBe('demo');
    expect(s.map.planets.map((p) => p.id)).toEqual(DEMO_MAP.planets.map((p) => p.id));
    expect(s.planets).toHaveLength(6);
    expect(s.toggles.events.fortunesOfWar).toBe(false);
    expect(s.stage).toEqual({ kind: 'SETUP', step: 'W0' });
    expect(demoState(s)).toEqual({ attacks: [], points: {} });
  });

  it('Setup → eine Phase → Ende', () => {
    let s = demoCampaign();
    const [a, b] = s.alliances.map((x) => x.id);
    s = run(s, { type: 'SETUP_START', startDate: '2026-01-02' });
    expect(s.stage).toEqual({ kind: 'PHASE', phase: 1, step: 'OPS' });
    const [fa, fb] = s.fleets;
    expect(fa.planetId).toBe('demo-nord');
    expect(fb.planetId).toBe('demo-mitte');

    // Operationen über OP_SET mit den Angriffsarten des Moduls
    s = run(s, { type: 'OP_SET', fleetId: fa.id, slot: 1, op: { type: 'BATTLE', attackType: 'SIEGE', targetPlanetId: 'demo-mitte', targetAllianceId: b } });
    s = run(s, { type: 'OP_SET', fleetId: fb.id, slot: 1, op: { type: 'BATTLE', attackType: 'RAID', targetPlanetId: 'demo-nord', targetAllianceId: a } });
    expect(demoState(s).attacks).toHaveLength(2);
    // öffentliche Sicht: Befehle der laufenden Phase verdeckt
    expect(demoState(toPublicView(s)).attacks).toHaveLength(0);

    s = run(s, { type: 'ADVANCE' });
    expect(s.stage).toEqual({ kind: 'PHASE', phase: 1, step: 'BATTLES' });
    // ohne Ergebnis geht es nicht weiter
    expect(tryRun(s, { type: 'ADVANCE' }).ok).toBe(false);
    const [siege, raid] = demoState(s).attacks;
    s = run(s, { type: 'MODULE_ACTION', action: 'RESULT', data: { attackId: siege.id, winner: 'ATTACKER' } });
    s = run(s, { type: 'MODULE_ACTION', action: 'RESULT', data: { attackId: raid.id, winner: 'DEFENDER' } });
    s = run(s, { type: 'ADVANCE' });
    expect(s.stage).toEqual({ kind: 'PHASE', phase: 1, step: 'RESULTS' });
    // Belagerung gewonnen: Rot +2; Überfall abgewehrt: Rot +1 als Verteidiger
    expect(demoState(s).points).toEqual({ [a]: 3, [b]: 0 });

    s = run(s, { type: 'SCORE' });
    expect(s.pointsHistory.at(-1)).toEqual({ phaseNumber: 1, points: { [a]: 3, [b]: 0 }, powerSum: {} });
    s = run(s, { type: 'CAMPAIGN_END' });
    expect(s.stage).toEqual({ kind: 'ENDED' });
    expect(s.result).toEqual({ winnerAllianceId: a, tiebreak: 'NONE', tied: [] });
  });

  it('Regeln des Moduls greifen, Vespator-Commands werden abgewiesen', () => {
    let s = demoCampaign();
    const w0 = tryRun(s, { type: 'SETUP_W0_DONE' });
    expect(w0.ok).toBe(false);
    if (!w0.ok && w0.kind === 'error') expect(w0.error).toBe('Diese Aktion gibt es im Regelmodul Demo-Modul nicht');
    s = run(s, { type: 'SETUP_START' });
    const [fa] = s.fleets;
    const b = s.alliances[1].id;
    const bad = tryRun(s, { type: 'OP_SET', fleetId: fa.id, slot: 1, op: { type: 'BATTLE', attackType: 'SEIZE_POWER_BASE', targetPlanetId: 'demo-mitte', targetAllianceId: b } });
    expect(bad.ok).toBe(false);
    if (!bad.ok && bad.kind === 'error') expect(bad.error).toBe('Unbekannte Angriffsart');
    const ev = tryRun(s, { type: 'EVENTS_GENERATE' });
    expect(ev.ok).toBe(false);
    if (!ev.ok && ev.kind === 'error') expect(ev.error).toBe('Das Regelmodul Demo-Modul kennt keine Ereignisse');
    expect(tryRun(s, { type: 'BATTLE_PROCESS_ALL' }).ok).toBe(false);
  });
});

describe('Übersetzung der Modul-Meldungen', () => {
  it('Engine-Meldungen der Schnittstelle haben englische Muster', () => {
    expect(translateMessage('en', 'Diese Aktion gibt es im Regelmodul Demo-Modul nicht')).toBe('This action does not exist in the rules module Demo-Modul');
    expect(translateMessage('en', 'Das Regelmodul Demo-Modul kennt keine Ereignisse')).toBe('The rules module Demo-Modul has no events');
    expect(translateMessage('en', 'Unbekannte Angriffsart')).toBe('Unknown attack type');
  });
});
