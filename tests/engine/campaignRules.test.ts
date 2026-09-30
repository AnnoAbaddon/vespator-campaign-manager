import { describe, expect, it } from 'vitest';
import { battleSizes, DEFAULT_BATTLE_SIZES, sizeDef } from '@/engine/campaignRules';
import type { CampaignState, PhaseStep } from '@/engine/types';
import { PL, ids, run, startedCampaign, tryRun } from './helpers';

function toStep(s: CampaignState, step: PhaseStep): CampaignState {
  for (let i = 0; i < 20 && !(s.stage.kind === 'PHASE' && s.stage.step === step); i++) s = run(s, { type: 'ADVANCE' });
  return s;
}

const lastPhase = (s: CampaignState, rules: Partial<NonNullable<CampaignState['toggles']['lastPhase']>>) =>
  run(s, { type: 'TOGGLES_UPDATE', toggles: { ...s.toggles, lastPhase: { mandatoryBattle: false, doubleGains: false, noVoidLeap: false, ...rules } } });

describe('Letzte Phase (N2.4)', () => {
  it('kein Void Leap in der letzten Phase', () => {
    let s = startedCampaign({ phases: 1 });
    const { fa } = ids(s);
    expect(tryRun(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'VOID_LEAP', destinationPlanetId: 'jawardet' } }).ok).toBe(true);
    s = lastPhase(s, { noVoidLeap: true });
    expect(tryRun(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'VOID_LEAP', destinationPlanetId: 'jawardet' } }).ok).toBe(false);
    // Nicht die letzte Phase → erlaubt
    const s6 = lastPhase(startedCampaign({ phases: 6 }), { noVoidLeap: true });
    expect(tryRun(s6, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'VOID_LEAP', destinationPlanetId: 'jawardet' } }).ok).toBe(true);
  });

  it('Pflichtschlacht warnt beim Weiterschalten', () => {
    const s = lastPhase(startedCampaign({ phases: 1 }), { mandatoryBattle: true });
    const r = tryRun(s, { type: 'ADVANCE' });
    expect(r.ok && r.warnings.join(' ')).toMatch(/keine Battle Operation erklärt/);
  });

  it('doppelte PL-Gewinne des Siegers', () => {
    const play = (s0: CampaignState) => {
      let s = s0;
      const { fa, c, a } = ids(s);
      s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
      s = toStep(s, 'REVEAL');
      s = run(s, { type: 'REVEAL_OPS' });
      s = toStep(s, 'BATTLES');
      const b = s.battles[0];
      s = run(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { playedAt: '2026-01-05T18:00:00Z', vp: { attacker: 60, defender: 20 } } });
      s = toStep(s, 'PROCESS');
      s = run(s, { type: 'BATTLE_PROCESS', battleId: b.id });
      return { pa: PL(s, a, 'caltus-novem'), pc: PL(s, c, 'caltus-novem') };
    };
    // A: PL 2 auf Caltus; C: 4 → Purge A: Angreifer-PL kleiner, keine Reduktion; A +1 bzw. +2
    expect(play(startedCampaign({ phases: 1 }))).toEqual({ pa: 3, pc: 4 });
    expect(play(lastPhase(startedCampaign({ phases: 1 }), { doubleGains: true }))).toEqual({ pa: 4, pc: 4 });
  });
});

describe('Reserveflotten (N2.5)', () => {
  it('Reserve anlegen, zählt nicht als Flotte, erhält keine Befehle', () => {
    let s = startedCampaign();
    const { a } = ids(s);
    s = run(s, { type: 'FLEET_RESERVE_SET', allianceId: a, count: 2 });
    const res = s.fleets.filter((f) => f.reserve);
    expect(res).toHaveLength(2);
    expect(res[0].name).toMatch(/Reserve I$/);
    expect(tryRun(s, { type: 'OP_SET', fleetId: res[0].id, slot: 1, op: { type: 'LOGISTICAL_AUXILIA' } }).ok).toBe(false);
    // Default-Befehle nur für aktive Flotten
    s = toStep(s, 'REVEAL');
    expect(s.phases[0].operations.some((o) => res.some((r) => r.id === o.fleetId))).toBe(false);
    // Flottenzahl der Allianz bleibt unberührt
    s = run(s, { type: 'FLEET_SET_COUNT', allianceId: a, count: 1 });
    expect(s.fleets.filter((f) => f.allianceId === a)).toHaveLength(3);
  });

  it('Aktivieren nur bei eigener Flotte oder eigenem Stronghold', () => {
    let s = startedCampaign();
    const { a } = ids(s);
    s = run(s, { type: 'FLEET_RESERVE_SET', allianceId: a, count: 1 });
    const r = s.fleets.find((f) => f.reserve)!;
    expect(tryRun(s, { type: 'FLEET_ACTIVATE', fleetId: r.id, planetId: 'jawardet' }).ok).toBe(false);
    s = run(s, { type: 'FLEET_ACTIVATE', fleetId: r.id, planetId: 'norallus' }); // Stronghold von A
    const f = s.fleets.find((x) => x.id === r.id)!;
    expect(f.reserve).toBe(false);
    expect(f.planetId).toBe('norallus');
    expect(f.activated).toEqual({ phase: 1, planetId: 'norallus' });
    expect(tryRun(s, { type: 'OP_SET', fleetId: r.id, slot: 1, op: { type: 'LOGISTICAL_AUXILIA' } }).ok).toBe(true);
  });
});

describe('Edition und Spielgrößen (N2.6)', () => {
  it('Standardgrößen und eigene Größen', () => {
    let s = startedCampaign();
    expect(battleSizes(s)).toEqual(DEFAULT_BATTLE_SIZES);
    s = run(s, { type: 'META_UPDATE', edition: '10', battleSizes: [...DEFAULT_BATTLE_SIZES, { id: 'combat-patrol', name: 'Combat Patrol', points: 500, duration: '1 h', reserves: 250 }] });
    expect(s.meta.edition).toBe('10');
    expect(sizeDef(s, 'combat-patrol')?.name).toBe('Combat Patrol');
    expect(tryRun(s, { type: 'META_UPDATE', battleSizes: [] }).ok).toBe(false);
    expect(tryRun(s, { type: 'META_UPDATE', battleSizes: [{ id: 'x', name: '', points: 1, duration: '', reserves: 0 }] }).ok).toBe(false);
  });
});
