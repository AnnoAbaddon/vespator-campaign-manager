import { warn, type Ctx } from './ctx';
import { playersOfAlliance } from './players';
import { isAbsent } from './lifecycle';
import { nemesisMatch } from './narrative';
import type { Battle, CampaignState, Participant } from './types';

/**
 * Paarungs-Historie im Verteidigervorschlag (A3) und harte Obergrenze je Spieler und Phase (A4).
 * Gäste (B3) stehen nicht in den Teilnehmerlisten und zählen daher weder für Spiellast noch für Paarungen.
 */

const ids = (l: Participant[]) => l.map((p) => p.playerId);

/** Gespielte Paarungen zwischen zwei Spielern (Schlachten, Einzelspiele, bestätigte freie Gefechte) */
export function pairingCounts(state: CampaignState): Map<string, number> {
  const out = new Map<string, number>();
  const add = (x: string, y: string) => {
    if (x === y) return;
    const k = x < y ? `${x}|${y}` : `${y}|${x}`;
    out.set(k, (out.get(k) ?? 0) + 1);
  };
  const pairs = (as: string[], ds: string[]) => {
    for (const a of new Set(as)) for (const d of new Set(ds)) add(a, d);
  };
  for (const b of state.battles) {
    if (b.status !== 'PLAYED' && b.status !== 'PROCESSED') continue;
    if (b.unplayedResolution) continue;
    if (b.games?.length) for (const g of b.games) pairs(ids(g.attackers), ids(g.defenders));
    else pairs(ids(b.attackers), ids(b.defenders));
  }
  for (const s of state.skirmishes ?? []) if (s.status === 'CONFIRMED') pairs(ids(s.a.players), ids(s.b.players));
  return out;
}

export const pairingCount = (counts: Map<string, number>, x: string, y: string) => counts.get(x < y ? `${x}|${y}` : `${y}|${x}`) ?? 0;

export interface DefenderCandidate {
  playerId: string;
  /** Schlachten in dieser Phase */
  load: number;
  /** Schlachten insgesamt */
  total: number;
  /** bisherige Paarungen gegen die Angreifer (Summe) */
  pairings: number;
  /** Angreifer, gegen die der Spieler noch nie gespielt hat */
  fresh: string[];
  /** Nemesis-Paarung (C5), die noch nie gespielt wurde – wird bevorzugt */
  nemesis?: boolean;
  /** harte Obergrenze (A4) erreicht */
  capped: boolean;
}

/** Schlachten je Spieler (nur Schlachten mit Teilnehmern, ohne verfallene), optional ohne eine Schlacht */
function loads(state: CampaignState, phase: number | null, exclude?: string) {
  const all: Record<string, number> = {};
  const def: Record<string, number> = {};
  for (const b of state.battles) {
    if (b.status === 'VOID' || b.id === exclude || (phase !== null && b.phaseNumber !== phase)) continue;
    for (const id of new Set([...ids(b.attackers), ...ids(b.defenders)])) all[id] = (all[id] ?? 0) + 1;
    for (const id of new Set(ids(b.defenders))) def[id] = (def[id] ?? 0) + 1;
  }
  return { all, def };
}

/**
 * Verteidiger-Kandidaten einer Allianz, bestes zuerst: harte Obergrenze nicht erreicht, wenigste Schlachten
 * dieser Phase, dann die wenigsten bisherigen Paarungen gegen die Angreifer, dann die wenigsten Schlachten insgesamt.
 */
export function rankDefenders(state: CampaignState, allianceId: string, phaseNumber: number, attackerIds: string[] = [], excludeBattleId?: string): DefenderCandidate[] {
  const now = loads(state, phaseNumber, excludeBattleId);
  const total = loads(state, null, excludeBattleId).all;
  const counts = pairingCounts(state);
  const opp = [...new Set(attackerIds)];
  // A5: abwesende Spieler werden nicht vorgeschlagen
  const members = playersOfAlliance(state, allianceId, phaseNumber).filter((p) => p.active && !isAbsent(state, p.id, phaseNumber));
  const nick = (id: string) => members.find((p) => p.id === id)?.nickname ?? '';
  return members
    .map((p) => ({
      playerId: p.id,
      load: now.all[p.id] ?? 0,
      total: total[p.id] ?? 0,
      pairings: opp.reduce((n, a) => n + pairingCount(counts, p.id, a), 0),
      fresh: opp.filter((a) => a !== p.id && pairingCount(counts, p.id, a) === 0),
      capped: !!capReason(state, phaseNumber, p.id, 'DEFENDER', excludeBattleId),
      nemesis: nemesisMatch(state, p.id, opp),
    }))
    .sort((a, b) => Number(a.capped) - Number(b.capped) || Number(b.nemesis) - Number(a.nemesis) || a.load - b.load || a.pairings - b.pairings || a.total - b.total || nick(a.playerId).localeCompare(nick(b.playerId)));
}

// ─── Harte Obergrenze (A4) ─────────────────────────────────────────────────

export function loadCap(state: Pick<CampaignState, 'toggles'>): { maxDefences: number | null; maxGames: number | null } | null {
  const c = state.toggles.loadCap;
  if (!c) return null;
  const d = c.maxDefences && c.maxDefences > 0 ? c.maxDefences : null;
  const g = c.maxGames && c.maxGames > 0 ? c.maxGames : null;
  return d || g ? { maxDefences: d, maxGames: g } : null;
}

/**
 * Würde ein zusätzlicher Eintrag die harte Obergrenze überschreiten? Liefert die Art der Grenze oder null.
 * Gezählt werden die übrigen Schlachten der Phase (ohne `excludeBattleId`).
 */
export function capReason(state: CampaignState, phase: number, playerId: string, side: 'ATTACKER' | 'DEFENDER', excludeBattleId?: string): 'DEFENCES' | 'GAMES' | null {
  const cap = loadCap(state);
  if (!cap) return null;
  const l = loads(state, phase, excludeBattleId);
  if (side === 'DEFENDER' && cap.maxDefences && (l.def[playerId] ?? 0) >= cap.maxDefences) return 'DEFENCES';
  if (cap.maxGames && (l.all[playerId] ?? 0) >= cap.maxGames) return 'GAMES';
  return null;
}

/**
 * Prüft die harte Obergrenze für Spieler, die neu in eine Schlacht eingetragen werden. Überschreiten ist
 * eine Warnung: der Spielleiter hebt sie per Override mit Begründung auf, Spielerlinks scheitern daran.
 */
export function checkCap(ctx: Ctx, b: Battle, added: { playerId: string; side: 'ATTACKER' | 'DEFENDER' }[]) {
  const st = ctx.state;
  const cap = loadCap(st);
  if (!cap) return;
  for (const a of added) {
    const r = capReason(st, b.phaseNumber, a.playerId, a.side, b.id);
    if (!r) continue;
    const name = st.players.find((p) => p.id === a.playerId)?.nickname ?? '?';
    warn(
      ctx,
      r === 'DEFENCES'
        ? `Obergrenze: ${name} hat in Phase ${b.phaseNumber} bereits ${cap.maxDefences} Verteidigung(en) – nur per Override`
        : `Obergrenze: ${name} hat in Phase ${b.phaseNumber} bereits ${cap.maxGames} Schlacht(en) – nur per Override`,
    );
  }
}

/** Neu eingetragene Spieler einer Schlacht gegenüber einem früheren Stand */
export function addedParticipants(before: Pick<Battle, 'attackers' | 'defenders'>, after: Pick<Battle, 'attackers' | 'defenders'>): { playerId: string; side: 'ATTACKER' | 'DEFENDER' }[] {
  const out: { playerId: string; side: 'ATTACKER' | 'DEFENDER' }[] = [];
  for (const id of new Set(ids(after.attackers))) if (!ids(before.attackers).includes(id)) out.push({ playerId: id, side: 'ATTACKER' });
  for (const id of new Set(ids(after.defenders))) if (!ids(before.defenders).includes(id)) out.push({ playerId: id, side: 'DEFENDER' });
  return out;
}
