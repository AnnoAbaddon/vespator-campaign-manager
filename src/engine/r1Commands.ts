import { fail, type Ctx } from './ctx';
import { setMissionPool } from './missionPool';
import { setTerrainLayouts } from './terrain';
import { rollOffActive, rollOffUnplayed } from './unplayedRoll';
import { setGuest } from './guests';
import { confirmSkirmish, deleteSkirmish, reportSkirmish, type SkirmishInput } from './skirmish';
import { addedParticipants, checkCap } from './pairings';
import type { AttackType, Battle, TerrainLayout } from './types';

/** Commands des Blocks R1 (Nice-to-have Stufe 2) */
export type R1Command =
  | { type: 'MISSION_POOL_SET'; pool: Partial<Record<AttackType, string[]>> }
  | { type: 'TERRAIN_LAYOUTS_SET'; layouts: TerrainLayout[] }
  | { type: 'BATTLE_ROLL_OFF'; battleId: string }
  | { type: 'BATTLE_GUEST_SET'; battleId: string; playerId: string | null; side: 'ATTACKER' | 'DEFENDER'; guest: { name: string; faction: string } | null; index?: number }
  | { type: 'SKIRMISH_REPORT'; playerId: string | null; skirmish: SkirmishInput }
  | { type: 'SKIRMISH_CONFIRM'; id: string; playerId: string | null }
  | { type: 'SKIRMISH_DELETE'; id: string; playerId: string | null };

export function dispatchR1(ctx: Ctx, cmd: R1Command) {
  switch (cmd.type) {
    case 'MISSION_POOL_SET':
      return setMissionPool(ctx, cmd.pool);
    case 'TERRAIN_LAYOUTS_SET':
      return setTerrainLayouts(ctx, cmd.layouts);
    case 'BATTLE_ROLL_OFF':
      if (!rollOffActive(ctx.state)) fail('Die Hausregel „Auswürfeln statt verfallen“ ist nicht aktiv');
      return rollOffUnplayed(ctx, cmd.battleId);
    case 'BATTLE_GUEST_SET':
      return setGuest(ctx, cmd.battleId, cmd.playerId, cmd.side, cmd.guest, cmd.index ?? 0);
    case 'SKIRMISH_REPORT':
      return reportSkirmish(ctx, cmd.playerId, cmd.skirmish);
    case 'SKIRMISH_CONFIRM':
      return confirmSkirmish(ctx, cmd.id, cmd.playerId);
    case 'SKIRMISH_DELETE':
      return deleteSkirmish(ctx, cmd.id, cmd.playerId);
  }
}

/** A4: nach BATTLE_UPDATE die neu eingetragenen Spieler gegen die harte Obergrenze prüfen */
export function checkCapAfterUpdate(ctx: Ctx, battleId: string, before: Pick<Battle, 'attackers' | 'defenders'>) {
  const b = ctx.state.battles.find((x) => x.id === battleId);
  if (b) checkCap(ctx, b, addedParticipants(before, b));
}
