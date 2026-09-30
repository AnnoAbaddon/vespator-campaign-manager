import type { AttackType } from './data/vespator';
import { mapOf, type MapDef } from './map';
import { SCHEMA_VERSION, type CampaignState, type RuleToggles } from './types';
import { DEFAULT_MODULE_ID, getModule } from './modules/registry';

export function defaultToggles(allianceCount: 2 | 3): RuleToggles {
  const attackTypes = {
    SEIZE_POWER_BASE: true,
    PURGE_AND_BURN: true,
    ORBITAL_INVASION: true,
    PLANETARY_BOMBARDMENT: true,
    SUPPLY_BASE_RAID: true,
    BOARDING_ACTION: true,
  } as Record<AttackType, boolean>;
  return {
    events: { fortunesOfWar: true, perilsOfPower: true, desperateMeasures: true, disabled: [] },
    theatreTwists: true,
    medals: true,
    operations: { voidLeap: true, raiseEdifices: true, logisticalAuxilia: true, killTeams: true, attackTypes },
    setupInfraCount: allianceCount === 2 ? 4 : 3,
  };
}

export function createCampaignState(opts: {
  name: string;
  intro?: string;
  phaseCount: number;
  allianceCount: 2 | 3;
  toggles?: RuleToggles;
  now?: string;
  map?: MapDef;
  /** Kampagnensprache (Vorgabe: globale Standardsprache der Installation) */
  locale?: 'de' | 'en' | 'fr' | 'es' | 'pl';
  /** Regelmodul (NTH2 3.3); Vorgabe: Vespator */
  module?: string;
}): CampaignState {
  const now = opts.now ?? new Date().toISOString();
  const mod = getModule(opts.module ?? DEFAULT_MODULE_ID);
  const map = structuredClone(opts.map ?? mod.defaultMap());
  const state: CampaignState = {
    schemaVersion: SCHEMA_VERSION,
    map,
    meta: {
      name: opts.name,
      intro: opts.intro ?? '',
      phaseCount: opts.phaseCount,
      allianceCount: opts.allianceCount,
      createdAt: now,
      timezone: 'Europe/Berlin',
      ...(opts.locale ? { locale: opts.locale } : {}),
      module: mod.id,
    },
    toggles: opts.toggles ?? mod.defaultToggles(opts.allianceCount),
    alliances: [],
    players: [],
    fleets: [],
    planets: mapOf({ map }).planets.map((p) => ({
      id: p.id,
      power: {},
      destroyed: false,
      slots: Array.from({ length: p.slots }, () => ({ destroyed: false, infra: null })),
      lore: '',
      notes: '',
    })),
    phases: [],
    stage: { kind: 'SETUP', step: mod.setupSteps[0]?.id ?? 'W0' },
    battles: [],
    battleSeq: 0,
    events: [],
    stellarStormsUsed: false,
    modifiers: [],
    dice: [],
    dispatches: [],
    medals: [],
    inheritedMedals: [],
    setup: {
      fleetsPerAlliance: {},
      strongholds: {},
      strongholdsRevealed: false,
      wreathApplied: false,
      infra: [],
      infraRevealed: false,
      fleetStarts: {},
      fleetsRevealed: false,
      daggerSwaps: 0,
      daggerDone: false,
      laurel: null,
      messages: [],
    },
    pointsHistory: [],
    result: null,
    publishedAfterResistance: false,
  };
  if (mod.defaultHouseRules) state.toggles.houseRules = { ...mod.defaultHouseRules, ...state.toggles.houseRules };
  mod.initState?.(state);
  return state;
}

export function newPhase(number: number): CampaignState['phases'][number] {
  return {
    number,
    startDate: null,
    opsDeadline: null,
    battlesDeadline: null,
    endDate: null,
    operations: [],
    moves: {},
    flags: {},
    processOrder: null,
    noMoveFleets: [],
    buildOrder: [],
    builds: {},
    stepStatus: {},
    notes: '',
    openTomeRevealed: false,
    archeotechResolved: false,
  };
}
