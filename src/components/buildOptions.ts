import { BUILDABLE_TYPES, INFRA, type InfraType } from '@/engine/data/vespator';
import { canBuild, countInfra, freeSlotIndex } from '@/engine/board';
import { planetName } from '@/engine/map';
import type { CampaignState } from '@/engine/types';
import { house } from '@/engine/houseRules';

/**
 * Gültige Bauoptionen (SPEC 9.11: „listet nur gültige Planeten und Typen“) mit derselben Prüfung wie die Engine
 * (canBuild): Typen am Limit und volle bzw. zerstörte Planeten fallen weg. `type`/`planetId` schränken die jeweils
 * andere Liste auf passende Kombinationen ein. `atLimit`/`full` nennen die weggelassenen Optionen für einen Hinweis.
 */
export function buildOptions(state: CampaignState, allianceId: string, candidates: string[], sel: { type?: InfraType | ''; planetId?: string } = {}) {
  const ok = (ty: InfraType, p: string) => !canBuild(state, allianceId, ty, p);
  const types = BUILDABLE_TYPES.filter((ty) => (sel.planetId ? ok(ty, sel.planetId) : candidates.some((p) => ok(ty, p))));
  const planets = candidates.filter((p) => (sel.type ? ok(sel.type, p) : BUILDABLE_TYPES.some((ty) => ok(ty, p))));
  const atLimit = BUILDABLE_TYPES.filter((ty) => countInfra(state, allianceId, ty) >= INFRA[ty].max);
  const full = candidates.filter((p) => freeSlotIndex(state, p) < 0 && !state.planets.find((x) => x.id === p)?.destroyed);
  return {
    types,
    planets,
    /** Typen am Limit (z. B. „Staging Grounds 3/3“) */
    atLimit: atLimit.map((ty) => `${INFRA[ty].name} ${INFRA[ty].max}/${INFRA[ty].max}`),
    /** erreichbare, aber volle Planeten */
    full: full.map((p) => planetName(p)),
  };
}

/**
 * Typen für den Befehl Raise Edifices: Standard (F-7) alle – am Limit nur mit Hinweis, Annullierung in 2.2.
 * Mit der Hausregel F-7 lehnt die Engine den Befehl schon bei der Eingabe ab, dann nur gültige Typen anbieten (B12).
 */
export function edificeTypes(state: CampaignState, allianceId: string, planetId: string | null | undefined): InfraType[] {
  if (!planetId || !house(state, 'F7_EDIFICES_BLOCK')) return BUILDABLE_TYPES;
  return BUILDABLE_TYPES.filter((ty) => !canBuild(state, allianceId, ty, planetId));
}
