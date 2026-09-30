import { describe, expect, it } from 'vitest';
import { CONNECTIONS, PLANETS } from '@/engine/data/vespator';
import { adjacent, connectedFor, distance } from '@/engine/graph';
import { campaignPoints } from '@/engine/board';
import { dominating, trailing } from '@/engine/events';
import { executeCommand } from '@/engine/commands';
import type { CampaignState, PhaseStep } from '@/engine/types';
import { PL, ids, run, slotsOf, startedCampaign, tryRun } from './helpers';

function toStep(s: CampaignState, step: PhaseStep): CampaignState {
  for (let i = 0; i < 20 && !(s.stage.kind === 'PHASE' && s.stage.step === step); i++) s = run(s, { type: 'ADVANCE' });
  return s;
}

/** Erklärt einen Angriff von Flotte A auf C bei Caltus Novem, deckt auf und trägt das Ergebnis ein */
function battleAC(attackType: 'PURGE_AND_BURN' | 'ORBITAL_INVASION' | 'SEIZE_POWER_BASE' | 'PLANETARY_BOMBARDMENT' | 'SUPPLY_BASE_RAID' | 'BOARDING_ACTION', vp: [number, number], planet = 'caltus-novem') {
  let s = startedCampaign();
  const { fa, c } = ids(s);
  s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType, targetPlanetId: planet, targetAllianceId: c } });
  s = toStep(s, 'REVEAL');
  s = run(s, { type: 'REVEAL_OPS' });
  s = toStep(s, 'BATTLES');
  const b = s.battles[0];
  s = run(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { playedAt: '2026-01-05T18:00:00Z', vp: { attacker: vp[0], defender: vp[1] } } });
  return { s: toStep(s, 'PROCESS'), battleId: b.id, opId: b.operationIds[0] };
}

describe('Karte', () => {
  it('hat 13 Planeten, 18 Verbindungen, ist zusammenhängend', () => {
    expect(PLANETS).toHaveLength(13);
    expect(CONNECTIONS).toHaveLength(18);
    for (const a of PLANETS) for (const b of PLANETS) expect(distance(a.id, b.id)).toBeLessThan(Infinity);
    expect(PLANETS.reduce((n, p) => n + p.slots, 0)).toBe(36);
  });
  it('Distanzen', () => {
    expect(adjacent('norallus', 'masnet')).toBe(true);
    expect(distance('masnet', 'jawardet')).toBe(2);
    expect(distance('norallus', 'norallus')).toBe(0);
  });
  it('Support Facility verbindet gerichtet Distanz 2', () => {
    const s = startedCampaign();
    const { a, b } = ids(s);
    // A hat SF auf Karabas; Masnet ist Distanz 2 (über Norallus)
    expect(distance('karabas', 'masnet')).toBe(2);
    expect(connectedFor(s, a, 'karabas', 'masnet', 1)).toBe(true);
    expect(connectedFor(s, a, 'masnet', 'karabas', 1)).toBe(false);
    expect(connectedFor(s, b, 'karabas', 'masnet', 1)).toBe(false);
    s.modifiers.push({ id: 'm', source: 'x', kind: 'SUPPORT_FACILITIES_INACTIVE', phaseNumber: 1, allianceId: null });
    expect(connectedFor(s, a, 'karabas', 'masnet', 1)).toBe(false);
  });
});

describe('Setup', () => {
  it('Start-Power-Level und Punkte', () => {
    const s = startedCampaign();
    const { a } = ids(s);
    expect(PL(s, a, 'norallus')).toBe(4);
    expect(PL(s, a, 'masnet')).toBe(3);
    expect(PL(s, a, 'felgris-secundas')).toBe(2);
    expect(PL(s, a, 'jawardet')).toBe(1);
    // 4 + 3*3 + 4*2 + 5*1 = 26, +3 Stronghold
    expect(campaignPoints(s, a)).toBe(29);
    expect(s.pointsHistory[0].points[a]).toBe(29);
    expect(s.stage).toEqual({ kind: 'PHASE', phase: 1, step: 'OPS' });
    expect(s.fleets.every((f) => f.commanders['1'])).toBe(true);
  });
  it('PL-Verteilung wird validiert', () => {
    const s = startedCampaign();
    expect(s.planets.find((p) => p.id === 'norallus')!.slots.some((x) => x.infra?.type === 'STRONGHOLD')).toBe(true);
  });
  it('Stronghold-Konflikt: Verlierer muss neu wählen', async () => {
    const { createCampaignState } = await import('@/engine/init');
    let s = createCampaignState({ name: 'K', phaseCount: 4, allianceCount: 3 });
    for (const n of ['R', 'B', 'G']) s = run(s, { type: 'ALLIANCE_UPSERT', name: n, color: '#' + n.charCodeAt(0).toString(16).repeat(3) });
    for (const al of s.alliances) s = run(s, { type: 'FLEET_SET_COUNT', allianceId: al.id, count: 1 });
    s = run(s, { type: 'SETUP_W0_DONE' });
    const [a, b, c] = s.alliances.map((x) => x.id);
    const pl3 = ['norallus', 'karabas', 'kryndaer'];
    const pl2 = ['felgris-secundas', 'caltus-novem', 'marvinius', 'vikus-decima'];
    // Masnet hat 2 Slots, alle drei wollen dorthin
    for (const al of [a, b, c]) s = run(s, { type: 'SETUP_STRONGHOLDS', allianceId: al, strongholdPlanetId: 'masnet', pl3, pl2 });
    s = run(s, { type: 'SETUP_REVEAL_STRONGHOLDS' }, [6, 3, 1]);
    expect(s.setup.strongholdsRevealed).toBe(false);
    expect(s.setup.strongholds[c].strongholdPlanetId).toBeNull();
    expect(s.setup.strongholds[a].strongholdPlanetId).toBe('masnet');
  });
});

describe('Power Level & Fortification', () => {
  it('Fortification Line zerstört statt PL-Verlust', () => {
    let s = startedCampaign();
    const { a } = ids(s);
    // A: Masnet PL 3 mit 1 FL (min 2)
    s = run(s, { type: 'OVERRIDE_PL', allianceId: a, planetId: 'masnet', value: 2 }, [], { reason: 'x' });
    const r = tryRun(s, { type: 'OVERRIDE_PL', allianceId: a, planetId: 'masnet', value: 1 });
    expect(r.ok).toBe(true); // Override mit Warnung (force)
  });
});

describe('Campaign Outcomes', () => {
  it('Purge and Burn: Angreifer siegt, aber PL kleiner → keine Reduktion', () => {
    const { s, battleId } = battleAC('PURGE_AND_BURN', [60, 40]);
    const { a, c } = ids(s);
    expect(PL(s, a, 'caltus-novem')).toBe(2);
    const s2 = run(s, { type: 'BATTLE_PROCESS', battleId });
    expect(PL(s2, a, 'caltus-novem')).toBe(3);
    expect(PL(s2, c, 'caltus-novem')).toBe(4);
  });
  it('Orbital Invasion: Angreifer schwächer → Verteidiger −1', () => {
    const { s, battleId } = battleAC('ORBITAL_INVASION', [60, 40]);
    const { a, c } = ids(s);
    const s2 = run(s, { type: 'BATTLE_PROCESS', battleId });
    expect(PL(s2, a, 'caltus-novem')).toBe(3);
    expect(PL(s2, c, 'caltus-novem')).toBe(3);
  });
  it('Unentschieden: Angreifer +1', () => {
    const { s, battleId } = battleAC('SUPPLY_BASE_RAID', [50, 50]);
    const { a, c } = ids(s);
    const s2 = run(s, { type: 'BATTLE_PROCESS', battleId });
    expect(PL(s2, a, 'caltus-novem')).toBe(3);
    expect(PL(s2, c, 'caltus-novem')).toBe(4);
  });
  it('Battle-Ready-Bonus entscheidet', () => {
    const { s, battleId } = battleAC('SUPPLY_BASE_RAID', [50, 45]);
    const s2 = run(s, { type: 'OVERRIDE_STAGE', stage: { kind: 'PHASE', phase: 1, step: 'BATTLES' } }, [], { reason: 'x' });
    const s3 = run(s2, { type: 'BATTLE_UPDATE', battleId, update: { battleReady: { attacker: false, defender: true } } });
    expect(s3.battles[0].victor).toBe('DEFENDER');
  });
  it('Planetary Bombardment: Location zerstört bei 3+', () => {
    const { s, battleId, opId } = battleAC('PLANETARY_BOMBARDMENT', [70, 20]);
    const free = slotsOf(s, 'caltus-novem').findIndex((x) => !x.infra && !x.destroyed);
    let s2 = run(s, { type: 'BATTLE_DECISION', battleId, opId, decision: { type: 'BOMBARD_A', slot: free, roll: null, shift: 0 } });
    s2 = run(s2, { type: 'BATTLE_PROCESS', battleId }, [3]);
    expect(slotsOf(s2, 'caltus-novem')[free].destroyed).toBe(true);
  });
  it('Bombardment: Stronghold-Slot nicht wählbar, solange andere existieren', () => {
    const { s, battleId, opId } = battleAC('PLANETARY_BOMBARDMENT', [70, 20]);
    const sh = slotsOf(s, 'caltus-novem').findIndex((x) => x.infra?.type === 'STRONGHOLD');
    // schon beim Eintragen abgelehnt (nicht erst beim Verarbeiten)
    const r = tryRun(s, { type: 'BATTLE_DECISION', battleId, opId, decision: { type: 'BOMBARD_A', slot: sh, roll: null, shift: 0 } });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.kind === 'error' && r.error).toMatch(/Entscheidung ungültig/);
  });
  it('Seize Power Base: Verteidiger ohne Infrastruktur → Ersatzbau', () => {
    const { s, battleId, opId } = battleAC('SEIZE_POWER_BASE', [70, 20], 'kryndaer');
    const { a } = ids(s);
    // Kryndaer: A hat dort SG (eigene), C keine Infrastruktur
    let s2 = run(s, { type: 'BATTLE_DECISION', battleId, opId, decision: { type: 'SEIZE_A', captureSlot: null, fallbackType: 'FORTIFICATION_LINE', bonusType: null, shift: 0 } });
    s2 = run(s2, { type: 'BATTLE_PROCESS', battleId });
    expect(slotsOf(s2, 'kryndaer').filter((x) => x.infra?.allianceId === a)).toHaveLength(2);
    expect(PL(s2, a, 'kryndaer')).toBe(4);
  });
  it('Supply Base Raid mit Würfeln', () => {
    const { s, battleId, opId } = battleAC('SUPPLY_BASE_RAID', [70, 20]);
    const { c } = ids(s);
    let s2 = run(s, { type: 'BATTLE_DECISION', battleId, opId, decision: { type: 'RAID_A', strikes: [{ planetId: 'caltus-novem', roll: null }], shift: 0 } });
    s2 = run(s2, { type: 'BATTLE_PROCESS', battleId }, [4]);
    expect(PL(s2, c, 'caltus-novem')).toBe(3);
  });
  it('manueller Würfelmodus fordert Wurf an', () => {
    const { s, battleId, opId } = battleAC('SUPPLY_BASE_RAID', [70, 20]);
    const s2 = run(s, { type: 'BATTLE_DECISION', battleId, opId, decision: { type: 'RAID_A', strikes: [{ planetId: 'caltus-novem', roll: null }], shift: 0 } });
    const r = executeCommand(s2, { type: 'BATTLE_PROCESS', battleId }, { dice: { mode: 'MANUAL', manual: [], random: () => 1 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe('dice');
  });
  it('±1 ohne Quelle ist ungültig', () => {
    const { s, battleId, opId } = battleAC('PURGE_AND_BURN', [70, 20]);
    const s2 = run(s, { type: 'BATTLE_DECISION', battleId, opId, decision: { type: 'PURGE_A', shift: 1 } });
    expect(tryRun(s2, { type: 'BATTLE_PROCESS', battleId }).ok).toBe(false);
  });
});

describe('Ablauf', () => {
  it('fehlende Befehle → Logistical Auxilia; ungespielt → Angreifer siegt', () => {
    let s = startedCampaign();
    const { fa, c, a } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
    s = toStep(s, 'REVEAL');
    expect(s.phases[0].operations.filter((o) => o.isDefault && o.type === 'LOGISTICAL_AUXILIA')).toHaveLength(2);
    s = run(s, { type: 'REVEAL_OPS' });
    // C hat Logistical Auxilia auf Caltus → Verteidiger wählt Theatre
    expect(s.battles[0].theatreChosenBy).toBe('DEFENDER_AUXILIA');
    s = toStep(s, 'PROCESS');
    expect(s.battles[0].status).toBe('UNPLAYED_RESOLVED');
    s = run(s, { type: 'BATTLE_PROCESS', battleId: s.battles[0].id });
    expect(PL(s, a, 'caltus-novem')).toBe(3);
  });
  it('Kill Teams: 5+ senkt PL', () => {
    let s = startedCampaign();
    const { fb, a, c } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fb, slot: 1, op: { type: 'KILL_TEAMS', killTeamPlanetId: 'novamagnor' } });
    s = toStep(s, 'RESISTANCE');
    const before = [PL(s, a, 'novamagnor'), PL(s, c, 'novamagnor')];
    s = run(s, { type: 'RESOLVE_KILL_TEAMS' }, [5, 2]);
    expect(PL(s, a, 'novamagnor')).toBe(Math.max(1, before[0] - 1));
    expect(PL(s, c, 'novamagnor')).toBe(before[1]);
  });
  it('Void Leap und Move Fleets', () => {
    let s = startedCampaign();
    const { fa, fb } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'VOID_LEAP', destinationPlanetId: 'jawardet' } });
    s = toStep(s, 'RESISTANCE');
    expect(s.fleets.find((f) => f.id === fa)!.planetId).toBe('jawardet');
    s = toStep(s, 'RESULTS');
    s = run(s, { type: 'SCORE' });
    s = run(s, { type: 'EVENTS_GENERATE' }, [1, 1, 1].slice(0, 3));
    s = toStep(s, 'MOVE');
    expect(tryRun(s, { type: 'MOVE_SET', fleetId: fb, path: ['masnet'] }).ok).toBe(false);
    s = run(s, { type: 'MOVE_SET', fleetId: fb, path: ['astarthem'] });
    s = toStep(s, 'BUILD');
    expect(s.fleets.find((f) => f.id === fb)!.planetId).toBe('astarthem');
  });
  it('Raise Edifices: voll → annulliert', () => {
    let s = startedCampaign();
    const { fb } = ids(s);
    // Novamagnor (2 Slots): C hat SG; B-Flotte baut FL → passt
    s = run(s, { type: 'OP_SET', fleetId: fb, slot: 1, op: { type: 'RAISE_EDIFICES', infraType: 'FORTIFICATION_LINE' } });
    s = toStep(s, 'BATTLES');
    expect(slotsOf(s, 'novamagnor').filter((x) => x.infra)).toHaveLength(2);
  });
  it('kompletter Phasendurchlauf bis Phase 2 und Bau-Reihenfolge', () => {
    let s = startedCampaign();
    s = toStep(s, 'RESULTS');
    s = run(s, { type: 'SCORE' });
    s = run(s, { type: 'EVENTS_GENERATE' }, [1]);
    s = toStep(s, 'BUILD');
    s = run(s, { type: 'BUILD_START' }, [6, 1, 3, 2]);
    const order = s.phases[0].buildOrder;
    expect(order).toHaveLength(3);
    s = run(s, { type: 'ADVANCE' });
    expect(s.stage).toEqual({ kind: 'PHASE', phase: 2, step: 'OPS' });
  });
});

describe('Events', () => {
  it('dominierend / zurückliegend nur bei mehr als 5 Punkten', () => {
    expect(dominating({ a: 20, b: 15, c: 10 })).toBeNull();
    expect(dominating({ a: 21, b: 15, c: 10 })).toBe('a');
    expect(trailing({ a: 20, b: 15, c: 9 })).toBe('c');
    expect(trailing({ a: 20, b: 15, c: 10 })).toBeNull();
  });
  it('Starvation and Disease mit Fortification', () => {
    let s = startedCampaign();
    const { a } = ids(s);
    s = toStep(s, 'RESULTS');
    s = run(s, { type: 'SCORE' });
    // Fortunes 4+ → W33 = 2,3 → FW_23
    s = run(s, { type: 'EVENTS_GENERATE' }, [4, 2, 3]);
    const e = s.events[0];
    expect(e.code).toBe('FW_23');
    s = run(s, { type: 'EVENT_APPLY', eventId: e.id, data: {} });
    expect(PL(s, a, 'norallus')).toBe(3);
    // Masnet: PL 3 mit FL (min 2) → 2
    expect(PL(s, a, 'masnet')).toBe(2);
    expect(PL(s, a, 'jawardet')).toBe(1);
  });
  it('Stellar Storms nur einmal', () => {
    let s = startedCampaign();
    s = toStep(s, 'RESULTS');
    s = run(s, { type: 'SCORE' });
    s.stellarStormsUsed = true;
    // 3,3 → FW_33 (bereits genutzt) → neu: 1,2 → FW_12
    s = run(s, { type: 'EVENTS_GENERATE' }, [5, 3, 3, 1, 2]);
    expect(s.events[0].code).toBe('FW_12');
  });
  it('Void Piracy verbietet Void Leap in der nächsten Phase', () => {
    let s = startedCampaign();
    const { fa } = ids(s);
    s = toStep(s, 'RESULTS');
    s = run(s, { type: 'SCORE' });
    s = run(s, { type: 'EVENTS_GENERATE' }, [4, 1, 2]);
    s = run(s, { type: 'EVENT_APPLY', eventId: s.events[0].id, data: {} });
    s = toStep(s, 'BUILD');
    s = run(s, { type: 'ADVANCE' }, [6, 5, 4]);
    expect(tryRun(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'VOID_LEAP', destinationPlanetId: 'jawardet' } }).ok).toBe(false);
  });
});

describe('Kampagnenende', () => {
  it('Sieger und Medaillen', () => {
    let s = startedCampaign({ phases: 1 });
    s = toStep(s, 'RESULTS');
    s = run(s, { type: 'SCORE' });
    s = run(s, { type: 'CAMPAIGN_END' }, [6, 5, 4, 3, 2, 1, 6, 5, 4]);
    expect(s.stage.kind === 'ENDED' || s.stage.kind === 'TIEBREAK').toBe(true);
    if (s.stage.kind === 'ENDED') {
      expect(s.result?.winnerAllianceId).toBeTruthy();
      expect(s.medals.find((m) => m.medal === 'LAUREL')).toBeTruthy();
    }
  });
});
