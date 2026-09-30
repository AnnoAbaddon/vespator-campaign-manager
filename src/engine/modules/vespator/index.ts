// NTH2 3.3: „War on the Vespator Front“ als erstes Regelmodul. Die Regeln selbst leben weiterhin in
// setup.ts, phase.ts, outcomes.ts, events.ts, scoring.ts usw.; dieses Modul bündelt sie hinter der
// Schnittstelle `CampaignModule` (Delegation statt Neuschreiben, Verhalten unverändert).
//
// Alle Verweise auf Engine-Funktionen stehen in Funktionen bzw. Gettern: Die Module bilden mit
// init.ts/phase.ts einen Import-Kreis, der erst zur Laufzeit (nicht beim Laden) aufgelöst wird.

import type { CampaignModule, ModuleOpInput } from '../types';
import type { Ctx } from '../../ctx';
import { fail } from '../../ctx';
import { VESPATOR_MAP } from '../../map';
import { HOUSE_RULES } from '../../houseRules';
import { PHASE_STEPS, SETUP_STEPS, type SetupStep } from '../../types';
import * as init from '../../init';
import * as setup from '../../setup';
import * as phase from '../../phase';
import * as events from '../../events';
import * as scoring from '../../scoring';
import { ATTACK_TYPES, EVENTS, INFRA, MEDALS, OP_TYPES, THEATRES } from './data';
import { dispatchVespator } from './commands';

const SETUP_LABELS: Record<SetupStep, string> = {
  W0: 'Allianzen & Spieler',
  W1: 'Medaillen zuordnen',
  W2: 'Strongholds & Power Level',
  W3: 'Start-Infrastruktur',
  W4: 'Flotten-Startpositionen',
  W5: 'Start vorbereiten',
};

/** Modul-Eingabe → Vespator-Operation; unbekannte Angriffsarten werden abgewiesen statt abzustürzen */
function toOpInput(input: ModuleOpInput): phase.OpInput {
  if (input.attackType !== undefined && !(input.attackType in ATTACK_TYPES)) fail('Unbekannte Angriffsart');
  return input as phase.OpInput;
}

export const vespatorModule: CampaignModule = {
  id: 'vespator',
  name: 'Vespator Front',
  version: '1.0.0',
  description: 'Kampagnensystem der Vespator-Front: Allianzen ringen mit Flotten, Power Level und Infrastruktur um ein Sternensystem.',

  data: {
    attackTypes: ATTACK_TYPES,
    opTypes: OP_TYPES,
    theatres: THEATRES,
    infra: INFRA,
    medals: MEDALS,
    events: EVENTS,
  },
  defaultMap: () => VESPATOR_MAP,
  get setupSteps() {
    return SETUP_STEPS.map((id) => ({ id, label: SETUP_LABELS[id] }));
  },
  get phaseSteps() {
    return PHASE_STEPS.map((id) => ({ id, label: phase.STEP_LABELS[id] }));
  },

  defaultToggles: (allianceCount) => init.defaultToggles(allianceCount),
  get houseRules() {
    return HOUSE_RULES;
  },

  migrate(state) {
    state.stellarStormsUsed ??= false;
  },

  startCampaign: (ctx, dates) => setup.startCampaign(ctx, dates),
  operations: {
    validate: (ctx: Ctx, fleetId, slot, input) => phase.validateOp(ctx, fleetId, slot, toOpInput(input)),
    set: (ctx: Ctx, fleetId, slot, input) => phase.setOperation(ctx, fleetId, slot, toOpInput(input)),
    clear: (ctx: Ctx, fleetId, slot) => phase.clearOperation(ctx, fleetId, slot),
  },
  advance: (ctx) => phase.advance(ctx),
  battles: {
    process: (ctx, battleId) => phase.processBattle(ctx, battleId),
    processAll: (ctx) => phase.processAll(ctx),
  },
  scorePhase: (ctx) => scoring.scorePhase(ctx),
  generateEvents: (ctx) => events.generateEvents(ctx),
  endCampaign: (ctx) => scoring.endCampaign(ctx),
  dispatch: (ctx, cmd) => dispatchVespator(ctx, cmd),

  publicView(full) {
    // Setup-Wahlen (Strongholds, Start-Infrastruktur, Flottenstarts) bis zum jeweiligen Reveal verbergen – als
    // Allowlist neu aufgebaut. Der Laurel-Planet bleibt sichtbar: Er wird zu Beginn des Schritts gewählt und beschränkt
    // die (verdeckten) Wahlen der anderen Allianzen (die übrigen Allianzen dürfen ihn nicht wählen) – die müssen ihn kennen.
    // Vespator hat keinen eigenen Modulzustand (moduleState bleibt privat).
    const su = full.setup;
    const hidden = { strongholdPlanetId: null, pl3: [], pl2: [] };
    return {
      setup: {
        fleetsPerAlliance: { ...su.fleetsPerAlliance },
        strongholds: Object.fromEntries(Object.entries(su.strongholds).map(([k, v]) => [k, su.strongholdsRevealed ? structuredClone(v) : { ...hidden, pl3: [], pl2: [] }])),
        strongholdsRevealed: su.strongholdsRevealed,
        wreathApplied: su.wreathApplied,
        infra: structuredClone(su.infra.filter((i) => i.built)),
        infraRevealed: su.infraRevealed,
        fleetStarts: su.fleetsRevealed ? { ...su.fleetStarts } : {},
        fleetsRevealed: su.fleetsRevealed,
        daggerSwaps: su.daggerSwaps,
        daggerDone: su.daggerDone,
        laurel: su.laurel ? { ...su.laurel } : null,
        messages: [],
      },
    };
  },
};
