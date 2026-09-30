import type { CampaignState } from '@/engine/types';
import { house } from '@/engine/houseRules';

/**
 * Wie weit das Power Level für Mission Rules verschoben werden darf: ±1 bei mindestens einer Quelle,
 * mit Hausregel F-15 („Quellen stapeln“) ±1 je Quelle.
 */
export function shiftRange(state: Pick<CampaignState, 'toggles'>, sources: number): number {
  if (sources <= 0) return 0;
  return house(state, 'F15_TREAT_STACKS') ? sources : 1;
}

/** Wert der Missionsregel bei tatsächlichem PL und bei allen zulässigen Verschiebungen */
export function shiftedValue(f: (x: number) => number | string, pl: number, range: number): string {
  const real = String(f(pl));
  if (!range) return real;
  const alt: string[] = [];
  for (let d = -range; d <= range; d++) if (d) alt.push(`${d > 0 ? '+' : '−'}${Math.abs(d)}: ${f(pl + d)}`);
  return `${real} (${alt.join(' / ')})`;
}
