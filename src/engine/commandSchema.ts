import { z } from 'zod';
import type { Command } from './commands';
import { isIsoDate } from './logTime';
import { checkCommandInput, sanitizeCommand } from './playerActions';

/**
 * S2 (Architektur-Review): Schema jedes Commands (zod, Diskriminator `type`). Geprüft wird die Form – Typen,
 * Längen, Zahlenbereiche, strikte ISO-Zeitpunkte –, die Regelprüfung bleibt in der Engine. Unbekannte Felder
 * werden entfernt (nie durchgereicht), `__proto__` fällt weg, `constructor`/`prototype` als Schlüssel werden abgelehnt. Größe, Verschachtelung und
 * die engeren Grenzen für Spieler prüft weiterhin `checkCommandInput`, Steuerzeichen entfernt `sanitizeCommand`.
 */

/** Gemeinsame Meldung bei Formfehlern; der Pfad zeigt das betroffene Feld */
export const INVALID_INPUT = 'Ungültige Eingabe ({0})';

// ─── Bausteine ─────────────────────────────────────────────────────────────

/** Obergrenzen für Freitexte (Spieler zusätzlich: MAX_PLAYER_TEXT in checkCommandInput) */
/** Namen, Titel, Fraktionen: großzügig begrenzt – die Engine kürzt auf ihre eigenen Längen */
const NAME = 1000;
const TEXT = 5000;
const LONG = 100_000;
const LIST = 500;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
/** Kennungen (Allianz, Spieler, Schlacht, Planet, Upload …): kurz, ohne Leer- und Sonderzeichen */
const ID_RE = /^[\w.:@+-]*$/;
const id = z.string().max(120).regex(ID_RE);
const nid = id.nullable();
/** Schlüssel von Zuordnungen (Record) – nie Prototyp-Namen */
const key = z
  .string()
  .min(1)
  .max(120)
  .regex(ID_RE)
  .refine((k) => !FORBIDDEN_KEYS.has(k));
/** Regel-Codes (Angriffsart, Operation, Theatre, Medaille, Ereignis …); Module dürfen eigene verwenden */
const code = z
  .string()
  .max(64)
  .regex(/^[A-Za-z0-9_-]*$/);
const text = (max = TEXT) => z.string().max(max);
const int = (min = -1_000_000, max = 1_000_000) => z.number().int().min(min).max(max);
const num = (min = -1_000_000, max = 1_000_000) => z.number().min(min).max(max);
const list = <T extends z.ZodType>(item: T, max = LIST) => z.array(item).max(max);
const rec = <T extends z.ZodType>(value: T) => z.record(key, value);
const lang = z.enum(['de', 'en', 'fr', 'es', 'pl']);

/** Zeitpunkt: strikt ISO (Datum oder Datum mit Uhrzeit), Jahr 2000–2100 */
const isoDate = z.string().max(40).refine(isIsoDate, { message: 'date' });
const optDate = isoDate.nullable().optional();
/** „Gespielt am“: leer bedeutet „kein Datum“ (wie bisher) */
const playedAt = z.union([isoDate, z.literal('')]).nullable();

/** Beliebiger, begrenzter JSON-Wert (Modul-Aktionen, Modul-Commands) */
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
const json: z.ZodType<Json> = z.lazy(() => z.union([text(), z.number(), z.boolean(), z.null(), list(json, 200), z.record(key, json)]));

const textTr = z.object({ de: text(LONG).optional(), en: text(LONG).optional(), fr: text(LONG).optional(), es: text(LONG).optional(), pl: text(LONG).optional() });
const dispatchTrEntry = z.object({ title: text(NAME), body: text(LONG) });
const dispatchTr = z.object({ de: dispatchTrEntry.optional(), en: dispatchTrEntry.optional(), fr: dispatchTrEntry.optional(), es: dispatchTrEntry.optional(), pl: dispatchTrEntry.optional() });

/** Benachrichtigungen: nur bekannte Kategorien; andere Werte als Wahrheitswerte werden ignoriert (wie bisher) */
const flag = z.boolean().optional().catch(undefined);
const notify = z.object({ PHASE: flag, RESULTS: flag, DEADLINES: flag, PERSONAL: flag });
const participant = z.object({ playerId: id, faction: text(NAME) });
// VP und Verschiebung: nur endliche, begrenzte Zahlen – ganze Zahl und Bereich prüft die Engine mit eigener Meldung
const vp = z.object({ attacker: num(-100_000, 100_000), defender: num(-100_000, 100_000) });
const battleReady = z.object({ attacker: z.boolean(), defender: z.boolean() });
const victor = z.enum(['ATTACKER', 'DEFENDER', 'DRAW']);
const side = z.enum(['ATTACKER', 'DEFENDER']);
const battleGame = z.object({
  id,
  attackers: list(participant, 50),
  defenders: list(participant, 50),
  playedAt,
  size: nid,
  missionName: text(NAME),
  vp: vp.nullable(),
  battleReady,
  report: text(),
  photos: list(id, 50).optional(),
});
const battleUpdate = z.object({
  attackers: list(participant, 50).optional(),
  defenders: list(participant, 50).optional(),
  playedAt: playedAt.optional(),
  size: nid.optional(),
  mission: z.object({ source: z.enum(['VESPATOR', 'EXTERNAL', 'LIST', 'SPACE']), externalName: text(NAME), missionId: id.optional() }).optional(),
  theatre: code.nullable().optional(),
  theatreRoll: int(0, 100).nullable().optional(),
  twistRoll: int(0, 100).nullable().optional(),
  vp: vp.nullable().optional(),
  battleReady: battleReady.optional(),
  victorOverride: victor.nullable().optional(),
  report: text().optional(),
  notes: text().optional(),
  photos: list(id, 50).optional(),
  games: list(battleGame, 20).optional(),
});
/** Outcome-Entscheidung: alle Felder der Varianten optional, die Engine prüft die Kombination */
const outcomeDecision = z.object({
  type: code,
  captureSlot: int(0, 20).nullable().optional(),
  fallbackType: code.nullable().optional(),
  bonusType: code.nullable().optional(),
  shift: num(-10, 10).optional(),
  build: z.object({ type: code, planetId: id }).nullable().optional(),
  redistributions: list(id, 50).optional(),
  bonusPlanetId: nid.optional(),
  otherPlanetId: nid.optional(),
  direction: z.enum(['OUT', 'IN']).optional(),
  slots: list(int(0, 20), 20).optional(),
  slot: int(0, 20).nullable().optional(),
  roll: int(0, 100).nullable().optional(),
  planetId: nid.optional(),
  strikes: list(z.object({ slot: int(0, 20).optional(), planetId: id.optional(), roll: int(0, 100).nullable().optional() }), 20).optional(),
  reducePlanetId: nid.optional(),
  targetFleetId: nid.optional(),
  path: list(id, 20).optional(),
  ownFleetId: nid.optional(),
  toPlanetId: nid.optional(),
});
const opInput = z.object({
  type: code,
  attackType: code.optional(),
  targetPlanetId: id.optional(),
  targetAllianceId: id.optional(),
  targetFleetId: id.optional(),
  destinationPlanetId: id.optional(),
  infraType: code.optional(),
  killTeamPlanetId: id.optional(),
  killTeamMode: z.enum(['DICE', 'GAME']).optional(),
});
const infraAt = z.object({ type: code, planetId: id });
const eventData = z.object({
  builds: rec(infraAt.nullable()).optional(),
  moves: rec(nid).optional(),
  stronghold: rec(nid).optional(),
  planetIds: list(id, 50).optional(),
  positions: rec(id).optional(),
  defections: rec(id).optional(),
  fleetAssignments: rec(id).optional(),
  planetId: id.optional(),
  opponentId: id.optional(),
  relocations: list(z.object({ fromPlanetId: id, slot: int(0, 20), toPlanetId: id }), 50).optional(),
  extra: infraAt.nullable().optional(),
  targetAllianceId: id.optional(),
});
const customEffect = z.object({
  kind: code,
  alliance: id.nullable().optional(),
  planet: id.optional(),
  delta: int(-100, 100).optional(),
  infra: code.optional(),
  modifier: code.optional(),
});
const customEventDef = z.object({
  id,
  name: text(NAME),
  description: text(),
  effects: list(customEffect, 20),
  phase: int(0, 100).nullable(),
  replaces: code.nullable(),
  target: nid,
});
const stage = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('SETUP'), step: code }),
  z.object({ kind: z.literal('PHASE'), phase: int(0, 100), step: code }),
  z.object({ kind: z.literal('TIEBREAK') }),
  z.object({ kind: z.literal('ENDED') }),
]);
const planetDef = z.object({
  id,
  name: text(NAME),
  system: text(NAME),
  slots: int(0, 100),
  theatres: list(code, 20),
  x: num(-10_000, 10_000),
  y: num(-10_000, 10_000),
  portrait: nid.optional(),
  landscape: nid.optional(),
});
const mapDef = z.object({
  name: text(NAME),
  template: z.string().max(64).nullable(),
  background: text(64).nullable(),
  planets: list(planetDef, 200),
  connections: list(z.tuple([id, id]), 2000),
});
const crusadeRules = z.object({ enabled: z.boolean(), xpParticipation: int(0, 1000), xpWin: int(0, 1000), xpDraw: int(0, 1000), xpMarked: int(0, 1000) });
const toggles = z.object({
  events: z.object({ fortunesOfWar: z.boolean(), perilsOfPower: z.boolean(), desperateMeasures: z.boolean(), disabled: list(code, 100) }),
  theatreTwists: z.boolean(),
  medals: z.boolean(),
  operations: z.object({ voidLeap: z.boolean(), raiseEdifices: z.boolean(), logisticalAuxilia: z.boolean(), killTeams: z.boolean(), attackTypes: rec(z.boolean()) }),
  setupInfraCount: int(0, 100),
  voidLeapIntercept: z.boolean().optional(),
  load: z.object({ maxPerPlayer: int(0, 100).nullable(), minOnePerAlliance: z.boolean() }).optional(),
  lastPhase: z.object({ mandatoryBattle: z.boolean(), doubleGains: z.boolean(), noVoidLeap: z.boolean() }).optional(),
  houseRules: rec(z.boolean()).optional(),
  missionRepeatLock: z.boolean().optional(),
  loadCap: z.object({ maxDefences: int(0, 100).nullable(), maxGames: int(0, 100).nullable() }).optional(),
  unplayedRollOff: z.object({ enabled: z.boolean(), plModifier: z.boolean() }).optional(),
  freeSkirmishes: z.object({ enabled: z.boolean(), reward: z.enum(['STATS', 'POINTS']), pointsPerWin: int(0, 1000), maxBonus: int(0, 10_000) }).optional(),
  fog: z.boolean().optional(),
  endScoring: z.object({ mode: z.enum(['BOOK', 'BATTLES', 'PLANETS']), planetWeights: rec(int(-1000, 1000)).optional() }).optional(),
  grandFinale: z.object({ enabled: z.boolean(), bonus: list(int(-1000, 1000), 20) }).optional(),
  narrative: z.object({ pulse: z.boolean().optional(), secretGoals: z.boolean().optional(), nemesis: z.boolean().optional(), lateJoinBonus: z.boolean().optional() }).optional(),
  crusade: crusadeRules.optional(),
});
const battleSize = z.object({ id, name: text(NAME), points: int(0, 1_000_000), duration: text(NAME), reserves: int(0, 1_000_000) });
const missionDef = z.object({ id, name: text(NAME), source: text(NAME), note: text(), attackTypes: list(code, 20) });
const terrainLayout = z.object({ id, theatre: code.nullable(), missionId: nid, title: text(NAME), image: nid, link: text(2000), note: text() });
const skirmishInput = z.object({
  aAllianceId: id,
  aPlayerIds: list(id, 50),
  bAllianceId: id,
  bPlayerIds: list(id, 50),
  playedAt,
  vp: z.object({ a: num(-100_000, 100_000), b: num(-100_000, 100_000) }).nullable(),
  winner: z.enum(['A', 'B', 'DRAW']).optional(),
  mission: text(NAME),
  note: text(),
});
const objectiveInput = z.object({
  id: id.optional(),
  phaseNumber: int(0, 100),
  title: text(NAME),
  text: text(),
  allianceId: nid,
  check: z.enum(['MANUAL', 'HOLD_PLANET']),
  planetId: nid,
  reward: z.object({ kind: z.enum(['NONE', 'PL', 'END_POINTS', 'HONOR']), value: int(-1000, 1000), planetId: nid, text: text() }),
  secret: z.boolean().optional(),
});
const grandUpdate = z.object({
  name: text(NAME).optional(),
  mission: text(NAME).optional(),
  scheduledAt: z
    .union([isoDate, z.literal('')])
    .nullable()
    .optional(),
  report: text().optional(),
  tables: list(z.object({ id, label: text(NAME), winnerAllianceId: nid }), 100).optional(),
  placement: rec(int(0, 100)).nullable().optional(),
  done: z.boolean().optional(),
  participants: rec(list(id, 200)).optional(),
});

// ─── Commands ─────────────────────────────────────────────────────────────

const cmd = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) => z.object({ type: z.literal(type), ...shape });
const dates = { startDate: optDate, opsDeadline: optDate, battlesDeadline: optDate, endDate: optDate };

const COMMAND_SCHEMAS = [
  // Stammdaten
  cmd('META_UPDATE', {
    name: text(NAME).optional(),
    intro: text(LONG).optional(),
    timezone: text(64).optional(),
    edition: z.enum(['10', '11']).optional(),
    battleSizes: list(battleSize, 50).optional(),
    attackNotes: rec(text()).optional(),
    missions: list(missionDef, 500).optional(),
    introTr: textTr.optional(),
    locale: lang.optional(),
  }),
  cmd('TOGGLES_UPDATE', { toggles }),
  cmd('ALLIANCE_UPSERT', {
    id: id.optional(),
    name: text(NAME),
    color: text(64),
    logo: text(NAME).nullable().optional(),
    emblem: text(NAME).nullable().optional(),
    lore: text(LONG).optional(),
    loreTr: textTr.optional(),
    leaderPlayerId: nid.optional(),
  }),
  cmd('ALLIANCE_DELETE', { id }),
  cmd('PLAYER_UPSERT', {
    id: id.optional(),
    // F10: nur diese Felder (kein Object.assign beliebiger Schlüssel); E-Mail ohne Listen-Trenner
    data: z.object({
      nickname: text(NAME).optional(),
      realName: text(NAME).optional(),
      email: z
        .string()
        .max(254)
        .regex(/^[^\s,;<>]*$/)
        .optional(),
      discord: text(NAME).optional(),
      avatar: nid.optional(),
      notes: text(LONG).optional(),
      faction: text(NAME).optional(),
      subfaction: text(NAME).optional(),
      active: z.boolean().optional(),
      isGameMaster: z.boolean().optional(),
      locale: lang.optional(),
      notify: notify.optional(),
    }),
    allianceId: nid.optional(),
  }),
  cmd('PLAYER_DELETE', { id }),
  cmd('FLEET_SET_COUNT', { allianceId: id, count: int(0, 100) }),
  cmd('FLEET_UPDATE', { id, name: text(NAME).optional() }),
  cmd('FLEET_PLACE', { fleetId: id, planetId: id }),
  cmd('FLEET_RESERVE_SET', { allianceId: id, count: int(0, 100) }),
  cmd('FLEET_ACTIVATE', { fleetId: id, planetId: id }),
  cmd('FLEET_COMMANDER', { fleetId: id, phase: int(0, 100), playerId: nid }),
  cmd('PLANET_TEXT', { planetId: id, lore: text(LONG).optional(), notes: text(LONG).optional(), loreTr: textTr.optional() }),
  cmd('DISPATCH_UPSERT', { id: id.optional(), title: text(NAME), body: text(LONG), pinned: z.boolean(), public: z.boolean(), tr: dispatchTr.optional() }),
  cmd('DISPATCH_DELETE', { id }),
  cmd('PHASE_UPDATE', { phase: int(0, 100), ...dates, notes: text(LONG).optional() }),
  // Setup
  cmd('MAP_SET', { map: mapDef }),
  cmd('SETUP_W0_DONE', {}),
  cmd('SETUP_MEDAL_SUGGEST', {}),
  cmd('SETUP_MEDAL_ASSIGN', { medal: code, allianceId: nid }),
  cmd('SETUP_W1_DONE', {}),
  cmd('SETUP_LAUREL_PLANET', { planetId: id }),
  cmd('SETUP_STRONGHOLDS', { allianceId: id, strongholdPlanetId: nid, pl3: list(id, 50), pl2: list(id, 50) }),
  cmd('SETUP_REVEAL_STRONGHOLDS', {}),
  cmd('SETUP_WREATH', { planetIds: list(id, 50) }),
  cmd('SETUP_W2_DONE', {}),
  cmd('SETUP_INFRA', { allianceId: id, items: list(z.object({ type: code, planetId: nid }), 50) }),
  cmd('SETUP_INFRA_RECHOOSE', { itemId: id, planetId: id }),
  cmd('SETUP_REVEAL_INFRA', {}),
  cmd('SETUP_W3_DONE', {}),
  cmd('SETUP_FLEET_STARTS', { starts: rec(id) }),
  cmd('SETUP_REVEAL_FLEETS', {}),
  cmd('SETUP_DAGGER_SWAP', { a: id, b: id }),
  cmd('SETUP_W4_DONE', {}),
  cmd('SETUP_START', dates),
  // Phase
  cmd('OP_SET', { fleetId: id, slot: int(0, 10), op: opInput }),
  cmd('OP_CLEAR', { fleetId: id, slot: int(0, 10) }),
  cmd('OPEN_TOME_REVEAL', {}),
  cmd('ADVANCE', {}),
  cmd('REVEAL_OPS', {}),
  cmd('RESOLVE_EDIFICES', {}),
  cmd('BATTLE_UPDATE', { battleId: id, update: battleUpdate }),
  cmd('BATTLE_ROLL', { battleId: id, what: z.enum(['THEATRE', 'TWIST']) }),
  cmd('BATTLE_DECISION', { battleId: id, opId: id, decision: outcomeDecision }),
  cmd('BATTLE_BUNDLE', { battleIds: list(id, 100) }),
  cmd('RESULT_DRAFT_SUBMIT', { battleId: id, playerId: id, update: battleUpdate, decisions: rec(outcomeDecision).optional() }),
  cmd('RESULT_DRAFT_CONFIRM', { battleId: id, playerId: nid, draftAt: z.string().max(40).optional() }),
  cmd('RESULT_DRAFT_DISPUTE', { battleId: id, playerId: id, reason: text(), draftAt: z.string().max(40).optional() }),
  cmd('RESULT_DRAFT_DISCARD', { battleId: id }),
  cmd('BATTLE_CLAIM_SIDE', { battleId: id, playerId: id, mode: z.enum(['TAKE_OVER', 'JOIN', 'LEAVE']).optional() }),
  cmd('TIME_PROPOSE', { battleId: id, playerId: nid, times: list(isoDate, 10) }),
  cmd('TIME_ACCEPT', { battleId: id, playerId: nid, time: isoDate }),
  cmd('NOTE_ADD', { allianceId: id, playerId: nid, text: text() }),
  cmd('NOTE_DELETE', { id }),
  cmd('PROFILE_UPDATE', {
    playerId: id,
    update: z.object({
      nickname: text(NAME).optional(),
      faction: text(NAME).optional(),
      subfaction: text(NAME).optional(),
      avatar: nid.optional(),
      notify: notify.optional(),
      locale: lang.optional(),
    }),
  }),
  cmd('COMMANDER_UPDATE', { playerId: id, name: text(NAME), title: text(NAME), portrait: nid }),
  cmd('MARK_ADD', { kind: z.enum(['HONOR', 'SCAR']), playerId: id, title: text(NAME), reason: text(), phase: int(0, 100).nullable(), battleId: nid }),
  cmd('MARK_REMOVE', { kind: z.enum(['HONOR', 'SCAR']), playerId: id, id }),
  cmd('BATTLE_UNBUNDLE', { battleId: id, opId: id }),
  cmd('BATTLE_UNPLAYED', { battleId: id, resolution: z.enum(['ATTACKER_WINS', 'DEFENDER_WINS', 'VOID', 'POSTPONED']) }),
  cmd('BATTLE_REOPEN', { battleId: id }),
  cmd('BATTLE_PROCESS', { battleId: id }),
  cmd('BATTLE_PROCESS_ALL', {}),
  cmd('PROCESS_ORDER', { battleIds: list(id, 500) }),
  cmd('ARCHEOTECH_RESOLVE', { increments: rec(list(id, 50)) }),
  cmd('RESOLVE_ARRIVAL', {}),
  cmd('INTERCEPT_ADD', { opId: id, allianceId: id }),
  cmd('RESOLVE_KILL_TEAMS', {}),
  cmd('SCORE', {}),
  cmd('EVENTS_GENERATE', {}),
  cmd('EVENT_APPLY', { eventId: id, data: eventData }),
  cmd('EVENT_DISCARD', { eventId: id }),
  cmd('EVENT_INPUT', { eventId: id, playerId: id, data: eventData }),
  cmd('CUSTOM_EVENT_UPSERT', { def: customEventDef }),
  cmd('CUSTOM_EVENT_DELETE', { id }),
  cmd('CUSTOM_EVENT_TRIGGER', { defId: id, allianceId: nid }),
  cmd('EVENT_FORCE', { code, allianceId: nid, customId: id.optional() }),
  cmd('MOVE_SET', { fleetId: id, path: list(id, 20) }),
  cmd('MOVES_APPLY', {}),
  cmd('BUILD_START', {}),
  cmd('BUILD_SET', { allianceId: id, choice: z.union([z.literal('SKIP'), infraAt]) }),
  // Ende
  cmd('CAMPAIGN_END', {}),
  cmd('TIEBREAK_ADD', { attackerAllianceId: id, defenderAllianceId: id }),
  cmd('TIEBREAK_DECIDE', { winnerAllianceId: id }),
  cmd('MEDAL_OVERRIDE', { medal: code, allianceId: nid }),
  // Overrides
  cmd('OVERRIDE_PL', { allianceId: id, planetId: id, value: int(-100, 100) }),
  cmd('OVERRIDE_SLOT', { planetId: id, slot: int(0, 100), destroyed: z.boolean(), infra: z.object({ type: code, allianceId: id }).nullable() }),
  cmd('OVERRIDE_FLEET', { fleetId: id, planetId: id }),
  cmd('OVERRIDE_STRONGHOLD', { allianceId: id, destroyed: z.boolean() }),
  cmd('OVERRIDE_PLANET_DESTROYED', { planetId: id, destroyed: z.boolean() }),
  cmd('OVERRIDE_MODIFIER_ADD', { kind: code, phaseNumber: int(0, 100), allianceId: nid, planetIds: list(id, 50).optional() }),
  cmd('OVERRIDE_MODIFIER_REMOVE', { id }),
  cmd('OVERRIDE_STAGE', { stage }),
  cmd('OVERRIDE_POINTS', { phaseNumber: int(0, 100), allianceId: id, points: int(-100_000, 100_000) }),
  // Regelmodul (NTH2 3.3): eigene Aktion eines Moduls – allgemeines, begrenztes Schema
  cmd('MODULE_ACTION', { action: code, data: rec(json).optional() }),
  // R1
  cmd('MISSION_POOL_SET', { pool: rec(list(id, 200)) }),
  cmd('TERRAIN_LAYOUTS_SET', { layouts: list(terrainLayout, 200) }),
  cmd('BATTLE_ROLL_OFF', { battleId: id }),
  cmd('BATTLE_GUEST_SET', { battleId: id, playerId: nid, side, guest: z.object({ name: text(NAME), faction: text(NAME) }).nullable(), index: int(0, 100).optional() }),
  cmd('SKIRMISH_REPORT', { playerId: nid, skirmish: skirmishInput }),
  cmd('SKIRMISH_CONFIRM', { id, playerId: nid }),
  cmd('SKIRMISH_DELETE', { id, playerId: nid }),
  // R2
  cmd('ABSENCE_SET', { playerId: id, phases: list(int(0, 100), 100), absent: z.boolean() }),
  cmd('PLAYER_HANDOVER', {
    input: z.object({
      fromPlayerId: id,
      toPlayerId: nid.optional(),
      newPlayer: z.object({ nickname: text(NAME), faction: text(NAME).optional(), subfaction: text(NAME).optional() }).optional(),
      retire: z.boolean(),
    }),
  }),
  cmd('PLAYER_JOIN', { nickname: text(NAME), faction: text(NAME).optional(), subfaction: text(NAME).optional(), allianceId: id, fromPhase: int(0, 100) }),
  cmd('PULSE_SUBMIT', { playerId: id, phase: int(0, 100), fun: int(0, 10), time: z.enum(['MUCH', 'LITTLE', 'NONE']), comment: text(), anonymous: z.boolean(), absentNext: z.boolean().optional() }),
  cmd('OBJECTIVE_UPSERT', { objective: objectiveInput }),
  cmd('OBJECTIVE_DELETE', { id }),
  cmd('OBJECTIVE_RESOLVE', { id, achievedBy: list(id, 20), reason: text() }),
  cmd('GOAL_LIST_SET', { goals: list(z.object({ id, title: text(NAME), text: text() }), 200) }),
  cmd('GOAL_ASSIGN', { playerId: id, goalId: nid.optional(), title: text(NAME).optional(), text: text().optional() }),
  cmd('GOAL_CHOOSE', { playerId: id, goalId: id }),
  cmd('GOAL_CLAIM', { playerId: id, id, note: text() }),
  cmd('GOAL_RESOLVE', { playerId: id, id, met: z.boolean(), reason: text() }),
  cmd('GOAL_REMOVE', { playerId: id, id }),
  cmd('NEMESIS_SET', { playerId: id, nemesisId: nid }),
  cmd('GRAND_UPDATE', { update: grandUpdate }),
  cmd('GRAND_JOIN', { playerId: id, join: z.boolean() }),
  // P2
  cmd('DECREE_BLOCKS_SET', { blocks: list(z.object({ id, slot: code, tone: code, lang, text: text() }), 500) }),
  cmd('PLANET_IMAGE_SET', { planetId: id, portrait: nid.optional(), landscape: nid.optional() }),
  cmd('PHASE_PHOTO_SET', { phase: int(0, 100), uploadId: nid, caption: text(NAME).optional() }),
  cmd('PHOTO_VOTE_MODE', { enabled: z.boolean() }),
  cmd('PHOTO_VOTE', { playerId: id, phase: int(0, 100), uploadId: nid }),
  cmd('HOBBY_ADD', { playerId: id, entry: z.object({ date: isoDate, unit: text(NAME), status: z.enum(['BUILT', 'PRIMED', 'WIP', 'DONE']), photo: nid, points: int(0, 100_000) }) }),
  cmd('HOBBY_DELETE', { playerId: id, id }),
  // P1
  cmd('BATTLE_TABLE_SET', { battleId: id, playerId: nid, table: z.object({ id, name: text(NAME) }).nullable() }),
  // P3
  cmd('CRUSADE_RULES_SET', { rules: crusadeRules.partial() }),
  cmd('CRUSADE_ROSTER_SET', { playerId: id, roster: z.object({ name: text(NAME), faction: text(NAME), supplyLimit: int(0, 1_000_000), requisition: int(0, 1000), notes: text() }).nullable() }),
  cmd('CRUSADE_UNIT_UPSERT', {
    playerId: id,
    unit: z.object({
      id: id.optional(),
      name: text(NAME),
      kind: text(NAME),
      points: int(0, 1_000_000),
      xpStart: int(0, 100_000).optional(),
      honours: list(text(NAME), 50),
      scars: list(text(NAME), 50),
      notes: text(),
      retired: z.boolean().optional(),
    }),
  }),
  cmd('CRUSADE_UNIT_DELETE', { playerId: id, unitId: id }),
  cmd('CRUSADE_BATTLE_UNITS', { playerId: id, battleId: id, units: list(id, 100), marked: nid }),
  cmd('CRUSADE_XP_ADJUST', { playerId: id, unitId: id, delta: int(-100_000, 100_000), reason: text() }),
  cmd('PLANET_TRAITS_SET', { planetId: id, traits: list(z.object({ id: id.optional(), keyword: text(NAME), effect: text() }), 50) }),
] as const;

/** Alle Commands als Diskriminator-Union über `type` */
export const CommandSchema = z.discriminatedUnion('type', COMMAND_SCHEMAS);

/** Jeder Command-Typ der Union braucht ein Schema (Prüfung zur Übersetzungszeit) */
type Missing = Exclude<Command['type'], z.infer<typeof CommandSchema>['type']>;
const allCovered: [Missing] extends [never] ? true : Missing = true;
void allCovered;

const KNOWN_TYPES = new Set<string>(COMMAND_SCHEMAS.map((s) => s.shape.type.value));

/**
 * Regelspezifische Commands eines Moduls, die der Kern nicht kennt (NTH2 3.3, `CampaignModule.dispatch`):
 * allgemeines, begrenztes Schema – Typ als Code, übrige Felder nur einfache JSON-Werte.
 */
const ModuleCommandSchema = z.record(key, json).and(z.object({ type: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/) }));

export type ParsedCommand = { ok: true; cmd: Command } | { ok: false; error: string };

const issuePath = (issue: z.core.$ZodIssue | undefined) => {
  const p = (issue?.path ?? []).map(String).join('.');
  return p || 'type';
};

/**
 * Einziger Eingang für Commands aus Benutzerhand (Spielleiter, Spielerlink, Einmal-Link, Discord, Abmeldelink):
 * Form und Größe prüfen (`checkCommandInput`), gegen das Schema parsen (unbekannte Felder fallen weg),
 * Steuerzeichen aus Freitexten entfernen (`sanitizeCommand`). Liefert den bereinigten Command oder eine Meldung.
 */
export function parseCommand(raw: unknown, player = false): ParsedCommand {
  const invalid = checkCommandInput(raw, player);
  if (invalid) return { ok: false, error: invalid };
  const type = (raw as { type: string }).type;
  const res = KNOWN_TYPES.has(type) ? CommandSchema.safeParse(raw) : ModuleCommandSchema.safeParse(raw);
  if (!res.success) return { ok: false, error: INVALID_INPUT.replace('{0}', issuePath(res.error.issues[0])) };
  return { ok: true, cmd: sanitizeCommand(res.data as Command) };
}
