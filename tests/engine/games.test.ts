import { describe, expect, it } from 'vitest';
import { aggregateGames, missionLabel } from '@/engine/missions';
import type { BattleGame, CampaignState, PhaseStep } from '@/engine/types';
import { PL, ids, run, startedCampaign, tryRun } from './helpers';

function toStep(s: CampaignState, step: PhaseStep): CampaignState {
  for (let i = 0; i < 20 && !(s.stage.kind === 'PHASE' && s.stage.step === step); i++) s = run(s, { type: 'ADVANCE' });
  return s;
}

const g = (id: string, a: number, d: number, br: [boolean, boolean] = [false, false], at = '2026-01-05T18:00:00Z'): BattleGame => ({
  id,
  attackers: [],
  defenders: [],
  playedAt: at,
  size: null,
  missionName: '',
  vp: { attacker: a, defender: d },
  battleReady: { attacker: br[0], defender: br[1] },
  report: '',
});

describe('Mehrere Einzelspiele (N2.3)', () => {
  it('Mehrheit der Siege, dann VP-Summe, sonst Unentschieden; spätestes Datum', () => {
    expect(aggregateGames([g('1', 70, 50), g('2', 40, 60), g('3', 80, 20)]).victor).toBe('ATTACKER');
    const tie = aggregateGames([g('1', 70, 50), g('2', 40, 90, [false, false], '2026-01-09T18:00:00Z')]);
    expect(tie.victor).toBe('DEFENDER');
    expect(tie.vp).toEqual({ attacker: 110, defender: 140 });
    expect(tie.playedAt).toBe('2026-01-09T18:00:00Z');
    expect(aggregateGames([g('1', 60, 50), g('2', 50, 60)]).victor).toBe('DRAW');
    // Battle Ready zählt in der Summe
    expect(aggregateGames([g('1', 60, 50), g('2', 50, 60, [true, false])]).victor).toBe('ATTACKER');
    expect(aggregateGames([g('1', 60, 50), { ...g('2', 0, 0), vp: null }]).victor).toBeNull();
  });

  it('Schlacht mit Einzelspielen: Gesamtsieger und Outcome wie gewohnt', () => {
    let s = startedCampaign();
    const { fa, c, a } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
    s = toStep(s, 'REVEAL');
    s = run(s, { type: 'REVEAL_OPS' });
    s = toStep(s, 'BATTLES');
    const b = s.battles[0];
    s = run(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { games: [g('1', 70, 50), g('2', 40, 60), g('3', 80, 20, [false, false], '2026-01-07T18:00:00Z')] } });
    expect(s.battles[0].victor).toBe('ATTACKER');
    expect(s.battles[0].status).toBe('PLAYED');
    expect(s.battles[0].playedAt).toBe('2026-01-07T18:00:00Z');
    s = toStep(s, 'PROCESS');
    s = run(s, { type: 'BATTLE_PROCESS', battleId: b.id });
    expect(PL(s, a, 'caltus-novem')).toBe(3);
    expect(tryRun(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { games: [g('1', 70, 50), g('1', 1, 2)] } }).ok).toBe(false);
  });
});

describe('Missionen (N2.2)', () => {
  it('Standard Vespator-Mission, Auswahl aus der Liste, eigene Missionen', () => {
    let s = startedCampaign();
    const { fa, c } = ids(s);
    s = run(s, { type: 'META_UPDATE', missions: [{ id: 'm-1', name: 'Nachtangriff', source: 'eigene', note: '', attackTypes: [] }] });
    expect(tryRun(s, { type: 'META_UPDATE', missions: [{ id: 'tpl-x', name: 'x', source: '', note: '', attackTypes: [] }] }).ok).toBe(false);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
    s = toStep(s, 'REVEAL');
    s = run(s, { type: 'REVEAL_OPS' });
    const b = s.battles[0];
    expect(missionLabel(s, b)).toBe('Vespator – Purge and Burn');
    expect(tryRun(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { mission: { source: 'LIST', externalName: '', missionId: 'gibt-es-nicht' } } }).ok).toBe(false);
    s = run(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { mission: { source: 'LIST', externalName: '', missionId: 'm-1' } } });
    expect(missionLabel(s, s.battles[0])).toBe('Nachtangriff');
  });
});

describe('Kill Team (N4.1)', () => {
  it('Kill-Team-Spiel: je Gegner ein Gefecht, Sieg senkt das PL, ungespielt ohne Wirkung', () => {
    let s = startedCampaign();
    const { fa, b, c } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'KILL_TEAMS', killTeamPlanetId: 'caltus-novem', killTeamMode: 'GAME' } });
    s = toStep(s, 'REVEAL');
    s = run(s, { type: 'REVEAL_OPS' });
    const kt = s.battles.filter((x) => x.kind === 'KILL_TEAM');
    expect(kt.map((x) => x.defenderAllianceId).sort()).toEqual([b, c].sort());
    const vsC = kt.find((x) => x.defenderAllianceId === c)!;
    s = run(s, { type: 'BATTLE_UPDATE', battleId: vsC.id, update: { vp: { attacker: 18, defender: 10 } } });
    const before = { b: PL(s, b, 'caltus-novem'), c: PL(s, c, 'caltus-novem') };
    s = toStep(s, 'PROCESS');
    for (const x of s.battles.filter((y) => y.kind === 'CAMPAIGN')) s = run(s, { type: 'BATTLE_PROCESS', battleId: x.id });
    s = toStep(s, 'RESISTANCE');
    s = run(s, { type: 'RESOLVE_KILL_TEAMS' });
    expect(PL(s, c, 'caltus-novem')).toBe(before.c - 1);
    expect(PL(s, b, 'caltus-novem')).toBe(before.b);
    expect(s.battles.filter((x) => x.kind === 'KILL_TEAM').every((x) => x.status === 'PROCESSED')).toBe(true);
  });
});

describe('Void-Leap-Abfangen (N4.2)', () => {
  const setup = () => {
    let s = startedCampaign();
    const { fa } = ids(s);
    s = run(s, { type: 'TOGGLES_UPDATE', toggles: { ...s.toggles, voidLeapIntercept: true } });
    // B hat eine Flotte auf Novamagnor; A springt dorthin
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'VOID_LEAP', destinationPlanetId: 'novamagnor' } });
    s = toStep(s, 'ARRIVAL');
    return s;
  };

  it('gewonnenes Abfanggefecht hält die Flotte auf, verlorenes nicht', () => {
    for (const [vp, stays] of [
      [{ attacker: 30, defender: 10 }, true],
      [{ attacker: 10, defender: 30 }, false],
    ] as const) {
      let s = setup();
      const { fa, b } = ids(s);
      const op = s.phases[0].operations.find((o) => o.fleetId === fa)!;
      s = run(s, { type: 'INTERCEPT_ADD', opId: op.id, allianceId: b });
      const ic = s.battles.find((x) => x.kind === 'INTERCEPT')!;
      expect(ic.attackerAllianceId).toBe(b);
      s = run(s, { type: 'BATTLE_UPDATE', battleId: ic.id, update: { vp } });
      s = run(s, { type: 'RESOLVE_ARRIVAL' });
      expect(s.fleets.find((f) => f.id === fa)!.planetId).toBe(stays ? 'kryndaer' : 'novamagnor');
    }
  });

  it('nur mit Hausregel, nur mit Flotte am Ziel; ungespielt kommt die Flotte an', () => {
    let s = setup();
    const { fa, b, c } = ids(s);
    const op = s.phases[0].operations.find((o) => o.fleetId === fa)!;
    expect(tryRun(s, { type: 'INTERCEPT_ADD', opId: op.id, allianceId: c }).ok).toBe(false);
    const off = run(s, { type: 'TOGGLES_UPDATE', toggles: { ...s.toggles, voidLeapIntercept: false } });
    expect(tryRun(off, { type: 'INTERCEPT_ADD', opId: op.id, allianceId: b }).ok).toBe(false);
    s = run(s, { type: 'INTERCEPT_ADD', opId: op.id, allianceId: b });
    s = run(s, { type: 'RESOLVE_ARRIVAL' });
    expect(s.fleets.find((f) => f.id === fa)!.planetId).toBe('novamagnor');
  });
});
