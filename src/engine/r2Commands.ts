import { fail, type Ctx } from './ctx';
import * as life from './lifecycle';
import * as story from './narrative';
import * as finale from './finale';
import type { CampaignState, Player } from './types';

/**
 * Nice-to-have 2, Block R2 (Spieler-Lebenszyklus und Erzählung): Commands, Dispatch und Rechte der
 * Spielerlinks. Die Logik liegt in lifecycle.ts, narrative.ts und finale.ts.
 */
export type R2Command =
  | { type: 'ABSENCE_SET'; playerId: string; phases: number[]; absent: boolean }
  | { type: 'PLAYER_HANDOVER'; input: life.HandoverInput }
  | { type: 'PLAYER_JOIN'; nickname: string; faction?: string; subfaction?: string; allianceId: string; fromPhase: number }
  | { type: 'PULSE_SUBMIT'; playerId: string; phase: number; fun: number; time: life.PulseTime; comment: string; anonymous: boolean; absentNext?: boolean }
  | { type: 'OBJECTIVE_UPSERT'; objective: story.ObjectiveInput }
  | { type: 'OBJECTIVE_DELETE'; id: string }
  | { type: 'OBJECTIVE_RESOLVE'; id: string; achievedBy: string[]; reason: string }
  | { type: 'GOAL_LIST_SET'; goals: story.GoalDef[] }
  | { type: 'GOAL_ASSIGN'; playerId: string; goalId?: string | null; title?: string; text?: string }
  | { type: 'GOAL_CHOOSE'; playerId: string; goalId: string }
  | { type: 'GOAL_CLAIM'; playerId: string; id: string; note: string }
  | { type: 'GOAL_RESOLVE'; playerId: string; id: string; met: boolean; reason: string }
  | { type: 'GOAL_REMOVE'; playerId: string; id: string }
  | { type: 'NEMESIS_SET'; playerId: string; nemesisId: string | null }
  | { type: 'GRAND_UPDATE'; update: finale.GrandUpdate }
  | { type: 'GRAND_JOIN'; playerId: string; join: boolean };

export const R2_TYPES = new Set<R2Command['type']>([
  'ABSENCE_SET',
  'PLAYER_HANDOVER',
  'PLAYER_JOIN',
  'PULSE_SUBMIT',
  'OBJECTIVE_UPSERT',
  'OBJECTIVE_DELETE',
  'OBJECTIVE_RESOLVE',
  'GOAL_LIST_SET',
  'GOAL_ASSIGN',
  'GOAL_CHOOSE',
  'GOAL_CLAIM',
  'GOAL_RESOLVE',
  'GOAL_REMOVE',
  'NEMESIS_SET',
  'GRAND_UPDATE',
  'GRAND_JOIN',
]);

export function dispatchR2(ctx: Ctx, cmd: R2Command) {
  switch (cmd.type) {
    case 'ABSENCE_SET':
      return life.setAbsence(ctx, cmd.playerId, cmd.phases, cmd.absent);
    case 'PLAYER_HANDOVER':
      return life.handover(ctx, cmd.input);
    case 'PLAYER_JOIN':
      return life.joinPlayer(ctx, cmd);
    case 'PULSE_SUBMIT':
      return life.submitPulse(ctx, cmd.playerId, cmd.phase, cmd);
    case 'OBJECTIVE_UPSERT':
      return story.upsertObjective(ctx, cmd.objective);
    case 'OBJECTIVE_DELETE':
      return story.deleteObjective(ctx, cmd.id);
    case 'OBJECTIVE_RESOLVE':
      return story.resolveObjective(ctx, cmd.id, cmd.achievedBy, cmd.reason);
    case 'GOAL_LIST_SET':
      return story.setGoalList(ctx, cmd.goals);
    case 'GOAL_ASSIGN':
      return story.assignGoal(ctx, cmd.playerId, cmd);
    case 'GOAL_CHOOSE':
      return story.chooseGoal(ctx, cmd.playerId, cmd.goalId);
    case 'GOAL_CLAIM':
      return story.claimGoal(ctx, cmd.playerId, cmd.id, cmd.note);
    case 'GOAL_RESOLVE':
      return story.resolveGoal(ctx, cmd.playerId, cmd.id, cmd.met, cmd.reason);
    case 'GOAL_REMOVE':
      return story.removeGoal(ctx, cmd.playerId, cmd.id);
    case 'NEMESIS_SET':
      return story.setNemesis(ctx, cmd.playerId, cmd.nemesisId);
    case 'GRAND_UPDATE':
      return finale.updateGrand(ctx, cmd.update);
    case 'GRAND_JOIN':
      return finale.joinGrand(ctx, cmd.playerId, cmd.join);
    default:
      fail('Unbekannter Befehl');
  }
}

/** Commands aus R2, die ein Spieler über seinen Link auslösen darf (immer nur im eigenen Namen) */
export const R2_PLAYER_COMMANDS = new Set<R2Command['type']>(['ABSENCE_SET', 'PULSE_SUBMIT', 'GOAL_CHOOSE', 'GOAL_CLAIM', 'NEMESIS_SET', 'GRAND_JOIN']);

/** Berechtigung für R2-Commands eines Spielers; null = erlaubt */
export function authorizeR2(_st: CampaignState, player: Player, cmd: R2Command): string | null {
  if (!R2_PLAYER_COMMANDS.has(cmd.type)) return 'Diese Aktion ist dem Spielleiter vorbehalten';
  if ('playerId' in cmd && cmd.playerId === player.id) return null;
  return 'Nur im eigenen Namen';
}

/** Hooks nach dem Weiterschalten bzw. Kampagnenstart: Standardoperationen für Abwesende der neuen Phase */
export const afterPhaseStart = (ctx: Ctx) => life.syncAbsenceOrders(ctx);
