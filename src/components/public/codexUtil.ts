import type { CampaignState, Dispatch } from '@/engine/types';

/**
 * Ordnet einen Dispatch nach seinem Datum einer Phase zu (N3.1): die letzte Phase, die zu diesem Zeitpunkt
 * begonnen hatte (Startdatum). Meldungen nach dem Ende einer Phase, aber vor dem Start der nächsten, gehören
 * noch zur beendeten Phase. Vor der ersten Phase oder ohne Phasendaten: null (allgemeiner Abschnitt).
 */
export function dispatchPhase(phases: Pick<CampaignState['phases'][number], 'number' | 'startDate'>[], at: string): number | null {
  const t = Date.parse(at);
  if (Number.isNaN(t)) return null;
  let hit: number | null = null;
  let best = -Infinity;
  for (const p of phases) {
    if (!p.startDate) continue;
    const s = Date.parse(p.startDate);
    if (Number.isNaN(s) || s > t) continue;
    if (s > best || (s === best && hit !== null && p.number > hit)) {
      best = s;
      hit = p.number;
    }
  }
  return hit;
}

/** Dispatches je Phase (chronologisch); Schlüssel 0 = keiner Phase zuzuordnen */
export function dispatchesByPhase(state: Pick<CampaignState, 'phases' | 'dispatches'>): Map<number, Dispatch[]> {
  const out = new Map<number, Dispatch[]>();
  for (const d of [...state.dispatches].sort((a, b) => a.at.localeCompare(b.at))) {
    const n = dispatchPhase(state.phases, d.at) ?? 0;
    out.set(n, [...(out.get(n) ?? []), d]);
  }
  return out;
}
