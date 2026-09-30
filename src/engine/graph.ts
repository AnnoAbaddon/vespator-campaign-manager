import type { CampaignState, ModifierKind } from './types';
import { adjacent, distance, neighbours, planetIds } from './map';
import { house } from './houseRules';

export { adjacent, distance, neighbours };

export function modifierActive(state: CampaignState, kind: ModifierKind, phase: number | null, allianceId?: string | null): boolean {
  if (phase === null) return false;
  return state.modifiers.some((m) => m.kind === kind && m.phaseNumber === phase && (allianceId === undefined || m.allianceId === allianceId));
}

export function currentPhaseNumber(state: CampaignState): number | null {
  return state.stage.kind === 'PHASE' ? state.stage.phase : null;
}

export function hasSupportFacility(state: CampaignState, allianceId: string, planetId: string): boolean {
  const p = state.planets.find((x) => x.id === planetId);
  return !!p?.slots.some((s) => !s.destroyed && s.infra?.type === 'SUPPORT_FACILITY' && s.infra.allianceId === allianceId);
}

/**
 * „Connected“ aus Sicht einer Allianz (SPEC 7.1): Nachbar im Basisgraphen oder
 * Distanz 2 von einem Planeten mit eigener Support Facility (gerichtet).
 */
export function connectedFor(
  state: CampaignState,
  allianceId: string,
  from: string,
  to: string,
  phase: number | null = currentPhaseNumber(state),
  purpose: 'move' | 'other' = 'other',
): boolean {
  if (from === to) return false;
  if (adjacent(from, to)) return true;
  if (modifierActive(state, 'SUPPORT_FACILITIES_INACTIVE', phase)) return false;
  // F-18: Standard – Support Facility gilt überall; Hausregel: nur für Flottenbewegung
  if (purpose !== 'move' && house(state, 'F18_FACILITY_MOVE_ONLY')) return false;
  return distance(from, to) === 2 && hasSupportFacility(state, allianceId, from);
}

export function connectedPlanets(state: CampaignState, allianceId: string, from: string, phase: number | null = currentPhaseNumber(state), purpose: 'move' | 'other' = 'other'): string[] {
  return planetIds(state).filter((id) => connectedFor(state, allianceId, from, id, phase, purpose));
}

/** Planet selbst oder für die Allianz von dort verbunden */
export function selfOrConnected(state: CampaignState, allianceId: string, from: string, phase: number | null = currentPhaseNumber(state)): string[] {
  return [from, ...connectedPlanets(state, allianceId, from, phase)];
}

/** Liegt `target` in Reichweite einer Infrastruktur auf `infraPlanet`? (this or a connected Planet) */
export function inRangeOf(state: CampaignState, allianceId: string, infraPlanet: string, target: string, phase: number | null = currentPhaseNumber(state)): boolean {
  return infraPlanet === target || connectedFor(state, allianceId, infraPlanet, target, phase);
}
