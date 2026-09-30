import { BATTLE_SIZES, type BattleSize } from './data/vespator';
import type { BattleSizeDef, CampaignState } from './types';

/** Standard-Spielgrößen (vorbelegt, N2.6) */
export const DEFAULT_BATTLE_SIZES: BattleSizeDef[] = (Object.keys(BATTLE_SIZES) as BattleSize[]).map((id) => ({
  id,
  name: BATTLE_SIZES[id].name,
  points: BATTLE_SIZES[id].points,
  reserves: BATTLE_SIZES[id].reserves,
  duration: id === 'INCURSION' ? '1,5–2 h' : id === 'STRIKE_FORCE' ? '2,5–3 h' : '4 h',
}));

export function battleSizes(state: Pick<CampaignState, 'meta'>): BattleSizeDef[] {
  return state.meta.battleSizes?.length ? state.meta.battleSizes : DEFAULT_BATTLE_SIZES;
}

export function sizeDef(state: Pick<CampaignState, 'meta'>, id: string | null | undefined): BattleSizeDef | null {
  if (!id) return null;
  return battleSizes(state).find((s) => s.id === id) ?? DEFAULT_BATTLE_SIZES.find((s) => s.id === id) ?? null;
}

export const edition = (state: Pick<CampaignState, 'meta'>) => state.meta.edition ?? '11';

/** Letzte Phase der Kampagne? */
export function isLastPhase(state: Pick<CampaignState, 'meta'>, phase: number | null | undefined): boolean {
  return !!phase && phase === state.meta.phaseCount;
}

/** Aktiver Anreiz der letzten Phase (N2.4) */
export function lastPhaseRule(state: Pick<CampaignState, 'meta' | 'toggles'>, phase: number | null | undefined, rule: 'mandatoryBattle' | 'doubleGains' | 'noVoidLeap'): boolean {
  return isLastPhase(state, phase) && state.toggles.lastPhase?.[rule] === true;
}
