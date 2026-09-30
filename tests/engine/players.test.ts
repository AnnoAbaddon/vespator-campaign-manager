import { describe, expect, it } from 'vitest';
import { authorizePlayer, battlesPerPlayer, draftOverdue, suggestDefender } from '@/engine/playerActions';
import { toPlayerView, toPublicView } from '@/engine/publicView';
import type { Command } from '@/engine/commands';
import type { CampaignState, PhaseStep } from '@/engine/types';
import { ids, run, startedCampaign, tryRun } from './helpers';

function toStep(s: CampaignState, step: PhaseStep): CampaignState {
  for (let i = 0; i < 20 && !(s.stage.kind === 'PHASE' && s.stage.step === step); i++) s = run(s, { type: 'ADVANCE' });
  return s;
}

/** A greift C auf Caltus Novem an, Schlacht in Schritt BATTLES; Kommandanten gesetzt */
function battleSetup() {
  let s = startedCampaign();
  const i = ids(s);
  s = run(s, { type: 'FLEET_COMMANDER', fleetId: i.fa, phase: 1, playerId: i.pa });
  s = run(s, { type: 'OP_SET', fleetId: i.fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: i.c } });
  s = toStep(s, 'REVEAL');
  s = run(s, { type: 'REVEAL_OPS' });
  s = toStep(s, 'BATTLES');
  return { ...i, s, bt: s.battles[0] };
}

const may = (s: CampaignState, playerId: string, cmd: Command) => authorizePlayer(s, s.players.find((p) => p.id === playerId)!, cmd);

describe('Spieler-Berechtigungen (N1.2)', () => {
  it('Befehle nur als Kommandant, SL-Aktionen nie', () => {
    let s = startedCampaign();
    const { fa, pa, pb } = ids(s);
    s = run(s, { type: 'FLEET_COMMANDER', fleetId: fa, phase: 1, playerId: pa });
    const op: Command = { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'LOGISTICAL_AUXILIA' } };
    expect(may(s, pa, op)).toBeNull();
    expect(may(s, pb, op)).toMatch(/Kommandant/);
    expect(may(s, pa, { type: 'ADVANCE' })).toMatch(/Spielleiter/);
    expect(may(s, pa, { type: 'OVERRIDE_PL', allianceId: 'x', planetId: 'norallus', value: 4 })).toMatch(/Spielleiter/);
  });

  it('Profil und Notizen nur im eigenen Namen bzw. für die eigene Allianz', () => {
    const s = startedCampaign();
    const { pa, pb, a, b } = ids(s);
    expect(may(s, pa, { type: 'PROFILE_UPDATE', playerId: pa, update: { nickname: 'X' } })).toBeNull();
    expect(may(s, pa, { type: 'PROFILE_UPDATE', playerId: pb, update: { nickname: 'X' } })).not.toBeNull();
    expect(may(s, pa, { type: 'NOTE_ADD', allianceId: a, playerId: pa, text: 'hi' })).toBeNull();
    expect(may(s, pa, { type: 'NOTE_ADD', allianceId: b, playerId: pa, text: 'hi' })).not.toBeNull();
  });
});

describe('Ergebnis mit Bestätigung (N1.2)', () => {
  it('Entwurf → Bestätigung der Gegenseite übernimmt das Ergebnis', () => {
    const { s: s0, bt: b, pa, pc } = battleSetup();
    let s = run(s0, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: pa, update: { playedAt: '2026-01-05T18:00:00Z', vp: { attacker: 70, defender: 40 } } });
    expect(s.battles[0].vp).toBeNull();
    expect(s.battles[0].draft?.status).toBe('PENDING');
    // Eigene Seite darf nicht bestätigen
    expect(tryRun(s, { type: 'RESULT_DRAFT_CONFIRM', battleId: b.id, playerId: pa }).ok).toBe(false);
    s = run(s, { type: 'RESULT_DRAFT_CONFIRM', battleId: b.id, playerId: pc });
    expect(s.battles[0].vp).toEqual({ attacker: 70, defender: 40 });
    expect(s.battles[0].victor).toBe('ATTACKER');
    expect(s.battles[0].draft).toBeNull();
  });

  it('Widerspruch markiert den Entwurf, SL kann ihn übernehmen oder verwerfen', () => {
    const { s: s0, bt: b, pa, pc, pb } = battleSetup();
    let s = run(s0, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: pa, update: { vp: { attacker: 70, defender: 40 } } });
    expect(tryRun(s, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: pb, update: { vp: { attacker: 1, defender: 2 } } }).ok).toBe(false);
    expect(tryRun(s, { type: 'RESULT_DRAFT_DISPUTE', battleId: b.id, playerId: pc, reason: '' }).ok).toBe(false);
    s = run(s, { type: 'RESULT_DRAFT_DISPUTE', battleId: b.id, playerId: pc, reason: 'Es waren 60:40' });
    expect(s.battles[0].draft?.status).toBe('DISPUTED');
    const kept = run(s, { type: 'RESULT_DRAFT_CONFIRM', battleId: b.id, playerId: null });
    expect(kept.battles[0].vp?.attacker).toBe(70);
    const gone = run(s, { type: 'RESULT_DRAFT_DISCARD', battleId: b.id });
    expect(gone.battles[0].draft).toBeNull();
    expect(gone.battles[0].vp).toBeNull();
  });

  it('Entwurf läuft nach 48 h ab (SL entscheidet)', () => {
    const { s: s0, bt: b, pa } = battleSetup();
    const s = run(s0, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: pa, update: { vp: { attacker: 70, defender: 40 } } });
    const at = new Date(s.battles[0].draft!.at).getTime();
    expect(draftOverdue(s.battles[0], at + 47 * 3600_000)).toBe(false);
    expect(draftOverdue(s.battles[0], at + 49 * 3600_000)).toBe(true);
  });
});

describe('Terminfindung (N1.5)', () => {
  it('Vorschlag der einen, Bestätigung der anderen Seite', () => {
    const { s: s0, bt: b, pa, pc } = battleSetup();
    let s = run(s0, { type: 'TIME_PROPOSE', battleId: b.id, playerId: pa, times: ['2026-01-10T18:00:00Z', '2026-01-11T18:00:00Z'] });
    expect(tryRun(s, { type: 'TIME_ACCEPT', battleId: b.id, playerId: pa, time: '2026-01-10T18:00:00Z' }).ok).toBe(false);
    expect(tryRun(s, { type: 'TIME_ACCEPT', battleId: b.id, playerId: pc, time: '2026-01-12T18:00:00Z' }).ok).toBe(false);
    s = run(s, { type: 'TIME_ACCEPT', battleId: b.id, playerId: pc, time: '2026-01-11T18:00:00Z' });
    expect(s.battles[0].scheduledAt).toBe('2026-01-11T18:00:00Z');
    expect(s.battles[0].proposals).toEqual([]);
    expect(tryRun(s0, { type: 'TIME_PROPOSE', battleId: b.id, playerId: pa, times: [] }).ok).toBe(false);
  });
});

describe('Allianz-Sicht und Notizen (N1.3)', () => {
  it('Spieler sieht verdeckte Befehle und Notizen nur der eigenen Allianz', () => {
    let s = startedCampaign();
    const { fa, fb, pa, a, b } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'LOGISTICAL_AUXILIA' } });
    s = run(s, { type: 'OP_SET', fleetId: fb, slot: 1, op: { type: 'LOGISTICAL_AUXILIA' } });
    s = run(s, { type: 'NOTE_ADD', allianceId: a, playerId: pa, text: 'Wir greifen Caltus an' });
    s = run(s, { type: 'NOTE_ADD', allianceId: b, playerId: null, text: 'Geheim' });
    const pub = toPublicView(s);
    expect(pub.allianceNotes).toEqual([]);
    expect(pub.phases[0].operations.every((o) => o.type === 'NONE')).toBe(true);
    const view = toPlayerView(s, pa, a);
    expect(view.allianceNotes?.map((n) => n.text)).toEqual(['Wir greifen Caltus an']);
    expect(view.phases[0].operations.find((o) => o.fleetId === fa)?.type).toBe('LOGISTICAL_AUXILIA');
    expect(view.phases[0].operations.find((o) => o.fleetId === fb)?.type).toBe('NONE');
  });

  it('Profil: Nickname eindeutig, Armee-Wechsel in der Historie', () => {
    let s = startedCampaign();
    const { pa } = ids(s);
    expect(tryRun(s, { type: 'PROFILE_UPDATE', playerId: pa, update: { nickname: 'P2' } }).ok).toBe(false);
    s = run(s, { type: 'PROFILE_UPDATE', playerId: pa, update: { faction: 'Space Wolves', notify: { DEADLINES: false } } });
    const p = s.players.find((x) => x.id === pa)!;
    expect(p.faction).toBe('Space Wolves');
    expect(p.factionHistory?.at(-1)).toEqual({ faction: 'Space Wolves', subfaction: '', fromPhase: 1 });
    expect(p.notify).toEqual({ DEADLINES: false });
  });
});

describe('Spiellast (N1.6)', () => {
  it('Zählung, Verteidiger-Vorschlag und Warnung', () => {
    let s = startedCampaign();
    const { a, c, fa, pa, pc } = ids(s);
    s = run(s, { type: 'TOGGLES_UPDATE', toggles: { ...s.toggles, load: { maxPerPlayer: 1, minOnePerAlliance: true } } });
    const adv = tryRun(s, { type: 'ADVANCE' });
    expect(adv.ok && adv.warnings.join(' ')).toMatch(/keine Battle Operation/);
    s = run(s, { type: 'FLEET_SET_COUNT', allianceId: a, count: 2 });
    const fa2 = s.fleets.find((f) => f.allianceId === a && f.id !== fa)!.id;
    s = run(s, { type: 'OVERRIDE_FLEET', fleetId: fa2, planetId: 'marvinius' }, [], { reason: 'x' });
    for (const f of [fa, fa2]) s = run(s, { type: 'OP_SET', fleetId: f, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
    s = toStep(s, 'REVEAL');
    s = run(s, { type: 'REVEAL_OPS' });
    expect(suggestDefender(s, c, 1)).toBe(pc);
    const [b1, b2] = s.battles;
    s = run(s, { type: 'BATTLE_UPDATE', battleId: b1.id, update: { attackers: [{ playerId: pa, faction: 'Orks' }] } });
    expect(battlesPerPlayer(s, 1)[pa]).toBe(1);
    const r = tryRun(s, { type: 'BATTLE_UPDATE', battleId: b2.id, update: { attackers: [{ playerId: pa, faction: 'Orks' }] } });
    expect(r.ok && r.warnings.join(' ')).toMatch(/Spiellast: P1.* über 1/);
  });

});
