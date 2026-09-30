import { isIsoDate } from './logTime';
import { fail, log, warn, type Ctx } from './ctx';
import { alliance, allianceName, campaignPoints } from './board';
import { effectiveVictor } from './outcomes';
import { planetHolder } from './narrative';
import { allianceOf } from './players';
import type { CampaignState } from './types';

/**
 * Endwertung (C2, Hausregel) und Finale „Großschlacht“ (C6). Standard ist das Buch: Sieger ist, wer nach der
 * letzten Phase die meisten Kampagnenpunkte hat. Alternativen und Boni verändern nur die Endwertung – die
 * Kampagnenpunkte und alle Schwellen während der Kampagne bleiben exakt nach Buch.
 */

export type EndScoringMode = 'BOOK' | 'BATTLES' | 'PLANETS';

export interface EndScoring {
  mode: EndScoringMode;
  /** PLANETS: Gewicht je Planet (fehlend = 1) */
  planetWeights?: Record<string, number>;
}

export interface GrandFinaleRules {
  enabled: boolean;
  /** Bonus für die Endwertung je Platz (Index 0 = Platz 1) */
  bonus: number[];
}

export const DEFAULT_GRAND_BONUS = [5, 2, 0];

export const END_SCORING_LABEL: Record<EndScoringMode, string> = {
  BOOK: 'Kampagnenpunkte (Buch)',
  BATTLES: 'Summe der gewonnenen Schlachten',
  PLANETS: 'gewichtete Planeten (höchstes Power Level)',
};

export interface GrandTable {
  id: string;
  label: string;
  /** Sieger dieses Tisches bzw. Ziels; null = offen oder unentschieden */
  winnerAllianceId: string | null;
}

export interface GrandBattle {
  name: string;
  mission: string;
  scheduledAt: string | null;
  report: string;
  /** Teilnehmer je Allianz */
  participants: Record<string, string[]>;
  /** Ergebnis je Tisch bzw. Ziel */
  tables: GrandTable[];
  /** Platzierung (1 = bester) durch den Warmaster; null = aus den Tischen */
  placement: Record<string, number> | null;
  /** Ergebnis steht fest und geht in die Endwertung ein */
  done: boolean;
}

export interface FinalScores {
  mode: EndScoringMode;
  base: Record<string, number>;
  bonus: Record<string, number>;
  total: Record<string, number>;
  /** Herkunft der Boni */
  items: { allianceId: string; points: number; reason: string }[];
}

export const endScoringMode = (st: Pick<CampaignState, 'toggles'>): EndScoringMode => st.toggles.endScoring?.mode ?? 'BOOK';
export const grandEnabled = (st: Pick<CampaignState, 'toggles'>) => st.toggles.grandFinale?.enabled === true;

/** Grundwert der Endwertung je Allianz nach der gewählten Wertung */
export function baseScores(st: CampaignState): Record<string, number> {
  const mode = endScoringMode(st);
  const out: Record<string, number> = Object.fromEntries(st.alliances.map((a) => [a.id, 0]));
  if (mode === 'BATTLES') {
    for (const b of st.battles) {
      if (b.kind !== 'CAMPAIGN' || b.status !== 'PROCESSED') continue;
      const v = effectiveVictor(b);
      if (v === 'ATTACKER') out[b.attackerAllianceId] = (out[b.attackerAllianceId] ?? 0) + 1;
      if (v === 'DEFENDER') out[b.defenderAllianceId] = (out[b.defenderAllianceId] ?? 0) + 1;
    }
    return out;
  }
  if (mode === 'PLANETS') {
    const w = st.toggles.endScoring?.planetWeights ?? {};
    for (const p of st.planets) {
      const h = planetHolder(st, p.id);
      if (h) out[h] += Math.max(0, w[p.id] ?? 1);
    }
    return out;
  }
  const last = st.pointsHistory.find((h) => h.phaseNumber === st.meta.phaseCount) ?? st.pointsHistory.at(-1);
  for (const a of st.alliances) out[a.id] = last?.points[a.id] ?? campaignPoints(st, a.id);
  return out;
}

/** Platzierung der Großschlacht: vom Warmaster gesetzt oder nach gewonnenen Tischen (Gleichstand = gleicher Platz) */
export function grandPlacement(st: CampaignState): Record<string, number> | null {
  const g = st.grandBattle;
  if (!g) return null;
  if (g.placement && Object.keys(g.placement).length) return g.placement;
  const wins: Record<string, number> = Object.fromEntries(st.alliances.map((a) => [a.id, 0]));
  let any = false;
  for (const t of g.tables) {
    if (t.winnerAllianceId && t.winnerAllianceId in wins) {
      wins[t.winnerAllianceId]++;
      any = true;
    }
  }
  if (!any) return null;
  return Object.fromEntries(st.alliances.map((a) => [a.id, 1 + st.alliances.filter((b) => wins[b.id] > wins[a.id]).length]));
}

export function finalScores(st: CampaignState): FinalScores {
  const base = baseScores(st);
  const items: FinalScores['items'] = [];
  for (const b of st.endBonus ?? []) items.push({ allianceId: b.allianceId, points: b.points, reason: b.reason });
  if (grandEnabled(st) && st.grandBattle?.done) {
    const place = grandPlacement(st);
    const bonus = st.toggles.grandFinale?.bonus ?? DEFAULT_GRAND_BONUS;
    if (place) for (const a of st.alliances) if (place[a.id] && bonus[place[a.id] - 1]) items.push({ allianceId: a.id, points: bonus[place[a.id] - 1], reason: `Großschlacht: Platz ${place[a.id]}` });
  }
  const bonus: Record<string, number> = Object.fromEntries(st.alliances.map((a) => [a.id, 0]));
  for (const i of items) if (i.allianceId in bonus) bonus[i.allianceId] += i.points;
  const total = Object.fromEntries(st.alliances.map((a) => [a.id, (base[a.id] ?? 0) + bonus[a.id]]));
  return { mode: endScoringMode(st), base, bonus, total, items };
}

/** Weicht die Endwertung vom Buch ab (andere Wertung oder Boni)? */
export const scoresDeviate = (s: FinalScores) => s.mode !== 'BOOK' || s.items.length > 0;

// ─── C6 Großschlacht ────────────────────────────────────────────────────────

export function emptyGrandBattle(st: CampaignState): GrandBattle {
  return {
    name: 'Großschlacht',
    mission: '',
    scheduledAt: null,
    report: '',
    participants: Object.fromEntries(st.alliances.map((a) => [a.id, []])),
    tables: [],
    placement: null,
    done: false,
  };
}

export type GrandUpdate = Partial<Omit<GrandBattle, 'participants'>> & { participants?: Record<string, string[]> };

const inLastPhase = (st: CampaignState) => st.stage.kind === 'PHASE' && st.stage.phase === st.meta.phaseCount;

export function updateGrand(ctx: Ctx, u: GrandUpdate) {
  const st = ctx.state;
  if (!grandEnabled(st)) fail('Die Großschlacht ist nicht aktiviert');
  if (st.stage.kind === 'ENDED' || st.stage.kind === 'TIEBREAK') fail('Die Kampagne ist beendet');
  const g = st.grandBattle ?? emptyGrandBattle(st);
  if (u.name !== undefined) {
    if (!u.name.trim()) fail('Name fehlt');
    g.name = u.name.trim().slice(0, 120);
  }
  if (u.mission !== undefined) g.mission = u.mission.trim().slice(0, 200);
  if (u.report !== undefined) g.report = u.report.slice(0, 5000);
  if (u.scheduledAt !== undefined) {
    if (u.scheduledAt && !isIsoDate(u.scheduledAt)) fail('Ungültiger Termin');
    g.scheduledAt = u.scheduledAt || null;
  }
  if (u.participants) {
    const next: Record<string, string[]> = {};
    for (const [al, ids] of Object.entries(u.participants)) {
      alliance(st, al);
      next[al] = [...new Set(ids)];
      for (const id of next[al]) {
        const p = st.players.find((x) => x.id === id);
        if (!p) fail('Spieler nicht gefunden');
        const cur = allianceOf(p, st.meta.phaseCount);
        if (cur && cur !== al) warn(ctx, `${p.nickname} kämpft nicht für die eigene Allianz`);
      }
    }
    g.participants = next;
  }
  const results = u.tables !== undefined || u.placement !== undefined || u.done !== undefined;
  if (results && (u.tables?.some((t) => t.winnerAllianceId) || (u.placement && Object.keys(u.placement).length) || u.done) && !inLastPhase(st)) fail('Ergebnisse der Großschlacht erst in der letzten Phase');
  if (u.tables) {
    for (const t of u.tables) {
      if (!t.id || !t.label.trim()) fail('Jeder Tisch braucht eine Bezeichnung');
      if (t.winnerAllianceId) alliance(st, t.winnerAllianceId);
    }
    g.tables = u.tables.map((t) => ({ id: t.id, label: t.label.trim().slice(0, 80), winnerAllianceId: t.winnerAllianceId || null }));
  }
  if (u.placement !== undefined) {
    if (u.placement) {
      for (const [al, n] of Object.entries(u.placement)) {
        alliance(st, al);
        if (!Number.isInteger(n) || n < 1 || n > st.alliances.length) fail('Ungültige Platzierung');
      }
      g.placement = Object.keys(u.placement).length ? u.placement : null;
    } else g.placement = null;
  }
  if (u.done !== undefined) g.done = u.done;
  st.grandBattle = g;
  if (u.done === true) {
    const place = grandPlacement(st);
    if (!place) fail('Ohne Tischergebnisse oder Platzierung gibt es kein Ergebnis');
    log(
      ctx,
      `Großschlacht entschieden: ${[...st.alliances]
        .sort((a, b) => place[a.id] - place[b.id])
        .map((a) => `${place[a.id]}. ${a.name}`)
        .join(', ')}`,
    );
  } else log(ctx, `Großschlacht aktualisiert: ${g.name}`);
}

/** Spieler tritt der Großschlacht für seine Allianz bei bzw. zieht sich zurück */
export function joinGrand(ctx: Ctx, playerId: string, join: boolean) {
  const st = ctx.state;
  if (!grandEnabled(st)) fail('Die Großschlacht ist nicht aktiviert');
  if (st.stage.kind === 'ENDED' || st.stage.kind === 'TIEBREAK') fail('Die Kampagne ist beendet');
  const g = st.grandBattle ?? emptyGrandBattle(st);
  if (g.done) fail('Die Großschlacht ist bereits entschieden');
  const p = st.players.find((x) => x.id === playerId);
  if (!p) fail('Spieler nicht gefunden');
  const al = allianceOf(p, st.stage.kind === 'PHASE' ? st.stage.phase : st.meta.phaseCount);
  if (!al) fail('Du gehörst keiner Allianz an');
  const list = g.participants[al] ?? [];
  if (join === list.includes(p.id)) fail(join ? 'Du bist bereits eingetragen' : 'Du bist nicht eingetragen');
  g.participants[al] = join ? [...list, p.id] : list.filter((x) => x !== p.id);
  st.grandBattle = g;
  log(ctx, join ? `${p.nickname} kämpft in der Großschlacht für ${allianceName(st, al)}` : `${p.nickname} zieht sich aus der Großschlacht zurück`);
}
