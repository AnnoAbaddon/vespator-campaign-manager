import { describe, expect, it } from 'vitest';
import { translateMessage } from '@/i18n/core';
import { EN_PATTERNS } from '@/i18n/en/engine';
import { executeCommand, type Command } from '@/engine/commands';
import { createCampaignState } from '@/engine/init';
import { EVENTS } from '@/engine/data/vespator';
import { DRAW_SUMMARY, OUTCOME_SUMMARY } from '@/engine/outcomes';
import { HOUSE_RULES } from '@/engine/houseRules';
import { AUTO_HONORS } from '@/engine/commanders';
import { MISSION_TEMPLATES, missionLabel } from '@/engine/missions';
import { DEFAULT_BATTLE_SIZES } from '@/engine/campaignRules';
import { mapWarnings, validateMap, VESPATOR_MAP, type MapDef } from '@/engine/map';
import type { TheatreId } from '@/engine/data/vespator';
import { authorizePlayer } from '@/engine/playerActions';
import { describeOp } from '@/engine/phase';
import type { EventData } from '@/engine/events';
import type { CampaignState } from '@/engine/types';
import { idGen } from './helpers';

/** Englische Übersetzung der Engine-Meldungen (N5.4) */

const placeholders = (s: string) => [...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort();

// Namen aus den Testdaten sind keine deutschen Wörter
const NAMES = ['Grün', 'Rot', 'Blau'];
const GERMAN = /(\s|^)(der|die|das|und|nicht|ist|wird|werden|auf|für|mit|von|zu|oder|eine?n?|keine?n?|bereits|noch|nur|erst|wählen|Schlacht|Allianz|Flotten|Spieler)(\s|$|[.,:;)])|[äöüÄÖÜß]/;
const germanIn = (s: string) => {
  let t = s;
  for (const n of NAMES) t = t.split(n).join('');
  // generierte Flottennamen („Rot Flotte I“) sind Namen
  t = t.replace(/ Flotte [IVX]+/g, '');
  return GERMAN.exec(t)?.[0] ?? null;
};

/** Sammelt alle Meldungen, die executeCommand liefert */
class Collector {
  lines = new Set<string>();
  constructor(public random = 4) {}
  exec(s: CampaignState, cmd: Command, dice: number[] = []): CampaignState {
    const r = executeCommand(s, cmd, {
      force: true,
      reason: 'test',
      idGen,
      dice: { mode: dice.length ? 'MANUAL' : 'DIGITAL', manual: dice, random: (n: number) => Math.min(n, this.random) },
    });
    if (r.ok) {
      for (const l of [...r.log, ...r.warnings, r.summary, ...r.state.dice.map((d) => d.context), ...r.state.setup.messages]) this.lines.add(l);
      return r.state;
    }
    if (r.kind === 'error') this.lines.add(r.error);
    if (r.kind === 'confirm') for (const w of r.warnings) this.lines.add(w);
    if (r.kind === 'dice') this.lines.add(r.dice.context);
    return s;
  }
  /** Erwartet Erfolg (damit der Ablauf wirklich voranschreitet) */
  ok(s: CampaignState, cmd: Command, dice: number[] = []): CampaignState {
    const r = executeCommand(s, cmd, { force: true, reason: 'test', idGen, dice: { mode: dice.length ? 'MANUAL' : 'DIGITAL', manual: dice, random: (n: number) => Math.min(n, this.random) } });
    if (!r.ok) throw new Error(`${cmd.type}: ${r.kind === 'error' ? r.error : r.kind === 'confirm' ? r.warnings.join('; ') : r.dice.context}`);
    return this.exec(s, cmd, dice);
  }
}

function setupCampaign(c: Collector, opts: { phases?: number } = {}) {
  let s = createCampaignState({ name: 'Test', phaseCount: opts.phases ?? 6, allianceCount: 3, now: '2026-01-01T00:00:00Z' });
  s = c.exec(s, { type: 'SETUP_W0_DONE' }); // Fehler: Allianzen fehlen
  s = c.exec(s, { type: 'ALLIANCE_UPSERT', name: ' ', color: '#000000' });
  s = c.ok(s, { type: 'ALLIANCE_UPSERT', name: 'Rot', color: '#ff0000' });
  s = c.ok(s, { type: 'ALLIANCE_UPSERT', name: 'Blau', color: '#0000ff' });
  s = c.ok(s, { type: 'ALLIANCE_UPSERT', name: 'Grün', color: '#00ff00' });
  s = c.exec(s, { type: 'ALLIANCE_UPSERT', name: 'Gelb', color: '#00ff00' });
  const [a, b, cc] = s.alliances.map((x) => x.id);
  s = c.exec(s, { type: 'SETUP_W0_DONE' }); // Fehler: keine Flotten
  s = c.ok(s, { type: 'PLAYER_UPSERT', data: { nickname: 'P1', faction: 'Orks' }, allianceId: a });
  s = c.ok(s, { type: 'PLAYER_UPSERT', data: { nickname: 'P2', faction: 'Necrons' }, allianceId: b });
  s = c.ok(s, { type: 'PLAYER_UPSERT', data: { nickname: 'P3', faction: 'Tau' }, allianceId: cc });
  s = c.exec(s, { type: 'PLAYER_UPSERT', data: { nickname: 'P4' } });
  s = c.exec(s, { type: 'PLAYER_UPSERT', data: { nickname: '' } });
  s = c.exec(s, { type: 'FLEET_SET_COUNT', allianceId: a, count: 0 });
  for (const id of [a, b, cc]) s = c.ok(s, { type: 'FLEET_SET_COUNT', allianceId: id, count: 1 });
  s = c.exec(s, { type: 'FLEET_RESERVE_SET', allianceId: a, count: 1 });
  s = c.exec(s, { type: 'FLEET_RESERVE_SET', allianceId: a, count: 0 });
  s = c.exec(s, { type: 'META_UPDATE', name: '' });
  s = c.exec(s, { type: 'META_UPDATE', battleSizes: [] });
  s = c.exec(s, { type: 'META_UPDATE', missions: [{ id: 'tpl-x', name: 'x', source: '', note: '', attackTypes: [] }] });
  s = c.ok(s, { type: 'META_UPDATE', intro: 'Hallo' });
  s = c.ok(s, { type: 'DISPATCH_UPSERT', title: 'Aufruf', body: '', pinned: false, public: true });
  s = c.exec(s, { type: 'DISPATCH_UPSERT', title: '', body: '', pinned: false, public: true });
  s = c.ok(s, { type: 'PLANET_TEXT', planetId: 'masnet', lore: 'x' });
  s = c.exec(s, { type: 'SETUP_STRONGHOLDS', allianceId: a, strongholdPlanetId: 'norallus', pl3: ['masnet'], pl2: [] }); // Schritt falsch
  s = c.exec(s, { type: 'OVERRIDE_PL', allianceId: a, planetId: 'masnet', value: 9 });
  s = c.ok(s, { type: 'SETUP_W0_DONE' });
  s = c.exec(s, { type: 'SETUP_STRONGHOLDS', allianceId: a, strongholdPlanetId: 'norallus', pl3: ['masnet', 'masnet'], pl2: [] });
  s = c.exec(s, { type: 'SETUP_STRONGHOLDS', allianceId: a, strongholdPlanetId: 'norallus', pl3: ['masnet', 'karabas', 'kryndaer', 'jawardet'], pl2: [] });
  s = c.exec(s, { type: 'SETUP_REVEAL_STRONGHOLDS' });
  s = c.ok(s, { type: 'SETUP_STRONGHOLDS', allianceId: a, strongholdPlanetId: 'norallus', pl3: ['masnet', 'karabas', 'kryndaer'], pl2: ['felgris-secundas', 'caltus-novem', 'marvinius', 'vikus-decima'] });
  s = c.ok(s, { type: 'SETUP_STRONGHOLDS', allianceId: b, strongholdPlanetId: 'jawardet', pl3: ['tarkad-vindix', 'astarthem', 'ikaron-prime'], pl2: ['novamagnor', 'felgris-secundas', 'masnet', 'vikus-decima'] });
  s = c.ok(s, { type: 'SETUP_STRONGHOLDS', allianceId: cc, strongholdPlanetId: 'caltus-novem', pl3: ['vikus-decima', 'marvinius', 'novamagnor'], pl2: ['kryndaer', 'karabas', 'ikaron-prime', 'astarthem'] });
  s = c.ok(s, { type: 'SETUP_REVEAL_STRONGHOLDS' });
  s = c.exec(s, { type: 'SETUP_WREATH', planetIds: ['masnet'] });
  s = c.ok(s, { type: 'SETUP_W2_DONE' });
  s = c.exec(s, { type: 'SETUP_INFRA', allianceId: a, items: [{ type: 'STRONGHOLD', planetId: 'masnet' }] });
  s = c.exec(s, { type: 'SETUP_REVEAL_INFRA' });
  s = c.ok(s, { type: 'SETUP_INFRA', allianceId: a, items: [{ type: 'FORTIFICATION_LINE', planetId: 'masnet' }, { type: 'SUPPORT_FACILITY', planetId: 'karabas' }, { type: 'STAGING_GROUNDS', planetId: 'kryndaer' }] });
  s = c.ok(s, { type: 'SETUP_INFRA', allianceId: b, items: [{ type: 'FORTIFICATION_LINE', planetId: 'tarkad-vindix' }, { type: 'SUPPORT_FACILITY', planetId: 'astarthem' }, { type: 'STAGING_GROUNDS', planetId: 'ikaron-prime' }] });
  s = c.ok(s, { type: 'SETUP_INFRA', allianceId: cc, items: [{ type: 'FORTIFICATION_LINE', planetId: 'marvinius' }, { type: 'SUPPORT_FACILITY', planetId: 'vikus-decima' }, { type: 'STAGING_GROUNDS', planetId: 'novamagnor' }] });
  s = c.ok(s, { type: 'SETUP_REVEAL_INFRA' });
  s = c.ok(s, { type: 'SETUP_W3_DONE' });
  s = c.exec(s, { type: 'SETUP_REVEAL_FLEETS' });
  const [fa, fb, fc] = s.fleets.map((f) => f.id);
  s = c.ok(s, { type: 'SETUP_FLEET_STARTS', starts: { [fa]: 'kryndaer', [fb]: 'novamagnor', [fc]: 'caltus-novem' } });
  s = c.exec(s, { type: 'SETUP_DAGGER_SWAP', a: 'masnet', b: 'karabas' });
  s = c.ok(s, { type: 'SETUP_REVEAL_FLEETS' });
  s = c.ok(s, { type: 'SETUP_W4_DONE' });
  s = c.ok(s, { type: 'SETUP_START' });
  return s;
}

function fullPhase(c: Collector, s: CampaignState, variant: 1 | 2) {
  const [a, b, cc] = s.alliances.map((x) => x.id);
  const [fa, fb, fc] = s.fleets.filter((f) => !f.reserve).map((f) => f.id);
  const [pa, pb] = s.players.map((p) => p.id);
  // Fehler bei der Befehlsvergabe
  s = c.exec(s, { type: 'OP_SET', fleetId: fa, slot: 2, op: { type: 'NONE' } });
  s = c.exec(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE' } });
  s = c.exec(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'SEIZE_POWER_BASE' } });
  s = c.exec(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'SEIZE_POWER_BASE', targetPlanetId: 'jawardet', targetAllianceId: b } });
  s = c.exec(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'SEIZE_POWER_BASE', targetPlanetId: 'kryndaer' } });
  s = c.exec(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'BOARDING_ACTION', targetPlanetId: 'kryndaer', targetAllianceId: b } });
  s = c.exec(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'VOID_LEAP' } });
  s = c.exec(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'RAISE_EDIFICES' } });
  s = c.exec(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'RAISE_EDIFICES', infraType: 'STAGING_GROUNDS' } });
  s = c.exec(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'KILL_TEAMS' } });
  s = c.exec(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'KILL_TEAMS', killTeamPlanetId: 'jawardet' } });
  s = c.exec(s, { type: 'OP_SET', fleetId: 'nix', slot: 1, op: { type: 'NONE' } });
  s = c.exec(s, { type: 'OPEN_TOME_REVEAL' });
  s = c.exec(s, { type: 'BATTLE_PROCESS', battleId: 'x' });
  s = c.exec(s, { type: 'EVENTS_GENERATE' });
  s = c.exec(s, { type: 'SCORE' });
  // gültige Befehle: A bombardiert C auf Kryndaer, B baut, C Kill Teams (Würfel)
  const at = variant === 1 ? 'kryndaer' : 'karabas';
  s = c.ok(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: variant === 1 ? 'PLANETARY_BOMBARDMENT' : 'SUPPLY_BASE_RAID', targetPlanetId: at, targetAllianceId: cc } });
  s = c.ok(s, { type: 'OP_SET', fleetId: fb, slot: 1, op: { type: 'RAISE_EDIFICES', infraType: 'FORTIFICATION_LINE' } });
  s = c.ok(s, { type: 'OP_SET', fleetId: fc, slot: 1, op: { type: 'KILL_TEAMS', killTeamPlanetId: 'caltus-novem' } });
  s = c.ok(s, { type: 'ADVANCE' });
  s = c.ok(s, { type: 'ADVANCE' }); // Reveal
  s = c.ok(s, { type: 'ADVANCE' }); // Edifices
  const battle = s.battles.find((x) => x.phaseNumber === s.phases.at(-1)!.number && x.kind === 'CAMPAIGN')!;
  s = c.exec(s, { type: 'BATTLE_ROLL', battleId: battle.id, what: 'TWIST' });
  s = c.ok(s, { type: 'BATTLE_ROLL', battleId: battle.id, what: 'THEATRE' });
  s = c.ok(s, { type: 'BATTLE_ROLL', battleId: battle.id, what: 'TWIST' });
  s = c.exec(s, { type: 'BATTLE_UPDATE', battleId: battle.id, update: { theatre: 'SPACEPORT' } });
  s = c.exec(s, { type: 'BATTLE_UPDATE', battleId: battle.id, update: { twistRoll: 9 } });
  s = c.exec(s, { type: 'BATTLE_UPDATE', battleId: battle.id, update: { attackers: [{ playerId: pb, faction: 'x' }] } });
  s = c.ok(s, { type: 'BATTLE_UPDATE', battleId: battle.id, update: { attackers: [{ playerId: pa, faction: 'Orks' }] } });
  s = c.exec(s, { type: 'BATTLE_UPDATE', battleId: battle.id, update: { mission: { source: 'LIST', externalName: '', missionId: 'nope' } } });
  s = c.exec(s, { type: 'BATTLE_BUNDLE', battleIds: [battle.id] });
  s = c.exec(s, { type: 'BATTLE_UNBUNDLE', battleId: battle.id, opId: 'x' });
  s = c.exec(s, { type: 'BATTLE_DECISION', battleId: battle.id, opId: battle.operationIds[0], decision: { type: 'DRAW' } });
  s = c.exec(s, { type: 'BATTLE_DECISION', battleId: battle.id, opId: 'x', decision: { type: 'DRAW' } });
  // Spieler-Entwürfe und Termine
  s = c.exec(s, { type: 'RESULT_DRAFT_SUBMIT', battleId: battle.id, playerId: pb, update: {} });
  s = c.exec(s, { type: 'RESULT_DRAFT_CONFIRM', battleId: battle.id, playerId: pa });
  s = c.exec(s, { type: 'RESULT_DRAFT_DISCARD', battleId: battle.id });
  s = c.exec(s, { type: 'RESULT_DRAFT_SUBMIT', battleId: battle.id, playerId: pa, update: {} });
  s = c.ok(s, { type: 'RESULT_DRAFT_SUBMIT', battleId: battle.id, playerId: pa, update: { vp: { attacker: 60, defender: 40 } } });
  s = c.exec(s, { type: 'RESULT_DRAFT_DISPUTE', battleId: battle.id, playerId: s.players[2].id, reason: '' });
  s = c.exec(s, { type: 'RESULT_DRAFT_DISPUTE', battleId: battle.id, playerId: s.players[2].id, reason: 'Falsch' });
  s = c.exec(s, { type: 'RESULT_DRAFT_CONFIRM', battleId: battle.id, playerId: pa });
  s = c.exec(s, { type: 'RESULT_DRAFT_DISCARD', battleId: battle.id });
  s = c.exec(s, { type: 'TIME_PROPOSE', battleId: battle.id, playerId: pa, times: [] });
  s = c.ok(s, { type: 'TIME_PROPOSE', battleId: battle.id, playerId: pa, times: ['2026-02-01T18:00:00Z'] });
  s = c.exec(s, { type: 'TIME_ACCEPT', battleId: battle.id, playerId: pa, time: '2026-02-01T18:00:00Z' });
  s = c.exec(s, { type: 'TIME_ACCEPT', battleId: battle.id, playerId: null, time: '2027-01-01T00:00:00Z' });
  s = c.ok(s, { type: 'TIME_ACCEPT', battleId: battle.id, playerId: null, time: '2026-02-01T18:00:00Z' });
  s = c.ok(s, { type: 'NOTE_ADD', allianceId: a, playerId: pa, text: 'Plan' });
  s = c.exec(s, { type: 'NOTE_ADD', allianceId: a, playerId: pa, text: ' ' });
  s = c.exec(s, { type: 'NOTE_DELETE', id: 'x' });
  s = c.ok(s, { type: 'NOTE_DELETE', id: s.allianceNotes!.at(-1)!.id });
  s = c.ok(s, { type: 'PROFILE_UPDATE', playerId: pa, update: { faction: 'Orks' } });
  s = c.exec(s, { type: 'PROFILE_UPDATE', playerId: pa, update: { nickname: 'P2' } });
  s = c.ok(s, { type: 'COMMANDER_UPDATE', playerId: pa, name: 'Grax', title: 'Warboss', portrait: null });
  s = c.ok(s, { type: 'MARK_ADD', kind: 'SCAR', playerId: pa, title: 'Hinkt', reason: '', phase: 1, battleId: null });
  s = c.exec(s, { type: 'MARK_ADD', kind: 'HONOR', playerId: pa, title: '', reason: '', phase: 1, battleId: null });
  s = c.ok(s, { type: 'MARK_REMOVE', kind: 'SCAR', playerId: pa, id: s.players[0].scars!.at(-1)!.id });
  s = c.exec(s, { type: 'MARK_REMOVE', kind: 'HONOR', playerId: pa, id: 'x' });
  s = c.ok(s, { type: 'FLEET_COMMANDER', fleetId: fa, phase: 2, playerId: pa });
  // Ergebnis durch den Warmaster
  s = c.ok(s, { type: 'BATTLE_UPDATE', battleId: battle.id, update: { vp: { attacker: 80, defender: 50 } } });
  s = c.ok(s, { type: 'BATTLE_UPDATE', battleId: battle.id, update: { victorOverride: 'DEFENDER' } });
  s = c.ok(s, { type: 'BATTLE_UPDATE', battleId: battle.id, update: { victorOverride: null } });
  s = c.exec(s, { type: 'BATTLE_DECISION', battleId: battle.id, opId: battle.operationIds[0], decision: { type: 'DRAW' } });
  s = c.ok(s, { type: 'BATTLE_DECISION', battleId: battle.id, opId: battle.operationIds[0], decision: variant === 1 ? { type: 'BOMBARD_A', slot: 1, roll: null, shift: 2 } : { type: 'RAID_A', strikes: [{ planetId: at, roll: null }, { planetId: at, roll: null }, { planetId: at, roll: null }], shift: 0 } });
  s = c.ok(s, { type: 'ADVANCE' }); // → PROCESS
  s = c.exec(s, { type: 'ADVANCE' });
  s = c.exec(s, { type: 'BATTLE_PROCESS', battleId: battle.id });
  s = c.ok(s, { type: 'BATTLE_DECISION', battleId: battle.id, opId: battle.operationIds[0], decision: variant === 1 ? { type: 'BOMBARD_A', slot: 1, roll: null, shift: 0 } : { type: 'RAID_A', strikes: [{ planetId: at, roll: null }], shift: 0 } });
  s = c.ok(s, { type: 'PROCESS_ORDER', battleIds: [battle.id] });
  s = c.ok(s, { type: 'BATTLE_PROCESS', battleId: battle.id });
  s = c.exec(s, { type: 'BATTLE_PROCESS', battleId: battle.id });
  s = c.exec(s, { type: 'BATTLE_UPDATE', battleId: battle.id, update: { vp: { attacker: 1, defender: 2 } } });
  s = c.ok(s, { type: 'ADVANCE' }); // → ARRIVAL
  s = c.exec(s, { type: 'INTERCEPT_ADD', opId: 'x', allianceId: a });
  s = c.ok(s, { type: 'ADVANCE' }); // → RESISTANCE
  s = c.ok(s, { type: 'ADVANCE' }); // Kill Teams → RESULTS
  s = c.exec(s, { type: 'ADVANCE' });
  s = c.exec(s, { type: 'EVENTS_GENERATE' });
  s = c.ok(s, { type: 'SCORE' });
  s = c.ok(s, { type: 'EVENTS_GENERATE' });
  s = c.exec(s, { type: 'EVENTS_GENERATE' });
  s = c.exec(s, { type: 'EVENT_APPLY', eventId: 'x', data: {} });
  if (s.events.some((e) => e.status === 'PENDING')) s = c.exec(s, { type: 'ADVANCE' });
  for (const e of s.events.filter((x) => x.status === 'PENDING')) {
    s = c.exec(s, { type: 'EVENT_APPLY', eventId: e.id, data: {} });
    if (s.events.find((x) => x.id === e.id)?.status === 'PENDING') s = c.exec(s, { type: 'EVENT_DISCARD', eventId: e.id });
  }
  s = c.ok(s, { type: 'ADVANCE' }); // → MOVE
  s = c.exec(s, { type: 'MOVE_SET', fleetId: fa, path: ['jawardet'] });
  s = c.exec(s, { type: 'MOVE_SET', fleetId: fa, path: ['karabas', 'norallus'] });
  s = c.ok(s, { type: 'MOVE_SET', fleetId: fa, path: [variant === 1 ? 'karabas' : 'norallus'] });
  s = c.ok(s, { type: 'ADVANCE' }); // → BUILD
  s = c.exec(s, { type: 'MOVE_SET', fleetId: fa, path: [] });
  s = c.ok(s, { type: 'BUILD_START' });
  s = c.exec(s, { type: 'BUILD_START' });
  const order = s.phases.at(-1)!.buildOrder;
  s = c.exec(s, { type: 'BUILD_SET', allianceId: order[1], choice: 'SKIP' });
  s = c.exec(s, { type: 'BUILD_SET', allianceId: order[0], choice: { type: 'STRONGHOLD', planetId: 'masnet' } });
  s = c.exec(s, { type: 'BUILD_SET', allianceId: order[0], choice: { type: 'FORTIFICATION_LINE', planetId: 'jawardet' } });
  s = c.ok(s, { type: 'BUILD_SET', allianceId: order[0], choice: 'SKIP' });
  s = c.exec(s, { type: 'BUILD_SET', allianceId: order[0], choice: 'SKIP' });
  s = c.ok(s, { type: 'ADVANCE' }); // → nächste Phase
  return s;
}

/** Alle Zeilen übersetzt: unverändert bleiben dürfen nur Zeilen, die schon englisch sind (Theatre/Twist-Namen, reine PL-Änderungen, Würfelkontexte) */
function expectTranslated(lines: Iterable<string>) {
  const same: string[] = [];
  const german: string[] = [];
  for (const l of lines) {
    const en = translateMessage('en', l);
    if (en === l && germanIn(l)) same.push(l);
    const g = germanIn(en);
    if (g) german.push(`${l} → ${en} [${g}]`);
  }
  expect(same, 'unübersetzt').toEqual([]);
  expect(german, 'deutsche Reste').toEqual([]);
}

/** Phase 1 bis Schritt 3 (alle Flotten ohne Befehl), optional mit PL-Overrides vor der Wertung (negativ = Grün) */
function atResults(c: Collector, pl: Record<string, number> = {}) {
  let s = setupCampaign(c);
  for (let i = 0; i < 7; i++) s = c.ok(s, { type: 'ADVANCE' });
  const [a, , cc] = s.alliances.map((x) => x.id);
  for (const [planetId, v] of Object.entries(pl)) s = c.exec(s, { type: 'OVERRIDE_PL', allianceId: v > 0 ? a : cc, planetId, value: Math.abs(v) });
  return c.ok(s, { type: 'SCORE' });
}

describe('Engine-Meldungen auf Englisch (N5.4)', () => {
  it('jedes Muster hat auf beiden Seiten dieselben Platzhalter', () => {
    expect(EN_PATTERNS.length).toBeGreaterThan(300);
    for (const [de, en] of EN_PATTERNS) expect(placeholders(en), de).toEqual(placeholders(de));
    const des = EN_PATTERNS.map(([de]) => de);
    expect(new Set(des).size).toBe(des.length);
  });

  it('kein Muster wird von einem anderen verdeckt', () => {
    const fill = (t: string) => t.replace(/\{(\d+)\}/g, (_, i: string) => `Q${i}q`);
    const shadowed = EN_PATTERNS.filter(([de, en]) => translateMessage('en', fill(de)) !== fill(en)).map(([de]) => `${de} → ${translateMessage('en', fill(de))}`);
    expect(shadowed).toEqual([]);
  });

  it('übersetzt Platzhalter rekursiv und bevorzugt spezifische Muster', () => {
    expect(translateMessage('en', 'Rot PL Masnet: 1→2 (Seize Power Base, Verteidigung, letzte Phase doppelt)')).toBe('Rot PL Masnet: 1→2 (Seize Power Base, defence, doubled in the last phase)');
    expect(translateMessage('en', 'Masnet ist von Karabas aus nicht verbunden')).toBe('Masnet is not connected to Karabas');
    expect(translateMessage('en', 'Ungespielte Schlacht auf Masnet: Angreifer siegt')).toBe('Unplayed battle on Masnet: Attacker wins');
    expect(translateMessage('en', 'Die Karte braucht einen Namen. Mindestens 6 Planeten nötig (aktuell 2).')).toBe('The map needs a name. At least 6 planets required (currently 2).');
    expect(translateMessage('en', 'Rot: Strongholds können hier nicht gebaut werden')).toBe('Rot: Strongholds cannot be built here');
    expect(translateMessage('de', 'Phase 2 beginnt')).toBe('Phase 2 beginnt');
  });

  it('übersetzt die Meldungen eines kompletten Kampagnenablaufs', () => {
    const lines = new Set<string>();
    for (const random of [4, 6, 1]) {
      const c = new Collector(random);
      let s = setupCampaign(c);
      s = fullPhase(c, s, 1);
      s = fullPhase(c, s, 2);
      const [a, b] = s.alliances.map((x) => x.id);
      // Overrides und Stammdaten während der Kampagne
      s = c.exec(s, { type: 'OVERRIDE_PL', allianceId: a, planetId: 'masnet', value: 1 }, []);
      s = c.exec(s, { type: 'OVERRIDE_SLOT', planetId: 'masnet', slot: 0, destroyed: true, infra: null });
      s = c.exec(s, { type: 'OVERRIDE_SLOT', planetId: 'masnet', slot: 1, destroyed: false, infra: { type: 'SUPPORT_FACILITY', allianceId: b } });
      s = c.exec(s, { type: 'OVERRIDE_SLOT', planetId: 'masnet', slot: 1, destroyed: false, infra: null });
      s = c.exec(s, { type: 'OVERRIDE_SLOT', planetId: 'masnet', slot: 9, destroyed: false, infra: null });
      s = c.exec(s, { type: 'OVERRIDE_FLEET', fleetId: s.fleets[0].id, planetId: 'masnet' });
      s = c.exec(s, { type: 'OVERRIDE_STRONGHOLD', allianceId: b, destroyed: false });
      s = c.exec(s, { type: 'OVERRIDE_PLANET_DESTROYED', planetId: 'felgris-secundas', destroyed: true });
      s = c.exec(s, { type: 'OVERRIDE_PLANET_DESTROYED', planetId: 'felgris-secundas', destroyed: false });
      s = c.exec(s, { type: 'OVERRIDE_MODIFIER_ADD', kind: 'DEFIANT_ZEAL', phaseNumber: 3, allianceId: a });
      s = c.exec(s, { type: 'OVERRIDE_MODIFIER_REMOVE', id: 'x' });
      s = c.exec(s, { type: 'OVERRIDE_POINTS', phaseNumber: 1, allianceId: a, points: 30 });
      s = c.exec(s, { type: 'OVERRIDE_POINTS', phaseNumber: 9, allianceId: a, points: 30 });
      s = c.exec(s, { type: 'TOGGLES_UPDATE', toggles: s.toggles });
      s = c.exec(s, { type: 'PLAYER_UPSERT', id: s.players[0].id, data: {}, allianceId: b });
      s = c.exec(s, { type: 'PLAYER_DELETE', id: s.players[1].id });
      s = c.exec(s, { type: 'FLEET_UPDATE', id: s.fleets[0].id, name: 'Waaagh' });
      s = c.exec(s, { type: 'FLEET_RESERVE_SET', allianceId: a, count: 1 });
      s = c.exec(s, { type: 'FLEET_ACTIVATE', fleetId: s.fleets.find((f) => f.reserve)?.id ?? 'x', planetId: 'jawardet' });
      s = c.exec(s, { type: 'FLEET_ACTIVATE', fleetId: s.fleets.find((f) => f.reserve)?.id ?? 'x', planetId: 'norallus' });
      s = c.exec(s, { type: 'FLEET_SET_COUNT', allianceId: a, count: 2 });
      s = c.exec(s, { type: 'FLEET_PLACE', fleetId: s.fleets.at(-1)!.id, planetId: 'norallus' });
      s = c.exec(s, { type: 'PHASE_UPDATE', phase: 1, notes: 'x' });
      s = c.exec(s, { type: 'ALLIANCE_DELETE', id: a });
      s = c.exec(s, { type: 'CAMPAIGN_END' });
      s = c.exec(s, { type: 'MEDAL_OVERRIDE', medal: 'STAR', allianceId: null });
      for (const l of c.lines) lines.add(l);
    }
    // Kampagnenende mit Punkteberechnung (1 Phase)
    {
      const c = new Collector(4);
      let s = setupCampaign(c, { phases: 1 });
      s = c.ok(s, { type: 'ADVANCE' });
      for (let i = 0; i < 6; i++) s = c.exec(s, { type: 'ADVANCE' });
      s = c.ok(s, { type: 'SCORE' });
      s = c.exec(s, { type: 'EVENTS_GENERATE' });
      s = c.exec(s, { type: 'ADVANCE' });
      s = c.ok(s, { type: 'CAMPAIGN_END' });
      s = c.exec(s, { type: 'MEDAL_OVERRIDE', medal: 'STAR', allianceId: null });
      s = c.exec(s, { type: 'MEDAL_OVERRIDE', medal: 'STAR', allianceId: s.alliances[0].id });
      s = c.exec(s, { type: 'TIEBREAK_DECIDE', winnerAllianceId: 'x' });
      for (const l of c.lines) lines.add(l);
    }

    expectTranslated(lines);
    expect(lines.size).toBeGreaterThan(150);
  });

  it('übersetzt Kurztexte aus den Engine-Daten', () => {
    const texts = [
      ...Object.values(EVENTS).map((e) => e.summary),
      ...Object.values(OUTCOME_SUMMARY).flatMap((o) => [o.A, o.D]),
      DRAW_SUMMARY,
      ...HOUSE_RULES.flatMap((r) => [r.title, r.standard, r.alternative]),
      ...Object.values(AUTO_HONORS).flatMap((h) => [h.title, h.reason]),
      ...MISSION_TEMPLATES.flatMap((m) => [m.name, m.note]),
      ...DEFAULT_BATTLE_SIZES.map((b) => b.duration),
      ...mapWarnings({ ...VESPATOR_MAP, planets: VESPATOR_MAP.planets.slice(0, 6) }),
    ].filter((t): t is string => !!t);
    const stay = new Set(['Veteran', 'Pariah Nexus', 'Leviathan', 'Kill Team', 'Defiant Zeal', 'Roll-off', '4 h']);
    for (const t of texts) {
      const en = translateMessage('en', t);
      if (!stay.has(t)) expect(en, t).not.toBe(t);
      expect(germanIn(en), `${t} → ${en}`).toBeNull();
    }
    expect(translateMessage('en', 'Unaufhaltsam')).toBe('Unstoppable');
    expect(translateMessage('en', 'Weltenbrecher')).toBe('Worldbreaker');
    expect(translateMessage('en', 'Bollwerk')).toBe('Bulwark');
  });

  it('übersetzt Kartenfehler, Missionsnamen, Operationen und Berechtigungen', () => {
    const bad: MapDef = {
      ...VESPATOR_MAP,
      name: ' ',
      planets: [
        { ...VESPATOR_MAP.planets[0], slots: 9, theatres: [], x: 200 },
        { ...VESPATOR_MAP.planets[0], name: 'Norallus', theatres: ['SPACEPORT', 'SPACEPORT', 'NOPE' as TheatreId] },
        { ...VESPATOR_MAP.planets[1], name: '' },
      ],
      connections: [['norallus', 'norallus'], ['norallus', 'x'], ['norallus', 'x']] as [string, string][],
    };
    const errs = validateMap(bad);
    expect(errs.length).toBeGreaterThan(8);
    const msgs = [...errs, errs.join(' ')];
    const c = new Collector();
    const s = setupCampaign(c);
    const st = { meta: s.meta };
    for (const m of [
      { source: 'LIST', externalName: '', missionId: 'tpl-bfg' },
      { source: 'LIST', externalName: '', missionId: 'nope' },
      { source: 'SPACE', externalName: '' },
      { source: 'SPACE', externalName: 'BFG' },
      { source: 'EXTERNAL', externalName: '' },
    ] as const)
      msgs.push(missionLabel(st, { mission: m, attackType: null, kind: 'CAMPAIGN' }));
    msgs.push(missionLabel(st, { mission: { source: 'VESPATOR', externalName: '' }, attackType: null, kind: 'INTERCEPT' }));
    const base = { id: 'o', fleetId: s.fleets[0].id, allianceId: s.alliances[0].id, slot: 1 as const, originPlanetId: 'kryndaer', isDefault: true, revealed: true, status: 'PLANNED' as const };
    msgs.push(describeOp({ state: s }, { ...base, type: 'BATTLE', attackType: 'SEIZE_POWER_BASE', targetPlanetId: 'masnet', targetAllianceId: s.alliances[1].id }));
    msgs.push(describeOp({ state: s }, { ...base, type: 'RAISE_EDIFICES', infraType: 'STAGING_GROUNDS' }));
    msgs.push(describeOp({ state: s }, { ...base, type: 'LOGISTICAL_AUXILIA' }));
    msgs.push(describeOp({ state: s }, { ...base, type: 'KILL_TEAMS', killTeamPlanetId: 'masnet', killTeamMode: 'GAME' }));
    msgs.push(describeOp({ state: s }, { ...base, type: 'NONE' }));
    const p = s.players[0];
    for (const cmd of [
      { type: 'SCORE' },
      { type: 'OP_SET', fleetId: 'x', slot: 1, op: { type: 'NONE' } },
      { type: 'BUILD_SET', allianceId: 'x', choice: 'SKIP' },
      { type: 'TIME_PROPOSE', battleId: 'x', playerId: 'x', times: [] },
      { type: 'NOTE_ADD', allianceId: 'x', playerId: p.id, text: '' },
      { type: 'NOTE_DELETE', id: 'x' },
      { type: 'PROFILE_UPDATE', playerId: 'x', update: {} },
    ] as Command[])
      msgs.push(authorizePlayer(s, p, cmd)!);
    msgs.push(authorizePlayer(s, { ...p, active: false }, { type: 'NOTE_DELETE', id: 'x' })!);
    for (const m of msgs) {
      const en = translateMessage('en', m);
      expect(en, m).not.toBe(m);
      expect(germanIn(en), `${m} → ${en}`).toBeNull();
    }
  });

  it('übersetzt Events (Fortunes of War, Perils of Power, Desperate Measures)', () => {
    const c = new Collector(4);
    const base = atResults(c);
    const [a, b] = base.alliances.map((x) => x.id);
    const [fa, fb, fc] = base.fleets.map((f) => f.id);
    const [pa, , pc] = base.players.map((p) => p.id);
    c.exec(base, { type: 'EVENTS_GENERATE' }, [4]); // fehlender Würfel (Zehner)
    const fw = (code: string, tries: EventData[]) => {
      const [x, y] = code.slice(3).split('').map(Number);
      let s = c.ok(base, { type: 'EVENTS_GENERATE' }, [6, x, y]);
      const e = s.events.find((ev) => ev.status === 'PENDING')!;
      for (const data of tries) s = c.exec(s, { type: 'EVENT_APPLY', eventId: e.id, data });
      c.exec(s, { type: 'EVENT_DISCARD', eventId: e.id });
      return s;
    };
    fw('FW_11', [{ builds: { [a]: { type: 'STRONGHOLD', planetId: 'jawardet' } } }, { moves: { [fa]: 'jawardet' } }, { builds: { [a]: { type: 'FORTIFICATION_LINE', planetId: 'jawardet' } }, moves: { [fa]: 'karabas' } }]);
    fw('FW_12', [{}]);
    fw('FW_13', [{ stronghold: { [a]: 'norallus' } }, { stronghold: { [a]: 'masnet' } }]);
    fw('FW_21', [{}]);
    fw('FW_22', [{}]);
    fw('FW_23', [{}]);
    fw('FW_31', [{}, { positions: { [fa]: 'karabas', [fb]: 'norallus', [fc]: 'jawardet' } }, { positions: { [fa]: 'jawardet', [fb]: 'norallus', [fc]: 'jawardet' } }]);
    fw('FW_32', [{ defections: { [pa]: b }, fleetAssignments: { [fb]: pc } }, { defections: { [pa]: b } }]);
    fw('FW_33', [{}]);
    // Rot dominiert: Perils of Power
    const dom = atResults(c, { masnet: 4, karabas: 4, 'tarkad-vindix': 4, jawardet: 4, novamagnor: 4, astarthem: 4, 'ikaron-prime': 4 });
    const perils: [number, EventData[]][] = [
      [1, [{ planetId: 'x' }, { planetId: 'masnet' }]],
      [2, [{}]],
      [3, [{}]],
    ];
    for (const [d3, tries] of perils) {
      let s = c.ok(dom, { type: 'EVENTS_GENERATE' }, [4, d3, 1]);
      const e = s.events.find((ev) => ev.status === 'PENDING');
      if (e) for (const data of tries) s = c.exec(s, { type: 'EVENT_APPLY', eventId: e.id, data });
    }
    // Grün liegt zurück: Desperate Measures
    const trail = atResults(c, { 'caltus-novem': -1, 'vikus-decima': -1, marvinius: -1, novamagnor: -1, kryndaer: -1, karabas: -1, 'ikaron-prime': -1, astarthem: -1 });
    const t = trail.alliances.map((x) => x.id);
    const desperate: [number, EventData[]][] = [
      [1, [{}, { planetId: 'masnet', opponentId: t[2] }, { planetId: 'jawardet', opponentId: t[1] }, { planetId: 'masnet', opponentId: t[0] }]],
      [2, [{}]],
      [3, [{ relocations: [{ fromPlanetId: 'masnet', slot: 0, toPlanetId: 'masnet' }] }, { extra: { type: 'STRONGHOLD', planetId: 'masnet' } }, { relocations: [{ fromPlanetId: 'marvinius', slot: 0, toPlanetId: 'masnet' }], extra: { type: 'STAGING_GROUNDS', planetId: 'karabas' } }]],
    ];
    for (const [d3, tries] of desperate) {
      let s = c.ok(trail, { type: 'EVENTS_GENERATE' }, [4, d3, 1]);
      const e = s.events.find((ev) => ev.status === 'PENDING');
      if (e) for (const data of tries) s = c.exec(s, { type: 'EVENT_APPLY', eventId: e.id, data });
      if (e) c.exec(s, { type: 'EVENT_DISCARD', eventId: e.id });
    }
    const lines = [...c.lines];
    expect(lines.some((l) => l.startsWith('Event: Cult Uprisings'))).toBe(true);
    expect(lines.some((l) => l.startsWith('Event: A Costly Bargain'))).toBe(true);
    expectTranslated(lines);
  });

  it('übersetzt Void Leap, Abfangen, Kill-Team-Spiele und ungespielte Schlachten', () => {
    const c = new Collector(4);
    let s = setupCampaign(c);
    const [a, b, cc] = s.alliances.map((x) => x.id);
    const [fa, fb, fc] = s.fleets.map((f) => f.id);
    s = c.ok(s, { type: 'TOGGLES_UPDATE', toggles: { ...s.toggles, voidLeapIntercept: true, houseRules: { F3_BOARDING_NEEDS_FLEET: true, F7_EDIFICES_BLOCK: true } } });
    s = c.exec(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'BOARDING_ACTION', targetPlanetId: 'kryndaer', targetAllianceId: b } });
    s = c.exec(s, { type: 'OP_SET', fleetId: fb, slot: 1, op: { type: 'RAISE_EDIFICES', infraType: 'STAGING_GROUNDS' } });
    s = c.ok(s, { type: 'TOGGLES_UPDATE', toggles: { ...s.toggles, load: { maxPerPlayer: 0, minOnePerAlliance: true }, houseRules: {} } });
    s = c.ok(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'VOID_LEAP', destinationPlanetId: 'novamagnor' } });
    s = c.ok(s, { type: 'OP_SET', fleetId: fb, slot: 1, op: { type: 'BATTLE', attackType: 'SEIZE_POWER_BASE', targetPlanetId: 'novamagnor', targetAllianceId: cc } });
    s = c.ok(s, { type: 'OP_SET', fleetId: fc, slot: 1, op: { type: 'KILL_TEAMS', killTeamPlanetId: 'caltus-novem', killTeamMode: 'GAME' } });
    s = c.ok(s, { type: 'ADVANCE' });
    s = c.ok(s, { type: 'ADVANCE' });
    s = c.ok(s, { type: 'ADVANCE' });
    const bt = s.battles.find((x) => x.kind === 'CAMPAIGN')!;
    s = c.exec(s, { type: 'BATTLE_UPDATE', battleId: bt.id, update: { attackers: [{ playerId: s.players[1].id, faction: 'Necrons' }] } });
    s = c.ok(s, { type: 'ADVANCE' }); // ungespielt → Angreifer siegt
    s = c.exec(s, { type: 'BATTLE_PROCESS', battleId: bt.id });
    s = c.ok(s, { type: 'BATTLE_DECISION', battleId: bt.id, opId: bt.operationIds[0], decision: { type: 'SEIZE_A', captureSlot: 0, fallbackType: null, bonusType: 'STRONGHOLD', shift: 0 } });
    s = c.ok(s, { type: 'BATTLE_PROCESS', battleId: bt.id }); // Zusatzbau wird ignoriert (PL < 3)
    s = c.ok(s, { type: 'ADVANCE' }); // → ARRIVAL
    const leap = s.phases[0].operations.find((o) => o.type === 'VOID_LEAP')!;
    s = c.exec(s, { type: 'INTERCEPT_ADD', opId: leap.id, allianceId: a });
    s = c.exec(s, { type: 'INTERCEPT_ADD', opId: leap.id, allianceId: cc });
    s = c.ok(s, { type: 'INTERCEPT_ADD', opId: leap.id, allianceId: b });
    s = c.exec(s, { type: 'INTERCEPT_ADD', opId: leap.id, allianceId: b });
    const ic = s.battles.find((x) => x.kind === 'INTERCEPT')!;
    const won = c.ok(s, { type: 'BATTLE_UPDATE', battleId: ic.id, update: { vp: { attacker: 50, defender: 10 } } });
    c.ok(won, { type: 'ADVANCE' });
    s = c.ok(s, { type: 'ADVANCE' }); // nicht gespielt → Sprung
    s = c.ok(s, { type: 'ADVANCE' }); // Kill-Team-Gefechte ungespielt
    const lines = [...c.lines];
    expect(lines.some((l) => l.includes('abgefangen'))).toBe(true);
    expect(lines.some((l) => l.startsWith('Kill-Team-Gefecht gegen'))).toBe(true);
    expectTranslated(lines);
  });

  it('übersetzt Setup-Konflikte', () => {
    const c = new Collector(4);
    let s = createCampaignState({ name: 'Test', phaseCount: 6, allianceCount: 3, now: '2026-01-01T00:00:00Z' });
    for (const [name, color] of [['Rot', '#f00'], ['Blau', '#00f'], ['Grün', '#0f0']]) s = c.ok(s, { type: 'ALLIANCE_UPSERT', name, color });
    for (const al of s.alliances) s = c.ok(s, { type: 'FLEET_SET_COUNT', allianceId: al.id, count: 1 });
    s = c.ok(s, { type: 'SETUP_W0_DONE' });
    const all = ['norallus', 'karabas', 'kryndaer', 'felgris-secundas', 'caltus-novem', 'marvinius', 'vikus-decima'];
    for (const al of s.alliances) s = c.ok(s, { type: 'SETUP_STRONGHOLDS', allianceId: al.id, strongholdPlanetId: 'masnet', pl3: all.slice(0, 3), pl2: all.slice(3) });
    s = c.ok(s, { type: 'SETUP_REVEAL_STRONGHOLDS' });
    expect(s.setup.messages.length).toBe(1);
    expectTranslated(c.lines);
  });
});
