import { describe, expect, it } from 'vitest';
import { toPublicView } from '@/engine/publicView';
import { createCampaignState } from '@/engine/init';
import type { CampaignState, PhaseStep } from '@/engine/types';
import { PL, ids, run, slotsOf, startedCampaign, tryRun } from './helpers';

function toStep(s: CampaignState, step: PhaseStep): CampaignState {
  for (let i = 0; i < 20 && !(s.stage.kind === 'PHASE' && s.stage.step === step); i++) s = run(s, { type: 'ADVANCE' });
  return s;
}

/** Angriff Flotte A → C (oder B) auf Planet, Ergebnis eingetragen, Schritt PROCESS */
function fight(attackType: Parameters<typeof mk>[0], vp: [number, number], planet: string, target: 'b' | 'c' = 'c', prep?: (s: CampaignState) => CampaignState) {
  return mk(attackType, vp, planet, target, prep);
}
function mk(
  attackType: 'PURGE_AND_BURN' | 'ORBITAL_INVASION' | 'SEIZE_POWER_BASE' | 'PLANETARY_BOMBARDMENT' | 'SUPPLY_BASE_RAID' | 'BOARDING_ACTION',
  vp: [number, number],
  planet: string,
  target: 'b' | 'c',
  prep?: (s: CampaignState) => CampaignState,
) {
  let s = startedCampaign();
  if (prep) s = prep(s);
  const i = ids(s);
  s = run(s, { type: 'OP_SET', fleetId: i.fa, slot: 1, op: { type: 'BATTLE', attackType, targetPlanetId: planet, targetAllianceId: i[target] } });
  s = toStep(s, 'REVEAL');
  s = run(s, { type: 'REVEAL_OPS' });
  s = toStep(s, 'BATTLES');
  const b = s.battles[0];
  s = run(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { playedAt: '2026-01-05T18:00:00Z', vp: { attacker: vp[0], defender: vp[1] } } });
  return { s: toStep(s, 'PROCESS'), battleId: b.id, opId: b.operationIds[0], ...i };
}

describe('Outcomes – Verteidiger-Siege', () => {
  it('Purge and Burn D: Umverteilung auf verbundene Planeten', () => {
    const { s, battleId, opId, c } = fight('PURGE_AND_BURN', [20, 60], 'caltus-novem');
    // C: Caltus 4, Marvinius 3 (FL), Vikus 3
    let s2 = run(s, { type: 'BATTLE_DECISION', battleId, opId, decision: { type: 'PURGE_D', redistributions: ['kryndaer', 'kryndaer'], bonusPlanetId: 'marvinius', shift: 0 } });
    s2 = run(s2, { type: 'BATTLE_PROCESS', battleId });
    expect(PL(s2, c, 'caltus-novem')).toBe(2);
    expect(PL(s2, c, 'kryndaer')).toBe(4);
    expect(PL(s2, c, 'marvinius')).toBe(4);
  });
  it('Purge and Burn D: nicht verbundener Planet ist ungültig', () => {
    const { s, battleId, opId } = fight('PURGE_AND_BURN', [20, 60], 'caltus-novem');
    const s2 = run(s, { type: 'BATTLE_DECISION', battleId, opId, decision: { type: 'PURGE_D', redistributions: ['jawardet'], bonusPlanetId: null, shift: 0 } });
    expect(tryRun(s2, { type: 'BATTLE_PROCESS', battleId }).ok).toBe(false);
  });
  it('Seize Power Base D: Staging Grounds nur bei PL ≥ 3', () => {
    const { s, battleId, opId, c } = fight('SEIZE_POWER_BASE', [20, 60], 'caltus-novem');
    let s2 = run(s, { type: 'BATTLE_DECISION', battleId, opId, decision: { type: 'SEIZE_D', build: { type: 'STAGING_GROUNDS', planetId: 'caltus-novem' }, shift: 0 } });
    s2 = run(s2, { type: 'BATTLE_PROCESS', battleId });
    expect(slotsOf(s2, 'caltus-novem').some((x) => x.infra?.type === 'STAGING_GROUNDS' && x.infra.allianceId === c)).toBe(true);
    expect(PL(s2, c, 'caltus-novem')).toBe(4);
  });
  it('Orbital Invasion D: Infrastruktur verlegen', () => {
    const { s, battleId, opId, c } = fight('ORBITAL_INVASION', [20, 60], 'caltus-novem');
    const sh = slotsOf(s, 'caltus-novem').findIndex((x) => x.infra?.type === 'STRONGHOLD');
    let s2 = run(s, { type: 'BATTLE_DECISION', battleId, opId, decision: { type: 'ORBITAL_D', otherPlanetId: 'marvinius', direction: 'OUT', slots: [sh], shift: 0 } });
    s2 = run(s2, { type: 'BATTLE_PROCESS', battleId });
    expect(slotsOf(s2, 'marvinius').some((x) => x.infra?.type === 'STRONGHOLD' && x.infra.allianceId === c)).toBe(true);
    expect(s2.alliances.find((a) => a.id === c)!.strongholdDestroyed).toBe(false);
  });
  it('Planetary Bombardment D: Gegenschlag 6 zerstört Location', () => {
    const { s, battleId, opId } = fight('PLANETARY_BOMBARDMENT', [20, 60], 'caltus-novem');
    // Kryndaer ist verbunden; A hat dort SG in Slot 0
    let s2 = run(s, { type: 'BATTLE_DECISION', battleId, opId, decision: { type: 'BOMBARD_D', planetId: 'kryndaer', strikes: [{ slot: 0, roll: null }, { slot: 1, roll: null }], shift: 0 } });
    s2 = run(s2, { type: 'BATTLE_PROCESS', battleId }, [6, 5]);
    expect(slotsOf(s2, 'kryndaer')[0].destroyed).toBe(true);
  });
  it('Supply Base Raid D: Angreifer −1', () => {
    const { s, battleId, opId, a } = fight('SUPPLY_BASE_RAID', [20, 60], 'caltus-novem');
    let s2 = run(s, { type: 'BATTLE_DECISION', battleId, opId, decision: { type: 'RAID_D', reducePlanetId: null, shift: 0 } });
    s2 = run(s2, { type: 'BATTLE_PROCESS', battleId });
    expect(PL(s2, a, 'caltus-novem')).toBe(1);
  });
  it('Boarding Action A: Verteidiger-Flotte wird vertrieben', () => {
    const { s, battleId, opId, fc } = fight('BOARDING_ACTION', [60, 20], 'caltus-novem');
    let s2 = run(s, { type: 'BATTLE_DECISION', battleId, opId, decision: { type: 'BOARDING_A', targetFleetId: fc, path: ['marvinius', 'vikus-decima'], shift: 0 } });
    s2 = run(s2, { type: 'BATTLE_PROCESS', battleId });
    expect(s2.fleets.find((f) => f.id === fc)!.planetId).toBe('vikus-decima');
  });
  it('Boarding Action D: Angreifer darf nicht ziehen', () => {
    const { s, battleId, opId, fa } = fight('BOARDING_ACTION', [20, 60], 'caltus-novem');
    let s2 = run(s, { type: 'BATTLE_DECISION', battleId, opId, decision: { type: 'BOARDING_D', ownFleetId: null, toPlanetId: null, shift: 0 } });
    s2 = run(s2, { type: 'BATTLE_PROCESS', battleId });
    s2 = toStep(s2, 'RESULTS');
    s2 = run(s2, { type: 'SCORE' });
    s2 = run(s2, { type: 'EVENTS_GENERATE' }, [1]);
    s2 = toStep(s2, 'MOVE');
    expect(tryRun(s2, { type: 'MOVE_SET', fleetId: fa, path: ['norallus'] }).ok).toBe(false);
  });
  it('Seize Power Base A: Übernahme', () => {
    const { s, battleId, opId, a } = fight('SEIZE_POWER_BASE', [60, 20], 'novamagnor', 'c', (st) => {
      // Flotte A nach Tarkad (verbunden mit Novamagnor)
      return run(st, { type: 'OVERRIDE_FLEET', fleetId: st.fleets[0].id, planetId: 'tarkad-vindix' }, [], { reason: 'x' });
    });
    const sg = slotsOf(s, 'novamagnor').findIndex((x) => x.infra?.type === 'STAGING_GROUNDS');
    let s2 = run(s, { type: 'BATTLE_DECISION', battleId, opId, decision: { type: 'SEIZE_A', captureSlot: sg, fallbackType: null, bonusType: null, shift: 0 } });
    s2 = run(s2, { type: 'BATTLE_PROCESS', battleId });
    expect(slotsOf(s2, 'novamagnor')[sg].infra).toEqual({ type: 'STAGING_GROUNDS', allianceId: a });
  });
});

describe('Bündeln & Verschieben', () => {
  it('zwei Operationen gebündelt → zwei Outcomes', () => {
    let s = startedCampaign();
    const { a, c, fa } = ids(s);
    s = run(s, { type: 'FLEET_SET_COUNT', allianceId: a, count: 2 }, [], { force: true });
    const fa2 = s.fleets.find((f) => f.allianceId === a && f.id !== fa)!.id;
    s = run(s, { type: 'OVERRIDE_FLEET', fleetId: fa2, planetId: 'marvinius' }, [], { reason: 'x' });
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
    s = run(s, { type: 'OP_SET', fleetId: fa2, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
    s = toStep(s, 'REVEAL');
    s = run(s, { type: 'REVEAL_OPS' });
    s = toStep(s, 'BATTLES');
    s = run(s, { type: 'BATTLE_BUNDLE', battleIds: s.battles.map((b) => b.id) });
    expect(s.battles).toHaveLength(1);
    expect(s.battles[0].operationIds).toHaveLength(2);
    s = run(s, { type: 'BATTLE_UPDATE', battleId: s.battles[0].id, update: { playedAt: '2026-01-02T10:00:00Z', vp: { attacker: 80, defender: 30 } } });
    s = toStep(s, 'PROCESS');
    s = run(s, { type: 'BATTLE_PROCESS', battleId: s.battles[0].id });
    expect(PL(s, a, 'caltus-novem')).toBe(4);
  });
  it('verschobene Schlacht erscheint in der nächsten Phase', () => {
    let s = startedCampaign();
    const { c, fa } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
    s = toStep(s, 'REVEAL');
    s = run(s, { type: 'REVEAL_OPS' });
    s = toStep(s, 'BATTLES');
    s = run(s, { type: 'BATTLE_UNPLAYED', battleId: s.battles[0].id, resolution: 'POSTPONED' });
    s = toStep(s, 'RESULTS');
    s = run(s, { type: 'SCORE' });
    s = run(s, { type: 'EVENTS_GENERATE' }, [1]);
    s = toStep(s, 'BUILD');
    s = run(s, { type: 'ADVANCE' }, [6, 5, 4]);
    const moved = s.battles.filter((b) => b.phaseNumber === 2);
    expect(moved).toHaveLength(1);
    expect(moved[0].status).toBe('SCHEDULED');
  });
});

describe('Events mit Entscheidungen', () => {
  function atEvents(dice: number[]) {
    let s = startedCampaign();
    s = toStep(s, 'RESULTS');
    s = run(s, { type: 'SCORE' });
    s = run(s, { type: 'EVENTS_GENERATE' }, dice);
    return s;
  }
  it('Tides of War versetzt Strongholds', () => {
    let s = atEvents([4, 1, 3]);
    const { a } = ids(s);
    expect(s.events[0].code).toBe('FW_13');
    s = run(s, { type: 'EVENT_APPLY', eventId: s.events[0].id, data: { stronghold: { [a]: 'karabas' } } }, [3, 2, 1]);
    expect(slotsOf(s, 'karabas').some((x) => x.infra?.type === 'STRONGHOLD' && x.infra.allianceId === a)).toBe(true);
    expect(slotsOf(s, 'norallus').some((x) => x.infra?.type === 'STRONGHOLD')).toBe(false);
  });
  it('Xenobeast Migration: Ziel darf nicht verbunden sein', () => {
    const s = atEvents([4, 3, 1]);
    const { fa, fb, fc } = ids(s);
    expect(s.events[0].code).toBe('FW_31');
    const bad = tryRun(s, { type: 'EVENT_APPLY', eventId: s.events[0].id, data: { positions: { [fa]: 'karabas', [fb]: 'masnet', [fc]: 'jawardet' } } });
    expect(bad.ok).toBe(false);
    const good = run(s, { type: 'EVENT_APPLY', eventId: s.events[0].id, data: { positions: { [fa]: 'jawardet', [fb]: 'masnet', [fc]: 'felgris-secundas' } } });
    expect(good.fleets.find((f) => f.id === fa)!.planetId).toBe('jawardet');
  });
  it('Archeotech: Kandidaten und Auswertung in der Folgephase', () => {
    let s = atEvents([4, 2, 2]);
    expect(s.events[0].code).toBe('FW_22');
    s = run(s, { type: 'EVENT_APPLY', eventId: s.events[0].id, data: {} });
    const mod = s.modifiers.find((m) => m.kind === 'ARCHEOTECH')!;
    expect(mod.planetIds).toHaveLength(3);
    expect(mod.phaseNumber).toBe(2);
  });
  it('Machinations of Fate: Mitgliedschaft ab nächster Phase', () => {
    let s = atEvents([4, 3, 2]);
    const { pa, b } = ids(s);
    expect(s.events[0].code).toBe('FW_32');
    s = run(s, { type: 'EVENT_APPLY', eventId: s.events[0].id, data: { defections: { [pa]: b } } });
    const p = s.players.find((x) => x.id === pa)!;
    expect(p.memberships.at(-1)).toEqual({ allianceId: b, fromPhase: 2, toPhase: null });
    expect(p.memberships[0].toPhase).toBe(1);
  });
});

describe('Öffentliche Projektion', () => {
  it('verbirgt Operationen vor dem Reveal und Kontaktdaten', () => {
    let s = startedCampaign();
    const { fa, c, pa } = ids(s);
    s = run(s, { type: 'PLAYER_UPSERT', id: pa, data: { email: 'geheim@example.org', discord: 'x#1' } });
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
    const pub = toPublicView(s);
    expect(JSON.stringify(pub)).not.toContain('geheim@example.org');
    expect(JSON.stringify(pub.phases)).not.toContain('PURGE_AND_BURN');
    expect(pub.phases[0].operations[0].hidden).toBe(true);
  });
  it('verbirgt Setup-Wahlen bis zum Reveal', () => {
    let s = createCampaignState({ name: 'X', phaseCount: 3, allianceCount: 2 });
    s = run(s, { type: 'ALLIANCE_UPSERT', name: 'R', color: '#f00' });
    s = run(s, { type: 'ALLIANCE_UPSERT', name: 'B', color: '#00f' });
    for (const a of s.alliances) s = run(s, { type: 'FLEET_SET_COUNT', allianceId: a.id, count: 1 });
    s = run(s, { type: 'SETUP_W0_DONE' });
    s = run(s, { type: 'SETUP_STRONGHOLDS', allianceId: s.alliances[0].id, strongholdPlanetId: 'karabas', pl3: [], pl2: [] });
    expect(JSON.stringify(toPublicView(s).setup)).not.toContain('karabas');
  });
});

describe('Medaillen-Übertrag', () => {
  it('Laurel sperrt Planeten für andere Allianzen im Setup', () => {
    let s = createCampaignState({ name: 'X', phaseCount: 3, allianceCount: 2 });
    s = run(s, { type: 'ALLIANCE_UPSERT', name: 'R', color: '#f00' });
    s = run(s, { type: 'ALLIANCE_UPSERT', name: 'B', color: '#00f' });
    s = run(s, { type: 'PLAYER_UPSERT', data: { nickname: 'P' }, allianceId: s.alliances[0].id });
    const pid = s.players[0].id;
    s.inheritedMedals = [{ medal: 'LAUREL', fromCampaignId: 'old', holderPlayerIds: [pid], assignedAllianceId: undefined }];
    for (const a of s.alliances) s = run(s, { type: 'FLEET_SET_COUNT', allianceId: a.id, count: 1 });
    s = run(s, { type: 'SETUP_W0_DONE' });
    expect(s.stage).toEqual({ kind: 'SETUP', step: 'W1' });
    s = run(s, { type: 'SETUP_MEDAL_SUGGEST' });
    expect(s.inheritedMedals[0].assignedAllianceId).toBe(s.alliances[0].id);
    s = run(s, { type: 'SETUP_W1_DONE' });
    s = run(s, { type: 'SETUP_LAUREL_PLANET', planetId: 'karabas' });
    const [a, b] = s.alliances.map((x) => x.id);
    expect(tryRun(s, { type: 'SETUP_STRONGHOLDS', allianceId: b, strongholdPlanetId: 'masnet', pl3: ['karabas'], pl2: [] }).ok).toBe(false);
    s = run(s, { type: 'SETUP_STRONGHOLDS', allianceId: a, strongholdPlanetId: 'karabas', pl3: ['norallus', 'kryndaer', 'masnet'], pl2: ['caltus-novem', 'marvinius', 'vikus-decima', 'felgris-secundas'] });
    s = run(s, { type: 'SETUP_STRONGHOLDS', allianceId: b, strongholdPlanetId: 'jawardet', pl3: ['tarkad-vindix', 'astarthem', 'ikaron-prime'], pl2: ['novamagnor', 'felgris-secundas', 'masnet', 'vikus-decima'] });
    s = run(s, { type: 'SETUP_REVEAL_STRONGHOLDS' });
    // Stronghold + zusätzliche Fortification Line
    expect(slotsOf(s, 'karabas').filter((x) => x.infra?.allianceId === a).map((x) => x.infra!.type).sort()).toEqual(['FORTIFICATION_LINE', 'STRONGHOLD']);
  });
});
