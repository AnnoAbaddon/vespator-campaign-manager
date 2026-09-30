import { fail, log, type Ctx } from './ctx';
import { isIsoDate } from './logTime';
import { allianceOf, stagePhase } from './players';
import type { CampaignState, Participant, Skirmish } from './types';

/**
 * Hausregel „Freie Gefechte“ (B5): Spiele zwischen zwei Allianzen außerhalb der Befehle. Ein Spieler meldet,
 * die Gegenseite (oder der Spielleiter) bestätigt. Wirkung einstellbar: nur Statistik oder ein kleiner
 * Kampagnenpunkt-Bonus je Sieg, insgesamt gedeckelt je Allianz. Standard: aus (Regelbuch).
 */

export const skirmishesActive = (st: Pick<CampaignState, 'toggles'>) => st.toggles.freeSkirmishes?.enabled === true;

export interface SkirmishInput {
  aAllianceId: string;
  aPlayerIds: string[];
  bAllianceId: string;
  bPlayerIds: string[];
  playedAt: string | null;
  vp: { a: number; b: number } | null;
  /** nur ohne VP nötig */
  winner?: 'A' | 'B' | 'DRAW';
  mission: string;
  note: string;
}

const MAX_PER_SIDE = 4;

/** Kampagnenpunkt-Bonus einer Allianz aus bestätigten freien Gefechten (nur mit Belohnung „Punkte“) */
export function skirmishBonus(st: Pick<CampaignState, 'toggles' | 'skirmishes'>, allianceId: string): number {
  const cfg = st.toggles.freeSkirmishes;
  if (!cfg?.enabled || cfg.reward !== 'POINTS' || !(cfg.pointsPerWin > 0)) return 0;
  let wins = 0;
  for (const s of st.skirmishes ?? []) {
    if (s.status !== 'CONFIRMED' || s.winner === 'DRAW') continue;
    if ((s.winner === 'A' ? s.a : s.b).allianceId === allianceId) wins++;
  }
  return Math.min(Math.max(0, cfg.maxBonus), wins * cfg.pointsPerWin);
}

function participants(st: CampaignState, allianceId: string, playerIds: string[], phase: number): Participant[] {
  const uniq = [...new Set(playerIds.filter(Boolean))];
  if (!uniq.length) fail('Je Seite mindestens einen Spieler angeben');
  if (uniq.length > MAX_PER_SIDE) fail(`Höchstens ${MAX_PER_SIDE} Spieler je Seite`);
  return uniq.map((id) => {
    const p = st.players.find((x) => x.id === id);
    if (!p) fail('Unbekannter Spieler');
    if (allianceOf(p, phase) !== allianceId) fail(`${p.nickname} gehört nicht zu dieser Allianz`);
    return { playerId: p.id, faction: p.faction };
  });
}

/** Freies Gefecht melden: Spieler (Status offen, Gegenseite bestätigt) oder Spielleiter (sofort bestätigt) */
export function reportSkirmish(ctx: Ctx, playerId: string | null, input: SkirmishInput) {
  const st = ctx.state;
  if (!skirmishesActive(st)) fail('Die Hausregel „Freie Gefechte“ ist nicht aktiv');
  if (st.stage.kind === 'SETUP') fail('Freie Gefechte gibt es erst nach dem Kampagnenstart');
  const phase = Math.max(1, stagePhase(st));
  if (input.aAllianceId === input.bAllianceId) fail('Ein freies Gefecht braucht zwei verschiedene Allianzen');
  for (const a of [input.aAllianceId, input.bAllianceId]) if (!st.alliances.some((x) => x.id === a)) fail('Unbekannte Allianz');
  const a = participants(st, input.aAllianceId, input.aPlayerIds, phase);
  const b = participants(st, input.bAllianceId, input.bPlayerIds, phase);
  if (playerId && !a.some((p) => p.playerId === playerId)) fail('Melden kann nur, wer selbst mitgespielt hat');
  let vp: Skirmish['vp'] = null;
  let winner: Skirmish['winner'];
  if (input.vp) {
    if (!Number.isFinite(input.vp.a) || !Number.isFinite(input.vp.b) || input.vp.a < 0 || input.vp.b < 0) fail('VP dürfen nicht negativ sein');
    vp = { a: Math.round(input.vp.a), b: Math.round(input.vp.b) };
    winner = vp.a > vp.b ? 'A' : vp.b > vp.a ? 'B' : 'DRAW';
  } else if (input.winner) winner = input.winner;
  else fail('Siegpunkte oder Sieger angeben');
  const playedAt = isIsoDate(input.playedAt) ? input.playedAt : null;
  const s: Skirmish = {
    id: ctx.newId('sk'),
    phaseNumber: phase,
    playedAt,
    a: { allianceId: input.aAllianceId, players: a },
    b: { allianceId: input.bAllianceId, players: b },
    vp,
    winner,
    mission: input.mission.trim().slice(0, 80),
    note: input.note.trim().slice(0, 500),
    byPlayerId: playerId,
    status: playerId ? 'PENDING' : 'CONFIRMED',
    at: ctx.now,
  };
  st.skirmishes = [...(st.skirmishes ?? []), s];
  log(ctx, `Freies Gefecht ${playerId ? 'gemeldet' : 'eingetragen'}: ${label(st, s)}${playerId ? ' – wartet auf Bestätigung der Gegenseite' : ''}`);
}

/** Kurzbeschreibung: „Rot (P1) vs. Blau (P2): Rot siegt“ */
export function label(st: CampaignState, s: Skirmish): string {
  const al = (id: string) => st.alliances.find((a) => a.id === id)?.name ?? '?';
  const pl = (l: Participant[]) => l.map((p) => st.players.find((x) => x.id === p.playerId)?.nickname ?? '?').join(' & ');
  const res = s.winner === 'DRAW' ? 'Unentschieden' : `${al((s.winner === 'A' ? s.a : s.b).allianceId)} siegt`;
  return `${al(s.a.allianceId)} (${pl(s.a.players)}) vs. ${al(s.b.allianceId)} (${pl(s.b.players)}): ${res}`;
}

/** Darf der Spieler dieses Gefecht bestätigen? Gegenseite: eingetragener Spieler der Seite B */
export function mayConfirmSkirmish(st: CampaignState, s: Skirmish, playerId: string): boolean {
  return s.status === 'PENDING' && s.byPlayerId !== playerId && s.b.players.some((p) => p.playerId === playerId);
}

export function confirmSkirmish(ctx: Ctx, id: string, playerId: string | null) {
  const st = ctx.state;
  const s = (st.skirmishes ?? []).find((x) => x.id === id);
  if (!s) fail('Freies Gefecht nicht gefunden');
  if (s.status === 'CONFIRMED') fail('Bereits bestätigt');
  if (playerId && !mayConfirmSkirmish(st, s, playerId)) fail('Bestätigen muss ein Spieler der Gegenseite');
  s.status = 'CONFIRMED';
  const name = playerId ? (st.players.find((p) => p.id === playerId)?.nickname ?? '?') : 'Spielleiter';
  log(ctx, `Freies Gefecht bestätigt von ${name}: ${label(st, s)}`);
}

/** Löschen: Spielleiter immer; Spieler nur die eigene, noch offene Meldung (oder als Gegenseite ablehnen) */
export function deleteSkirmish(ctx: Ctx, id: string, playerId: string | null) {
  const st = ctx.state;
  const s = (st.skirmishes ?? []).find((x) => x.id === id);
  if (!s) fail('Freies Gefecht nicht gefunden');
  if (playerId && !(s.status === 'PENDING' && (s.byPlayerId === playerId || s.b.players.some((p) => p.playerId === playerId)))) fail('Nur offene Meldungen der Beteiligten lassen sich zurückziehen');
  st.skirmishes = (st.skirmishes ?? []).filter((x) => x.id !== id);
  log(ctx, `Freies Gefecht gelöscht: ${label(st, s)}`);
}
