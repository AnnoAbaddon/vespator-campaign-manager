import type { Alliance, Battle, CampaignState, EventRecord, Fleet, Operation, Phase, PlanetState, Player, SetupState } from './types';
import type { CrusadeRoster, CrusadeUnit } from './crusade';
import { r2PlayerView } from './r2View';
import { p2PlayerView } from './p2Commands';
import { applyFog, fogActive } from './fog';
import { moduleOf } from './modules/registry';

/**
 * Öffentliche Projektion (SPEC 3.3) als Allowlist (Architektur-Review S3): Die Ausgabe wird aus ausdrücklich
 * freigegebenen Feldern neu aufgebaut – nicht mehr durch Löschen bekannter privater Felder. Jedes Feld jeder
 * Entität steht in einer Regeltabelle (`FieldRules`); TypeScript verlangt für jedes neue Feld eine Entscheidung,
 * und Felder, die zur Laufzeit zusätzlich im Zustand stehen (Altdaten, Module), fallen weg.
 *
 * - 'public': Wert wird (tief kopiert) übernommen
 * - 'private': Feld fehlt in der Projektion
 * - Funktion: öffentlicher Wert wird daraus gebildet (z. B. leere Texte für Pflichtfelder, gefilterte Listen)
 *
 * Das Ergebnis darf an nicht angemeldete Leser ausgeliefert werden.
 */
type Rule<T, K extends keyof T> = 'public' | 'private' | ((v: T[K], src: T) => T[K] | undefined);
type FieldRules<T> = { [K in keyof Required<T>]: Rule<T, K> };

function project<T extends object>(src: T, rules: FieldRules<T>): T {
  const out: Partial<T> = {};
  for (const k of Object.keys(rules) as (keyof T)[]) {
    if (!Object.hasOwn(src, k)) continue;
    const rule = rules[k] as Rule<T, typeof k>;
    if (rule === 'private') continue;
    const v = rule === 'public' ? structuredClone(src[k]) : rule(src[k], src);
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

const blank = (): string => '';
const clone = <T>(v: T): T => structuredClone(v);

const ALLIANCE: FieldRules<Alliance> = {
  id: 'public',
  name: 'public',
  color: 'public',
  logo: 'public',
  emblem: 'public',
  lore: 'public',
  loreTr: 'public',
  leaderPlayerId: 'public',
  strongholdDestroyed: 'public',
  order: 'public',
};

const CRUSADE_UNIT: FieldRules<CrusadeUnit> = {
  id: 'public',
  name: 'public',
  kind: 'public',
  points: 'public',
  xpStart: 'public',
  xpAdjust: 'public',
  honours: 'public',
  scars: 'public',
  // Notizen zur Einheit sind privat (der Spieler sieht die eigenen über toPlayerView)
  notes: blank,
  retired: 'public',
};

const CRUSADE: FieldRules<CrusadeRoster> = {
  name: 'public',
  faction: 'public',
  supplyLimit: 'public',
  requisition: 'public',
  notes: blank,
  units: (units) => units.map((u) => project(u, CRUSADE_UNIT)),
  battles: 'public',
  adjustments: 'public',
};

/** Spieler: Kontaktdaten, Notizen, Benachrichtigungen, Abwesenheiten privat; persönliche Ziele erst nach Kampagnenende */
function playerRules(ended: boolean): FieldRules<Player> {
  return {
    id: 'public',
    nickname: 'public',
    realName: blank,
    email: blank,
    discord: blank,
    avatar: 'public',
    notes: blank,
    faction: 'public',
    subfaction: 'public',
    factionHistory: 'public',
    memberships: 'public',
    active: 'public',
    isGameMaster: 'public',
    commander: 'public',
    // C4: Ehrungen für geheime Ziele nennen ihren Anlass erst nach Kampagnenende
    honors: (list) => list?.map((h) => (h.goal && !ended ? { ...clone(h), reason: '' } : clone(h))),
    scars: 'public',
    suppressedAuto: 'public',
    locale: 'public',
    notify: 'private',
    absences: 'private',
    nemesisId: 'public',
    goals: (g) => (ended ? clone(g) : undefined),
    crusade: (c) => (c ? project(c, CRUSADE) : c),
    hobby: 'public',
  };
}

const FLEET: FieldRules<Fleet> = {
  id: 'public',
  allianceId: 'public',
  name: 'public',
  planetId: 'public',
  commanders: 'public',
  reserve: 'public',
  activated: 'public',
};

const PLANET: FieldRules<PlanetState> = {
  id: 'public',
  power: 'public',
  destroyed: 'public',
  slots: 'public',
  lore: 'public',
  notes: blank,
  loreTr: 'public',
  portrait: 'public',
  landscape: 'public',
};

/** Aufgedeckte Operationen vollständig */
const OPERATION: FieldRules<Operation> = {
  id: 'public',
  fleetId: 'public',
  allianceId: 'public',
  slot: 'public',
  type: 'public',
  attackType: 'public',
  targetPlanetId: 'public',
  targetAllianceId: 'public',
  targetFleetId: 'public',
  destinationPlanetId: 'public',
  infraType: 'public',
  killTeamPlanetId: 'public',
  killTeamMode: 'public',
  originPlanetId: 'public',
  isDefault: 'public',
  revealed: 'public',
  status: 'public',
  note: 'public',
  hidden: 'public',
  absence: 'public',
};

/** Verdeckte Operation: nur, dass es sie gibt (Flotte, Allianz, Slot, Ausgangsplanet) */
const hiddenOp = (o: Operation): Operation => ({
  id: o.id,
  fleetId: o.fleetId,
  allianceId: o.allianceId,
  slot: o.slot,
  type: 'NONE',
  originPlanetId: o.originPlanetId,
  isDefault: false,
  revealed: false,
  status: 'PLANNED',
  hidden: true,
});

const PHASE: FieldRules<Phase> = {
  number: 'public',
  startDate: 'public',
  opsDeadline: 'public',
  battlesDeadline: 'public',
  endDate: 'public',
  operations: (ops) => ops.map((o) => (o.revealed ? project(o, OPERATION) : hiddenOp(o))),
  // Bewegungen erst, wenn sie ausgeführt sind
  moves: (m, ph) => (ph.flags.movesApplied ? clone(m) : {}),
  flags: 'public',
  processOrder: 'public',
  noMoveFleets: 'public',
  buildOrder: 'public',
  builds: 'public',
  stepStatus: 'public',
  notes: blank,
  openTomeRevealed: 'public',
  archeotechResolved: 'public',
  archeotechResults: 'public',
  // B4: Phasen-Puls nur für den Warmaster (eigene Antworten über toPlayerView)
  pulse: 'private',
  photo: 'public',
  // P2: Stimmen zum Bild der Phase anonym
  photoVotes: (v) => v?.map((x) => ({ playerId: '', uploadId: x.uploadId })),
};

const BATTLE: FieldRules<Battle> = {
  id: 'public',
  phaseNumber: 'public',
  kind: 'public',
  operationIds: 'public',
  attackType: 'public',
  planetId: 'public',
  attackerAllianceId: 'public',
  defenderAllianceId: 'public',
  attackers: 'public',
  defenders: 'public',
  status: 'public',
  playedAt: 'public',
  createdSeq: 'public',
  size: 'public',
  mission: 'public',
  games: 'public',
  theatre: 'public',
  theatreChosenBy: 'public',
  twist: 'public',
  vp: 'public',
  battleReady: 'public',
  victor: 'public',
  victorOverride: 'public',
  decisions: 'public',
  applied: 'public',
  report: 'public',
  photos: 'public',
  notes: blank,
  processedOrder: 'public',
  unplayedResolution: 'public',
  postponedFrom: 'public',
  // Ergebnis-Entwürfe sind erst nach Bestätigung öffentlich (Beteiligte über toPlayerView)
  draft: () => null,
  proposals: 'public',
  scheduledAt: 'public',
  guests: 'public',
  unplayedRoll: 'public',
  table: 'public',
};

const EVENT: FieldRules<EventRecord> = {
  id: 'public',
  phaseNumber: 'public',
  category: 'public',
  code: 'public',
  custom: 'public',
  forced: 'public',
  allianceId: 'public',
  status: 'public',
  // offene Events: Daten erst beim Anwenden
  data: (d, e) => (e.status === 'PENDING' ? {} : clone(d)),
  applied: 'public',
  // Spielereingaben sind verdeckt (Xenobeast, Überläuferwünsche)
  inputs: 'private',
};

type Meta = CampaignState['meta'];
const META: FieldRules<Meta> = {
  name: 'public',
  intro: 'public',
  introTr: 'public',
  phaseCount: 'public',
  allianceCount: 'public',
  createdAt: 'public',
  timezone: 'public',
  locale: 'public',
  edition: 'public',
  battleSizes: 'public',
  missions: 'public',
  attackNotes: 'public',
  missionPool: 'public',
  terrainLayouts: 'public',
  // Herkunft einer Sandbox (interne Kampagnen-ID) – Sandboxes haben ohnehin keine Leseansicht
  sandbox: 'private',
  rhythm: 'public',
  module: 'public',
};

/** Ohne Modul-Hook: Setup vollständig (das Modul entscheidet, was davon verdeckt ist) */
const SETUP_DEFAULT = (s: SetupState): SetupState => clone(s);

function stateRules(full: CampaignState, opts: { reveal?: boolean }): FieldRules<CampaignState> {
  const ended = full.stage.kind === 'ENDED' || !!opts.reveal;
  const PLAYER = playerRules(ended);
  const mod = moduleOf(full).publicView?.(full, opts) ?? {};
  return {
    schemaVersion: 'public',
    map: 'public',
    destructions: 'public',
    // N1.3: Allianz-Notizen nur für die Allianz (toPlayerView)
    allianceNotes: () => [],
    meta: (m) => project(m, META),
    // D2: Baukasten eigener Ereignisse ist Sache des Warmasters (eingetretene stehen in events)
    customEvents: 'private',
    pointsBonus: 'public',
    toggles: 'public',
    alliances: (list) => list.map((a) => project(a, ALLIANCE)),
    players: (list) => list.map((p) => project(p, PLAYER)),
    fleets: (list) => list.map((f) => project(f, FLEET)),
    planets: (list) => list.map((p) => project(p, PLANET)),
    phases: (list) => list.map((p) => project(p, PHASE)),
    stage: 'public',
    battles: (list) => list.map((b) => project(b, BATTLE)),
    battleSeq: 'public',
    events: (list) => list.map((e) => project(e, EVENT)),
    stellarStormsUsed: 'public',
    modifiers: 'public',
    dice: (list) => clone(list.filter((d) => d.public)),
    dispatches: (list) => clone(list.filter((d) => d.public)),
    medals: 'public',
    // interne Kampagnen-IDs gehören nicht in öffentliche Daten
    inheritedMedals: (list) => list.map((m) => ({ ...clone(m), fromCampaignId: '' })),
    // NTH2 3.3: modulspezifisch Verdecktes (Vespator: Setup-Wahlen bis zum jeweiligen Reveal)
    setup: (s) => mod.setup ?? SETUP_DEFAULT(s),
    pointsHistory: 'public',
    result: 'public',
    // verdeckte Sonderziele erst nach der Auswertung
    objectives: (list) => list && clone(list.filter((o) => !o.secret || o.status !== 'OPEN')),
    // C4: Zielliste nur für Warmaster und (bei geheimen Zielen) Spieler
    goalList: 'private',
    endBonus: 'public',
    grandBattle: 'public',
    // Nebel entsteht allein in der Projektion (siehe unten)
    fog: 'private',
    publishedAfterResistance: 'public',
    // B5: gemeldete freie Gefechte sind erst nach Bestätigung öffentlich
    skirmishes: (list) => list && clone(list.filter((x) => x.status === 'CONFIRMED')),
    planetTraits: 'public',
    // P2: eigene Dekret-Bausteine privat
    decreeBlocks: 'private',
    gallery: 'public',
    // Modulzustand nur, soweit das Modul ihn freigibt
    moduleState: () => mod.moduleState,
  };
}

export function toPublicView(state: CampaignState, opts: { reveal?: boolean } = {}): CampaignState {
  const s = project(state, stateRules(state, opts));
  // immer vorhanden (auch bei Ständen ohne Allianz-Notizen) – die Oberfläche liest die Liste direkt
  s.allianceNotes = [];
  // C1: Nebel über dem Punktestand (Rang und Tendenz statt Zahlen); `reveal` bzw. Kampagnenende deckt auf
  if (fogActive(state, opts.reveal)) applyFog(s, state);
  return s;
}

/**
 * Sicht eines Spielers (N1.3): öffentliche Projektion plus ausdrücklich hinzugefügte Daten – die eigenen Kontaktdaten,
 * Notizen der eigenen Order of Battle und die verdeckten Daten der eigenen Allianz (Befehle, Bewegungen,
 * Allianz-Notizen, Event-Eingaben). Schlacht-Entwürfe sieht, wer an der Schlacht beteiligt ist (Allianz einer der
 * beiden Seiten). `allianceId` null (z. B. inaktiver Spieler): nur die eigenen Daten, keine Allianz-Geheimnisse.
 */
export function toPlayerView(state: CampaignState, playerId: string, allianceId: string | null): CampaignState {
  const s = toPublicView(state);
  const me = state.players.find((p) => p.id === playerId);
  const mine = s.players.find((p) => p.id === playerId);
  if (me && mine) {
    Object.assign(mine, { email: me.email, discord: me.discord, realName: me.realName });
    if (me.notify) mine.notify = clone(me.notify);
    if (me.crusade) mine.crusade = clone(me.crusade);
  }
  r2PlayerView(s, state, playerId, allianceId);
  p2PlayerView(s, state, playerId);
  if (!allianceId) return s;
  for (const ph of s.phases) {
    const orig = state.phases.find((p) => p.number === ph.number)!;
    ph.operations = ph.operations.map((o) => (o.allianceId === allianceId ? project(orig.operations.find((x) => x.id === o.id) ?? o, OPERATION) : o));
    if (!ph.flags.movesApplied) {
      for (const [fid, path] of Object.entries(orig.moves)) if (state.fleets.find((f) => f.id === fid)?.allianceId === allianceId) ph.moves[fid] = [...path];
    }
  }
  for (const b of s.battles) {
    const orig = state.battles.find((x) => x.id === b.id)!;
    if (orig.attackerAllianceId === allianceId || orig.defenderAllianceId === allianceId) b.draft = clone(orig.draft ?? null);
  }
  s.allianceNotes = clone((state.allianceNotes ?? []).filter((n) => n.allianceId === allianceId));
  // B5: offene Meldungen freier Gefechte sehen beide beteiligten Allianzen
  if (state.skirmishes) s.skirmishes = clone(state.skirmishes.filter((x) => x.status === 'CONFIRMED' || x.a.allianceId === allianceId || x.b.allianceId === allianceId));
  // Event-Eingaben der eigenen Allianz (offene Events), damit Mitglieder den Stand sehen
  for (const e of s.events) {
    const orig = state.events.find((x) => x.id === e.id);
    const mineInputs = orig?.status === 'PENDING' ? (orig.inputs ?? []).filter((i) => i.allianceId === allianceId) : [];
    if (mineInputs.length) e.inputs = clone(mineInputs);
  }
  return s;
}
