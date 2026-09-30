import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from '@/engine/commands';
import { authorizePlayer, battlesPerPlayer, loadLimit, overloadedPlayers, timeClashes } from '@/engine/playerActions';
import { moveOptions, movableFleets } from '@/engine/phase';
import { bombardSlots } from '@/engine/outcomes';
import { eventInputRights, mergedEventInput } from '@/engine/events';
import { toPlayerView, toPublicView } from '@/engine/publicView';
import { phaseDatesMissing, proposePhaseDates, stageDeadline } from '@/engine/deadlines';
import type { CampaignState, EventRecord, PhaseStep } from '@/engine/types';
import { ids, idGen, run, slotsOf, startedCampaign, tryRun } from './helpers';

/** Korrekturen aus den Playtests A und B (Engine) */

function toStep(s: CampaignState, step: PhaseStep): CampaignState {
  for (let i = 0; i < 20 && !(s.stage.kind === 'PHASE' && s.stage.step === step); i++) s = run(s, { type: 'ADVANCE' });
  return s;
}

/** ohne force/Begründung – wie ein Spielerlink */
const plain = (s: CampaignState, cmd: Command, dice: number[] = []) => executeCommand(s, cmd, { idGen, dice: { mode: dice.length ? 'MANUAL' : 'DIGITAL', manual: dice, random: () => 4 } });

/** Kampagne mit einem zweiten Spieler (P4) in Allianz C */
function withSecondDefender() {
  let s = startedCampaign();
  const { c } = ids(s);
  s = run(s, { type: 'PLAYER_UPSERT', data: { nickname: 'P4', faction: 'Eldar' }, allianceId: c });
  const p4 = s.players.find((p) => p.nickname === 'P4')!.id;
  return { s, p4 };
}

/** Angriff Flotte A → C auf Caltus Novem, aufgedeckt, Schritt BATTLES */
function attackAC(s0: CampaignState, attackType: 'PURGE_AND_BURN' | 'BOARDING_ACTION' | 'PLANETARY_BOMBARDMENT' = 'PURGE_AND_BURN', extra: Record<string, string> = {}) {
  let s = s0;
  const { fa, c } = ids(s);
  s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType, targetPlanetId: 'caltus-novem', targetAllianceId: c, ...extra } });
  s = toStep(s, 'REVEAL');
  s = run(s, { type: 'REVEAL_OPS' });
  s = toStep(s, 'BATTLES');
  return { s, b: s.battles.find((x) => x.kind === 'CAMPAIGN')! };
}

describe('R1/B2: Verteidiger über den Spielerlink', () => {
  it('Angreifer = Kommandant; ohne eindeutigen Verteidiger bleibt die Seite leer', () => {
    const { s: s0 } = withSecondDefender();
    const { s, b } = attackAC(s0);
    expect(b.attackers.map((p) => p.playerId)).toEqual([ids(s).pa]);
    expect(b.defenders).toEqual([]);
  });

  it('Terminvorschlag, Annahme, Meldung und Bestätigung tragen Spieler der leeren Seite ein', () => {
    const { s: s0, p4 } = withSecondDefender();
    let { s, b } = attackAC(s0);
    const { pa } = ids(s);
    s = run(s, { type: 'TIME_PROPOSE', battleId: b.id, playerId: p4, times: ['2026-02-01T18:00:00Z'] });
    b = s.battles.find((x) => x.id === b.id)!;
    expect(b.defenders.map((p) => p.playerId)).toEqual([p4]);
    // der andere Verteidiger ist damit nicht mehr Teilnehmer
    expect(tryRun(s, { type: 'TIME_PROPOSE', battleId: b.id, playerId: ids(s).pc, times: ['2026-02-02T18:00:00Z'] }).ok).toBe(false);
    s = run(s, { type: 'TIME_ACCEPT', battleId: b.id, playerId: pa, time: '2026-02-01T18:00:00Z' });
    expect(battlesPerPlayer(s, 1)[p4]).toBe(1);
  });

  it('Annahme durch den Verteidiger trägt ihn ein; der GM-Vorschlag trägt niemanden ein', () => {
    const { s: s0, p4 } = withSecondDefender();
    let { s, b } = attackAC(s0);
    s = run(s, { type: 'TIME_PROPOSE', battleId: b.id, playerId: null, times: ['2026-02-01T18:00:00Z'] });
    expect(s.battles.find((x) => x.id === b.id)!.defenders).toEqual([]);
    s = run(s, { type: 'TIME_ACCEPT', battleId: b.id, playerId: p4, time: '2026-02-01T18:00:00Z' });
    b = s.battles.find((x) => x.id === b.id)!;
    expect(b.defenders.map((p) => p.playerId)).toEqual([p4]);
  });

  it('Einzelspiele ohne Teilnehmer übernehmen die der Schlacht; bestätigender Verteidiger wird eingetragen', () => {
    const { s: s0, p4 } = withSecondDefender();
    let { s, b } = attackAC(s0);
    const { pa } = ids(s);
    const game = (id: string, a: number, d: number) => ({
      id,
      attackers: b.attackers,
      defenders: [],
      playedAt: null,
      size: null,
      missionName: '',
      vp: { attacker: a, defender: d },
      battleReady: { attacker: false, defender: false },
      report: '',
    });
    s = run(s, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: pa, update: { games: [game('g1', 80, 50), game('g2', 40, 60), game('g3', 70, 20)], defenders: [] } });
    s = run(s, { type: 'RESULT_DRAFT_CONFIRM', battleId: b.id, playerId: p4 });
    b = s.battles.find((x) => x.id === b.id)!;
    expect(b.defenders.map((p) => p.playerId)).toEqual([p4]);
    expect(b.games!.every((g) => g.defenders.length === 1 && g.defenders[0].playerId === p4)).toBe(true);
    expect(b.victor).toBe('ATTACKER');
  });

  it('Meldung durch einen Verteidiger trägt ihn ein', () => {
    const { s: s0, p4 } = withSecondDefender();
    let { s, b } = attackAC(s0);
    s = run(s, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: p4, update: { vp: { attacker: 20, defender: 60 } } });
    b = s.battles.find((x) => x.id === b.id)!;
    expect(b.defenders.map((p) => p.playerId)).toEqual([p4]);
  });

  it('BATTLE_CLAIM_SIDE: übernehmen, verstärken, abgeben – nur für die verteidigende Allianz', () => {
    const { s: s0, p4 } = withSecondDefender();
    let { s, b } = attackAC(s0);
    const { pa, pb, pc } = ids(s);
    const pl = (id: string) => s.players.find((p) => p.id === id)!;
    expect(authorizePlayer(s, pl(p4), { type: 'BATTLE_CLAIM_SIDE', battleId: b.id, playerId: p4 })).toBeNull();
    expect(authorizePlayer(s, pl(p4), { type: 'BATTLE_CLAIM_SIDE', battleId: b.id, playerId: pc })).not.toBeNull();
    const r = plain(s, { type: 'BATTLE_CLAIM_SIDE', battleId: b.id, playerId: p4 });
    expect(r.ok).toBe(true);
    s = r.ok ? r.state : s;
    s = run(s, { type: 'BATTLE_CLAIM_SIDE', battleId: b.id, playerId: pc, mode: 'JOIN' });
    expect(s.battles.find((x) => x.id === b.id)!.defenders.map((p) => p.playerId)).toEqual([p4, pc]);
    s = run(s, { type: 'BATTLE_CLAIM_SIDE', battleId: b.id, playerId: p4, mode: 'LEAVE' });
    s = run(s, { type: 'BATTLE_CLAIM_SIDE', battleId: b.id, playerId: p4 });
    b = s.battles.find((x) => x.id === b.id)!;
    expect(b.defenders.map((p) => p.playerId)).toEqual([p4]);
    // Angreifer einer Kampagnenschlacht steht fest, fremde Allianz darf nicht
    expect(tryRun(s, { type: 'BATTLE_CLAIM_SIDE', battleId: b.id, playerId: pa }).ok).toBe(false);
    expect(tryRun(s, { type: 'BATTLE_CLAIM_SIDE', battleId: b.id, playerId: pb }).ok).toBe(false);
  });

  it('Spiellast (N1.6): Selbsteintrag über der Schwelle ist nur ein Hinweis, der SL-Eintrag eine Warnung', () => {
    const { s: s0, p4 } = withSecondDefender();
    const r0 = attackAC(s0);
    const b = r0.b;
    let s = r0.s;
    s.toggles.load = { maxPerPlayer: 1, minOnePerAlliance: false };
    // zweite Schlacht, in der P4 schon verteidigt
    s.battles.push({ ...structuredClone(b), id: 'b-extra', defenders: [{ playerId: p4, faction: 'Eldar' }] });
    const r = plain(s, { type: 'BATTLE_CLAIM_SIDE', battleId: b.id, playerId: p4 });
    expect(r.ok).toBe(true);
    expect(r.ok && r.hints.join(' ')).toMatch(/Spiellast/);
    s = r.ok ? r.state : s;
    expect(loadLimit(s)).toBe(1);
    expect(overloadedPlayers(s, 1)).toContainEqual({ playerId: p4, count: 2 });
    const g = plain(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { defenders: [{ playerId: p4, faction: 'Eldar' }] } });
    expect(g.ok).toBe(false);
    expect(!g.ok && g.kind === 'confirm' && g.needsReason).toBe(true);
  });

  it('Kill-Team-Gefecht: Angreifer = Kommandant der befehlenden Flotte', () => {
    let s = startedCampaign();
    const { fa, pa } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'KILL_TEAMS', killTeamPlanetId: 'kryndaer', killTeamMode: 'GAME' } });
    s = toStep(s, 'REVEAL');
    s = run(s, { type: 'REVEAL_OPS' });
    const kt = s.battles.filter((b) => b.kind === 'KILL_TEAM');
    expect(kt).toHaveLength(2);
    for (const b of kt) {
      expect(b.attackers.map((p) => p.playerId)).toEqual([pa]);
      expect(b.defenders).toHaveLength(1);
    }
  });

  it('Entscheidungsschlacht: Teilnehmer vorbelegt, Angriff übernehmbar; nach dem Sieg verarbeitet (B8)', () => {
    let s = startedCampaign({ phases: 1 });
    const { a, b: bb, pa, pb } = ids(s);
    s = run(s, { type: 'PLAYER_UPSERT', data: { nickname: 'P5', faction: 'Orks' }, allianceId: a });
    const p5 = s.players.find((p) => p.nickname === 'P5')!.id;
    s = { ...s, stage: { kind: 'TIEBREAK' }, result: { winnerAllianceId: null, tiebreak: 'FINAL_BATTLE', tied: [a, bb] } };
    s = run(s, { type: 'TIEBREAK_ADD', attackerAllianceId: a, defenderAllianceId: bb });
    let t = s.battles.find((x) => x.kind === 'FINAL_TIEBREAK')!;
    // zwei Mitglieder, kein Anführer → Angriff offen; B hat nur P2
    expect(t.attackers).toEqual([]);
    expect(t.defenders.map((p) => p.playerId)).toEqual([pb]);
    s = run(s, { type: 'BATTLE_CLAIM_SIDE', battleId: t.id, playerId: p5 });
    s = run(s, { type: 'RESULT_DRAFT_SUBMIT', battleId: t.id, playerId: p5, update: { vp: { attacker: 104, defender: 98 } } });
    s = run(s, { type: 'RESULT_DRAFT_CONFIRM', battleId: t.id, playerId: pb });
    t = s.battles.find((x) => x.id === t.id)!;
    expect(t.status).toBe('PLAYED');
    expect(t.attackers.map((p) => p.playerId)).toEqual([p5]);
    expect(pa).not.toBe(p5);
    s = run(s, { type: 'TIEBREAK_DECIDE', winnerAllianceId: a });
    expect(s.stage.kind).toBe('ENDED');
    expect(s.battles.find((x) => x.id === t.id)!.status).toBe('PROCESSED');
  });

  it('Entscheidungsschlacht ohne Ergebnis verfällt beim Entscheiden', () => {
    let s = startedCampaign({ phases: 1 });
    const { a, b: bb } = ids(s);
    s = { ...s, stage: { kind: 'TIEBREAK' }, result: { winnerAllianceId: null, tiebreak: 'FINAL_BATTLE', tied: [a, bb] } };
    s = run(s, { type: 'TIEBREAK_ADD', attackerAllianceId: a, defenderAllianceId: bb });
    s = run(s, { type: 'TIEBREAK_DECIDE', winnerAllianceId: bb });
    expect(s.battles.find((x) => x.kind === 'FINAL_TIEBREAK')!.status).toBe('VOID');
  });
});

describe('R2: Outcome-Entscheidungen bei ungespielt gewerteter Schlacht', () => {
  it('der Kommandant der Siegerseite darf entscheiden, die Gegenseite nicht', () => {
    let { s, b } = attackAC(startedCampaign());
    const { pa, pc } = ids(s);
    // Regelfall ohne Begründung
    const r = plain(s, { type: 'BATTLE_UNPLAYED', battleId: b.id, resolution: 'ATTACKER_WINS' });
    expect(r.ok).toBe(true);
    s = r.ok ? r.state : s;
    const opId = b.operationIds[0];
    const cmd: Command = { type: 'BATTLE_DECISION', battleId: b.id, opId, decision: { type: 'PURGE_A', shift: 0 } };
    const pl = (id: string) => s.players.find((p) => p.id === id)!;
    expect(authorizePlayer(s, pl(pa), cmd)).toBeNull();
    expect(authorizePlayer(s, pl(pc), cmd)).not.toBeNull();
    expect(plain(s, cmd).ok).toBe(true);
    // gespielte Schlachten: Entscheidungen weiter nur mit dem Ergebnis
    b = s.battles.find((x) => x.id === b.id)!;
    const played = { ...s, battles: s.battles.map((x) => (x.id === b.id ? { ...x, status: 'PLAYED' as const } : x)) };
    expect(authorizePlayer(played, pl(pa), cmd)).not.toBeNull();
  });
});

describe('R3: regelkonforme Folgen sind Hinweise, keine Warnungen', () => {
  it('Raise Edifices auf vollem Planeten: ohne Bestätigung erlaubt, mit Hinweis im Log', () => {
    let s = startedCampaign();
    const { fa, b } = ids(s);
    for (const i of slotsOf(s, 'kryndaer').keys())
      if (!slotsOf(s, 'kryndaer')[i].infra) s = run(s, { type: 'OVERRIDE_SLOT', planetId: 'kryndaer', slot: i, destroyed: false, infra: { type: 'FORTIFICATION_LINE', allianceId: b } });
    const r = plain(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'RAISE_EDIFICES', infraType: 'FORTIFICATION_LINE' } });
    expect(r.ok).toBe(true);
    expect(r.ok && r.override).toBe(false);
    expect(r.ok && r.log.some((l) => l.startsWith('Hinweis: Raise Edifices wird in 2.2 annulliert'))).toBe(true);
  });

  it('Boarding Action ohne gegnerische Flotte: Hinweis (F-3), kein Override', () => {
    const s = startedCampaign();
    const { fa, c } = ids(s);
    const r = plain(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'BOARDING_ACTION', targetPlanetId: 'kryndaer', targetAllianceId: c } });
    expect(r.ok).toBe(true);
    expect(r.ok && r.hints.join(' ')).toMatch(/Keine Flotte/);
  });
});

describe('R4: Boarding Action mit Zielflotte beim Befehl', () => {
  it('Zielflotte wird gespeichert und belegt die Siegerentscheidung vor', () => {
    const s0 = startedCampaign();
    const { fc, fb } = ids(s0);
    const bad = tryRun(s0, { type: 'OP_SET', fleetId: ids(s0).fa, slot: 1, op: { type: 'BATTLE', attackType: 'BOARDING_ACTION', targetPlanetId: 'caltus-novem', targetAllianceId: ids(s0).c, targetFleetId: fb } });
    expect(bad.ok).toBe(false);
    let { s, b } = attackAC(s0, 'BOARDING_ACTION', { targetFleetId: fc });
    expect(s.phases[0].operations.find((o) => o.id === b.operationIds[0])!.targetFleetId).toBe(fc);
    s = run(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { vp: { attacker: 80, defender: 20 } } });
    b = s.battles.find((x) => x.id === b.id)!;
    expect(b.decisions[b.operationIds[0]]).toMatchObject({ type: 'BOARDING_A', targetFleetId: fc });
  });
});

describe('R6 / Override-Logik', () => {
  it('ungespielt: Regelfall ohne Begründung, Abweichungen nur mit Begründung', () => {
    const { s, b } = attackAC(startedCampaign());
    for (const resolution of ['VOID', 'DEFENDER_WINS', 'POSTPONED'] as const) {
      const r = plain(s, { type: 'BATTLE_UNPLAYED', battleId: b.id, resolution });
      expect(r.ok).toBe(false);
      expect(!r.ok && r.kind === 'error' && r.error).toMatch(/Begründung/);
      expect(executeCommand(s, { type: 'BATTLE_UNPLAYED', battleId: b.id, resolution }, { reason: 'Terminprobleme', idGen }).ok).toBe(true);
    }
    const ok = plain(s, { type: 'BATTLE_UNPLAYED', battleId: b.id, resolution: 'ATTACKER_WINS' });
    expect(ok.ok && ok.override).toBe(false);
  });

  it('Weiterschalten mit ungespielten Schlachten bestätigt den Regelfall – ohne Begründung, kein Override', () => {
    const { s } = attackAC(startedCampaign());
    const c = plain(s, { type: 'ADVANCE' });
    expect(!c.ok && c.kind === 'confirm' && c.needsReason).toBe(false);
    const r = executeCommand(s, { type: 'ADVANCE' }, { force: true, idGen });
    expect(r.ok && r.override).toBe(false);
  });

  it('echte Warnung übergehen verlangt eine Begründung', () => {
    const { s, b } = attackAC(startedCampaign());
    const cmd: Command = { type: 'BATTLE_UPDATE', battleId: b.id, update: { vp: { attacker: 10, defender: 50 }, victorOverride: 'ATTACKER' } };
    const c = plain(s, cmd);
    expect(!c.ok && c.kind === 'confirm' && c.needsReason).toBe(true);
    const r = executeCommand(s, cmd, { force: true, idGen });
    expect(!r.ok && r.kind === 'error' && r.error).toMatch(/Begründung/);
    const ok = executeCommand(s, cmd, { force: true, reason: 'SL-Entscheid', idGen });
    expect(ok.ok && ok.override).toBe(true);
  });
});

describe('Bombardment und „Alle verarbeiten“ (Playtest B)', () => {
  function bombardDefenderWins() {
    const r0 = attackAC(startedCampaign(), 'PLANETARY_BOMBARDMENT');
    const b = r0.b;
    let s = run(r0.s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { playedAt: '2026-01-05T18:00:00Z', vp: { attacker: 20, defender: 70 } } });
    s = toStep(s, 'PROCESS');
    const { c } = ids(s);
    const slot = bombardSlots(s, 'marvinius', () => true).find((i) => slotsOf(s, 'marvinius')[i].infra?.allianceId !== c)!;
    return { s, b, c, slot };
  }

  it('zweiter Gegenschlag auf eine vom ersten zerstörte Location entfällt statt abzubrechen', () => {
    const { s, b, slot } = bombardDefenderWins();
    const opId = b.operationIds[0];
    let s2 = run(s, {
      type: 'BATTLE_DECISION',
      battleId: b.id,
      opId,
      decision: {
        type: 'BOMBARD_D',
        planetId: 'marvinius',
        strikes: [
          { slot, roll: null },
          { slot, roll: null },
        ],
        shift: 0,
      },
    });
    s2 = run(s2, { type: 'BATTLE_PROCESS', battleId: b.id }, [6]);
    expect(slotsOf(s2, 'marvinius')[slot].destroyed).toBe(true);
    expect(s2.battles.find((x) => x.id === b.id)!.applied.some((l) => l.includes('entfällt'))).toBe(true);
  });

  it('ungültige Entscheidung wird schon beim Eintragen abgelehnt', () => {
    const { s, b } = bombardDefenderWins();
    const r = tryRun(s, { type: 'BATTLE_DECISION', battleId: b.id, opId: b.operationIds[0], decision: { type: 'BOMBARD_D', planetId: 'caltus-novem', strikes: [{ slot: 0, roll: null }], shift: 0 } });
    expect(!r.ok && r.kind === 'error' && r.error).toMatch(/Entscheidung ungültig/);
  });

  it('BATTLE_PROCESS_ALL überspringt eine Schlacht mit ungültiger Entscheidung und verarbeitet die übrigen', () => {
    let s = startedCampaign();
    const { fa, fb, c } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
    s = run(s, { type: 'OP_SET', fleetId: fb, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'novamagnor', targetAllianceId: c } });
    s = toStep(s, 'REVEAL');
    s = run(s, { type: 'REVEAL_OPS' });
    s = toStep(s, 'BATTLES');
    const [b1, b2] = s.battles;
    s = run(s, { type: 'BATTLE_UPDATE', battleId: b1.id, update: { playedAt: '2026-01-05T18:00:00Z', vp: { attacker: 20, defender: 70 } } });
    s = run(s, { type: 'BATTLE_UPDATE', battleId: b2.id, update: { playedAt: '2026-01-06T18:00:00Z', vp: { attacker: 70, defender: 20 } } });
    s = toStep(s, 'PROCESS');
    // Entscheidung, die erst beim Verarbeiten scheitert (Planet nicht verbunden)
    s.battles.find((x) => x.id === b1.id)!.decisions[b1.operationIds[0]] = { type: 'PURGE_D', redistributions: ['astarthem'], bonusPlanetId: null, shift: 0 };
    const r = tryRun(s, { type: 'BATTLE_PROCESS_ALL' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.battles.find((x) => x.id === b1.id)!.status).toBe('PLAYED');
    expect(r.state.battles.find((x) => x.id === b2.id)!.status).toBe('PROCESSED');
    expect(r.hints.join(' ')).toMatch(/übersprungen/);
  });
});

describe('Machinations of Fate (Playtest B)', () => {
  const machinations = (s: CampaignState): CampaignState => {
    const e: EventRecord = { id: 'ev-m', phaseNumber: 1, category: 'FORTUNES', code: 'FW_32', allianceId: null, status: 'PENDING', data: {}, applied: [] };
    return { ...s, events: [...s.events, e] };
  };

  it('einzelner Überläufer in eine Allianz mit zu wenig Flotten → Warnung', () => {
    let s = toStep(startedCampaign(), 'RESULTS');
    s = run(s, { type: 'SCORE' });
    s = machinations(s);
    const { pa, b } = ids(s);
    const r = plain(s, { type: 'EVENT_APPLY', eventId: 'ev-m', data: { defections: { [pa]: b } } });
    expect(!r.ok && r.kind === 'confirm' && r.warnings.join(' ')).toMatch(/ohne Flotte in Blau/);
  });

  it('Flotten werden so verteilt, dass jeder Spieler eine hat (ohne Warnung)', () => {
    let s = startedCampaign();
    const { a, pa, pb, fb } = ids(s);
    s = run(s, { type: 'PLAYER_UPSERT', data: { nickname: 'P4', faction: 'Orks' }, allianceId: a });
    const p4 = s.players.find((p) => p.nickname === 'P4')!.id;
    const fleetB = s.fleets.find((f) => f.id === fb)!;
    s.fleets.push({ ...structuredClone(fleetB), id: 'fb2', name: 'Blau II', commanders: { '1': pb } });
    s = toStep(s, 'RESULTS');
    s = run(s, { type: 'SCORE' });
    s = machinations(s);
    const r = plain(s, { type: 'EVENT_APPLY', eventId: 'ev-m', data: { defections: { [pa]: fleetB.allianceId } } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cmd2 = (id: string) => r.state.fleets.find((f) => f.id === id)!.commanders['2'];
    expect([cmd2(fb), cmd2('fb2')].sort()).toEqual([pa, pb].sort());
    expect(cmd2(ids(s).fa)).toBe(p4);
  });
});

describe('Event-Eingaben über den Spielerlink (Playtest B)', () => {
  it('Xenobeast: Kommandant wählt verdeckt, Fremde nicht; der SL übernimmt die Eingaben', () => {
    let s = toStep(startedCampaign(), 'RESULTS');
    s = run(s, { type: 'SCORE' });
    const e: EventRecord = { id: 'ev-x', phaseNumber: 1, category: 'FORTUNES', code: 'FW_31', allianceId: null, status: 'PENDING', data: {}, applied: [] };
    s = { ...s, events: [...s.events, e] };
    const { pa, pb, fa, fb, fc, a } = ids(s);
    expect(eventInputRights(s, 'ev-x', pa).positions).toEqual([fa]);
    const pl = (id: string) => s.players.find((p) => p.id === id)!;
    expect(authorizePlayer(s, pl(pa), { type: 'EVENT_INPUT', eventId: 'ev-x', playerId: pa, data: {} })).toBeNull();
    expect(tryRun(s, { type: 'EVENT_INPUT', eventId: 'ev-x', playerId: pb, data: { positions: { [fa]: 'astarthem' } } }).ok).toBe(false);
    expect(tryRun(s, { type: 'EVENT_INPUT', eventId: 'ev-x', playerId: pa, data: { positions: { [fa]: 'caltus-novem' } } }).ok).toBe(false);
    s = run(s, { type: 'EVENT_INPUT', eventId: 'ev-x', playerId: pa, data: { positions: { [fa]: 'astarthem' } } });
    expect(mergedEventInput(s.events.find((x) => x.id === 'ev-x')!).positions).toEqual({ [fa]: 'astarthem' });
    // verdeckt: öffentlich nichts, die eigene Allianz sieht ihre Eingabe
    expect(toPublicView(s).events.find((x) => x.id === 'ev-x')!.inputs).toBeUndefined();
    expect(toPlayerView(s, pa, a).events.find((x) => x.id === 'ev-x')!.inputs).toHaveLength(1);
    s = run(s, { type: 'EVENT_APPLY', eventId: 'ev-x', data: { positions: { [fb]: 'kryndaer', [fc]: 'karabas' } } });
    expect(s.fleets.find((f) => f.id === fa)!.planetId).toBe('astarthem');
  });

  it('Machinations: jeder Spieler meldet nur seinen eigenen Wunsch', () => {
    let s = toStep(startedCampaign(), 'RESULTS');
    s = run(s, { type: 'SCORE' });
    s = { ...s, events: [...s.events, { id: 'ev-m', phaseNumber: 1, category: 'FORTUNES', code: 'FW_32', allianceId: null, status: 'PENDING', data: {}, applied: [] }] };
    const { pa, pb, b } = ids(s);
    expect(tryRun(s, { type: 'EVENT_INPUT', eventId: 'ev-m', playerId: pb, data: { defections: { [pa]: b } } }).ok).toBe(false);
    s = run(s, { type: 'EVENT_INPUT', eventId: 'ev-m', playerId: pa, data: { defections: { [pa]: b } } });
    expect(mergedEventInput(s.events.find((x) => x.id === 'ev-m')!).defections).toEqual({ [pa]: b });
  });
});

describe('Terminkollisionen, Bewegungen, Fristen', () => {
  it('Terminüberschneidung (±3 h) wird als Hinweis gemeldet', () => {
    let s = startedCampaign();
    const { fa, fb, c, pa, pb, pc } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
    s = run(s, { type: 'OP_SET', fleetId: fb, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'novamagnor', targetAllianceId: c } });
    s = toStep(s, 'REVEAL');
    s = run(s, { type: 'REVEAL_OPS' });
    const [b1, b2] = s.battles;
    s = run(s, { type: 'TIME_PROPOSE', battleId: b1.id, playerId: pc, times: ['2026-02-01T18:00:00Z'] });
    s = run(s, { type: 'TIME_ACCEPT', battleId: b1.id, playerId: pa, time: '2026-02-01T18:00:00Z' });
    const r = plain(s, { type: 'TIME_PROPOSE', battleId: b2.id, playerId: pb, times: ['2026-02-01T19:30:00Z'] });
    expect(r.ok && r.hints.join(' ')).toMatch(/Terminüberschneidung: P3/);
    expect(
      timeClashes(
        s,
        s.battles.find((x) => x.id === b2.id)!,
        '2026-02-02T18:00:00Z',
      ),
    ).toEqual([]);
  });

  it('moveOptions: gesperrte Flotte (Boarding) und ein Schritt ohne Star of the Voidfarer', () => {
    let s = toStep(startedCampaign(), 'RESULTS');
    s = run(s, { type: 'SCORE' });
    const { fa, fb } = ids(s);
    s.phases[0].noMoveFleets.push(fb);
    const o = moveOptions(s, fa, 1);
    expect(o).toMatchObject({ allowed: true, maxHops: 1 });
    expect(o.firstHops).toContain('caltus-novem');
    expect(moveOptions(s, fb, 1)).toMatchObject({ allowed: false });
    expect(movableFleets(s, 1)).not.toContain(fb);
  });

  it('Frist passend zum Schritt (B10) und Vorschlag für eine neue Phase', () => {
    let s = startedCampaign();
    s = run(s, { type: 'PHASE_UPDATE', phase: 1, startDate: '2026-01-01T00:00:00Z', opsDeadline: '2026-01-04T00:00:00Z', battlesDeadline: '2026-01-15T00:00:00Z', endDate: '2026-01-17T00:00:00Z' });
    expect(stageDeadline(s)).toEqual({ kind: 'OPS', at: '2026-01-04T00:00:00Z' });
    s = toStep(s, 'BATTLES');
    expect(stageDeadline(s)).toEqual({ kind: 'BATTLES', at: '2026-01-15T00:00:00Z' });
    expect(phaseDatesMissing(s)).toBe(false);
    const next = proposePhaseDates(s, 2, '2026-01-10T00:00:00Z');
    expect(next).toEqual({ startDate: '2026-01-17T00:00:00.000Z', opsDeadline: '2026-01-20T00:00:00.000Z', battlesDeadline: '2026-01-31T00:00:00.000Z', endDate: '2026-02-02T00:00:00.000Z' });
  });
});
