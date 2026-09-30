import { ATTACK_TYPES, BUILDABLE_TYPES, INFRA, OP_TYPES, THEATRES, twistIndex, type InfraType, type TheatreId } from './data/vespator';
import { planetIds } from './map';
import { isIsoDate } from './logTime';
import { house } from './houseRules';
import { lastPhaseRule } from './campaignRules';
import { aggregateGames, allMissions } from './missions';
import { awardAutoHonors } from './commanders';
import { RuleError, confirmRule, fail, hint, log, orderByValue, roll, rollOff, warn, type Ctx } from './ctx';
import { allianceName, build, campaignPoints, canBuild, decrease, fleetName, increase, pl, planet, planetDef, planetName, powerSum } from './board';
import { connectedFor, distance, modifierActive, selfOrConnected } from './graph';
import { newPhase } from './init';
import { applyOutcome, decisionTypesFor, defaultDecisionFor, effectiveVictor, precheckDecision } from './outcomes';
import { carryCommanders, commanderOf, playersOfAlliance } from './players';
import type { Battle, BattleGame, Operation, OutcomeDecision, Participant, Phase, PhaseStep } from './types';
import { PHASE_STEPS } from './types';
import { checkMissionRepeat, suggestMission } from './missionPool';
import { capReason } from './pairings';
import { rollOffActive, rollOffUnplayed } from './unplayedRoll';

export function curPhase(ctx: Ctx): Phase {
  const s = ctx.state.stage;
  if (s.kind !== 'PHASE') fail('Keine laufende Kampagnenphase');
  const ph = ctx.state.phases.find((p) => p.number === s.phase);
  if (!ph) fail('Phase nicht gefunden');
  return ph;
}

function requireStep(ctx: Ctx, ...steps: PhaseStep[]) {
  const s = ctx.state.stage;
  if (s.kind !== 'PHASE' || !steps.includes(s.step)) fail(`Aktion nur in Schritt ${steps.join('/')} möglich`);
}

// ─── Operationen ────────────────────────────────────────────────────────────

export interface OpInput {
  type: Operation['type'];
  attackType?: Operation['attackType'];
  targetPlanetId?: string;
  targetAllianceId?: string;
  targetFleetId?: string;
  destinationPlanetId?: string;
  infraType?: InfraType;
  killTeamPlanetId?: string;
  killTeamMode?: 'DICE' | 'GAME';
}

export function validateOp(ctx: Ctx, fleetId: string, slot: 1 | 2, input: OpInput) {
  const st = ctx.state;
  const ph = curPhase(ctx);
  const f = st.fleets.find((x) => x.id === fleetId);
  if (!f) fail('Unbekannte Flotte');
  if (!f.planetId) fail(`${f.name} hat keine Position`);
  const al = f.allianceId;
  const n = ph.number;
  // Review: nur Slot 1 oder 2 (sonst ließe sich das Defiant-Zeal-Limit mit Slot 3, 4 oder „2“ umgehen)
  if (slot !== 1 && slot !== 2) fail('Ungültiger Operations-Slot (1 oder 2)');
  if (slot === 2 && !modifierActive(st, 'DEFIANT_ZEAL', n, al)) fail('Eine zweite Operation ist nur mit Defiant Zeal erlaubt');
  if (house(st, 'F5_ZEAL_DIFFERENT')) {
    const other = ph.operations.find((o) => o.fleetId === fleetId && o.slot === (slot === 1 ? 2 : 1));
    if (other && other.type === input.type && input.type !== 'NONE') fail('Hausregel (F-5): Die zweite Operation muss eine andere Art sein');
  }
  const t = st.toggles.operations;
  const open = (id: string) => {
    const p = planet(st, id);
    if (p.destroyed) fail(`${planetName(id)} ist zerstört und kann nicht gewählt werden`);
  };
  switch (input.type) {
    case 'BATTLE': {
      if (!input.attackType) fail('Campaign Attack Type wählen');
      if (!t.attackTypes[input.attackType]) fail(`${ATTACK_TYPES[input.attackType].name} ist in dieser Kampagne deaktiviert`);
      if (!input.targetPlanetId) fail('Zielplanet wählen');
      if (!selfOrConnected(st, al, f.planetId, n).includes(input.targetPlanetId)) fail(`${planetName(input.targetPlanetId)} ist nicht der Flottenplanet oder mit ihm verbunden`);
      open(input.targetPlanetId);
      if (!input.targetAllianceId || input.targetAllianceId === al || !st.alliances.some((a) => a.id === input.targetAllianceId)) fail('Gegnerische Allianz wählen');
      if (input.attackType === 'BOARDING_ACTION') {
        // R4 / SPEC 9.2: Zielflotte schon beim Befehl wählbar; sie muss der angegriffenen Allianz gehören
        if (input.targetFleetId) {
          const tf = st.fleets.find((x) => x.id === input.targetFleetId);
          if (!tf || tf.allianceId !== input.targetAllianceId || tf.reserve) fail('Zielflotte muss eine Flotte der angegriffenen Allianz sein');
          if (tf.planetId !== input.targetPlanetId) hint(ctx, `${tf.name} steht nicht auf ${planetName(input.targetPlanetId)} – die Zielflotte wird bei Sieg neu gewählt`);
        }
        if (!st.fleets.some((x) => x.allianceId === input.targetAllianceId && x.planetId === input.targetPlanetId && !x.reserve)) {
          if (house(st, 'F3_BOARDING_NEEDS_FLEET')) fail(`Hausregel (F-3): Boarding Action nur gegen eine Flotte auf dem Zielplaneten`);
          // F-3: erlaubt, das Outcome kann dann aber keine Flotte vertreiben – Hinweis, keine Warnung
          hint(ctx, `Keine Flotte von ${allianceName(st, input.targetAllianceId)} auf ${planetName(input.targetPlanetId)} – bei Sieg wird keine Flotte vertrieben`);
        }
      }
      break;
    }
    case 'VOID_LEAP':
      if (!t.voidLeap) fail('Void Leap ist deaktiviert');
      if (lastPhaseRule(st, n, 'noVoidLeap')) fail('In der letzten Phase ist kein Void Leap erlaubt');
      if (modifierActive(st, 'NO_VOID_LEAP', n)) fail('Void Leap ist in dieser Phase verboten (Void Piracy)');
      if (!input.destinationPlanetId) fail('Zielplanet wählen');
      open(input.destinationPlanetId);
      break;
    case 'RAISE_EDIFICES': {
      if (!t.raiseEdifices) fail('Raise Edifices ist deaktiviert');
      if (!input.infraType || !BUILDABLE_TYPES.includes(input.infraType)) fail('Fortification Line, Support Facility oder Staging Grounds wählen');
      open(f.planetId);
      const err = canBuild(st, al, input.infraType, f.planetId);
      if (err && house(st, 'F7_EDIFICES_BLOCK')) fail(`Hausregel (F-7): Raise Edifices nicht möglich – ${err}`);
      // F-7 / SPEC 9.2: Die Regeln erlauben die Wahl – kein Override, nur ein Hinweis auf die Annullierung in 2.2
      if (err) hint(ctx, `Raise Edifices wird in 2.2 annulliert, falls bis dahin nichts frei wird: ${err}`);
      break;
    }
    case 'LOGISTICAL_AUXILIA':
      if (!t.logisticalAuxilia) fail('Logistical Auxilia ist deaktiviert');
      if (modifierActive(st, 'NO_LOGISTICAL_AUXILIA', n)) fail('Logistical Auxilia ist in dieser Phase verboten (Sinister Omens)');
      break;
    case 'KILL_TEAMS':
      if (!t.killTeams) fail('Deploy Kill Teams ist deaktiviert');
      if (!input.killTeamPlanetId) fail('Planet wählen');
      if (!selfOrConnected(st, al, f.planetId, n).includes(input.killTeamPlanetId)) fail('Planet muss der Flottenplanet oder verbunden sein');
      open(input.killTeamPlanetId);
      break;
    case 'NONE':
      break;
    default:
      fail('Unbekannte Operation');
  }
  const tome = st.modifiers.find((m) => m.kind === 'OPEN_TOME' && m.phaseNumber === n);
  if (tome && tome.allianceId !== al && !ph.openTomeRevealed) {
    warn(ctx, `An Open Tome: ${allianceName(st, tome.allianceId!)} muss ihre Operationen zuerst offenlegen`);
  }
}

export function setOperation(ctx: Ctx, fleetId: string, slot: 1 | 2, input: OpInput) {
  requireStep(ctx, 'OPS');
  validateOp(ctx, fleetId, slot, input);
  const ph = curPhase(ctx);
  const f = ctx.state.fleets.find((x) => x.id === fleetId)!;
  const tome = ctx.state.modifiers.find((m) => m.kind === 'OPEN_TOME' && m.phaseNumber === ph.number);
  if (tome?.allianceId === f.allianceId && ph.openTomeRevealed) fail('Die Operationen dieser Allianz sind bereits offengelegt (An Open Tome)');
  ph.operations = ph.operations.filter((o) => !(o.fleetId === fleetId && o.slot === slot));
  const op: Operation = {
    id: ctx.newId('op'),
    fleetId,
    allianceId: f.allianceId,
    slot,
    type: input.type,
    originPlanetId: f.planetId,
    isDefault: false,
    revealed: false,
    status: 'PLANNED',
  };
  if (input.type === 'BATTLE') {
    Object.assign(op, { attackType: input.attackType, targetPlanetId: input.targetPlanetId, targetAllianceId: input.targetAllianceId });
    if (input.attackType === 'BOARDING_ACTION' && input.targetFleetId) op.targetFleetId = input.targetFleetId;
  }
  if (input.type === 'VOID_LEAP') op.destinationPlanetId = input.destinationPlanetId;
  if (input.type === 'RAISE_EDIFICES') op.infraType = input.infraType;
  if (input.type === 'KILL_TEAMS') {
    op.killTeamPlanetId = input.killTeamPlanetId;
    op.killTeamMode = input.killTeamMode ?? 'DICE';
  }
  ph.operations.push(op);
  log(ctx, `${f.name}: Operation festgelegt (verdeckt)`);
}

export function clearOperation(ctx: Ctx, fleetId: string, slot: 1 | 2) {
  requireStep(ctx, 'OPS');
  if (slot !== 1 && slot !== 2) fail('Ungültiger Operations-Slot (1 oder 2)');
  const ph = curPhase(ctx);
  // Review: offengelegte Operationen (An Open Tome) lassen sich auch nicht zurückziehen
  const f = ctx.state.fleets.find((x) => x.id === fleetId);
  const tome = ctx.state.modifiers.find((m) => m.kind === 'OPEN_TOME' && m.phaseNumber === ph.number);
  if (f && tome?.allianceId === f.allianceId && ph.openTomeRevealed) fail('Die Operationen dieser Allianz sind bereits offengelegt (An Open Tome)');
  ph.operations = ph.operations.filter((o) => !(o.fleetId === fleetId && o.slot === slot));
}

export function openTomeReveal(ctx: Ctx) {
  requireStep(ctx, 'OPS');
  const ph = curPhase(ctx);
  const tome = ctx.state.modifiers.find((m) => m.kind === 'OPEN_TOME' && m.phaseNumber === ph.number);
  if (!tome) fail('An Open Tome ist nicht aktiv');
  ph.openTomeRevealed = true;
  for (const o of ph.operations) if (o.allianceId === tome.allianceId) o.revealed = true;
  log(ctx, `An Open Tome: Operationen von ${allianceName(ctx.state, tome.allianceId!)} offengelegt`);
}

export function describeOp(ctx: Ctx | { state: Ctx['state'] }, o: Operation): string {
  const st = ctx.state;
  switch (o.type) {
    case 'BATTLE':
      return `${ATTACK_TYPES[o.attackType!].name} → ${planetName(o.targetPlanetId!)} gegen ${allianceName(st, o.targetAllianceId!)}`;
    case 'VOID_LEAP':
      return `Void Leap → ${planetName(o.destinationPlanetId!)}`;
    case 'RAISE_EDIFICES':
      return `Raise Edifices: ${INFRA[o.infraType!].name} auf ${planetName(o.originPlanetId!)}`;
    case 'LOGISTICAL_AUXILIA':
      return `Logistical Auxilia${o.absence ? ' (abwesend)' : o.isDefault ? ' (Standard)' : ''}`;
    case 'KILL_TEAMS':
      return `Deploy Kill Teams → ${planetName(o.killTeamPlanetId!)}${o.killTeamMode === 'GAME' ? ' (Kill-Team-Spiel)' : ''}`;
    default:
      return 'Keine Operation';
  }
}

// ─── Schrittübergänge ──────────────────────────────────────────────────────

function nextStep(step: PhaseStep): PhaseStep | null {
  const i = PHASE_STEPS.indexOf(step);
  return PHASE_STEPS[i + 1] ?? null;
}

export function advance(ctx: Ctx) {
  const s = ctx.state.stage;
  if (s.kind !== 'PHASE') fail('Keine laufende Phase');
  const ph = curPhase(ctx);
  const st = ctx.state;
  switch (s.step) {
    case 'OPS': {
      const missing: string[] = [];
      // F-6: Der Kampagnen-Schalter geht immer vor; die Hausregel hebt nur das Verbot durch Sinister Omens auf
      const laAllowed = st.toggles.operations.logisticalAuxilia && (house(st, 'F6_AUXILIA_ANYWAY') || !modifierActive(st, 'NO_LOGISTICAL_AUXILIA', ph.number));
      for (const f of st.fleets) {
        if (!f.planetId) continue;
        if (!ph.operations.some((o) => o.fleetId === f.id && o.slot === 1)) {
          missing.push(f.name);
          ph.operations.push({
            id: ctx.newId('op'),
            fleetId: f.id,
            allianceId: f.allianceId,
            slot: 1,
            type: laAllowed ? 'LOGISTICAL_AUXILIA' : 'NONE',
            originPlanetId: f.planetId,
            isDefault: true,
            revealed: false,
            status: 'PLANNED',
          });
        }
      }
      // N1.6: mindestens eine Battle Operation je Allianz und Phase (Hausregel, nur Warnung)
      if (st.toggles.load?.minOnePerAlliance && !lastPhaseRule(st, ph.number, 'mandatoryBattle')) {
        // N1.6: Hausregel – Warnung mit Begründung
        const lazy = st.alliances.filter((a) => !ph.operations.some((o) => o.allianceId === a.id && o.type === 'BATTLE'));
        if (lazy.length) warn(ctx, `Spiellast: ${lazy.map((a) => a.name).join(', ')} ${lazy.length > 1 ? 'haben' : 'hat'} in dieser Phase keine Battle Operation erklärt`);
      }
      if (lastPhaseRule(st, ph.number, 'mandatoryBattle')) {
        const lazy = st.alliances.filter((a) => !ph.operations.some((o) => o.allianceId === a.id && o.type === 'BATTLE'));
        if (lazy.length) warn(ctx, `Letzte Phase: ${lazy.map((a) => a.name).join(', ')} ${lazy.length > 1 ? 'haben' : 'hat'} keine Battle Operation erklärt`);
      }
      if (missing.length) {
        // Regelfall ([R] 1.): Standardoperation – bestätigen, aber kein Override
        confirmRule(ctx, `Ohne Befehl: ${missing.join(', ')} → ${laAllowed ? 'Logistical Auxilia' : 'keine Operation'}`);
        log(ctx, `Standardoperation für ${missing.join(', ')}`);
      }
      break;
    }
    case 'REVEAL':
      if (!ph.flags.revealed) revealOps(ctx);
      break;
    case 'EDIFICES':
      if (!ph.flags.edifices) resolveEdifices(ctx);
      break;
    case 'BATTLES': {
      const open = st.battles.filter((b) => b.phaseNumber === ph.number && b.kind === 'CAMPAIGN' && b.status === 'SCHEDULED');
      if (open.length) {
        // Regelfall ([R] 2.3): bestätigen, aber kein Override
        // B1: Hausregel „Auswürfeln statt verfallen“ ersetzt den Regelfall
        if (rollOffActive(st)) confirmRule(ctx, `${open.length} Schlacht(en) ungespielt → werden per W6-Duell ausgewürfelt (Hausregel)`);
        else confirmRule(ctx, `${open.length} Schlacht(en) ungespielt → werden regelgemäß als Sieg des Angreifers gewertet`);
        const drafts = open.filter((b) => b.draft);
        if (drafts.length) {
          const label = (b: Battle) => `${planetName(b.planetId!)} (${allianceName(st, b.attackerAllianceId)} vs. ${allianceName(st, b.defenderAllianceId)})`;
          warn(ctx, `Offener Ergebnis-Entwurf für ${drafts.map(label).join(', ')} – erst bestätigen, sonst gilt die Schlacht als ungespielt`);
        }
        for (const b of open) {
          if (rollOffActive(st)) rollOffUnplayed(ctx, b.id);
          else resolveUnplayed(ctx, b.id, 'ATTACKER_WINS');
        }
      }
      const noVictor = st.battles.filter((b) => b.phaseNumber === ph.number && b.status === 'PLAYED' && !b.victor);
      if (noVictor.length) fail(`${noVictor.length} gespielte Schlacht(en) ohne Ergebnis (VP/Sieger) – bitte ergänzen`);
      break;
    }
    case 'PROCESS': {
      const pending = processQueue(ctx).filter((b) => b.status !== 'PROCESSED');
      if (pending.length) fail(`${pending.length} Schlacht(en) noch nicht verarbeitet`);
      // Review: in 2.4 wieder geöffnete Schlachten gingen sonst stillschweigend verloren
      const reopened = st.battles.filter((b) => b.phaseNumber === ph.number && b.kind === 'CAMPAIGN' && b.status === 'SCHEDULED');
      if (reopened.length) fail(`${reopened.length} wieder geöffnete Schlacht(en) ohne Ergebnis – Ergebnis eintragen oder als ungespielt werten`);
      if (modifierActive(st, 'ARCHEOTECH', ph.number) && !ph.archeotechResolved) warn(ctx, 'Archeotech Riches wurden noch nicht ausgewertet');
      break;
    }
    case 'ARRIVAL':
      if (!ph.flags.arrival) resolveArrival(ctx);
      break;
    case 'RESISTANCE':
      if (!ph.flags.resistance) resolveKillTeams(ctx);
      break;
    case 'RESULTS':
      if (!ph.flags.scored) fail('Erst Punkte berechnen');
      if (ph.number >= st.meta.phaseCount) fail('Letzte Phase – Kampagne über „Kampagne beenden“ abschließen');
      if (!ph.flags.eventsGenerated && eventsEnabled(ctx)) fail('Erst Events generieren');
      {
        const pend = st.events.filter((e) => e.phaseNumber === ph.number && e.status === 'PENDING');
        if (pend.length) fail('Offene Events zuerst anwenden');
      }
      break;
    case 'MOVE':
      if (!ph.flags.movesApplied) applyMoves(ctx);
      break;
    case 'BUILD': {
      if (!ph.flags.buildStarted) startBuild(ctx);
      const undecided = ph.buildOrder.filter((a) => !ph.builds[a]);
      // Verzicht ist regelkonform – bestätigen, aber kein Override
      if (undecided.length) confirmRule(ctx, `Kein Bau für ${undecided.map((a) => allianceName(st, a)).join(', ')} – wird übersprungen`);
      for (const a of undecided) ph.builds[a] = 'SKIP';
      startNextPhase(ctx);
      return;
    }
  }
  ph.stepStatus[s.step] = 'DONE';
  const nx = nextStep(s.step)!;
  st.stage = { kind: 'PHASE', phase: ph.number, step: nx };
  log(ctx, `Phase ${ph.number}: weiter zu ${STEP_LABELS[nx]}`);
}

export function eventsEnabled(ctx: Ctx) {
  const e = ctx.state.toggles.events;
  return e.fortunesOfWar || e.perilsOfPower || e.desperateMeasures;
}

export const STEP_LABELS: Record<PhaseStep, string> = {
  OPS: '1 · Operationen wählen',
  REVEAL: '2.1 · Reveal',
  EDIFICES: '2.2 · Edifice Raising',
  BATTLES: '2.3 · Schlachten',
  PROCESS: '2.4 · Ergebnisse verarbeiten',
  ARRIVAL: '2.5 · Fleet Arrival',
  RESISTANCE: '2.6 · Low-level Resistance',
  RESULTS: '3 · Punkte & Events',
  MOVE: '4 · Flotten bewegen',
  BUILD: '5 · Infrastruktur bauen',
};

// ─── 2.1 Reveal ────────────────────────────────────────────────────────────

export function theatreChooser(ctx: Ctx, phaseNumber: number, defenderAllianceId: string, planetId: string): Battle['theatreChosenBy'] {
  const st = ctx.state;
  if (!st.toggles.theatreTwists) return null;
  if (modifierActive(st, 'RANDOM_THEATRE', phaseNumber)) return 'RANDOM';
  const ph = st.phases.find((p) => p.number === phaseNumber);
  const auxilia = ph?.operations.some((o) => {
    if (o.type !== 'LOGISTICAL_AUXILIA' || o.allianceId !== defenderAllianceId || o.status === 'CANCELLED' || o.status === 'VOID') return false;
    const fp = st.fleets.find((f) => f.id === o.fleetId)?.planetId;
    return !!fp && (fp === planetId || connectedFor(st, defenderAllianceId, fp, planetId, phaseNumber));
  });
  return auxilia ? 'DEFENDER_AUXILIA' : 'ATTACKER';
}

function newBattle(ctx: Ctx, phaseNumber: number, op: Operation): Battle {
  const st = ctx.state;
  st.battleSeq++;
  const cmd = commanderOf(st, op.fleetId, phaseNumber);
  const attacker = cmd ? st.players.find((p) => p.id === cmd) : null;
  // Verteidiger nur, wenn eindeutig (einziges Mitglied); sonst übernimmt ihn ein Spieler (BATTLE_CLAIM_SIDE) oder der SL
  const def = playersOfAlliance(st, op.targetAllianceId!, phaseNumber);
  // A4: Wer die harte Obergrenze erreicht hat, wird nicht automatisch Verteidiger
  const soleCapped = def.length === 1 && !!capReason(st, phaseNumber, def[0].id, 'DEFENDER');
  if (soleCapped) hint(ctx, `Obergrenze: ${def[0].nickname} ist in Phase ${phaseNumber} ausgelastet – die Verteidigung bleibt offen`);
  return {
    id: ctx.newId('battle'),
    phaseNumber,
    kind: 'CAMPAIGN',
    operationIds: [op.id],
    attackType: op.attackType!,
    planetId: op.targetPlanetId!,
    attackerAllianceId: op.allianceId,
    defenderAllianceId: op.targetAllianceId!,
    attackers: attacker ? [{ playerId: attacker.id, faction: attacker.faction }] : [],
    defenders: def.length === 1 && !soleCapped ? [{ playerId: def[0].id, faction: def[0].faction }] : [],
    status: 'SCHEDULED',
    playedAt: null,
    createdSeq: st.battleSeq,
    size: null,
    // A1: Vorschlag aus dem Missions-Pool (ohne Pool: Mission der Angriffsart)
    mission: suggestMission(st, { id: '', phaseNumber, createdSeq: st.battleSeq, attackerAllianceId: op.allianceId, attackType: op.attackType! }),
    theatre: null,
    theatreChosenBy: op.attackType === 'BOARDING_ACTION' ? null : theatreChooser(ctx, phaseNumber, op.targetAllianceId!, op.targetPlanetId!),
    twist: null,
    vp: null,
    battleReady: { attacker: false, defender: false },
    victor: null,
    victorOverride: false,
    decisions: {},
    applied: [],
    report: '',
    photos: [],
    notes: '',
    processedOrder: null,
    unplayedResolution: null,
    postponedFrom: null,
  };
}

/** Nebengefecht ohne Campaign Outcome: Kill-Team-Spiel (N4.1) oder Void-Leap-Abfangen (N4.2) */
function sideBattle(ctx: Ctx, phaseNumber: number, kind: 'KILL_TEAM' | 'INTERCEPT', op: Operation, attackerAllianceId: string, defenderAllianceId: string, planetId: string): Battle {
  const st = ctx.state;
  st.battleSeq++;
  // Vorbelegung (R1): Die Seite der Operation führt der Kommandant ihrer Flotte, die Gegenseite ihr einziges Mitglied
  const lead = commanderOf(st, op.fleetId, phaseNumber);
  const part = (id: string | null | undefined): Participant[] => {
    const p = id ? st.players.find((x) => x.id === id) : null;
    return p ? [{ playerId: p.id, faction: p.faction }] : [];
  };
  const sole = (al: string) => {
    const m = playersOfAlliance(st, al, phaseNumber);
    return m.length === 1 ? m[0].id : null;
  };
  const opSide = kind === 'KILL_TEAM' ? 'ATTACKER' : 'DEFENDER';
  return {
    id: ctx.newId('battle'),
    phaseNumber,
    kind,
    operationIds: [op.id],
    attackType: null,
    planetId,
    attackerAllianceId,
    defenderAllianceId,
    attackers: part(opSide === 'ATTACKER' ? lead : sole(attackerAllianceId)),
    defenders: part(opSide === 'DEFENDER' ? lead : sole(defenderAllianceId)),
    status: 'SCHEDULED',
    playedAt: null,
    createdSeq: st.battleSeq,
    size: null,
    mission: kind === 'KILL_TEAM' ? { source: 'LIST', externalName: '', missionId: 'tpl-kt' } : { source: 'SPACE', externalName: '' },
    theatre: null,
    theatreChosenBy: null,
    twist: null,
    vp: null,
    battleReady: { attacker: false, defender: false },
    victor: null,
    victorOverride: false,
    decisions: {},
    applied: [],
    report: '',
    photos: [],
    notes: '',
    processedOrder: null,
    unplayedResolution: null,
    postponedFrom: null,
  };
}

/** Hausregel Void-Leap-Abfangen (N4.2): Abfanggefecht in Stufe 2.5 ansetzen */
export function addIntercept(ctx: Ctx, opId: string, interceptorAllianceId: string) {
  requireStep(ctx, 'ARRIVAL');
  const st = ctx.state;
  if (!st.toggles.voidLeapIntercept) fail('Die Hausregel „Void-Leap-Abfangen“ ist nicht aktiv');
  const ph = curPhase(ctx);
  if (ph.flags.arrival) fail('Ankunft bereits ausgeführt');
  const o = ph.operations.find((x) => x.id === opId && x.type === 'VOID_LEAP' && x.status === 'PLANNED');
  if (!o) fail('Kein geplanter Void Leap');
  if (interceptorAllianceId === o.allianceId) fail('Nur eine gegnerische Allianz kann abfangen');
  if (!st.fleets.some((f) => f.allianceId === interceptorAllianceId && !f.reserve && f.planetId === o.destinationPlanetId))
    fail(`${allianceName(st, interceptorAllianceId)} hat keine Flotte auf ${planetName(o.destinationPlanetId!)}`);
  if (st.battles.some((b) => b.kind === 'INTERCEPT' && b.operationIds.includes(opId))) fail('Für diesen Void Leap gibt es schon ein Abfanggefecht');
  st.battles.push(sideBattle(ctx, ph.number, 'INTERCEPT', o, interceptorAllianceId, o.allianceId, o.destinationPlanetId!));
  log(ctx, `Abfanggefecht: ${allianceName(st, interceptorAllianceId)} fängt ${fleetName(st, o.fleetId)} bei ${planetName(o.destinationPlanetId!)} ab`);
}

export function revealOps(ctx: Ctx) {
  requireStep(ctx, 'REVEAL');
  const ph = curPhase(ctx);
  if (ph.flags.revealed) fail('Bereits aufgedeckt');
  for (const o of ph.operations) {
    o.revealed = true;
    if (o.type === 'BATTLE' && o.status === 'PLANNED') ctx.state.battles.push(newBattle(ctx, ph.number, o));
    // N4.1: Kill-Team-Spiel – je gegnerischer Allianz ein Gefecht
    if (o.type === 'KILL_TEAMS' && o.status === 'PLANNED' && o.killTeamMode === 'GAME') {
      for (const a of ctx.state.alliances) if (a.id !== o.allianceId) ctx.state.battles.push(sideBattle(ctx, ph.number, 'KILL_TEAM', o, o.allianceId, a.id, o.killTeamPlanetId!));
    }
  }
  ph.flags.revealed = true;
  const n = ph.operations.filter((o) => o.type === 'BATTLE').length;
  log(ctx, `Operationen aufgedeckt – ${n} Battle Operation(s)`);
}

// ─── 2.2 Edifice Raising ───────────────────────────────────────────────────

export function resolveEdifices(ctx: Ctx) {
  requireStep(ctx, 'EDIFICES');
  const ph = curPhase(ctx);
  if (ph.flags.edifices) fail('Bereits ausgeführt');
  const st = ctx.state;
  const ops = ph.operations.filter((o) => o.type === 'RAISE_EDIFICES' && o.status === 'PLANNED');
  const byPlanet: Record<string, Operation[]> = {};
  for (const o of ops) (byPlanet[o.originPlanetId!] ??= []).push(o);
  for (const [pid, list] of Object.entries(byPlanet)) {
    const alliances = [...new Set(list.map((o) => o.allianceId))];
    const order = orderByValue(
      ctx,
      alliances,
      (a) => pl(st, a, pid),
      `Edifice Raising ${planetName(pid)}`,
      (a) => allianceName(st, a),
    );
    for (const a of order) {
      for (const o of list.filter((x) => x.allianceId === a)) {
        const err = canBuild(st, a, o.infraType!, pid);
        if (err) {
          o.status = 'CANCELLED';
          o.note = err;
          log(ctx, `${fleetName(st, o.fleetId)}: Raise Edifices annulliert – ${err}`);
        } else {
          build(ctx, a, o.infraType!, pid, { why: 'Raise Edifices' });
          o.status = 'RESOLVED';
        }
      }
    }
  }
  ph.flags.edifices = true;
  if (!ops.length) log(ctx, 'Keine Raise-Edifices-Operationen');
}

// ─── 2.3 Schlachten ────────────────────────────────────────────────────────

export function battleById(ctx: Ctx, id: string): Battle {
  const b = ctx.state.battles.find((x) => x.id === id);
  if (!b) fail('Schlacht nicht gefunden');
  return b;
}

export interface BattleUpdate {
  attackers?: Participant[];
  defenders?: Participant[];
  playedAt?: string | null;
  size?: Battle['size'];
  mission?: Battle['mission'];
  theatre?: TheatreId | null;
  /** Sinister Omens: W6-Wurf für das zufällige Theatre (wie „Theatre würfeln“, nur von Hand eingetragen) */
  theatreRoll?: number | null;
  twistRoll?: number | null;
  vp?: Battle['vp'];
  battleReady?: Battle['battleReady'];
  victorOverride?: Battle['victor'];
  report?: string;
  notes?: string;
  photos?: string[];
  /** Einzelspiele (N2.3) – ersetzen VP/Battle Ready durch das Gesamtergebnis */
  games?: BattleGame[];
}

/** Review: VP sind ganze Zahlen ab 0 (Texte würden lexikalisch verglichen, „10“ < „9“) */
function checkVp(vp: { attacker: unknown; defender: unknown } | null | undefined) {
  if (!vp) return;
  const ok = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0;
  if (!ok(vp.attacker) || !ok(vp.defender)) fail('VP müssen ganze Zahlen ab 0 sein');
}

/** Review: „Gespielt am“ muss ein gültiges Datum sein; gespeichert wird es einheitlich als ISO-Zeitstempel */
function normalizeDate(v: unknown): string | null {
  if (v === null || v === '') return null;
  // F1: strikt ISO und zwischen 2000 und 2100
  const t = isIsoDate(v) ? Date.parse(v) : NaN;
  if (Number.isNaN(t)) fail('Ungültiges Datum für „Gespielt am“');
  return new Date(t).toISOString();
}

export function computeVictor(b: Battle): Battle['victor'] {
  if (b.games?.length) return aggregateGames(b.games).victor;
  if (!b.vp) return null;
  const a = b.vp.attacker + (b.battleReady.attacker ? 10 : 0);
  const d = b.vp.defender + (b.battleReady.defender ? 10 : 0);
  return a > d ? 'ATTACKER' : d > a ? 'DEFENDER' : 'DRAW';
}

/** Abgeschlossene Schlachten: Ergebnisfelder (VP, Battle Ready, Einzelspiele, Sieger) sind gesperrt */
const RESULT_LOCKED: Battle['status'][] = ['PROCESSED', 'UNPLAYED_RESOLVED', 'VOID'];

/** Teilnehmer prüfen: unbekannter Spieler → Fehler, fremde Allianz → Warnung */
function checkParticipants(ctx: Ctx, b: Battle, list: Participant[], allianceId: string) {
  const st = ctx.state;
  for (const p of list) {
    const pl = st.players.find((x) => x.id === p.playerId);
    if (!pl) fail('Unbekannter Spieler');
    const a = playersOfAlliance(st, allianceId, b.phaseNumber).some((x) => x.id === p.playerId);
    if (!a) warn(ctx, `${pl.nickname} gehört nicht zur Allianz ${allianceName(st, allianceId)}`);
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function updateBattle(ctx: Ctx, id: string, u: BattleUpdate) {
  const st = ctx.state;
  const b = battleById(ctx, id);
  // Nur tatsächlich geänderte Ergebnisfelder zählen (der Editor schickt oft das ganze Formular)
  const vpChanged = u.vp !== undefined && !same(u.vp, b.vp);
  const readyChanged = u.battleReady !== undefined && !same(u.battleReady, b.battleReady);
  const gamesChanged = u.games !== undefined && !same(u.games.length ? u.games : null, b.games?.length ? b.games : null);
  const overrideChanged = u.victorOverride !== undefined && (u.victorOverride === null ? b.victorOverride : !b.victorOverride || b.victor !== u.victorOverride);
  const resultChanged = vpChanged || readyChanged || gamesChanged || overrideChanged;
  if (resultChanged && b.status === 'PROCESSED') fail('Schlacht bereits verarbeitet – Ergebnis nur per Undo änderbar');
  if (resultChanged && RESULT_LOCKED.includes(b.status)) fail('Ungespielte Schlacht ist entschieden – Ergebnis erst nach „Wieder öffnen“ änderbar');
  if (vpChanged) checkVp(u.vp);
  for (const [key, list, al] of [
    ['attackers', u.attackers, b.attackerAllianceId],
    ['defenders', u.defenders, b.defenderAllianceId],
  ] as const) {
    if (!list) continue;
    checkParticipants(ctx, b, list, al);
    b[key] = list;
  }
  if (u.playedAt !== undefined) b.playedAt = normalizeDate(u.playedAt);
  if (u.size !== undefined) b.size = u.size;
  if (u.mission) {
    if (u.mission.source === 'LIST') {
      const m = allMissions(st).find((x) => x.id === u.mission!.missionId);
      if (!m) fail('Mission ist nicht in der Missionsliste');
      // N2.2: zulässige Angriffsarten der Mission (leer = alle)
      if (m.attackTypes.length && b.attackType && !m.attackTypes.includes(b.attackType) && !same(u.mission, b.mission)) {
        warn(ctx, `Mission „${m.name}“ ist nicht für ${ATTACK_TYPES[b.attackType].name} vorgesehen`);
      }
    }
    // A1: Wiederholung derselben Mission (Hinweis bzw. Sperre per Hausregel)
    if (!same(u.mission, b.mission)) checkMissionRepeat(ctx, b, u.mission);
    b.mission = u.mission;
  }
  if (u.games !== undefined && gamesChanged) {
    const ids = new Set<string>();
    // Einzelspiele ohne Teilnehmer einer Seite übernehmen die Teilnehmer der Schlacht (R1)
    u = { ...u, games: u.games.map((g) => ({ ...g, attackers: g.attackers?.length ? g.attackers : b.attackers, defenders: g.defenders?.length ? g.defenders : b.defenders })) };
    for (const g of u.games!) {
      if (!g.id || ids.has(g.id)) fail('Einzelspiel ohne eindeutige ID');
      ids.add(g.id);
      if (g.vp && (g.vp.attacker < 0 || g.vp.defender < 0)) fail('VP dürfen nicht negativ sein');
      checkVp(g.vp);
      if (g.playedAt != null) normalizeDate(g.playedAt);
      checkParticipants(ctx, b, g.attackers, b.attackerAllianceId);
      checkParticipants(ctx, b, g.defenders, b.defenderAllianceId);
    }
    b.games = u.games!.length ? u.games : undefined;
    if (b.games) applyGames(b);
  }
  if (u.theatreRoll != null) {
    // B7/R2: zufälliges Theatre per W6 – gleiche Verteilung wie „Theatre würfeln“
    const v = u.theatreRoll;
    if (!Number.isInteger(v) || v < 1 || v > 6) fail('W6-Wert 1–6');
    const picked = b.planetId ? theatreForRoll(b.planetId, v) : null;
    if (!picked) fail('Planet hat keine Theatres');
    if (picked !== b.theatre) {
      b.twist = null;
      log(ctx, `Theatre (W6 ${v}): ${THEATRES[picked].name}`);
    }
    b.theatre = picked;
  } else if (u.theatre !== undefined) {
    if (u.theatre && b.planetId && !planetDef(b.planetId).theatres.includes(u.theatre)) fail('Theatre gehört nicht zu diesem Planeten');
    // B7/R2: Unter Sinister Omens wird das Theatre ausgewürfelt – freie Wahl nur als Override des Spielleiters
    if (u.theatre && u.theatre !== b.theatre && b.theatreChosenBy === 'RANDOM') warn(ctx, 'Sinister Omens: Das Theatre wird ausgewürfelt und ist nicht frei wählbar');
    if (u.theatre !== b.theatre) b.twist = null;
    b.theatre = u.theatre;
  }
  if (u.twistRoll !== undefined) {
    if (u.twistRoll === null) b.twist = null;
    else {
      if (!b.theatre) fail('Erst Theatre wählen');
      const v = u.twistRoll;
      if (v < 1 || v > 6) fail('W6-Wert 1–6');
      b.twist = { d6: v, name: THEATRES[b.theatre].twists[twistIndex(v)] };
    }
  }
  if (vpChanged) b.vp = u.vp!;
  if (readyChanged) b.battleReady = u.battleReady!;
  if (u.report !== undefined) b.report = u.report;
  if (u.notes !== undefined) b.notes = u.notes;
  if (u.photos) b.photos = u.photos;
  // Sieger nur neu bestimmen, wenn sich das Ergebnis geändert hat – und nie bei abgeschlossenen Schlachten
  if (RESULT_LOCKED.includes(b.status)) return;
  if (u.victorOverride !== undefined) {
    if (u.victorOverride === null) {
      b.victorOverride = false;
      b.victor = computeVictor(b);
    } else {
      b.victorOverride = true;
      b.victor = u.victorOverride;
      if (computeVictor(b) && computeVictor(b) !== u.victorOverride) warn(ctx, 'Sieger weicht vom VP-Ergebnis ab');
    }
  } else if (!b.victorOverride && resultChanged) b.victor = computeVictor(b);
  if (b.status === 'SCHEDULED' || b.status === 'PLAYED') b.status = b.victor ? 'PLAYED' : 'SCHEDULED';
  ensureDecisions(b, st);
}

/** Einzelspiele (N2.3) → Teilnehmer, VP-Summe und Datum der Schlacht */
function applyGames(b: Battle) {
  if (!b.games?.length) return;
  // Teilnehmer der Schlacht = alle Teilnehmer der Einzelspiele
  const uniq = (l: Participant[]) => [...new Map(l.map((p) => [p.playerId, p])).values()];
  b.attackers = uniq(b.games.flatMap((g) => g.attackers));
  b.defenders = uniq(b.games.flatMap((g) => g.defenders));
  const agg = aggregateGames(b.games);
  b.vp = agg.vp;
  b.battleReady = { attacker: false, defender: false };
  if (agg.playedAt) b.playedAt = agg.playedAt;
}

/** Legt passende Standard-Entscheidungen je Operation an bzw. ersetzt unpassende (Boarding: Zielflotte aus dem Befehl). */
export function ensureDecisions(b: Battle, st?: Ctx['state']) {
  if (b.kind !== 'CAMPAIGN') return;
  const v = effectiveVictor(b);
  if (!v) return;
  const t = decisionTypesFor(b.attackType, v);
  for (const opId of b.operationIds) {
    if (b.decisions[opId]?.type !== t) b.decisions[opId] = defaultDecisionFor(st, b, opId, t);
  }
}

/** W6-Ergebnis → Index eines von `n` Theatres (gleichmäßig verteilt) */
export function theatreIndex(r: number, n: number): number {
  return Math.max(0, Math.min(n - 1, Math.floor(((r - 1) * n) / 6)));
}

/** Theatre zu einem W6-Wurf auf einem Planeten (Sinister Omens); null ohne Theatres oder bei ungültigem Wurf */
export function theatreForRoll(planetId: string, v: number): TheatreId | null {
  const th = planetDef(planetId).theatres;
  if (!th.length || !Number.isInteger(v) || v < 1 || v > 6) return null;
  return th[theatreIndex(v, th.length)] as TheatreId;
}

/** Theatre und/oder Twist würfeln */
export function rollTheatre(ctx: Ctx, id: string, what: 'THEATRE' | 'TWIST') {
  const b = battleById(ctx, id);
  if (!b.planetId) fail('Keine Schlacht mit Planet');
  const th = planetDef(b.planetId).theatres;
  if (what === 'THEATRE') {
    const r = roll(ctx, 'D6', `Zufälliges Theatre ${planetName(b.planetId)}`);
    // Gleichverteilung über die Theatres: 1 Theatre immer, 2 Theatres 1-3/4-6, 3 Theatres 1-2/3-4/5-6
    if (!th.length) fail('Planet hat keine Theatres');
    const idx = theatreIndex(r, th.length);
    b.theatre = th[idx] as TheatreId;
    b.twist = null;
    log(ctx, `Theatre: ${THEATRES[b.theatre].name}`);
  } else {
    if (!b.theatre) fail('Erst Theatre wählen');
    const r = roll(ctx, 'D6', `Twist ${THEATRES[b.theatre].name}`);
    b.twist = { d6: r, name: THEATRES[b.theatre].twists[twistIndex(r)] };
    log(ctx, `Twist: ${b.twist.name}`);
  }
}

export function setDecision(ctx: Ctx, battleId: string, opId: string, d: OutcomeDecision) {
  const b = battleById(ctx, battleId);
  if (!b.operationIds.includes(opId)) fail('Operation gehört nicht zu dieser Schlacht');
  if (b.status === 'PROCESSED') fail('Bereits verarbeitet');
  const v = effectiveVictor(b);
  if (!v) fail('Erst Ergebnis eintragen');
  const t = decisionTypesFor(b.attackType, v);
  if (d.type !== t) fail(`Entscheidungstyp muss ${t} sein`);
  // Was sich jetzt schon prüfen lässt, fällt sofort auf – nicht erst beim Verarbeiten (2.4)
  const err = precheckDecision(ctx.state, b, v, d);
  if (err) fail(`Entscheidung ungültig: ${err}`);
  b.decisions[opId] = d;
}

export function bundleBattles(ctx: Ctx, input: string[]) {
  if (house(ctx.state, 'F8_NO_BUNDLING')) fail('Hausregel (F-8): Bündeln von Schlachten ist in dieser Kampagne deaktiviert');
  const ids = [...new Set(input)];
  if (ids.length < 2) fail('Mindestens zwei verschiedene Schlachten wählen');
  const bs = ids.map((id) => battleById(ctx, id));
  const f = bs[0];
  for (const b of bs) {
    if (b.status !== 'SCHEDULED' && b.status !== 'PLAYED') fail('Nur offene Schlachten können gebündelt werden');
    if (b.planetId !== f.planetId || b.attackerAllianceId !== f.attackerAllianceId || b.defenderAllianceId !== f.defenderAllianceId || b.attackType !== f.attackType || b.phaseNumber !== f.phaseNumber) {
      fail('Bündeln nur bei gleichem Planeten, gleichen Allianzen und gleichem Attack Type');
    }
  }
  for (const b of bs.slice(1)) {
    // Ergebnisse werden nicht zusammengeführt: sonst ginge ein Ergebnis stillschweigend verloren
    if (b.vp || b.victor || b.games?.some((g) => g.vp)) fail(`Die Schlacht auf ${planetName(b.planetId!)} (Nr. ${b.createdSeq}) hat bereits ein Ergebnis – nur die erste gewählte Schlacht darf ein Ergebnis haben`);
    if (b.draft) fail(`Für die Schlacht Nr. ${b.createdSeq} liegt ein Ergebnis-Entwurf vor – erst bestätigen oder verwerfen`);
    if (b.games?.length && !f.games?.length && f.vp) fail('Die erste Schlacht hat ein Ergebnis ohne Einzelspiele – Einzelspiele der anderen Schlacht können nicht angehängt werden');
  }
  for (const b of bs.slice(1)) {
    f.operationIds.push(...b.operationIds);
    for (const p of b.attackers) if (!f.attackers.some((x) => x.playerId === p.playerId)) f.attackers.push(p);
    for (const p of b.defenders) if (!f.defenders.some((x) => x.playerId === p.playerId)) f.defenders.push(p);
    Object.assign(f.decisions, b.decisions);
    f.photos.push(...b.photos);
    if (b.games?.length) {
      const used = new Set((f.games ?? []).map((g) => g.id));
      f.games = [...(f.games ?? []), ...b.games.map((g) => (used.has(g.id) ? { ...g, id: ctx.newId('game') } : g))];
    }
    if (b.report.trim()) f.report = [f.report.trim(), b.report.trim()].filter(Boolean).join('\n\n');
    if (!f.scheduledAt && b.scheduledAt) f.scheduledAt = b.scheduledAt;
    if (!f.proposals?.length && b.proposals?.length) f.proposals = b.proposals;
    if (!f.playedAt && b.playedAt) f.playedAt = b.playedAt;
    if (!f.size && b.size) f.size = b.size;
  }
  ctx.state.battles = ctx.state.battles.filter((b) => !ids.slice(1).includes(b.id));
  if (f.games?.length) {
    const agg = aggregateGames(f.games);
    f.vp = agg.vp;
    f.battleReady = { attacker: false, defender: false };
    if (agg.playedAt) f.playedAt = agg.playedAt;
    for (const g of f.games) {
      for (const p of g.attackers) if (!f.attackers.some((x) => x.playerId === p.playerId)) f.attackers.push(p);
      for (const p of g.defenders) if (!f.defenders.some((x) => x.playerId === p.playerId)) f.defenders.push(p);
    }
    if (!f.victorOverride) f.victor = computeVictor(f);
    f.status = f.victor ? 'PLAYED' : 'SCHEDULED';
  }
  ensureDecisions(f, ctx.state);
  log(ctx, `${ids.length} Battle Operations zu einer Schlacht gebündelt (${planetName(f.planetId!)})`);
}

export function unbundleOp(ctx: Ctx, battleId: string, opId: string) {
  const b = battleById(ctx, battleId);
  if (b.operationIds.length < 2) fail('Schlacht ist nicht gebündelt');
  if (b.status !== 'SCHEDULED' && b.status !== 'PLAYED') fail('Nur offene Schlachten');
  if (!b.operationIds.includes(opId)) fail('Operation gehört nicht zu dieser Schlacht');
  const op = findOperation(ctx.state, opId);
  if (!op) fail('Operation nicht gefunden');
  if (op.type !== 'BATTLE') fail('Nur Battle Operations können herausgelöst werden');
  b.operationIds = b.operationIds.filter((x) => x !== opId);
  delete b.decisions[opId];
  const nb = newBattle(ctx, b.phaseNumber, op);
  // Teilnehmer lassen sich nur über den Kommandanten der Flotte einer Operation zuordnen:
  // Der Angreifer dieser Operation wandert mit, wenn er keine der verbleibenden Operationen führt.
  // Verteidiger gehören zur ganzen Allianz und sind keiner Operation zuzuordnen – sie bleiben.
  const lead = (o: string) => {
    const x = findOperation(ctx.state, o);
    return x ? commanderOf(ctx.state, x.fleetId, b.phaseNumber) : null;
  };
  const moving = lead(opId);
  if (moving && !b.operationIds.some((o) => lead(o) === moving) && b.attackers.some((p) => p.playerId === moving)) {
    const p = b.attackers.find((x) => x.playerId === moving)!;
    b.attackers = b.attackers.filter((x) => x.playerId !== moving);
    if (!nb.attackers.some((x) => x.playerId === moving)) nb.attackers.push(p);
  }
  ctx.state.battles.push(nb);
  log(ctx, 'Bündelung gelöst');
}

export function resolveUnplayed(ctx: Ctx, battleId: string, res: NonNullable<Battle['unplayedResolution']>) {
  const b = battleById(ctx, battleId);
  if (b.status !== 'SCHEDULED' && b.status !== 'UNPLAYED_RESOLVED' && b.status !== 'VOID') fail('Nur ungespielte Schlachten');
  // Review: Ein ausgewürfeltes Ergebnis (Hausregel W6-Duell) umzudrehen ist ein Override mit Begründung
  if (b.unplayedRoll && b.unplayedResolution && b.unplayedResolution !== res) warn(ctx, 'Weicht vom Ergebnis des W6-Duells ab (Hausregel) – nur per Override mit Begründung');
  b.unplayedResolution = res;
  b.unplayedRoll = null;
  if (res === 'VOID' || res === 'POSTPONED') {
    b.status = 'VOID';
    // Review: eine verfallene/verschobene Schlacht hat keinen Sieger (zählt z. B. nicht für Archeotech)
    b.victor = null;
    b.victorOverride = false;
    b.decisions = {};
    for (const id of b.operationIds) {
      const o = findOperation(ctx.state, id);
      if (o && res === 'VOID') o.status = 'VOID';
    }
  } else {
    b.status = 'UNPLAYED_RESOLVED';
    b.victor = res === 'ATTACKER_WINS' ? 'ATTACKER' : 'DEFENDER';
  }
  ensureDecisions(b, ctx.state);
  const label = { ATTACKER_WINS: 'Angreifer siegt', DEFENDER_WINS: 'Verteidiger siegt', VOID: 'verfällt', POSTPONED: 'in nächste Phase verschoben' }[res];
  log(ctx, `Ungespielte Schlacht auf ${planetName(b.planetId!)}: ${label}`);
}

export function reopenBattle(ctx: Ctx, battleId: string) {
  const b = battleById(ctx, battleId);
  if (b.status !== 'UNPLAYED_RESOLVED' && b.status !== 'VOID') fail('Nur für ungespielte Schlachten');
  for (const id of b.operationIds) {
    const o = findOperation(ctx.state, id);
    if (o?.status === 'VOID') o.status = 'PLANNED';
  }
  b.unplayedResolution = null;
  b.unplayedRoll = null;
  b.status = 'SCHEDULED';
  b.victor = null;
  b.decisions = {};
}

// ─── 2.4 Verarbeitung ──────────────────────────────────────────────────────

export function processQueue(ctx: Ctx | { state: Ctx['state'] }, phaseNumber?: number): Battle[] {
  const st = ctx.state;
  const n = phaseNumber ?? (st.stage.kind === 'PHASE' ? st.stage.phase : -1);
  const ph = st.phases.find((p) => p.number === n);
  const list = st.battles.filter((b) => b.phaseNumber === n && b.kind === 'CAMPAIGN' && (b.status === 'PLAYED' || b.status === 'UNPLAYED_RESOLVED' || b.status === 'PROCESSED'));
  const sorted = [...list].sort((a, b) => {
    // Review: nach Zeitpunkt statt Text sortieren (ältere Stände können beliebige Datumstexte enthalten)
    const ta = a.playedAt ? Date.parse(a.playedAt) : NaN;
    const tb = b.playedAt ? Date.parse(b.playedAt) : NaN;
    const ua = a.status === 'UNPLAYED_RESOLVED' || Number.isNaN(ta) ? 1 : 0;
    const ub = b.status === 'UNPLAYED_RESOLVED' || Number.isNaN(tb) ? 1 : 0;
    if (ua !== ub) return ua - ub;
    if (!ua && ta !== tb) return ta - tb;
    return a.createdSeq - b.createdSeq;
  });
  if (ph?.processOrder) {
    const idx = (id: string) => {
      const i = ph.processOrder!.indexOf(id);
      return i < 0 ? 1e6 : i;
    };
    sorted.sort((a, b) => idx(a.id) - idx(b.id));
  }
  // bereits verarbeitete nach ihrer tatsächlichen Reihenfolge vorn
  const done = sorted.filter((b) => b.status === 'PROCESSED').sort((a, b) => (a.processedOrder ?? 0) - (b.processedOrder ?? 0));
  return [...done, ...sorted.filter((b) => b.status !== 'PROCESSED')];
}

export function setProcessOrder(ctx: Ctx, ids: string[]) {
  requireStep(ctx, 'PROCESS');
  curPhase(ctx).processOrder = ids;
  log(ctx, 'Verarbeitungsreihenfolge manuell geändert');
}

export function processBattle(ctx: Ctx, battleId: string, opts: { outOfOrder?: boolean } = {}) {
  requireStep(ctx, 'PROCESS');
  const st = ctx.state;
  const b = battleById(ctx, battleId);
  if (b.status === 'PROCESSED') fail('Bereits verarbeitet');
  const queue = processQueue(ctx).filter((x) => x.status !== 'PROCESSED');
  if (!queue.some((x) => x.id === battleId)) fail('Schlacht ist nicht zur Verarbeitung bereit');
  if (queue[0].id !== battleId && !opts.outOfOrder) warn(ctx, 'Diese Schlacht ist nicht die nächste in chronologischer Reihenfolge');
  const v = effectiveVictor(b)!;
  const before = ctx.log.length;
  const destroyedBefore = st.planets.reduce((n, p) => n + (p.destroyed ? 100 : 0) + p.slots.filter((s) => s.destroyed).length, 0);
  log(
    ctx,
    `▶ ${ATTACK_TYPES[b.attackType!].name} auf ${planetName(b.planetId!)}: ${allianceName(st, b.attackerAllianceId)} vs. ${allianceName(st, b.defenderAllianceId)} – ${v === 'DRAW' ? 'Unentschieden' : v === 'ATTACKER' ? 'Angreifer siegt' : 'Verteidiger siegt'}`,
  );
  for (const opId of b.operationIds) {
    const op = findOperation(st, opId);
    if (!op) fail('Operation fehlt');
    const d = b.decisions[opId] ?? defaultDecisionFor(st, b, opId, decisionTypesFor(b.attackType, v));
    applyOutcome(ctx, b, op, v, d);
    op.status = 'RESOLVED';
  }
  b.status = 'PROCESSED';
  b.processedOrder = st.battles.filter((x) => x.phaseNumber === b.phaseNumber && x.status === 'PROCESSED').length;
  // N3.4: automatische Ehrungen (Weltenbrecher, wenn die Siegerseite etwas zerstört hat)
  const destroyedAfter = st.planets.reduce((n, p) => n + (p.destroyed ? 100 : 0) + p.slots.filter((s) => s.destroyed).length, 0);
  awardAutoHonors(ctx, destroyedAfter > destroyedBefore && v !== 'DRAW' ? { battleId: b.id, side: v } : undefined);
  b.applied = ctx.log.slice(before);
}

/**
 * „Alle verarbeiten“: verarbeitet alle offenen Schlachten in Reihenfolge. Eine Schlacht mit ungültiger
 * Entscheidung wird mit klarer Meldung übersprungen (ihr Zustand bleibt unverändert), die übrigen laufen weiter.
 * Die übersprungenen Schlachten verarbeitet der Spielleiter nach einer neuen Wahl des Siegers einzeln.
 */
export function processAll(ctx: Ctx): { processed: string[]; skipped: { battleId: string; error: string }[] } {
  requireStep(ctx, 'PROCESS');
  const st = ctx.state;
  const out = { processed: [] as string[], skipped: [] as { battleId: string; error: string }[] };
  const pending = processQueue(ctx).filter((b) => b.status !== 'PROCESSED');
  if (!pending.length) fail('Keine Schlacht zu verarbeiten');
  for (const p of pending) {
    const snap = structuredClone(st);
    const mark = { log: ctx.log.length, warnings: ctx.warnings.length, hints: ctx.hints.length, dice: ctx.diceUsed };
    try {
      processBattle(ctx, p.id, { outOfOrder: out.skipped.length > 0 });
      out.processed.push(p.id);
    } catch (e) {
      if (!(e instanceof RuleError)) throw e;
      // Zustand der fehlgeschlagenen Schlacht zurücksetzen
      for (const k of Object.keys(snap) as (keyof typeof snap)[]) (st as unknown as Record<string, unknown>)[k] = snap[k];
      ctx.log.length = mark.log;
      ctx.warnings.length = mark.warnings;
      ctx.hints.length = mark.hints;
      // Review: Im manuellen Modus bleibt ein eingetragener Wurf bei seiner Schlacht – sonst verbrauchte ihn die nächste
      if (ctx.dice.mode !== 'MANUAL') ctx.diceUsed = mark.dice;
      out.skipped.push({ battleId: p.id, error: e.message });
      hint(ctx, `${ATTACK_TYPES[p.attackType!].name} auf ${planetName(p.planetId!)} übersprungen – ${e.message}`);
    }
  }
  if (out.skipped.length && out.processed.length) hint(ctx, 'Übersprungene Schlachten nach neuer Wahl des Siegers einzeln verarbeiten – die Reihenfolge weicht dann von der Chronologie ab');
  if (!out.processed.length) fail(out.skipped.map((s) => s.error).join(' · '));
  return out;
}

// ─── Archeotech ────────────────────────────────────────────────────────────

export function archeotechWinners(ctx: Ctx | { state: Ctx['state'] }, phaseNumber: number, tiedOut?: Map<string, string[]>): Record<string, string | null> {
  const st = ctx.state;
  const mod = st.modifiers.find((m) => m.kind === 'ARCHEOTECH' && m.phaseNumber === phaseNumber);
  const out: Record<string, string | null> = {};
  if (!mod?.planetIds) return out;
  for (const pid of mod.planetIds) {
    const wins: Record<string, number> = {};
    for (const b of st.battles) {
      if (b.phaseNumber !== phaseNumber || b.planetId !== pid || b.kind !== 'CAMPAIGN') continue;
      const v = effectiveVictor(b);
      if (v === 'ATTACKER') wins[b.attackerAllianceId] = (wins[b.attackerAllianceId] ?? 0) + b.operationIds.length;
      if (v === 'DEFENDER') wins[b.defenderAllianceId] = (wins[b.defenderAllianceId] ?? 0) + b.operationIds.length;
    }
    const max = Math.max(0, ...Object.values(wins));
    const top = Object.keys(wins).filter((a) => wins[a] === max);
    out[pid] = max > 0 && top.length === 1 ? top[0] : null;
    if (max > 0 && top.length > 1) tiedOut?.set(pid, top);
  }
  return out;
}

export function resolveArcheotech(ctx: Ctx, increments: Record<string, string[]>) {
  requireStep(ctx, 'PROCESS');
  const ph = curPhase(ctx);
  if (ph.archeotechResolved) fail('Bereits ausgewertet');
  const tied = new Map<string, string[]>();
  const winners = archeotechWinners(ctx, ph.number, tied);
  // F-20 Hausregel: Gleichstand der Siege per Roll-off statt „niemand“
  if (house(ctx.state, 'F20_ARCHEOTECH_ROLLOFF'))
    for (const [pid, top] of tied) {
      winners[pid] = rollOff(ctx, top, `Archeotech ${planetName(pid)}`, (a) => allianceName(ctx.state, a))[0];
      // Sieger stand vorher nicht fest: ohne Vorgabe alle drei Erhöhungen auf dem Planeten selbst
      increments[pid] ??= [pid, pid, pid];
    }
  const results: NonNullable<Phase['archeotechResults']> = [];
  for (const [pid, al] of Object.entries(winners)) {
    if (!al) {
      log(ctx, `Archeotech auf ${planetName(pid)}: niemand gesichert`);
      results.push({ planetId: pid, allianceId: null, increments: [] });
      continue;
    }
    results.push({ planetId: pid, allianceId: al, increments: [...(increments[pid] ?? [])] });
    const list = increments[pid] ?? [];
    if (list.length > 3) fail('Höchstens 3 Erhöhungen je Planet');
    for (const t of list) {
      if (t !== pid && !connectedFor(ctx.state, al, pid, t, ph.number)) fail(`${planetName(t)} ist nicht ${planetName(pid)} oder verbunden`);
      increase(ctx, al, t, 1, 'Archeotech Riches', house(ctx.state, 'F17_PL_FIVE') ? 5 : 4);
    }
    log(ctx, `Archeotech auf ${planetName(pid)} gesichert durch ${allianceName(ctx.state, al)}`);
  }
  ph.archeotechResolved = true;
  ph.archeotechResults = results;
}

// ─── 2.5 / 2.6 ─────────────────────────────────────────────────────────────

export function resolveArrival(ctx: Ctx) {
  requireStep(ctx, 'ARRIVAL');
  const ph = curPhase(ctx);
  if (ph.flags.arrival) fail('Bereits ausgeführt');
  for (const o of ph.operations.filter((x) => x.type === 'VOID_LEAP' && x.status === 'PLANNED')) {
    const f = ctx.state.fleets.find((x) => x.id === o.fleetId);
    if (!f) continue;
    // N4.2: Abfanggefecht gewonnen → die Flotte bleibt stehen
    const ic = ctx.state.battles.find((b) => b.kind === 'INTERCEPT' && b.operationIds.includes(o.id) && b.status !== 'PROCESSED');
    if (ic) {
      ic.status = 'PROCESSED';
      if (effectiveVictor(ic) === 'ATTACKER') {
        o.status = 'CANCELLED';
        o.note = 'abgefangen';
        log(ctx, `${f.name} wird abgefangen und bleibt auf ${planetName(f.planetId!)}`);
        continue;
      }
      log(ctx, `${f.name}: Abfangversuch ${ic.victor ? 'abgewehrt' : 'nicht gespielt'}`);
    }
    if (planet(ctx.state, o.destinationPlanetId!).destroyed) log(ctx, `Hinweis: ${planetName(o.destinationPlanetId!)} ist inzwischen zerstört`);
    f.planetId = o.destinationPlanetId!;
    o.status = 'RESOLVED';
    log(ctx, `${f.name} springt nach ${planetName(f.planetId)} (Void Leap)`);
  }
  ph.flags.arrival = true;
}

export function resolveKillTeams(ctx: Ctx) {
  requireStep(ctx, 'RESISTANCE');
  const ph = curPhase(ctx);
  if (ph.flags.resistance) fail('Bereits ausgeführt');
  const st = ctx.state;
  for (const o of ph.operations.filter((x) => x.type === 'KILL_TEAMS' && x.status === 'PLANNED')) {
    const pid = o.killTeamPlanetId!;
    if (planet(st, pid).destroyed) {
      o.status = 'CANCELLED';
      o.note = 'Planet zerstört';
      log(ctx, `${fleetName(st, o.fleetId)}: Kill Teams annulliert (${planetName(pid)} zerstört)`);
      continue;
    }
    if (o.killTeamMode === 'GAME') {
      // N4.1: Sieg im Kill-Team-Gefecht entspricht einer 5+
      for (const b of st.battles.filter((x) => x.kind === 'KILL_TEAM' && x.operationIds.includes(o.id))) {
        b.status = 'PROCESSED';
        if (effectiveVictor(b) === 'ATTACKER') decrease(ctx, b.defenderAllianceId, pid, 1, 'Kill-Team-Gefecht gewonnen');
        else log(ctx, `Kill-Team-Gefecht gegen ${allianceName(st, b.defenderAllianceId)} auf ${planetName(pid)} ohne Wirkung${b.victor ? '' : ' (nicht gespielt)'}`);
      }
      o.status = 'RESOLVED';
      continue;
    }
    for (const a of st.alliances) {
      if (a.id === o.allianceId) continue;
      const r = roll(ctx, 'D6', `Kill Teams ${fleetName(st, o.fleetId)} → ${planetName(pid)} gegen ${a.name}`);
      if (r >= 5) {
        log(ctx, `Kill Teams gegen ${a.name} auf ${planetName(pid)} erfolgreich (${r})`);
        decrease(ctx, a.id, pid, 1, 'Deploy Kill Teams');
      }
      else log(ctx, `Kill Teams gegen ${a.name} auf ${planetName(pid)} ohne Wirkung (${r})`);
    }
    o.status = 'RESOLVED';
  }
  ph.flags.resistance = true;
  st.publishedAfterResistance = true;
}

// ─── 4 Move Fleets ─────────────────────────────────────────────────────────

/** Bewegungsmöglichkeiten einer Flotte in Schritt 4 (für die Formulare): darf sie ziehen, wie weit, wohin zuerst? */
export interface MoveOptions {
  fleetId: string;
  allowed: boolean;
  /** Grund, warum die Flotte nicht ziehen darf (Engine-Meldung, übersetzbar) */
  reason: string | null;
  /** 1 Bewegung, 2 nur mit Star of the Voidfarer */
  maxHops: 1 | 2;
  /** erlaubte erste Ziele */
  firstHops: string[];
}

export function moveOptions(st: Ctx['state'], fleetId: string, phaseNumber: number): MoveOptions {
  const f = st.fleets.find((x) => x.id === fleetId);
  const ph = st.phases.find((p) => p.number === phaseNumber);
  const maxHops: 1 | 2 = f && modifierActive(st, 'STAR_OF_VOIDFARER', phaseNumber, f.allianceId) ? 2 : 1;
  const none = (reason: string): MoveOptions => ({ fleetId, allowed: false, reason, maxHops, firstHops: [] });
  if (!f) return none('Flotte nicht gefunden');
  if (!f.planetId || f.reserve) return none('Flotte ohne Position');
  if (ph?.noMoveFleets.includes(fleetId)) return none(`${f.name} darf in dieser Phase nicht ziehen (Boarding Action)`);
  const firstHops = planetIds(st).filter((id) => id !== f.planetId && connectedFor(st, f.allianceId, f.planetId!, id, phaseNumber, 'move'));
  return { fleetId, allowed: true, reason: null, maxHops, firstHops };
}

/** Flotten einer Allianz (oder aller), die in Schritt 4 ziehen dürfen */
export function movableFleets(st: Ctx['state'], phaseNumber: number, allianceId?: string): string[] {
  return st.fleets.filter((f) => (!allianceId || f.allianceId === allianceId) && moveOptions(st, f.id, phaseNumber).allowed).map((f) => f.id);
}

export function validateMovePath(ctx: Ctx, fleetId: string, path: string[], phaseNumber: number) {
  const st = ctx.state;
  const f = st.fleets.find((x) => x.id === fleetId);
  if (!f?.planetId) fail('Flotte ohne Position');
  const ph = st.phases.find((p) => p.number === phaseNumber)!;
  if (path.length && ph.noMoveFleets.includes(fleetId)) fail(`${f.name} darf in dieser Phase nicht ziehen (Boarding Action)`);
  const maxHops = modifierActive(st, 'STAR_OF_VOIDFARER', phaseNumber, f.allianceId) ? 2 : 1;
  if (path.length > maxHops) fail(`Höchstens ${maxHops} Bewegung(en)`);
  let cur = f.planetId;
  for (const next of path) {
    if (!connectedFor(st, f.allianceId, cur, next, phaseNumber, 'move')) fail(`${planetName(next)} ist von ${planetName(cur)} nicht verbunden`);
    cur = next;
  }
}

export function setMove(ctx: Ctx, fleetId: string, path: string[]) {
  requireStep(ctx, 'MOVE');
  const ph = curPhase(ctx);
  if (ph.flags.movesApplied) fail('Bewegungen bereits ausgeführt');
  validateMovePath(ctx, fleetId, path, ph.number);
  ph.moves[fleetId] = path;
}

export function applyMoves(ctx: Ctx) {
  requireStep(ctx, 'MOVE');
  const ph = curPhase(ctx);
  if (ph.flags.movesApplied) fail('Bereits ausgeführt');
  for (const [fid, path] of Object.entries(ph.moves)) {
    if (!path.length) continue;
    const f = ctx.state.fleets.find((x) => x.id === fid);
    if (!f) continue;
    validateMovePath(ctx, fid, path, ph.number);
    f.planetId = path[path.length - 1];
    log(ctx, `${f.name} zieht nach ${planetName(f.planetId)}`);
  }
  ph.flags.movesApplied = true;
}

// ─── 5 Build ───────────────────────────────────────────────────────────────

export function startBuild(ctx: Ctx) {
  requireStep(ctx, 'BUILD');
  const ph = curPhase(ctx);
  if (ph.flags.buildStarted) fail('Reihenfolge steht bereits fest');
  const st = ctx.state;
  // F-1: Standard Power-Level-Summe, Hausregel Kampagnenpunkte
  const buildValue = (a: string) => (house(st, 'F1_BUILD_ORDER_POINTS') ? campaignPoints(st, a) : powerSum(st, a));
  ph.buildOrder = orderByValue(
    ctx,
    st.alliances.map((a) => a.id),
    buildValue,
    'Bau-Reihenfolge',
    (a) => allianceName(st, a),
  );
  ph.flags.buildStarted = true;
  log(ctx, `Bau-Reihenfolge: ${ph.buildOrder.map((a) => allianceName(st, a)).join(' → ')}`);
}

export function buildablePlanets(ctx: Ctx | { state: Ctx['state'] }, allianceId: string, phaseNumber: number): string[] {
  const st = ctx.state;
  const bases = [...new Set(st.fleets.filter((f) => f.allianceId === allianceId && f.planetId).map((f) => f.planetId!))];
  const set = new Set<string>();
  for (const b of bases) {
    set.add(b);
    for (const id of planetIds(st)) if (connectedFor(st, allianceId, b, id, phaseNumber)) set.add(id);
  }
  return [...set].filter((id) => !planet(st, id).destroyed);
}

export function setBuild(ctx: Ctx, allianceId: string, choice: { type: InfraType; planetId: string } | 'SKIP') {
  requireStep(ctx, 'BUILD');
  const ph = curPhase(ctx);
  if (!ph.flags.buildStarted) startBuild(ctx);
  if (ph.builds[allianceId]) fail('Diese Allianz hat bereits entschieden');
  const idx = ph.buildOrder.indexOf(allianceId);
  const prev = ph.buildOrder.slice(0, idx);
  if (prev.some((a) => !ph.builds[a]))
    fail(
      `Erst ${prev
        .filter((a) => !ph.builds[a])
        .map((a) => allianceName(ctx.state, a))
        .join(', ')} bauen lassen`,
    );
  if (choice === 'SKIP') {
    ph.builds[allianceId] = 'SKIP';
    log(ctx, `${allianceName(ctx.state, allianceId)} verzichtet auf den Bau`);
    return;
  }
  if (choice.type === 'STRONGHOLD') fail('Keine Strongholds');
  if (!buildablePlanets(ctx, allianceId, ph.number).includes(choice.planetId)) fail('Planet muss eine eigene Flotte haben oder damit verbunden sein');
  build(ctx, allianceId, choice.type, choice.planetId, { why: 'Build Infrastructure' });
  ph.builds[allianceId] = { allianceId, ...choice };
}

// ─── neue Phase ────────────────────────────────────────────────────────────

export function startNextPhase(ctx: Ctx) {
  const st = ctx.state;
  const ph = curPhase(ctx);
  ph.stepStatus.BUILD = 'DONE';
  const n = ph.number + 1;
  const next = newPhase(n);
  st.phases.push(next);
  carryCommanders(st, n);
  // verschobene Schlachten übernehmen
  for (const b of st.battles.filter((x) => x.phaseNumber === ph.number && x.unplayedResolution === 'POSTPONED')) {
    st.battleSeq++;
    st.battles.push({
      ...structuredClone(b),
      id: ctx.newId('battle'),
      phaseNumber: n,
      status: 'SCHEDULED',
      unplayedResolution: null,
      victor: null,
      decisions: {},
      applied: [],
      processedOrder: null,
      createdSeq: st.battleSeq,
      postponedFrom: b.id,
    });
  }
  st.stage = { kind: 'PHASE', phase: n, step: 'OPS' };
  st.publishedAfterResistance = false;
  log(ctx, `Phase ${n} beginnt`);
}

/** Operationen der verschobenen Schlachten liegen in der Vorphase; Hilfsfunktion */
export function findOperation(st: Ctx['state'], opId: string): Operation | undefined {
  for (const p of st.phases) {
    const o = p.operations.find((x) => x.id === opId);
    if (o) return o;
  }
  return undefined;
}

export { distance, OP_TYPES };
