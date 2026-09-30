import { campaignPoints } from './board';
import type { CampaignState } from './types';

/**
 * Nebel über dem Punktestand (C1, Hausregel): Leseansicht, Spielerlinks und Präsentation zeigen statt der
 * Kampagnenpunkte nur Rangfolge und Tendenz. Die Engine rechnet intern unverändert exakt weiter (Schwellen
 * von Open Tome, Perils of Power usw.) – der Nebel entsteht allein in der öffentlichen Projektion.
 * Mit dem Kampagnenende wird aufgedeckt.
 */

export type Tendency = 'LEAD_CLEAR' | 'LEAD' | 'EVEN' | 'BEHIND' | 'BEHIND_CLEAR';

export interface FogView {
  /** Stand am Ende dieser Phase (0 = Kampagnenstart, null = noch keine Wertung) */
  phaseNumber: number | null;
  /** Rang je Allianz (1 = vorn, Gleichstand = gleicher Rang) */
  rank: Record<string, number>;
  tendency: Record<string, Tendency>;
}

/** Abstand, ab dem eine Führung als deutlich gilt (wie die 5-Punkte-Schwellen der Events) */
export const FOG_CLEAR_GAP = 5;

export const TENDENCY_LABEL: Record<Tendency, string> = {
  LEAD_CLEAR: 'deutlich vorn',
  LEAD: 'knapp vorn',
  EVEN: 'gleichauf',
  BEHIND: 'knapp dahinter',
  BEHIND_CLEAR: 'deutlich zurück',
};

/** Ist der Nebel für diesen Stand aktiv? `reveal` deckt auf (z. B. Phasenstände nach Kampagnenende). */
export function fogActive(st: Pick<CampaignState, 'toggles' | 'stage'>, reveal = false): boolean {
  return st.toggles.fog === true && st.stage.kind !== 'ENDED' && !reveal;
}

/** Rangfolge und Tendenz aus dem letzten veröffentlichten Punktestand (ohne Wertung: aktueller Stand) */
export function fogStandings(st: CampaignState): FogView {
  const last = st.pointsHistory.at(-1);
  const pts: Record<string, number> = Object.fromEntries(st.alliances.map((a) => [a.id, last?.points[a.id] ?? campaignPoints(st, a.id)]));
  const values = st.alliances.map((a) => pts[a.id]).sort((x, y) => y - x);
  const top = values[0] ?? 0;
  const second = values[1] ?? top;
  const rank: Record<string, number> = {};
  const tendency: Record<string, Tendency> = {};
  for (const a of st.alliances) {
    const p = pts[a.id];
    rank[a.id] = 1 + values.filter((v) => v > p).length;
    const gap = top - p;
    if (gap === 0) tendency[a.id] = top === second ? 'EVEN' : top - second >= FOG_CLEAR_GAP ? 'LEAD_CLEAR' : 'LEAD';
    else tendency[a.id] = gap >= FOG_CLEAR_GAP ? 'BEHIND_CLEAR' : 'BEHIND';
  }
  return { phaseNumber: last ? last.phaseNumber : null, rank, tendency };
}

/**
 * Wendet den Nebel auf eine bereits öffentliche Projektion an: Punkteverlauf und Punkte-Boni fallen weg,
 * dafür steht `fog` (Rang und Tendenz) im Zustand. `orig` ist der ungefilterte Stand.
 */
export function applyFog(s: CampaignState, orig: CampaignState) {
  s.fog = fogStandings(orig);
  s.pointsHistory = [];
  if (s.endBonus) s.endBonus = [];
  // Punkte-Boni aus eigenen Ereignissen verraten sonst die Zahlen (Rang und Tendenz stehen in `fog`)
  if (s.pointsBonus) s.pointsBonus = [];
  // Review: die Endwertung (z. B. im Stechen vor dem Kampagnenende) nennt die exakten Punkte
  if (s.result?.scores) {
    s.result = { ...s.result };
    delete s.result.scores;
  }
}
