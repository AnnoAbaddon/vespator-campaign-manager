import { modifierActive } from '@/engine/graph';
import { house } from '@/engine/houseRules';
import { PHASE_STEPS, type CampaignState, type PhaseStep } from '@/engine/types';

/**
 * Vorschau für die Weiter-Taste im Cockpit (ohne React, testbar): Ziel des Weiterschaltens und – im Schritt
 * „Operationen wählen“ – wie viele Flotten ohne Befehl automatisch eine Standardoperation bekommen.
 * Die Regeln entsprechen der Engine (engine/phase.ts, ADVANCE aus OPS).
 */
export function advancePreview(state: CampaignState): { next: PhaseStep | 'NEXT_PHASE' | null; openOrders: number; auxilia: boolean } | null {
  const st = state.stage;
  if (st.kind !== 'PHASE') return null;
  const ph = state.phases.find((p) => p.number === st.phase);
  if (!ph) return null;
  const idx = PHASE_STEPS.indexOf(st.step);
  const next = st.step === 'BUILD' ? 'NEXT_PHASE' : (PHASE_STEPS[idx + 1] ?? null);
  const openOrders = st.step === 'OPS' ? state.fleets.filter((f) => f.planetId && !ph.operations.some((o) => o.fleetId === f.id && o.slot === 1)).length : 0;
  // Hausregel F-6 hebt nur das Verbot durch Sinister Omens auf; der Kampagnen-Schalter geht immer vor
  const auxilia = state.toggles.operations.logisticalAuxilia && (house(state, 'F6_AUXILIA_ANYWAY') || !modifierActive(state, 'NO_LOGISTICAL_AUXILIA', ph.number));
  return { next, openOrders, auxilia };
}
