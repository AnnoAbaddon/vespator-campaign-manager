import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from '@/engine/commands';
import { authorizePlayer } from '@/engine/playerActions';
import { rankDefenders } from '@/engine/pairings';
import { toPlayerView, toPublicView } from '@/engine/publicView';
import { campaignPoints } from '@/engine/board';
import { isAbsent, pulsePhase, pulseSummary } from '@/engine/lifecycle';
import { planetHolder, rivalries } from '@/engine/narrative';
import { baseScores, finalScores, grandPlacement } from '@/engine/finale';
import { fogStandings } from '@/engine/fog';
import { translateMessage } from '@/i18n/core';
import type { Battle, CampaignState, PhaseStep } from '@/engine/types';
import { idGen, ids, run, startedCampaign, tryRun } from './helpers';

function toStep(s: CampaignState, step: PhaseStep): CampaignState {
  for (let i = 0; i < 20 && !(s.stage.kind === 'PHASE' && s.stage.step === step); i++) s = run(s, { type: 'ADVANCE' });
  return s;
}

const may = (s: CampaignState, playerId: string, cmd: Command) =>
  authorizePlayer(
    s,
    s.players.find((p) => p.id === playerId)!,
    cmd,
  );

/** Zweiter Spieler in Allianz A (P4), Kommandant P1 für Flotte A */
function withTeammate() {
  let s = startedCampaign();
  const i = ids(s);
  s = run(s, { type: 'PLAYER_UPSERT', data: { nickname: 'P4', faction: 'Orks' }, allianceId: i.a });
  s = run(s, { type: 'FLEET_COMMANDER', fleetId: i.fa, phase: 1, playerId: i.pa });
  const p4 = s.players.find((p) => p.nickname === 'P4')!.id;
  return { s, ...i, p4 };
}

/** Gespielte Schlacht direkt in den Zustand schreiben (für reine Auswertungsfunktionen) */
function playedBattle(s: CampaignState, att: string, def: string, attAl: string, defAl: string, victor: Battle['victor']): CampaignState {
  const b: Battle = {
    id: idGen('battle'),
    phaseNumber: 1,
    kind: 'CAMPAIGN',
    operationIds: [],
    attackType: 'PURGE_AND_BURN',
    planetId: 'masnet',
    attackerAllianceId: attAl,
    defenderAllianceId: defAl,
    attackers: [{ playerId: att, faction: '' }],
    defenders: [{ playerId: def, faction: '' }],
    status: 'PROCESSED',
    playedAt: '2026-01-02T18:00:00Z',
    createdSeq: 1,
    size: null,
    mission: { source: 'VESPATOR', externalName: '' },
    theatre: null,
    theatreChosenBy: null,
    twist: null,
    vp: { attacker: victor === 'ATTACKER' ? 60 : 40, defender: victor === 'DEFENDER' ? 60 : victor === 'DRAW' ? 40 : 30 },
    battleReady: { attacker: false, defender: false },
    victor,
    victorOverride: false,
    decisions: {},
    applied: [],
    report: '',
    photos: [],
    notes: '',
    processedOrder: 1,
    unplayedResolution: null,
    postponedFrom: null,
  };
  return { ...s, battles: [...s.battles, b] };
}

const narrative = (s: CampaignState, n: NonNullable<CampaignState['toggles']['narrative']>) => run(s, { type: 'TOGGLES_UPDATE', toggles: { ...s.toggles, narrative: { ...s.toggles.narrative, ...n } } });

describe('A5 Abwesenheitsmodus', () => {
  it('Spieler meldet sich ab: Logistical Auxilia sofort, kein Verteidigervorschlag, wieder dabei entfernt den Eintrag', () => {
    const w = withTeammate();
    let s = w.s;
    const cmd: Command = { type: 'ABSENCE_SET', playerId: w.pa, phases: [1, 2], absent: true };
    expect(may(s, w.pa, cmd)).toBeNull();
    expect(may(s, w.pb, cmd)).toMatch(/eigenen Namen/);
    s = run(s, cmd);
    expect(isAbsent(s, w.pa, 1)).toBe(true);
    const op = s.phases[0].operations.find((o) => o.fleetId === w.fa)!;
    expect(op).toMatchObject({ type: 'LOGISTICAL_AUXILIA', isDefault: true, absence: true });
    expect(rankDefenders(s, w.a, 1).map((c) => c.playerId)).toEqual([w.p4]);
    s = run(s, { type: 'ABSENCE_SET', playerId: w.pa, phases: [1], absent: false });
    expect(s.phases[0].operations.some((o) => o.fleetId === w.fa)).toBe(false);
    expect(s.players.find((p) => p.id === w.pa)!.absences).toEqual([2]);
  });

  it('eigener Befehl bleibt stehen; vergangene Phasen sind gesperrt; Weiterschalten ohne Rückfrage für Abwesende', () => {
    const w = withTeammate();
    let s = run(w.s, { type: 'OP_SET', fleetId: w.fa, slot: 1, op: { type: 'KILL_TEAMS', killTeamPlanetId: 'kryndaer' } });
    s = run(s, { type: 'ABSENCE_SET', playerId: w.pa, phases: [1], absent: true });
    expect(s.phases[0].operations.find((o) => o.fleetId === w.fa)!.type).toBe('KILL_TEAMS');
    expect(tryRun(s, { type: 'ABSENCE_SET', playerId: w.pa, phases: [0], absent: true }).ok).toBe(false);
    // Die übrigen Flotten brauchen die Bestätigung – die Flotte des Abwesenden nicht
    const r = executeCommand(s, { type: 'ADVANCE' }, { idGen });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'confirm') expect(r.warnings.join()).not.toMatch(/Rot Flotte/);
  });

  it('Kommandantenwechsel zu einem Abwesenden setzt die Standardoperation', () => {
    const w = withTeammate();
    let s = run(w.s, { type: 'ABSENCE_SET', playerId: w.p4, phases: [1], absent: true });
    expect(s.phases[0].operations.some((o) => o.fleetId === w.fa)).toBe(false);
    s = run(s, { type: 'FLEET_COMMANDER', fleetId: w.fa, phase: 1, playerId: w.p4 });
    expect(s.phases[0].operations.find((o) => o.fleetId === w.fa)?.absence).toBe(true);
  });

  it('Abwesenheit ist nicht öffentlich, aber für Spielerlinks sichtbar', () => {
    const w = withTeammate();
    const s = run(w.s, { type: 'ABSENCE_SET', playerId: w.pa, phases: [2], absent: true });
    expect(toPublicView(s).players.find((p) => p.id === w.pa)!.absences).toBeUndefined();
    expect(toPlayerView(s, w.pb, w.b).players.find((p) => p.id === w.pa)!.absences).toEqual([2]);
  });
});

describe('B2 Flotte übergeben / Nachzügler', () => {
  it('Übergabe an einen Allianzkollegen: Kommandos, Anführer, Austritt mit Historie', () => {
    const w = withTeammate();
    let s = run(w.s, { type: 'ALLIANCE_UPSERT', id: w.a, name: 'Rot', color: '#ff0000', leaderPlayerId: w.pa });
    s = run(s, { type: 'PLAYER_HANDOVER', input: { fromPlayerId: w.pa, toPlayerId: w.p4, retire: true } });
    expect(s.fleets.find((f) => f.id === w.fa)!.commanders['1']).toBe(w.p4);
    expect(s.alliances.find((a) => a.id === w.a)!.leaderPlayerId).toBe(w.p4);
    const old = s.players.find((p) => p.id === w.pa)!;
    expect(old.active).toBe(false);
    expect(old.memberships.find((m) => m.allianceId === w.a)!.toPhase).toBe(0);
    expect(may(s, w.p4, { type: 'OP_SET', fleetId: w.fa, slot: 1, op: { type: 'LOGISTICAL_AUXILIA' } })).toBeNull();
  });

  it('Übergabe an einen neuen Spieler und Nachzügler mit Startbonus (Hausregel)', () => {
    const w = withTeammate();
    let s = narrative(w.s, { lateJoinBonus: true });
    s = run(s, { type: 'PLAYER_HANDOVER', input: { fromPlayerId: w.pb, newPlayer: { nickname: 'Neu', faction: 'Aeldari' }, retire: false } });
    const neu = s.players.find((p) => p.nickname === 'Neu')!;
    expect(s.fleets.find((f) => f.id === w.fb)!.commanders['1']).toBe(neu.id);
    expect(neu.memberships).toEqual([{ allianceId: w.b, fromPhase: 1, toPhase: null }]);
    // Startbonus erst ab Phase 2
    expect(neu.honors ?? []).toEqual([]);
    s = run(s, { type: 'PLAYER_JOIN', nickname: 'Spät', faction: 'Tau', allianceId: w.c, fromPhase: 3 });
    const spaet = s.players.find((p) => p.nickname === 'Spät')!;
    expect(spaet.memberships[0].fromPhase).toBe(3);
    expect(spaet.honors?.[0].title).toBe('Späte Verstärkung');
    expect(tryRun(s, { type: 'PLAYER_JOIN', nickname: 'X', allianceId: w.c, fromPhase: 0 }).ok).toBe(false);
    expect(tryRun(s, { type: 'PLAYER_HANDOVER', input: { fromPlayerId: w.pa, toPlayerId: w.pb, retire: false } }).ok).toBe(false);
  });

  it('offene Schlachten wechseln den Teilnehmer', () => {
    const w = withTeammate();
    let s = run(w.s, { type: 'OP_SET', fleetId: w.fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: w.c } });
    s = toStep(s, 'BATTLES');
    const b = s.battles[0];
    s = run(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { attackers: [{ playerId: w.pa, faction: 'Orks' }] } });
    s = run(s, { type: 'PLAYER_HANDOVER', input: { fromPlayerId: w.pa, toPlayerId: w.p4, retire: true } });
    expect(s.battles[0].attackers.map((p) => p.playerId)).toEqual([w.p4]);
  });
});

describe('B4 Phasen-Puls', () => {
  it('nur mit Schalter; eine Antwort je Spieler; „keine Zeit“ meldet für die nächste Phase ab; anonym ohne Namen', () => {
    const w = withTeammate();
    let s = toStep(w.s, 'RESULTS');
    const cmd: Command = { type: 'PULSE_SUBMIT', playerId: w.pa, phase: 1, fun: 4, time: 'NONE', comment: 'zu wenig Zeit', anonymous: true, absentNext: true };
    expect(tryRun(s, cmd).ok).toBe(false);
    s = narrative(s, { pulse: true });
    expect(pulsePhase(s)).toBe(1);
    expect(may(s, w.pa, cmd)).toBeNull();
    s = run(s, cmd);
    s = run(s, { ...cmd, fun: 2 } as Command);
    s = run(s, { type: 'PULSE_SUBMIT', playerId: w.pb, phase: 1, fun: 5, time: 'MUCH', comment: 'super', anonymous: false });
    const sum = pulseSummary(s, 1);
    expect(sum.count).toBe(2);
    expect(sum.fun).toBe(3.5);
    expect(sum.time).toEqual({ MUCH: 1, LITTLE: 0, NONE: 1 });
    expect(sum.comments).toEqual([
      { text: 'zu wenig Zeit', by: null, fun: 2 },
      { text: 'super', by: 'P2', fun: 5 },
    ]);
    expect(isAbsent(s, w.pa, 2)).toBe(true);
    expect(tryRun(s, { ...cmd, fun: 6 } as Command).ok).toBe(false);
    // öffentlich unsichtbar, im Spielerlink nur die eigene Antwort
    expect(toPublicView(s).phases[0].pulse).toBeUndefined();
    expect(toPlayerView(s, w.pa, w.a).phases[0].pulse?.map((e) => e.playerId)).toEqual([w.pa]);
  });
});

describe('C1 Nebel über dem Punktestand', () => {
  it('Projektion ohne Punkte, mit Rang und Tendenz; Engine rechnet exakt; Kampagnenende deckt auf', () => {
    let s = startedCampaign();
    const { a, b, c } = ids(s);
    s = run(s, { type: 'TOGGLES_UPDATE', toggles: { ...s.toggles, fog: true } });
    const pub = toPublicView(s);
    expect(pub.pointsHistory).toEqual([]);
    expect(pub.fog?.rank).toBeDefined();
    const exact = s.pointsHistory.at(-1)!.points;
    const best = Object.keys(exact).sort((x, y) => exact[y] - exact[x])[0];
    expect(pub.fog!.rank[best]).toBe(1);
    // Engine unverändert exakt
    expect(s.pointsHistory.length).toBeGreaterThan(0);
    expect(campaignPoints(s, a)).toBe(exact[a]);
    expect(toPlayerView(s, s.players[0].id, a).pointsHistory).toEqual([]);
    // Punkte-Boni eigener Ereignisse verraten unter Nebel keine Zahlen
    const withBonus = { ...s, pointsBonus: [{ id: 'pb1', allianceId: a, points: 3, source: 'Test', phaseNumber: 1 }] };
    expect(toPublicView(withBonus).pointsBonus ?? []).toEqual([]);
    // aufdecken: nach Kampagnenende bzw. ausdrücklich
    expect(toPublicView(s, { reveal: true }).pointsHistory.length).toBeGreaterThan(0);
    expect(toPublicView({ ...s, stage: { kind: 'ENDED' } }).fog).toBeUndefined();
    void b;
    void c;
  });

  it('Tendenz: deutlich vorn ab 5 Punkten Abstand, gleichauf bei Punktgleichheit', () => {
    const s = startedCampaign();
    const { a, b, c } = ids(s);
    const st = { ...s, pointsHistory: [{ phaseNumber: 1, points: { [a]: 20, [b]: 14, [c]: 20 }, powerSum: {} }] };
    const f = fogStandings(st);
    expect(f.tendency).toEqual({ [a]: 'EVEN', [b]: 'BEHIND_CLEAR', [c]: 'EVEN' });
    expect(f.rank).toEqual({ [a]: 1, [b]: 3, [c]: 1 });
    const st2 = { ...s, pointsHistory: [{ phaseNumber: 1, points: { [a]: 20, [b]: 17, [c]: 10 }, powerSum: {} }] };
    expect(fogStandings(st2).tendency).toEqual({ [a]: 'LEAD', [b]: 'BEHIND', [c]: 'BEHIND_CLEAR' });
  });
});

describe('C2 Alternative Endwertung', () => {
  it('gewonnene Schlachten bzw. gewichtete Planeten; Standard bleibt das Buch', () => {
    let s = startedCampaign();
    const { a, b, c, pa, pb, pc } = ids(s);
    s = playedBattle(s, pa, pb, a, b, 'ATTACKER');
    s = playedBattle(s, pc, pa, c, a, 'DEFENDER');
    s = playedBattle(s, pb, pc, b, c, 'DRAW');
    const book = baseScores(s);
    expect(book[a]).toBe(s.pointsHistory.at(-1)!.points[a]);
    s = run(s, { type: 'TOGGLES_UPDATE', toggles: { ...s.toggles, endScoring: { mode: 'BATTLES' } } });
    expect(baseScores(s)).toEqual({ [a]: 2, [b]: 0, [c]: 0 });
    s = run(s, { type: 'TOGGLES_UPDATE', toggles: { ...s.toggles, endScoring: { mode: 'PLANETS', planetWeights: { norallus: 3 } } } });
    const holder = planetHolder(s, 'norallus');
    expect(holder).toBe(a);
    const planets = baseScores(s);
    const count = (al: string) => s.planets.filter((p) => p.id !== 'norallus' && planetHolder(s, p.id) === al).length;
    expect(planets[a]).toBe(3 + count(a));
    expect(planets[b]).toBe(count(b));
  });
});

describe('C3 Warmaster-Sonderziel', () => {
  it('„Planet halten“ wird bei der Punktewertung ausgewertet; PL-Belohnung zählt sofort', () => {
    let s = startedCampaign();
    const { a, b } = ids(s);
    s = run(s, { type: 'OVERRIDE_PL', allianceId: a, planetId: 'masnet', value: 4 });
    s = run(s, {
      type: 'OBJECTIVE_UPSERT',
      objective: { phaseNumber: 1, title: 'Masnet halten', text: '', allianceId: null, check: 'HOLD_PLANET', planetId: 'masnet', reward: { kind: 'PL', value: 1, planetId: 'karabas', text: '' } },
    });
    expect(
      tryRun(s, { type: 'OBJECTIVE_UPSERT', objective: { phaseNumber: 0, title: 'x', text: '', allianceId: null, check: 'MANUAL', planetId: null, reward: { kind: 'NONE', value: 0, planetId: null, text: '' } } }).ok,
    ).toBe(false);
    const before = s.planets.find((p) => p.id === 'karabas')!.power[a];
    s = toStep(s, 'RESULTS');
    s = run(s, { type: 'SCORE' });
    const o = s.objectives![0];
    expect(o.status).toBe('MET');
    expect(o.achievedBy).toEqual([a]);
    expect(s.planets.find((p) => p.id === 'karabas')!.power[a]).toBe(Math.min(4, before + 1));
    expect(s.pointsHistory.at(-1)!.points[a]).toBe(campaignPoints(s, a));
    void b;
  });

  it('manuell mit Endwertungs-Punkten; verdeckt nur für die Ziel-Allianz; offene verfallen beim Weiterschalten', () => {
    let s = startedCampaign();
    const { a, b, pa, pb } = ids(s);
    s = run(s, {
      type: 'OBJECTIVE_UPSERT',
      objective: { phaseNumber: 1, title: 'Artefakt bergen', text: 'Relikt', allianceId: b, check: 'MANUAL', planetId: null, reward: { kind: 'END_POINTS', value: 3, planetId: null, text: '' }, secret: true },
    });
    s = run(s, { type: 'OBJECTIVE_UPSERT', objective: { phaseNumber: 1, title: 'Offen', text: '', allianceId: null, check: 'MANUAL', planetId: null, reward: { kind: 'HONOR', value: 0, planetId: null, text: 'Held' } } });
    expect(toPublicView(s).objectives!.map((o) => o.title)).toEqual(['Offen']);
    expect(toPlayerView(s, pb, b).objectives!.map((o) => o.title)).toEqual(['Artefakt bergen', 'Offen']);
    expect(toPlayerView(s, pa, a).objectives!.map((o) => o.title)).toEqual(['Offen']);
    const id = s.objectives![0].id;
    expect(tryRun(s, { type: 'OBJECTIVE_RESOLVE', id, achievedBy: [a], reason: '' }).ok).toBe(false);
    s = run(s, { type: 'OBJECTIVE_RESOLVE', id, achievedBy: [b], reason: 'geborgen' });
    expect(finalScores(s).bonus[b]).toBe(3);
    expect(finalScores(s).total[b]).toBe(baseScores(s)[b] + 3);
    s = toStep(s, 'RESULTS');
    s = run(s, { type: 'SCORE' });
    // ohne Events (hier nicht Gegenstand des Tests)
    s = run(s, { type: 'TOGGLES_UPDATE', toggles: { ...s.toggles, events: { ...s.toggles.events, fortunesOfWar: false, perilsOfPower: false, desperateMeasures: false } } });
    const r = executeCommand(s, { type: 'ADVANCE' }, { idGen });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'confirm') expect(r.warnings.join()).toMatch(/Sonderziel nicht ausgewertet: Offen/);
    s = run(s, { type: 'ADVANCE' });
    expect(s.objectives!.find((o) => o.title === 'Offen')!.status).toBe('FAILED');
  });
});

describe('C4 Geheime persönliche Ziele', () => {
  it('Liste, Wahl durch den Spieler, Meldung, Bestätigung mit Ehrung; geheim bis Kampagnenende', () => {
    let s = startedCampaign();
    const { pa, pb, a } = ids(s);
    s = run(s, { type: 'GOAL_LIST_SET', goals: [{ id: 'g1', title: 'Warlord im Nahkampf töten', text: '' }] });
    const choose: Command = { type: 'GOAL_CHOOSE', playerId: pa, goalId: 'g1' };
    expect(tryRun(s, choose).ok).toBe(false);
    s = narrative(s, { secretGoals: true });
    expect(may(s, pa, choose)).toBeNull();
    s = run(s, choose);
    expect(tryRun(s, choose).ok).toBe(false);
    const g = s.players.find((p) => p.id === pa)!.goals![0];
    expect(may(s, pa, { type: 'GOAL_RESOLVE', playerId: pa, id: g.id, met: true, reason: '' })).toMatch(/Spielleiter/);
    s = run(s, { type: 'GOAL_CLAIM', playerId: pa, id: g.id, note: 'Phase 1, Masnet' });
    s = run(s, { type: 'GOAL_RESOLVE', playerId: pa, id: g.id, met: true, reason: '' });
    const me = s.players.find((p) => p.id === pa)!;
    expect(me.goals![0].status).toBe('MET');
    expect(me.honors!.at(-1)).toMatchObject({ title: 'Geheimauftrag erfüllt', reason: 'Warlord im Nahkampf töten', goal: true });
    const pub = toPublicView(s);
    expect(pub.players.find((p) => p.id === pa)!.goals).toBeUndefined();
    expect(pub.players.find((p) => p.id === pa)!.honors!.at(-1)!.reason).toBe('');
    expect(pub.goalList).toBeUndefined();
    expect(toPlayerView(s, pa, a).players.find((p) => p.id === pa)!.goals).toHaveLength(1);
    expect(toPlayerView(s, pb, null).players.find((p) => p.id === pa)!.goals).toBeUndefined();
    const ended = toPublicView({ ...s, stage: { kind: 'ENDED' } });
    expect(ended.players.find((p) => p.id === pa)!.goals![0].title).toBe('Warlord im Nahkampf töten');
    // Warmaster teilt ein eigenes Ziel zu
    s = run(s, { type: 'GOAL_ASSIGN', playerId: pb, title: 'Stronghold halten' });
    expect(s.players.find((p) => p.id === pb)!.goals![0]).toMatchObject({ title: 'Stronghold halten', by: 'GM', status: 'OPEN' });
  });
});

describe('C5 Nemesis und Rivalitäten', () => {
  it('Bilanz gegeneinander; Nemesis-Paarung wird einmal bevorzugt', () => {
    let s = startedCampaign();
    const { a, b, c, pa, pb, pc } = ids(s);
    s = playedBattle(s, pa, pb, a, b, 'ATTACKER');
    s = playedBattle(s, pb, pa, b, a, 'ATTACKER');
    s = playedBattle(s, pa, pc, a, c, 'ATTACKER');
    const r = rivalries(s, pa);
    expect(r.rows.find((x) => x.opponentId === pb)).toMatchObject({ games: 2, wins: 1, losses: 1 });
    expect(r.mostPlayed?.opponentId).toBe(pb);
    expect(r.closest?.opponentId).toBe(pb);
    expect(r.mostLostTo?.opponentId).toBe(pb);

    // Nemesis-Wahl und Vorschlag
    let t = startedCampaign();
    const i = ids(t);
    t = run(t, { type: 'PLAYER_UPSERT', data: { nickname: 'P5', faction: 'Tau' }, allianceId: i.c });
    const p5 = t.players.find((p) => p.nickname === 'P5')!.id;
    const set: Command = { type: 'NEMESIS_SET', playerId: p5, nemesisId: i.pa };
    expect(tryRun(t, set).ok).toBe(false);
    t = narrative(t, { nemesis: true });
    expect(tryRun(t, { type: 'NEMESIS_SET', playerId: p5, nemesisId: i.pc }).ok).toBe(false);
    t = run(t, set);
    expect(t.players.find((p) => p.id === p5)!.nemesisId).toBe(i.pa);
    expect(rankDefenders(t, i.c, 1, [i.pa])[0]).toMatchObject({ playerId: p5, nemesis: true });
    // nach einer gespielten Paarung nicht mehr bevorzugt
    t = playedBattle(t, i.pa, p5, i.a, i.c, 'DRAW');
    expect(rankDefenders(t, i.c, 1, [i.pa]).find((x) => x.playerId === p5)!.nemesis).toBe(false);
  });
});

describe('C6 Großschlacht', () => {
  it('nur in der letzten Phase mit Ergebnis; Platzierung aus Tischen; Bonus entscheidet die Endwertung', () => {
    let s = startedCampaign({ phases: 1 });
    const { a, b, c, pa, pb } = ids(s);
    const grand: Command = { type: 'GRAND_UPDATE', update: { name: 'Finale', mission: 'Mega-Battle' } };
    expect(tryRun(s, grand).ok).toBe(false);
    s = run(s, { type: 'TOGGLES_UPDATE', toggles: { ...s.toggles, grandFinale: { enabled: true, bonus: [20, 5, 0] } } });
    s = run(s, grand);
    expect(may(s, pa, { type: 'GRAND_JOIN', playerId: pa, join: true })).toBeNull();
    s = run(s, { type: 'GRAND_JOIN', playerId: pa, join: true });
    s = run(s, { type: 'GRAND_JOIN', playerId: pb, join: true });
    expect(s.grandBattle!.participants[a]).toEqual([pa]);
    s = run(s, {
      type: 'GRAND_UPDATE',
      update: {
        tables: [
          { id: 't1', label: 'Tisch 1', winnerAllianceId: c },
          { id: 't2', label: 'Tisch 2', winnerAllianceId: c },
          { id: 't3', label: 'Ziel Nord', winnerAllianceId: b },
        ],
      },
    });
    expect(grandPlacement(s)).toEqual({ [a]: 3, [b]: 2, [c]: 1 });
    s = run(s, { type: 'GRAND_UPDATE', update: { done: true } });
    expect(tryRun(s, { type: 'GRAND_JOIN', playerId: pa, join: false }).ok).toBe(false);
    s = toStep(s, 'RESULTS');
    s = run(s, { type: 'SCORE' });
    s = run(s, { type: 'CAMPAIGN_END' });
    expect(s.stage.kind).toBe('ENDED');
    expect(s.result?.winnerAllianceId).toBe(c);
    expect(s.result?.scores?.bonus).toEqual({ [a]: 0, [b]: 5, [c]: 20 });
  });

  it('Kampagnenende ohne Ergebnis der Großschlacht verlangt eine Bestätigung', () => {
    let s = startedCampaign({ phases: 1 });
    s = run(s, { type: 'TOGGLES_UPDATE', toggles: { ...s.toggles, grandFinale: { enabled: true, bonus: [3, 1, 0] } } });
    s = toStep(s, 'RESULTS');
    s = run(s, { type: 'SCORE' });
    const r = executeCommand(s, { type: 'CAMPAIGN_END' }, { idGen });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'confirm') expect(r.needsReason).toBe(true);
  });
});

describe('R2: englische Engine-Meldungen', () => {
  it('Log-, Fehler- und Warnmeldungen sind übersetzt', () => {
    const lines = new Set<string>();
    const exec = (s: CampaignState, cmd: Command): CampaignState => {
      const r = executeCommand(s, cmd, { force: true, reason: 'test', idGen, dice: { mode: 'DIGITAL', manual: [], random: () => 4 } });
      if (r.ok) {
        for (const l of [...r.log, ...r.warnings, ...r.hints]) lines.add(l);
        return r.state;
      }
      if (r.kind === 'error') lines.add(r.error);
      if (r.kind === 'confirm') r.warnings.forEach((w) => lines.add(w));
      return s;
    };
    let s = startedCampaign({ phases: 1 });
    const { a, b, c, fa, pa, pb } = ids(s);
    s = exec(s, {
      type: 'TOGGLES_UPDATE',
      toggles: { ...s.toggles, narrative: { pulse: true, secretGoals: true, nemesis: true, lateJoinBonus: true }, grandFinale: { enabled: true, bonus: [3, 1, 0] }, endScoring: { mode: 'BATTLES' } },
    });
    s = exec(s, { type: 'FLEET_COMMANDER', fleetId: fa, phase: 1, playerId: pa });
    s = exec(s, { type: 'ABSENCE_SET', playerId: pa, phases: [1], absent: true });
    s = exec(s, { type: 'ABSENCE_SET', playerId: pa, phases: [1], absent: false });
    s = exec(s, { type: 'ABSENCE_SET', playerId: pa, phases: [7], absent: true });
    s = exec(s, { type: 'PLAYER_JOIN', nickname: 'Neu', faction: 'Orks', allianceId: a, fromPhase: 1 });
    s = exec(s, { type: 'PLAYER_JOIN', nickname: 'Neu', faction: 'Orks', allianceId: a, fromPhase: 1 });
    const neu = s.players.find((p) => p.nickname === 'Neu')!.id;
    s = exec(s, { type: 'PLAYER_HANDOVER', input: { fromPlayerId: pa, toPlayerId: neu, retire: true } });
    s = exec(s, { type: 'PLAYER_HANDOVER', input: { fromPlayerId: pb, toPlayerId: neu, retire: false } });
    s = exec(s, {
      type: 'OBJECTIVE_UPSERT',
      objective: { phaseNumber: 1, title: 'Masnet', text: '', allianceId: null, check: 'HOLD_PLANET', planetId: 'masnet', reward: { kind: 'END_POINTS', value: 2, planetId: null, text: '' } },
    });
    s = exec(s, { type: 'OBJECTIVE_UPSERT', objective: { phaseNumber: 1, title: 'Ehre', text: '', allianceId: b, check: 'MANUAL', planetId: null, reward: { kind: 'HONOR', value: 0, planetId: null, text: 'Held' } } });
    s = exec(s, { type: 'OBJECTIVE_UPSERT', objective: { phaseNumber: 1, title: 'Weg', text: '', allianceId: null, check: 'MANUAL', planetId: null, reward: { kind: 'NONE', value: 0, planetId: null, text: '' } } });
    s = exec(s, { type: 'OBJECTIVE_DELETE', id: s.objectives!.at(-1)!.id });
    s = exec(s, { type: 'OBJECTIVE_RESOLVE', id: s.objectives![1].id, achievedBy: [b], reason: 'ok' });
    s = exec(s, { type: 'OBJECTIVE_RESOLVE', id: s.objectives![1].id, achievedBy: [b], reason: 'ok' });
    s = exec(s, { type: 'GOAL_LIST_SET', goals: [{ id: 'g1', title: 'Ziel', text: '' }] });
    s = exec(s, { type: 'GOAL_CHOOSE', playerId: pb, goalId: 'g1' });
    s = exec(s, { type: 'GOAL_CHOOSE', playerId: pb, goalId: 'g1' });
    const gid = s.players.find((p) => p.id === pb)!.goals![0].id;
    s = exec(s, { type: 'GOAL_CLAIM', playerId: pb, id: gid, note: '' });
    s = exec(s, { type: 'GOAL_RESOLVE', playerId: pb, id: gid, met: true, reason: '' });
    s = exec(s, { type: 'GOAL_ASSIGN', playerId: pb, title: 'Zweites' });
    s = exec(s, { type: 'GOAL_ASSIGN', playerId: pb, title: 'Drittes' });
    const g2 = s.players.find((p) => p.id === pb)!.goals![1].id;
    s = exec(s, { type: 'GOAL_RESOLVE', playerId: pb, id: g2, met: false, reason: '' });
    s = exec(s, { type: 'GOAL_REMOVE', playerId: pb, id: g2 });
    s = exec(s, { type: 'NEMESIS_SET', playerId: pb, nemesisId: neu });
    s = exec(s, { type: 'NEMESIS_SET', playerId: pb, nemesisId: pb });
    s = exec(s, { type: 'NEMESIS_SET', playerId: pb, nemesisId: null });
    s = exec(s, { type: 'GRAND_UPDATE', update: { name: 'Finale', participants: { [a]: [pb] } } });
    s = exec(s, { type: 'GRAND_JOIN', playerId: neu, join: true });
    s = exec(s, { type: 'GRAND_JOIN', playerId: neu, join: true });
    s = exec(s, { type: 'GRAND_UPDATE', update: { done: true } });
    s = exec(s, { type: 'GRAND_UPDATE', update: { placement: { [a]: 1, [b]: 2, [c]: 3 }, done: true } });
    s = toStep(s, 'RESULTS');
    s = exec(s, { type: 'SCORE' });
    s = exec(s, { type: 'PULSE_SUBMIT', playerId: pb, phase: 1, fun: 9, time: 'MUCH', comment: '', anonymous: false });
    s = exec(s, { type: 'PULSE_SUBMIT', playerId: pb, phase: 1, fun: 3, time: 'MUCH', comment: '', anonymous: false });
    s = exec(s, { type: 'CAMPAIGN_END' });
    const german = [...lines].filter((l) => translateMessage('en', l) === l && /[äöüß]|\b(der|die|das|und|nicht|ist|für|mit)\b/.test(l));
    expect(german).toEqual([]);
    expect(s.stage.kind).toBe('ENDED');
  });
});
