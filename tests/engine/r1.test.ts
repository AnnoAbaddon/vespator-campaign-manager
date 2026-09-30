import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from '@/engine/commands';
import { campaignPoints } from '@/engine/board';
import { missionKey, missionMix, missionRepeat, suggestMission, vespatorMissionId } from '@/engine/missionPool';
import { capReason, pairingCounts, pairingCount, rankDefenders } from '@/engine/pairings';
import { authorizePlayer, battlesPerPlayer, suggestDefender } from '@/engine/playerActions';
import { toPlayerView, toPublicView } from '@/engine/publicView';
import { ruleCard } from '@/engine/ruleCard';
import { layoutsFor } from '@/engine/terrain';
import { sideNames } from '@/engine/guests';
import { skirmishBonus } from '@/engine/skirmish';
import { referencedUploadIds } from '@/engine/uploads';
import type { Battle, CampaignState, PhaseStep } from '@/engine/types';
import { idGen, ids, run, startedCampaign, tryRun } from './helpers';

function toStep(s: CampaignState, step: PhaseStep): CampaignState {
  for (let i = 0; i < 20 && !(s.stage.kind === 'PHASE' && s.stage.step === step); i++) s = run(s, { type: 'ADVANCE' });
  return s;
}

/** ohne force: Rückfrage (confirm) sichtbar machen */
const probe = (s: CampaignState, cmd: Command, dice: number[] = []) => executeCommand(s, cmd, { idGen, dice: { mode: dice.length ? 'MANUAL' : 'DIGITAL', manual: dice, random: () => 4 } });

/** Kampagne mit zweitem Spieler in Allianz C (P4) und zweiter Flotte für A */
function base() {
  let s = startedCampaign();
  const i = ids(s);
  s = run(s, { type: 'PLAYER_UPSERT', data: { nickname: 'P4', faction: 'Eldar' }, allianceId: i.c });
  s = run(s, { type: 'FLEET_SET_COUNT', allianceId: i.a, count: 2 });
  const fa2 = s.fleets.find((f) => f.allianceId === i.a && f.id !== i.fa)!.id;
  s = run(s, { type: 'OVERRIDE_FLEET', fleetId: fa2, planetId: 'marvinius' }, [], { reason: 'x' });
  s = run(s, { type: 'FLEET_COMMANDER', fleetId: i.fa, phase: 1, playerId: i.pa });
  s = run(s, { type: 'FLEET_COMMANDER', fleetId: fa2, phase: 1, playerId: i.pa });
  const p4 = s.players.find((p) => p.nickname === 'P4')!.id;
  return { ...i, s, fa2, p4 };
}

/** beide Flotten von A greifen C auf Caltus Novem mit Purge and Burn an; Schritt BATTLES */
function twoAttacks(prep: (s: CampaignState) => CampaignState = (x) => x) {
  const b = base();
  let s = prep(b.s);
  for (const f of [b.fa, b.fa2]) s = run(s, { type: 'OP_SET', fleetId: f, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: b.c } });
  s = toStep(s, 'REVEAL');
  s = run(s, { type: 'REVEAL_OPS' });
  s = toStep(s, 'BATTLES');
  return { ...b, s };
}

const withMission = (s: CampaignState) => run(s, { type: 'META_UPDATE', missions: [{ id: 'm-ruins', name: 'Ruinen', source: 'eigene', note: 'Nur Ruinen', attackTypes: [] }] });

describe('A1 Missions-Pool und Wiederholungssperre', () => {
  it('prüft den Pool beim Speichern', () => {
    let s = withMission(startedCampaign());
    expect(tryRun(s, { type: 'MISSION_POOL_SET', pool: { PURGE_AND_BURN: ['m-ruins', 'tpl-ca', 'tpl-pn', 'tpl-lev'] } }).ok).toBe(false);
    expect(tryRun(s, { type: 'MISSION_POOL_SET', pool: { PURGE_AND_BURN: ['gibt-es-nicht'] } }).ok).toBe(false);
    // Vespator-Mission einer anderen Angriffsart passt nicht
    expect(tryRun(s, { type: 'MISSION_POOL_SET', pool: { PURGE_AND_BURN: [vespatorMissionId('ORBITAL_INVASION')] } }).ok).toBe(false);
    s = run(s, { type: 'MISSION_POOL_SET', pool: { PURGE_AND_BURN: ['m-ruins', 'm-ruins', vespatorMissionId('PURGE_AND_BURN')], SEIZE_POWER_BASE: [] } });
    expect(s.meta.missionPool).toEqual({ PURGE_AND_BURN: ['m-ruins', vespatorMissionId('PURGE_AND_BURN')] });
  });

  it('ohne Pool bleibt die Vespator-Mission (Regelbuch)', () => {
    const { s } = twoAttacks();
    expect(s.battles.map((b) => b.mission.source)).toEqual(['VESPATOR', 'VESPATOR']);
  });

  it('schlägt beim Ansetzen eine Pool-Mission vor und wechselt bei derselben Allianz', () => {
    const { s } = twoAttacks((x) => run(withMission(x), { type: 'MISSION_POOL_SET', pool: { PURGE_AND_BURN: ['m-ruins', vespatorMissionId('PURGE_AND_BURN')] } }));
    const [b1, b2] = s.battles;
    expect(b1.mission).toEqual({ source: 'LIST', externalName: '', missionId: 'm-ruins' });
    expect(b2.mission).toEqual({ source: 'VESPATOR', externalName: '' });
    expect(missionKey(b2)).toBe(vespatorMissionId('PURGE_AND_BURN'));
    // Vorschlag für eine weitere Schlacht: am seltensten gespielt, nicht die letzte
    expect(suggestMission(s, { id: 'x', phaseNumber: 2, createdSeq: 99, attackerAllianceId: b1.attackerAllianceId, attackType: 'PURGE_AND_BURN' })).toEqual({ source: 'LIST', externalName: '', missionId: 'm-ruins' });
  });

  it('Wiederholung: Hinweis, mit Hausregel Sperre (Override nur für den Spielleiter)', () => {
    const { s: s0, pa } = twoAttacks((x) => run(withMission(x), { type: 'MISSION_POOL_SET', pool: { PURGE_AND_BURN: ['m-ruins', vespatorMissionId('PURGE_AND_BURN')] } }));
    const b2 = s0.battles[1];
    const repeat = { source: 'LIST' as const, externalName: '', missionId: 'm-ruins' };
    expect(missionRepeat(s0, b2, repeat)?.mission).toBe('Ruinen');
    const soft = probe(s0, { type: 'BATTLE_UPDATE', battleId: b2.id, update: { mission: repeat } });
    expect(soft.ok && soft.hints.join(' ')).toMatch(/Wiederholung: Rot spielt „Ruinen“ zweimal hintereinander/);
    const locked = run(s0, { type: 'TOGGLES_UPDATE', toggles: { ...s0.toggles, missionRepeatLock: true } });
    const r = probe(locked, { type: 'BATTLE_UPDATE', battleId: b2.id, update: { mission: repeat } });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.kind === 'confirm' && r.needsReason).toBe(true);
    // Spieler meldet mit der gesperrten Mission: Warnung, für Spieler nicht übergehbar
    const d = probe(locked, { type: 'RESULT_DRAFT_SUBMIT', battleId: b2.id, playerId: pa, update: { vp: { attacker: 50, defender: 40 }, mission: repeat } });
    expect(!d.ok && d.kind === 'confirm' && d.warnings.join(' ')).toMatch(/Wiederholungssperre/);
    // andere Mission ist frei
    expect(probe(locked, { type: 'BATTLE_UPDATE', battleId: b2.id, update: { mission: { source: 'LIST', externalName: '', missionId: 'tpl-ca' } } }).ok).toBe(true);
  });
});

describe('A2 Mix-Statistik', () => {
  it('zählt Angriffsarten und Missionen je Phase und Allianz und warnt vor Monokultur', () => {
    const { s, a } = twoAttacks();
    const mix = missionMix(s);
    expect(mix.phases).toEqual([1]);
    expect(mix.byAlliance[a][1].types.PURGE_AND_BURN).toBe(2);
    expect(mix.byAlliance[a][0].total).toBe(2);
    expect(mix.warnings).toEqual([]);
    // dritte Schlacht derselben Art: Monokultur
    const extra: Battle = { ...structuredClone(s.battles[0]), id: 'bx', createdSeq: 50, phaseNumber: 2 };
    const s2 = { ...s, battles: [...s.battles, extra] };
    const m2 = missionMix(s2);
    expect(m2.warnings).toEqual([{ allianceId: a, kind: 'TYPE', key: 'PURGE_AND_BURN', count: 3, total: 3 }]);
  });
});

/** gespielte Schlacht zwischen zwei Spielern in einer früheren Phase (Testdaten) */
function playedBattle(tpl: Battle, id: string, attacker: string, defender: string): Battle {
  return {
    ...structuredClone(tpl),
    id,
    phaseNumber: 0,
    createdSeq: 0,
    status: 'PROCESSED',
    attackers: [{ playerId: attacker, faction: '' }],
    defenders: [{ playerId: defender, faction: '' }],
    vp: { attacker: 1, defender: 0 },
    victor: 'ATTACKER',
  };
}

describe('A3 Paarungs-Historie', () => {
  it('bevorzugt Verteidiger, die noch nie gegen den Angreifer gespielt haben', () => {
    const { s: s0, c, pa, pb, pc, p4 } = twoAttacks();
    const tpl = s0.battles[0];
    // P3 hat schon gegen P1 gespielt, P4 zweimal gegen P2 (mehr Schlachten insgesamt, aber keine Paarung mit P1)
    const s: CampaignState = { ...s0, battles: [...s0.battles, playedBattle(tpl, 'h1', pa, pc), playedBattle(tpl, 'h2', pb, p4), playedBattle(tpl, 'h3', pb, p4)] };
    const counts = pairingCounts(s);
    expect(pairingCount(counts, pa, pc)).toBe(1);
    expect(pairingCount(counts, pc, pa)).toBe(1);
    const rank = rankDefenders(s, c, 1, [pa], tpl.id);
    expect(rank[0]).toMatchObject({ playerId: p4, fresh: [pa], pairings: 0 });
    expect(suggestDefender(s, c, 1, [pa], tpl.id)).toBe(p4);
    // ohne Angreifer zählt wie bisher die Gesamtzahl
    expect(suggestDefender(s, c, 1)).toBe(pc);
  });
});

describe('A4 harte Obergrenze', () => {
  it('sperrt weitere Verteidigungen; Spieler scheitern, der Spielleiter braucht eine Begründung', () => {
    const { s: s0, c, pc } = twoAttacks((x) => run(x, { type: 'TOGGLES_UPDATE', toggles: { ...x.toggles, loadCap: { maxDefences: 1, maxGames: null } } }));
    const [b1, b2] = s0.battles;
    let s = run(s0, { type: 'BATTLE_CLAIM_SIDE', battleId: b1.id, playerId: pc });
    expect(capReason(s, 1, pc, 'DEFENDER', b2.id)).toBe('DEFENCES');
    const claim = probe(s, { type: 'BATTLE_CLAIM_SIDE', battleId: b2.id, playerId: pc });
    expect(!claim.ok && claim.kind === 'confirm' && claim.needsReason && claim.warnings[0]).toMatch(/Obergrenze: P3 hat in Phase 1 bereits 1 Verteidigung/);
    const gm = probe(s, { type: 'BATTLE_UPDATE', battleId: b2.id, update: { defenders: [{ playerId: pc, faction: 'Tau' }] } });
    expect(!gm.ok && gm.kind === 'confirm' && gm.needsReason).toBe(true);
    // mit Begründung übergangen
    s = run(s, { type: 'BATTLE_UPDATE', battleId: b2.id, update: { defenders: [{ playerId: pc, faction: 'Tau' }] } }, [], { reason: 'Absprache' });
    expect(s.battles[1].defenders[0].playerId).toBe(pc);
    // Vorschlag überspringt Spieler an der Grenze
    expect(rankDefenders(s0, c, 1, [], b2.id).find((x) => x.playerId === pc)?.capped).toBe(false);
    const r = rankDefenders(run(s0, { type: 'BATTLE_CLAIM_SIDE', battleId: b1.id, playerId: pc }), c, 1, [], b2.id);
    expect(r.at(-1)).toMatchObject({ playerId: pc, capped: true });
  });

  it('einziger Verteidiger an der Grenze wird beim Ansetzen nicht eingetragen', () => {
    let s = startedCampaign();
    const i = ids(s);
    s = run(s, { type: 'TOGGLES_UPDATE', toggles: { ...s.toggles, loadCap: { maxDefences: null, maxGames: 1 } } });
    s = run(s, { type: 'FLEET_SET_COUNT', allianceId: i.a, count: 2 });
    const fa2 = s.fleets.find((f) => f.allianceId === i.a && f.id !== i.fa)!.id;
    s = run(s, { type: 'OVERRIDE_FLEET', fleetId: fa2, planetId: 'marvinius' }, [], { reason: 'x' });
    for (const f of [i.fa, fa2]) s = run(s, { type: 'OP_SET', fleetId: f, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: i.c } });
    s = toStep(s, 'REVEAL');
    const r = tryRun(s, { type: 'REVEAL_OPS' });
    expect(r.ok && r.hints.join(' ')).toMatch(/Obergrenze: P3 ist in Phase 1 ausgelastet/);
    const st = r.ok ? r.state : s;
    expect(st.battles.map((b) => b.defenders.length)).toEqual([1, 0]);
  });
});

describe('B1 Auswürfeln statt verfallen', () => {
  const rollRules = (plModifier: boolean) => (x: CampaignState) => run(x, { type: 'TOGGLES_UPDATE', toggles: { ...x.toggles, unplayedRollOff: { enabled: true, plModifier } } });

  it('ohne Hausregel: Regelfall Angreifer siegt; manuelles Auswürfeln abgelehnt', () => {
    const { s } = twoAttacks();
    expect(tryRun(s, { type: 'BATTLE_ROLL_OFF', battleId: s.battles[0].id }).ok).toBe(false);
    const after = run(s, { type: 'ADVANCE' });
    expect(after.battles.every((b) => b.unplayedResolution === 'ATTACKER_WINS' && !b.unplayedRoll)).toBe(true);
  });

  it('beim Weiterschalten per W6-Duell, protokolliert; Gleichstand wird neu gewürfelt', () => {
    const { s } = twoAttacks(rollRules(false));
    const r = probe(s, { type: 'ADVANCE' }, [2, 5, 3, 3, 6, 1]);
    expect(!r.ok && r.kind === 'confirm' && r.warnings.join(' ')).toMatch(/per W6-Duell ausgewürfelt/);
    const after = run(s, { type: 'ADVANCE' }, [2, 5, 3, 3, 6, 1]);
    const [b1, b2] = after.battles;
    expect(b1).toMatchObject({ status: 'UNPLAYED_RESOLVED', unplayedResolution: 'DEFENDER_WINS', unplayedRoll: { attacker: 2, defender: 5, modAttacker: 0, modDefender: 0 } });
    expect(b2).toMatchObject({ unplayedResolution: 'ATTACKER_WINS', unplayedRoll: { attacker: 6, defender: 1 } });
    expect(after.dice.filter((d) => d.context.startsWith('Auswürfeln')).length).toBe(6);
    // Wieder öffnen löscht das Duell
    const re = run(after, { type: 'OVERRIDE_STAGE', stage: { kind: 'PHASE', phase: 1, step: 'BATTLES' } }, [], { reason: 'x' });
    const opened = run(re, { type: 'BATTLE_REOPEN', battleId: b1.id });
    expect(opened.battles[0].unplayedRoll).toBeNull();
  });

  it('PL-Modifikator für die Seite mit dem höheren Power Level; einzeln per Befehl', () => {
    const { s, a, c } = twoAttacks(rollRules(true));
    const planet = s.planets.find((p) => p.id === 'caltus-novem')!;
    expect(planet.power[c]).toBeGreaterThan(planet.power[a]);
    const after = run(s, { type: 'BATTLE_ROLL_OFF', battleId: s.battles[0].id }, [4, 4]);
    expect(after.battles[0]).toMatchObject({ unplayedResolution: 'DEFENDER_WINS', unplayedRoll: { attacker: 4, defender: 5, modDefender: 1 } });
  });
});

describe('B3 Gastspieler', () => {
  it('Gast verteidigt, zählt nicht für Spiellast; nur die eigene Seite darf ihn eintragen', () => {
    const { s: s0, pa, pc } = twoAttacks();
    const b = s0.battles[0];
    const player = (id: string) => s0.players.find((p) => p.id === id)!;
    const cmd: Command = { type: 'BATTLE_GUEST_SET', battleId: b.id, playerId: pc, side: 'DEFENDER', guest: { name: 'Gast Gustav', faction: 'Orks' } };
    expect(authorizePlayer(s0, player(pc), cmd)).toBeNull();
    expect(authorizePlayer(s0, player(pa), cmd)).not.toBeNull();
    expect(tryRun(s0, { ...cmd, playerId: pa, side: 'DEFENDER' }).ok).toBe(false);
    expect(tryRun(s0, { ...cmd, guest: { name: 'P2', faction: '' } }).ok).toBe(false);
    let s = run(s0, cmd);
    expect(s.battles[0].guests).toEqual([{ side: 'DEFENDER', name: 'Gast Gustav', faction: 'Orks' }]);
    expect(sideNames(s, s.battles[0], 'DEFENDER')).toEqual(['Gast Gustav (Gast)']);
    expect(battlesPerPlayer(s, 1)[pc]).toBeUndefined();
    // Allianzmitglied meldet und bestätigt für die Gastseite
    s = run(s, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: pa, update: { vp: { attacker: 30, defender: 60 } } });
    s = run(s, { type: 'RESULT_DRAFT_CONFIRM', battleId: b.id, playerId: pc });
    expect(s.battles[0].victor).toBe('DEFENDER');
    expect(toPublicView(s).battles[0].guests?.[0].name).toBe('Gast Gustav');
    // Spielleiter entfernt den Gast
    const gone = run(run(s0, cmd), { type: 'BATTLE_GUEST_SET', battleId: b.id, playerId: null, side: 'DEFENDER', guest: null });
    expect(gone.battles[0].guests).toBeUndefined();
  });
});

describe('B5 freie Gefechte', () => {
  const on = (reward: 'STATS' | 'POINTS') => (x: CampaignState) => run(x, { type: 'TOGGLES_UPDATE', toggles: { ...x.toggles, freeSkirmishes: { enabled: true, reward, pointsPerWin: 1, maxBonus: 2 } } });

  it('Meldung, Bestätigung der Gegenseite, gedeckelter Punktebonus und Sichtbarkeit', () => {
    const { s: s0, a, b, c, pa, pb, pc } = base();
    const input = { aAllianceId: a, aPlayerIds: [pa], bAllianceId: c, bPlayerIds: [pc], playedAt: '2026-01-03T18:00:00Z', vp: { a: 60, b: 20 }, mission: 'Only War', note: '' };
    expect(tryRun(s0, { type: 'SKIRMISH_REPORT', playerId: pa, skirmish: input }).ok).toBe(false);
    let s = on('POINTS')(s0);
    const before = campaignPoints(s, a);
    expect(tryRun(s, { type: 'SKIRMISH_REPORT', playerId: pb, skirmish: input }).ok).toBe(false);
    expect(tryRun(s, { type: 'SKIRMISH_REPORT', playerId: pa, skirmish: { ...input, bAllianceId: a, bPlayerIds: [pa] } }).ok).toBe(false);
    s = run(s, { type: 'SKIRMISH_REPORT', playerId: pa, skirmish: input });
    const sk = s.skirmishes![0];
    expect(sk).toMatchObject({ status: 'PENDING', winner: 'A', phaseNumber: 1 });
    expect(campaignPoints(s, a)).toBe(before);
    expect(toPublicView(s).skirmishes).toEqual([]);
    expect(toPlayerView(s, pc, c).skirmishes?.length).toBe(1);
    expect(toPlayerView(s, pb, b).skirmishes).toEqual([]);
    expect(tryRun(s, { type: 'SKIRMISH_CONFIRM', id: sk.id, playerId: pa }).ok).toBe(false);
    s = run(s, { type: 'SKIRMISH_CONFIRM', id: sk.id, playerId: pc });
    expect(campaignPoints(s, a)).toBe(before + 1);
    // Deckel: höchstens 2 Punkte
    for (let i = 0; i < 3; i++) s = run(s, { type: 'SKIRMISH_REPORT', playerId: null, skirmish: input });
    expect(skirmishBonus(s, a)).toBe(2);
    expect(campaignPoints(s, a)).toBe(before + 2);
    // Paarung zählt für den Verteidigervorschlag
    expect(pairingCount(pairingCounts(s), pa, pc)).toBe(4);
    // nur Statistik: kein Bonus
    expect(skirmishBonus(on('STATS')(s), a)).toBe(0);
  });

  it('Zurückziehen offener Meldungen durch Beteiligte, sonst nur durch den Spielleiter', () => {
    const { s: s0, a, c, pa, pc, pb } = base();
    let s = on('STATS')(s0);
    s = run(s, { type: 'SKIRMISH_REPORT', playerId: pa, skirmish: { aAllianceId: a, aPlayerIds: [pa], bAllianceId: c, bPlayerIds: [pc], playedAt: null, vp: null, winner: 'DRAW', mission: '', note: '' } });
    const id = s.skirmishes![0].id;
    expect(tryRun(s, { type: 'SKIRMISH_DELETE', id, playerId: pb }).ok).toBe(false);
    expect(run(s, { type: 'SKIRMISH_DELETE', id, playerId: pc }).skirmishes).toEqual([]);
    const confirmed = run(s, { type: 'SKIRMISH_CONFIRM', id, playerId: null });
    expect(tryRun(confirmed, { type: 'SKIRMISH_DELETE', id, playerId: pa }).ok).toBe(false);
    expect(run(confirmed, { type: 'SKIRMISH_DELETE', id, playerId: null }).skirmishes).toEqual([]);
  });
});

describe('A7 Regelkarte und A8 Gelände-Layouts', () => {
  it('Regelkarte fasst Mission, Twist, Boni, Zusatzregeln und Outcomes zusammen', () => {
    const { s: s0 } = twoAttacks(withMission);
    let s = run(s0, { type: 'BATTLE_UPDATE', battleId: s0.battles[0].id, update: { mission: { source: 'LIST', externalName: '', missionId: 'm-ruins' }, theatre: 'XENOFLORA_JUNGLE' } });
    s = run(s, { type: 'BATTLE_UPDATE', battleId: s.battles[0].id, update: { twistRoll: 2 } });
    const card = ruleCard(s, s.battles[0]);
    expect(card.mission).toEqual({ name: 'Ruinen', note: 'Nur Ruinen', fromPool: false });
    expect(card.theatre?.name).toBeTruthy();
    expect(card.theatre?.twist).toMatch(/\(W6 2\)/);
    expect(card.extras[0]).toMatch(/^Twist: /);
    expect(card.outcomes?.draw).toBe('Angreifer +1 PL.');
    expect(card.bonuses.map((x) => x.side)).toEqual(['ATTACKER', 'DEFENDER']);
    expect(card.stacked).toBe(card.extras.length > 1);
  });

  it('Gelände-Layouts: Prüfung, passendstes zuerst, Bilder bleiben referenziert', () => {
    const { s: s0 } = twoAttacks();
    const bad = tryRun(s0, { type: 'TERRAIN_LAYOUTS_SET', layouts: [{ id: 'l1', theatre: null, missionId: null, title: '', image: null, link: '', note: 'x' }] });
    expect(bad.ok).toBe(false);
    expect(tryRun(s0, { type: 'TERRAIN_LAYOUTS_SET', layouts: [{ id: 'l1', theatre: 'SPACEPORT', missionId: null, title: '', image: null, link: 'javascript:alert(1)', note: '' }] }).ok).toBe(false);
    const theatres = ['XENOFLORA_JUNGLE', 'HAB_SPRAWL'] as const;
    let s = run(s0, {
      type: 'TERRAIN_LAYOUTS_SET',
      layouts: [
        { id: 'l1', theatre: theatres[0], missionId: null, title: 'Dschungel', image: 'upload_abcdefgh', link: '', note: '' },
        { id: 'l2', theatre: theatres[0], missionId: vespatorMissionId('PURGE_AND_BURN'), title: 'Dschungel P&B', image: null, link: 'https://example.org/x', note: '' },
        { id: 'l3', theatre: null, missionId: 'tpl-ca', title: 'CA', image: null, link: '', note: 'Standard' },
      ],
    });
    expect(referencedUploadIds(s)).toContain('upload_abcdefgh');
    s = run(s, { type: 'BATTLE_UPDATE', battleId: s.battles[0].id, update: { theatre: theatres[0] } });
    expect(layoutsFor(s, s.battles[0]).map((l) => l.id)).toEqual(['l2', 'l1']);
    const ca = { ...s.battles[0], mission: { source: 'LIST' as const, externalName: '', missionId: 'tpl-ca' } };
    expect(layoutsFor(s, ca).map((l) => l.id)).toEqual(['l3', 'l1']);
  });
});
