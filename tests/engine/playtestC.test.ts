import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from '@/engine/commands';
import { authorizePlayer } from '@/engine/playerActions';
import { membersOfAlliance, setMembership, stagePhase } from '@/engine/players';
import { theatreForRoll } from '@/engine/phase';
import { distance } from '@/engine/graph';
import { planetDef } from '@/engine/map';
import type { HouseRuleId } from '@/engine/houseRules';
import type { CampaignState, PhaseStep } from '@/engine/types';
import { countedBattles, playerStats, profileRecord } from '@/components/stats/compute';
import { edificeTypes } from '@/components/buildOptions';
import { canBuild, countInfra } from '@/engine/board';
import { BUILDABLE_TYPES, INFRA } from '@/engine/data/vespator';
import { ids, idGen, run, slotsOf, startedCampaign } from './helpers';

/** Restpunkte aus Playtest C (Engine und reine Helfer) */

function toStep(s: CampaignState, step: PhaseStep): CampaignState {
  for (let i = 0; i < 20 && !(s.stage.kind === 'PHASE' && s.stage.step === step); i++) s = run(s, { type: 'ADVANCE' });
  return s;
}

function withRule(s: CampaignState, id: HouseRuleId): CampaignState {
  return run(s, { type: 'TOGGLES_UPDATE', toggles: { ...s.toggles, houseRules: { ...s.toggles.houseRules, [id]: true } } });
}

/** ohne force/Begründung – wie ein Spielerlink */
const plain = (s: CampaignState, cmd: Command) => executeCommand(s, cmd, { idGen, dice: { mode: 'DIGITAL', manual: [], random: () => 4 } });

/** Angriff Flotte A → C auf Caltus Novem, aufgedeckt, Schritt BATTLES */
function attackAC(s0: CampaignState, attackType: 'PURGE_AND_BURN' | 'BOARDING_ACTION' = 'PURGE_AND_BURN') {
  let s = s0;
  const { fa, c } = ids(s);
  s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType, targetPlanetId: 'caltus-novem', targetAllianceId: c } });
  s = toStep(s, 'REVEAL');
  s = run(s, { type: 'REVEAL_OPS' });
  s = toStep(s, 'BATTLES');
  return { s, b: s.battles.find((x) => x.kind === 'CAMPAIGN')! };
}

describe('B5: Mitgliedschaft nach Kampagnenende', () => {
  it('Überläufer bleibt nach dem Ende in der neuen Allianz (Notizen, Zuordnung)', () => {
    const s = startedCampaign({ phases: 2 });
    const { a, b, pa } = ids(s);
    const p = s.players.find((x) => x.id === pa)!;
    setMembership(p, b, 2);
    s.stage = { kind: 'ENDED' };
    expect(stagePhase(s)).toBe(2);
    expect(authorizePlayer(s, p, { type: 'NOTE_ADD', playerId: pa, allianceId: b, text: 'x' } as Command)).toBeNull();
    expect(authorizePlayer(s, p, { type: 'NOTE_ADD', playerId: pa, allianceId: a, text: 'x' } as Command)).toMatch(/eigenen Allianz/);
    s.stage = { kind: 'TIEBREAK' };
    expect(authorizePlayer(s, p, { type: 'NOTE_ADD', playerId: pa, allianceId: b, text: 'x' } as Command)).toBeNull();
  });
});

describe('R5: Medaillen an alle Mitglieder bei Kampagnenende (SPEC 12.2)', () => {
  it('inaktive Mitglieder bekommen die Medaille ihrer Allianz', () => {
    let s = startedCampaign({ phases: 1 });
    const { a } = ids(s);
    s = run(s, { type: 'PLAYER_UPSERT', data: { nickname: 'P4', faction: 'Eldar' }, allianceId: a });
    const p4 = s.players.find((p) => p.nickname === 'P4')!;
    p4.active = false;
    expect(membersOfAlliance(s, a, 1).map((p) => p.id)).toContain(p4.id);
    // A liegt vorn (kein Gleichstand, keine Entscheidungsschlacht)
    s = run(s, { type: 'OVERRIDE_PL', allianceId: a, planetId: 'masnet', value: 4 }, [], { reason: 'x' });
    s = toStep(s, 'RESULTS');
    s = run(s, { type: 'SCORE' });
    s = run(s, { type: 'CAMPAIGN_END' }, [6, 5, 4, 3, 2, 1, 6, 5, 4, 3, 2, 1]);
    expect(s.stage.kind, JSON.stringify(s.result)).toBe('ENDED');
    expect(s.medals.find((m) => m.medal === 'LAUREL')!.playerIds).toContain(p4.id);
    for (const m of s.medals) expect(m.playerIds).toEqual(membersOfAlliance(s, m.allianceId, 1).map((p) => p.id));
    // Vergabe per Override an A: auch dann mit dem inaktiven Mitglied
    s = run(s, { type: 'MEDAL_OVERRIDE', medal: 'LAUREL', allianceId: a }, [], { reason: 'Test' });
    expect(s.medals.find((m) => m.medal === 'LAUREL')!.playerIds).toContain(p4.id);
  });
});

describe('B7/R2: Sinister Omens – Theatre wird ausgewürfelt', () => {
  function omens() {
    const s0 = startedCampaign();
    s0.modifiers.push({ id: 'om', source: 'x', kind: 'RANDOM_THEATRE', phaseNumber: 1, allianceId: null });
    return attackAC(s0);
  }

  it('Theatre-Wurf (W6) setzt das Theatre wie „Theatre würfeln“', () => {
    const { s, b } = omens();
    expect(b.theatreChosenBy).toBe('RANDOM');
    const th = planetDef('caltus-novem')!.theatres;
    for (const v of [1, 6]) {
      const r = plain(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { theatreRoll: v } });
      expect(r.ok).toBe(true);
      const got = r.ok ? r.state.battles.find((x) => x.id === b.id)!.theatre : null;
      expect(got).toBe(theatreForRoll('caltus-novem', v));
      expect(th).toContain(got);
    }
    expect(plain(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { theatreRoll: 7 } }).ok).toBe(false);
  });

  it('freie Wahl ist eine Warnung (Override des Spielleiters); Spielermeldungen scheitern daran', () => {
    const { s, b } = omens();
    const th = planetDef('caltus-novem')!.theatres[0];
    const r = plain(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { theatre: th } });
    expect(!r.ok && r.kind === 'confirm' && r.needsReason).toBe(true);
    expect(!r.ok && r.kind === 'confirm' && r.warnings.join(' ')).toMatch(/Sinister Omens/);
    // Spieler meldet mit frei gewähltem Theatre → Rückfrage (auf dem Spielerlink ein Fehler)
    const { pa } = ids(s);
    const d = plain(s, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: pa, update: { vp: { attacker: 60, defender: 40 }, theatre: th } });
    expect(d.ok).toBe(false);
    // mit Wurf klappt die Meldung, die Bestätigung setzt das gewürfelte Theatre
    const ok = plain(s, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: pa, update: { vp: { attacker: 60, defender: 40 }, theatreRoll: 3 } });
    expect(ok.ok).toBe(true);
    const s2 = run(ok.ok ? ok.state : s, { type: 'RESULT_DRAFT_CONFIRM', battleId: b.id, playerId: ids(s).pc });
    expect(s2.battles.find((x) => x.id === b.id)!.theatre).toBe(theatreForRoll('caltus-novem', 3));
  });

  it('ohne Sinister Omens bleibt die freie Wahl ohne Warnung', () => {
    const { s, b } = attackAC(startedCampaign());
    const th = planetDef('caltus-novem')!.theatres[0];
    expect(plain(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { theatre: th } }).ok).toBe(true);
  });
});

describe('B8/R4: Profil-Bilanz ohne ungespielte Schlachten', () => {
  it('ungespielt gewertete Schlachten zählen weder in Statistik noch Profil – auch nach der Verarbeitung', () => {
    const { s: s0, b } = attackAC(startedCampaign());
    const { pa } = ids(s0);
    let s = run(s0, { type: 'BATTLE_UNPLAYED', battleId: b.id, resolution: 'ATTACKER_WINS' });
    s = toStep(s, 'PROCESS');
    s = run(s, { type: 'BATTLE_PROCESS', battleId: b.id });
    expect(s.battles.find((x) => x.id === b.id)!.status).toBe('PROCESSED');
    expect(countedBattles(s)).toHaveLength(0);
    expect(profileRecord(s, pa)).toEqual({ battles: 0, wins: 0, draws: 0, losses: 0 });
  });

  it('gespielte Schlachten zählen im Profil wie in der Statistik', () => {
    const { s: s0, b } = attackAC(startedCampaign());
    const { pa } = ids(s0);
    const s = run(s0, { type: 'BATTLE_UPDATE', battleId: b.id, update: { playedAt: '2026-01-05T18:00:00Z', vp: { attacker: 70, defender: 20 } } });
    const st = playerStats(s).find((x) => x.playerId === pa)!;
    expect(profileRecord(s, pa)).toEqual({ battles: st.battles, wins: st.wins, draws: st.draws, losses: st.losses });
    expect(profileRecord(s, pa).battles).toBe(1);
  });
});

describe('R3: Boarding-Action-Bewegung nach Move-Fleets-Regeln (F-18-Alternative)', () => {
  it('Support Facility gilt auch für die Bewegung aus dem Boarding-Outcome', () => {
    let s0 = startedCampaign();
    const { c, fc } = ids(s0);
    // Support Facility von C auf Caltus Novem, Ziel in Distanz 2
    const free = slotsOf(s0, 'caltus-novem').findIndex((x) => !x.infra && !x.destroyed);
    slotsOf(s0, 'caltus-novem')[free].infra = { type: 'SUPPORT_FACILITY', allianceId: c };
    const far = s0.planets.map((p) => p.id).find((id) => distance('caltus-novem', id) === 2)!;
    s0 = withRule(s0, 'F18_FACILITY_MOVE_ONLY');
    const { s: s1, b } = attackAC(s0, 'BOARDING_ACTION');
    let s = run(s1, { type: 'BATTLE_UPDATE', battleId: b.id, update: { playedAt: '2026-01-05T18:00:00Z', vp: { attacker: 20, defender: 70 } } });
    s = toStep(s, 'PROCESS');
    s = run(s, { type: 'BATTLE_DECISION', battleId: b.id, opId: b.operationIds[0], decision: { type: 'BOARDING_D', ownFleetId: fc, toPlanetId: far, shift: 0 } });
    s = run(s, { type: 'BATTLE_PROCESS', battleId: b.id });
    expect(s.fleets.find((f) => f.id === fc)!.planetId).toBe(far);
  });
});

describe('B12: Raise Edifices mit Hausregel F-7', () => {
  it('bietet am Limit nur noch gültige Typen an', () => {
    let s = startedCampaign();
    const { a } = ids(s);
    // Staging Grounds von A bis zum Limit auffüllen (je ein freier Slot auf weiteren Planeten)
    for (const p of s.planets) {
      if (countInfra(s, a, 'STAGING_GROUNDS') >= INFRA.STAGING_GROUNDS.max) break;
      const sl = p.slots.find((x) => !x.infra && !x.destroyed);
      if (sl && p.id !== 'norallus') sl.infra = { type: 'STAGING_GROUNDS', allianceId: a };
    }
    expect(countInfra(s, a, 'STAGING_GROUNDS')).toBe(INFRA.STAGING_GROUNDS.max);
    expect(edificeTypes(s, a, 'norallus')).toContain('STAGING_GROUNDS');
    s = withRule(s, 'F7_EDIFICES_BLOCK');
    const types = edificeTypes(s, a, 'norallus');
    expect(types).not.toContain('STAGING_GROUNDS');
    expect(types).toEqual(BUILDABLE_TYPES.filter((ty) => !canBuild(s, a, ty, 'norallus')));
  });
});
