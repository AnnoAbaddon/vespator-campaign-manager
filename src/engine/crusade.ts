import { fail, log, type Ctx } from './ctx';
import { planetName } from './board';
import { mapOf } from './map';
import type { Battle, CampaignState, Player } from './types';

/**
 * Crusade-Anbindung (NTH2 3.2) und Planeten-Merkmale (A9), Block P3.
 *
 * Leichte Order of Battle je Spieler: Einheiten mit Namen, Punkten, Erfahrung (XP), Rang, Battle Honours und
 * Battle Scars. Die Kampagnen-Ergebnisse vergeben Crusade-XP je Schlacht: Jede eingesetzte Einheit erhält die
 * Teilnahme-XP, bei Sieg bzw. Unentschieden optional mehr, die „Marked for Greatness“-Einheit zusätzlich den Bonus
 * (in Anlehnung an das Crusade-Regelwerk: jede eingesetzte Einheit sammelt Erfahrung, eine besonders
 * hervorgehobene Einheit deutlich mehr; die Werte sind einstellbar). Der Spieler teilt je Schlacht mit, welche
 * Einheiten dabei waren; der Warmaster kann alles korrigieren (XP-Korrektur mit Begründung).
 * Die XP werden aus den Schlachten abgeleitet – ändert sich ein Ergebnis, stimmt die Erfahrung automatisch.
 */

export interface CrusadeRules {
  enabled: boolean;
  /** XP je eingesetzter Einheit und gewerteter Schlacht */
  xpParticipation: number;
  /** zusätzliche XP je Einheit bei Sieg */
  xpWin: number;
  /** zusätzliche XP je Einheit bei Unentschieden */
  xpDraw: number;
  /** zusätzliche XP für die „Marked for Greatness“-Einheit */
  xpMarked: number;
}

export const DEFAULT_CRUSADE: CrusadeRules = { enabled: false, xpParticipation: 1, xpWin: 0, xpDraw: 0, xpMarked: 3 };

export interface CrusadeUnit {
  id: string;
  name: string;
  /** Datenblatt bzw. Rolle (frei, z. B. „Intercessor Squad“) */
  kind: string;
  points: number;
  /** Start-XP (vor der Kampagne gesammelt) */
  xpStart: number;
  /** Korrektur des Warmasters (Summe) */
  xpAdjust: number;
  honours: string[];
  scars: string[];
  notes: string;
  /** Einheit ist aus der Order of Battle ausgeschieden (bleibt für die Historie stehen) */
  retired?: boolean;
}

export interface CrusadeRoster {
  name: string;
  faction: string;
  /** Supply Limit (Punkte) */
  supplyLimit: number;
  /** Requisition Points */
  requisition: number;
  notes: string;
  units: CrusadeUnit[];
  /** je Schlacht: eingesetzte Einheiten und „Marked for Greatness“ */
  battles: Record<string, { units: string[]; marked: string | null }>;
  /** Protokoll der XP-Korrekturen des Warmasters */
  adjustments?: { unitId: string; delta: number; reason: string; at: string }[];
}

/** Planeten-Merkmal (A9): Schlagwort plus Wirkung als Freitext, z. B. „Industriewelt“ → „+1 Requisition bei Sieg“ */
export interface PlanetTrait {
  id: string;
  keyword: string;
  effect: string;
}

/** Ränge nach Erfahrung (Schwellen wie im Crusade-Regelwerk; Rangnamen sind Spielbegriffe) */
export const RANKS: { name: string; min: number }[] = [
  { name: 'Battle-ready', min: 0 },
  { name: 'Blooded', min: 6 },
  { name: 'Battle-hardened', min: 16 },
  { name: 'Heroic', min: 31 },
  { name: 'Legendary', min: 51 },
];

export const rankOf = (xp: number) => [...RANKS].reverse().find((r) => xp >= r.min)!.name;

export function crusadeRules(st: Pick<CampaignState, 'toggles'>): CrusadeRules {
  return { ...DEFAULT_CRUSADE, ...(st.toggles.crusade ?? {}) };
}

/** Gewertete Kampagnenschlacht (wie die Statistik: ungespielt gewertete zählen nicht) */
const counted = (b: Battle) => (b.status === 'PLAYED' || b.status === 'PROCESSED') && !b.unplayedResolution && !!b.victor && b.kind !== 'INTERCEPT';

export type BattleResult = 'WIN' | 'DRAW' | 'LOSS';

export interface BattleAward {
  battleId: string;
  phase: number;
  where: string;
  result: BattleResult;
  /** XP je eingesetzter Einheit */
  perUnit: number;
  marked: number;
  /** Zuteilung des Spielers (null = noch offen) */
  units: string[] | null;
  markedUnit: string | null;
}

/** Schlachten eines Spielers mit den XP, die sie vergeben */
export function battleAwards(st: CampaignState, player: Player): BattleAward[] {
  const r = crusadeRules(st);
  const out: BattleAward[] = [];
  for (const b of st.battles) {
    if (!counted(b)) continue;
    const att = b.attackers.some((p) => p.playerId === player.id);
    const def = b.defenders.some((p) => p.playerId === player.id);
    if (!att && !def) continue;
    const result: BattleResult = b.victor === 'DRAW' ? 'DRAW' : (b.victor === 'ATTACKER') === att ? 'WIN' : 'LOSS';
    const perUnit = r.xpParticipation + (result === 'WIN' ? r.xpWin : result === 'DRAW' ? r.xpDraw : 0);
    const log = player.crusade?.battles[b.id];
    out.push({
      battleId: b.id,
      phase: b.phaseNumber,
      where: b.planetId ? planetName(b.planetId) : b.kind === 'FINAL_TIEBREAK' ? 'Entscheidungsschlacht' : 'Schlacht',
      result,
      perUnit,
      marked: r.xpMarked,
      units: log ? log.units : null,
      markedUnit: log?.marked ?? null,
    });
  }
  return out.sort((a, b) => a.phase - b.phase || a.battleId.localeCompare(b.battleId));
}

export interface UnitXp {
  start: number;
  earned: number;
  adjust: number;
  total: number;
  rank: string;
  battles: number;
}

export function unitXp(st: CampaignState, player: Player, unit: CrusadeUnit, awards = battleAwards(st, player)): UnitXp {
  let earned = 0;
  let battles = 0;
  for (const a of awards) {
    if (!a.units?.includes(unit.id)) continue;
    battles++;
    earned += a.perUnit + (a.markedUnit === unit.id ? a.marked : 0);
  }
  const total = Math.max(0, unit.xpStart + earned + unit.xpAdjust);
  return { start: unit.xpStart, earned, adjust: unit.xpAdjust, total, rank: rankOf(total), battles };
}

/** Schlachten ohne Zuteilung der eingesetzten Einheiten (Aufgabe für den Spieler) */
export const openAllocations = (st: CampaignState, player: Player) => (player.crusade && crusadeRules(st).enabled ? battleAwards(st, player).filter((a) => a.units === null) : []);

/** Export der Order of Battle (JSON) mit berechneten XP und Rängen */
export function rosterExport(st: CampaignState, player: Player) {
  const ros = player.crusade;
  if (!ros) return null;
  const awards = battleAwards(st, player);
  return {
    format: 'vespator-crusade',
    version: 1,
    campaign: st.meta.name,
    player: player.nickname,
    rules: crusadeRules(st),
    orderOfBattle: {
      name: ros.name,
      faction: ros.faction,
      supplyLimit: ros.supplyLimit,
      supplyUsed: ros.units.filter((u) => !u.retired).reduce((s, u) => s + u.points, 0),
      requisition: ros.requisition,
      notes: ros.notes,
      units: ros.units.map((u) => {
        const x = unitXp(st, player, u, awards);
        return { name: u.name, kind: u.kind, points: u.points, xp: x.total, rank: x.rank, battles: x.battles, honours: u.honours, scars: u.scars, notes: u.notes, retired: !!u.retired };
      }),
    },
    battles: awards.map((a) => ({
      phase: a.phase,
      where: a.where,
      result: a.result,
      xpPerUnit: a.perUnit,
      units: (a.units ?? []).map((id) => ros.units.find((u) => u.id === id)?.name ?? id),
      markedForGreatness: ros.units.find((u) => u.id === a.markedUnit)?.name ?? null,
    })),
  };
}

// ─── Commands ──────────────────────────────────────────────────────────────

export type P3Command =
  | { type: 'CRUSADE_RULES_SET'; rules: Partial<CrusadeRules> }
  | { type: 'CRUSADE_ROSTER_SET'; playerId: string; roster: { name: string; faction: string; supplyLimit: number; requisition: number; notes: string } | null }
  | { type: 'CRUSADE_UNIT_UPSERT'; playerId: string; unit: Omit<CrusadeUnit, 'id' | 'xpAdjust'> & { id?: string } }
  | { type: 'CRUSADE_UNIT_DELETE'; playerId: string; unitId: string }
  | { type: 'CRUSADE_BATTLE_UNITS'; playerId: string; battleId: string; units: string[]; marked: string | null }
  | { type: 'CRUSADE_XP_ADJUST'; playerId: string; unitId: string; delta: number; reason: string }
  | { type: 'PLANET_TRAITS_SET'; planetId: string; traits: { id?: string; keyword: string; effect: string }[] };

export const P3_TYPES = new Set<P3Command['type']>(['CRUSADE_RULES_SET', 'CRUSADE_ROSTER_SET', 'CRUSADE_UNIT_UPSERT', 'CRUSADE_UNIT_DELETE', 'CRUSADE_BATTLE_UNITS', 'CRUSADE_XP_ADJUST', 'PLANET_TRAITS_SET']);

/** Über den Spielerlink erlaubt (nur im eigenen Namen, nur bei eingeschalteter Crusade-Anbindung) */
export const P3_PLAYER_COMMANDS = new Set<P3Command['type']>(['CRUSADE_ROSTER_SET', 'CRUSADE_UNIT_UPSERT', 'CRUSADE_UNIT_DELETE', 'CRUSADE_BATTLE_UNITS']);

export function authorizeP3(st: CampaignState, player: Player, cmd: P3Command): string | null {
  if (!P3_PLAYER_COMMANDS.has(cmd.type)) return 'Diese Aktion ist dem Spielleiter vorbehalten';
  if (!crusadeRules(st).enabled) return 'Die Crusade-Anbindung ist in dieser Kampagne abgeschaltet';
  return 'playerId' in cmd && cmd.playerId === player.id ? null : 'Nur im eigenen Namen';
}

const txt = (s: unknown, max: number) =>
  String(s ?? '')
    .trim()
    .slice(0, max);
const int = (v: unknown, lo: number, hi: number, name: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) fail(`${name}: ganze Zahl von ${lo} bis ${hi}`);
  return n;
};

function playerOf(st: CampaignState, id: string): Player {
  const p = st.players.find((x) => x.id === id);
  if (!p) fail('Spieler nicht gefunden');
  return p;
}

function roster(st: CampaignState, id: string): CrusadeRoster {
  const p = playerOf(st, id);
  if (!p.crusade) fail(`${p.nickname} hat keine Order of Battle`);
  return p.crusade;
}

const list = (v: unknown, max: number) =>
  (Array.isArray(v) ? v : [])
    .map((x) => txt(x, 120))
    .filter(Boolean)
    .slice(0, max);

export function dispatchP3(ctx: Ctx, cmd: P3Command) {
  const st = ctx.state;
  switch (cmd.type) {
    case 'CRUSADE_RULES_SET': {
      const cur = crusadeRules(st);
      const r = cmd.rules;
      const next: CrusadeRules = {
        enabled: r.enabled ?? cur.enabled,
        xpParticipation: r.xpParticipation === undefined ? cur.xpParticipation : int(r.xpParticipation, 0, 10, 'XP'),
        xpWin: r.xpWin === undefined ? cur.xpWin : int(r.xpWin, 0, 10, 'XP'),
        xpDraw: r.xpDraw === undefined ? cur.xpDraw : int(r.xpDraw, 0, 10, 'XP'),
        xpMarked: r.xpMarked === undefined ? cur.xpMarked : int(r.xpMarked, 0, 10, 'XP'),
      };
      st.toggles.crusade = next;
      log(ctx, next.enabled ? `Crusade-Anbindung: an (Teilnahme ${next.xpParticipation} XP, Sieg +${next.xpWin}, Unentschieden +${next.xpDraw}, Marked for Greatness +${next.xpMarked})` : 'Crusade-Anbindung: aus');
      return;
    }
    case 'CRUSADE_ROSTER_SET': {
      const p = playerOf(st, cmd.playerId);
      if (!cmd.roster) {
        if (!p.crusade) fail(`${p.nickname} hat keine Order of Battle`);
        delete p.crusade;
        log(ctx, `Order of Battle von ${p.nickname} entfernt`);
        return;
      }
      const r = cmd.roster;
      const name = txt(r.name, 80);
      if (!name) fail('Bitte einen Namen für die Order of Battle angeben');
      const isNew = !p.crusade;
      const base: CrusadeRoster = p.crusade ?? { name, faction: '', supplyLimit: 1000, requisition: 5, notes: '', units: [], battles: {} };
      p.crusade = {
        ...base,
        name,
        faction: txt(r.faction, 80),
        supplyLimit: int(r.supplyLimit, 0, 100000, 'Supply Limit'),
        requisition: int(r.requisition, 0, 99, 'Requisition'),
        notes: txt(r.notes, 2000),
      };
      log(ctx, isNew ? `Order of Battle „${name}“ von ${p.nickname} angelegt` : `Order of Battle von ${p.nickname} aktualisiert`);
      return;
    }
    case 'CRUSADE_UNIT_UPSERT': {
      const p = playerOf(st, cmd.playerId);
      const ros = roster(st, cmd.playerId);
      const u = cmd.unit;
      const name = txt(u.name, 80);
      if (!name) fail('Bitte einen Namen für die Einheit angeben');
      const existing = u.id ? ros.units.find((x) => x.id === u.id) : undefined;
      if (u.id && !existing) fail('Einheit nicht gefunden');
      if (!existing && ros.units.length >= 60) fail('Höchstens 60 Einheiten je Order of Battle');
      const data = {
        name,
        kind: txt(u.kind, 80),
        points: int(u.points, 0, 5000, 'Punkte'),
        xpStart: int(u.xpStart ?? 0, 0, 999, 'XP'),
        honours: list(u.honours, 12),
        scars: list(u.scars, 12),
        notes: txt(u.notes, 1000),
        retired: !!u.retired,
      };
      if (existing) Object.assign(existing, data);
      else ros.units.push({ id: ctx.newId('cu'), xpAdjust: 0, ...data });
      log(ctx, `${p.nickname}: Einheit „${name}“ ${existing ? 'aktualisiert' : 'aufgenommen'}`);
      return;
    }
    case 'CRUSADE_UNIT_DELETE': {
      const p = playerOf(st, cmd.playerId);
      const ros = roster(st, cmd.playerId);
      const u = ros.units.find((x) => x.id === cmd.unitId);
      if (!u) fail('Einheit nicht gefunden');
      ros.units = ros.units.filter((x) => x.id !== cmd.unitId);
      for (const b of Object.values(ros.battles)) {
        b.units = b.units.filter((x) => x !== cmd.unitId);
        if (b.marked === cmd.unitId) b.marked = null;
      }
      log(ctx, `${p.nickname}: Einheit „${u.name}“ entfernt`);
      return;
    }
    case 'CRUSADE_BATTLE_UNITS': {
      const p = playerOf(st, cmd.playerId);
      const ros = roster(st, cmd.playerId);
      const b = st.battles.find((x) => x.id === cmd.battleId);
      if (!b) fail('Schlacht nicht gefunden');
      if (![...b.attackers, ...b.defenders].some((x) => x.playerId === p.id)) fail(`${p.nickname} hat an dieser Schlacht nicht teilgenommen`);
      const units = [...new Set(cmd.units)];
      for (const id of units) if (!ros.units.some((u) => u.id === id)) fail('Einheit nicht gefunden');
      if (cmd.marked && !units.includes(cmd.marked)) fail('Marked for Greatness muss eine eingesetzte Einheit sein');
      ros.battles[b.id] = { units, marked: cmd.marked ?? null };
      log(ctx, `${p.nickname}: ${units.length} Einheit(en) in der Schlacht auf ${b.planetId ? planetName(b.planetId) : 'Schlacht'} eingesetzt`);
      return;
    }
    case 'CRUSADE_XP_ADJUST': {
      const p = playerOf(st, cmd.playerId);
      const ros = roster(st, cmd.playerId);
      const u = ros.units.find((x) => x.id === cmd.unitId);
      if (!u) fail('Einheit nicht gefunden');
      const delta = int(cmd.delta, -999, 999, 'XP');
      const reason = txt(cmd.reason, 300);
      if (!reason) fail('Bitte kurz begründen');
      u.xpAdjust += delta;
      (ros.adjustments ??= []).push({ unitId: u.id, delta, reason, at: ctx.now });
      log(ctx, `XP-Korrektur ${p.nickname}/${u.name}: ${delta > 0 ? '+' : ''}${delta} (${reason})`);
      return;
    }
    case 'PLANET_TRAITS_SET': {
      if (!mapOf(st).planets.some((x) => x.id === cmd.planetId)) fail('Planet nicht gefunden');
      const traits: PlanetTrait[] = (cmd.traits ?? []).map((x) => ({ id: x.id && /^[\w-]{1,40}$/.test(x.id) ? x.id : ctx.newId('tr'), keyword: txt(x.keyword, 60), effect: txt(x.effect, 300) })).filter((x) => x.keyword);
      if (traits.length > 8) fail('Höchstens 8 Merkmale je Planet');
      st.planetTraits ??= {};
      if (traits.length) st.planetTraits[cmd.planetId] = traits;
      else delete st.planetTraits[cmd.planetId];
      log(ctx, `Planeten-Merkmale ${planetName(cmd.planetId)}: ${traits.map((x) => x.keyword).join(', ') || '–'}`);
      return;
    }
  }
}

/** Merkmale eines Planeten (A9) */
export const planetTraits = (st: Pick<CampaignState, 'planetTraits'>, planetId: string | null | undefined): PlanetTrait[] => (planetId ? (st.planetTraits?.[planetId] ?? []) : []);
