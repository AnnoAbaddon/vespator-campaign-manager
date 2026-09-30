// NTH2 3.3: Regelspezifische Commands des Vespator-Moduls. Der Kern (commands.ts) reicht alles, was er
// selbst nicht kennt, an `dispatchVespator` weiter. Verhalten unverändert gegenüber der früheren
// Verarbeitung direkt in commands.ts.

import type { Command } from '../../commands';
import type { Ctx } from '../../ctx';
import * as setup from '../../setup';
import * as phase from '../../phase';
import * as events from '../../events';
import * as scoring from '../../scoring';

/** Liefert true, wenn der Command zum Vespator-Regelwerk gehört und ausgeführt wurde. */
export function dispatchVespator(ctx: Ctx, cmd: Command): boolean {
  switch (cmd.type) {
    // Setup W0–W4 (W5 schließt SETUP_START über den Kern-Erweiterungspunkt ab)
    case 'SETUP_W0_DONE':
      setup.finishW0(ctx);
      return true;
    case 'SETUP_MEDAL_SUGGEST':
      setup.suggestMedalAssignments(ctx);
      return true;
    case 'SETUP_MEDAL_ASSIGN':
      setup.assignMedal(ctx, cmd.medal, cmd.allianceId);
      return true;
    case 'SETUP_W1_DONE':
      setup.finishW1(ctx);
      return true;
    case 'SETUP_LAUREL_PLANET':
      setup.setLaurelPlanet(ctx, cmd.planetId);
      return true;
    case 'SETUP_STRONGHOLDS':
      setup.setStrongholdChoice(ctx, cmd.allianceId, cmd.strongholdPlanetId, cmd.pl3, cmd.pl2);
      return true;
    case 'SETUP_REVEAL_STRONGHOLDS':
      setup.revealStrongholds(ctx);
      return true;
    case 'SETUP_WREATH':
      setup.applyWreath(ctx, cmd.planetIds);
      return true;
    case 'SETUP_W2_DONE':
      setup.finishW2(ctx);
      return true;
    case 'SETUP_INFRA':
      setup.setInfraChoice(ctx, cmd.allianceId, cmd.items);
      return true;
    case 'SETUP_INFRA_RECHOOSE':
      setup.rechooseInfra(ctx, cmd.itemId, cmd.planetId);
      return true;
    case 'SETUP_REVEAL_INFRA':
      setup.revealInfra(ctx);
      return true;
    case 'SETUP_W3_DONE':
      setup.finishW3(ctx);
      return true;
    case 'SETUP_FLEET_STARTS':
      setup.setFleetStarts(ctx, cmd.starts);
      return true;
    case 'SETUP_REVEAL_FLEETS':
      setup.revealFleets(ctx);
      return true;
    case 'SETUP_DAGGER_SWAP':
      setup.daggerSwap(ctx, cmd.a, cmd.b);
      return true;
    case 'SETUP_W4_DONE':
      setup.finishW4(ctx);
      return true;

    // Phase: Schritte 2.1–2.6, Bewegung, Bau
    case 'OPEN_TOME_REVEAL':
      phase.openTomeReveal(ctx);
      return true;
    case 'REVEAL_OPS':
      phase.revealOps(ctx);
      return true;
    case 'RESOLVE_EDIFICES':
      phase.resolveEdifices(ctx);
      return true;
    case 'BATTLE_ROLL':
      phase.rollTheatre(ctx, cmd.battleId, cmd.what);
      return true;
    case 'BATTLE_DECISION':
      phase.setDecision(ctx, cmd.battleId, cmd.opId, cmd.decision);
      return true;
    case 'ARCHEOTECH_RESOLVE':
      phase.resolveArcheotech(ctx, cmd.increments);
      return true;
    case 'INTERCEPT_ADD':
      phase.addIntercept(ctx, cmd.opId, cmd.allianceId);
      return true;
    case 'RESOLVE_ARRIVAL':
      phase.resolveArrival(ctx);
      return true;
    case 'RESOLVE_KILL_TEAMS':
      phase.resolveKillTeams(ctx);
      return true;
    case 'MOVE_SET':
      phase.setMove(ctx, cmd.fleetId, cmd.path);
      return true;
    case 'MOVES_APPLY':
      phase.applyMoves(ctx);
      return true;
    case 'BUILD_START':
      phase.startBuild(ctx);
      return true;
    case 'BUILD_SET':
      phase.setBuild(ctx, cmd.allianceId, cmd.choice);
      return true;

    // Ereignistabellen (Fortunes of War, Perils of Power, Desperate Measures)
    case 'EVENT_APPLY':
      events.applyEvent(ctx, cmd.eventId, cmd.data);
      return true;
    case 'EVENT_DISCARD':
      events.deleteEvent(ctx, cmd.eventId);
      return true;
    case 'EVENT_INPUT':
      events.submitEventInput(ctx, cmd.eventId, cmd.playerId, cmd.data);
      return true;
    case 'EVENT_FORCE':
      events.forceEvent(ctx, cmd.code, cmd.allianceId, cmd.customId);
      return true;

    // Kampagnenende: Entscheidungsschlacht, Medaillen
    case 'TIEBREAK_ADD':
      scoring.addTiebreakBattle(ctx, cmd.attackerAllianceId, cmd.defenderAllianceId);
      return true;
    case 'TIEBREAK_DECIDE':
      scoring.decideTiebreak(ctx, cmd.winnerAllianceId);
      return true;
    case 'MEDAL_OVERRIDE':
      scoring.overrideMedal(ctx, cmd.medal, cmd.allianceId);
      return true;

    default:
      return false;
  }
}
