import { EVENTS, INFRA, THEATRES } from './data/vespator';
import { countOnPlanet, minPL } from './board';
import { lastPhaseRule } from './campaignRules';
import { modifierActive } from './graph';
import { allMissions, missionLabel } from './missions';
import { missionKey, missionPool } from './missionPool';
import { DRAW_SUMMARY, OUTCOME_SUMMARY, powerSources, type Side } from './outcomes';
import type { Battle, CampaignState, Modifier } from './types';

/**
 * Regelkarte „Diese Schlacht“ (A7): alles, was in genau dieser Schlacht gilt, auf einen Blick – Mission,
 * Theatre und Twist, Boni der Seiten (Staging Grounds, Stronghold, Support Facility, Fortification Line),
 * aktive Zusatzregeln (Twist, Infrastruktur-Aura, Events) und die Outcomes je Ergebnis.
 * Alle Texte sind deutsche Engine-Meldungen und werden in der Anzeige über translateMessage übersetzt.
 */

export interface RuleCard {
  mission: { name: string; note: string; fromPool: boolean };
  theatre: { name: string | null; chooser: Battle['theatreChosenBy']; twist: string | null } | null;
  bonuses: { side: Side; items: string[] }[];
  extras: string[];
  /** mehr als eine Zusatzregel gleichzeitig – leicht zu vergessen */
  stacked: boolean;
  outcomes: { attacker: string; defender: string; draw: string } | null;
}

/** Objective-Fähigkeit der Infrastruktur des Verteidigers in Seize Power Base */
const OBJECTIVE_ABILITY: Record<string, string> = {
  STRONGHOLD: 'Comms Network',
  SUPPORT_FACILITY: 'Unstable Materiel Duct',
  STAGING_GROUNDS: 'Augury Fane',
  FORTIFICATION_LINE: 'Prepared Defences',
};

function eventName(state: CampaignState, m: Modifier): string {
  const e = state.events.find((x) => x.id === m.source);
  // eigene Ereignisse haben keinen Eintrag in EVENTS
  return (e && (EVENTS as Record<string, { name: string } | undefined>)[e.code]?.name) || m.kind;
}

export function ruleCard(state: CampaignState, b: Battle): RuleCard {
  const all = allMissions(state);
  const key = missionKey(b);
  const def = all.find((m) => m.id === key);
  const pool = missionPool(state, b.attackType);
  const mission = { name: missionLabel(state, b), note: def?.note ?? '', fromPool: pool.some((m) => m.id === key) };
  const campaign = b.kind === 'CAMPAIGN' && !!b.attackType && !!b.planetId;
  const boarding = b.attackType === 'BOARDING_ACTION';
  const theatre =
    campaign && !boarding && state.toggles.theatreTwists ? { name: b.theatre ? THEATRES[b.theatre].name : null, chooser: b.theatreChosenBy, twist: b.twist ? `${b.twist.name} (W6 ${b.twist.d6})` : null } : null;
  const bonuses: RuleCard['bonuses'] = [];
  const extras: string[] = [];
  if (campaign) {
    const facilitiesOff = modifierActive(state, 'SUPPORT_FACILITIES_INACTIVE', b.phaseNumber);
    for (const side of ['ATTACKER', 'DEFENDER'] as Side[]) {
      const al = side === 'ATTACKER' ? b.attackerAllianceId : b.defenderAllianceId;
      const src = powerSources(state, b, side);
      const items: string[] = [];
      if (src.mission.includes('Staging Grounds')) items.push('Staging Grounds: Power Level für Mission Rules ±1');
      if (src.outcome.includes('Stronghold')) items.push('Stronghold: Power Level für Campaign Outcomes ±1');
      if (src.mission.includes('Coordinated Opposition')) items.push('Coordinated Opposition: ±1 für Mission Rules und Campaign Outcomes');
      const lines = countOnPlanet(state, al, b.planetId!, 'FORTIFICATION_LINE');
      if (lines) items.push(`Fortification Line: Power Level hier mindestens ${minPL(state, al, b.planetId!)}`);
      if (!facilitiesOff && countOnPlanet(state, al, b.planetId!, 'SUPPORT_FACILITY') > 0) items.push('Support Facility: verlängert die Reichweite „connected“');
      bonuses.push({ side, items });
    }
    if (b.twist) extras.push(`Twist: ${b.twist.name}`);
    if (b.attackType === 'SEIZE_POWER_BASE') {
      const p = state.planets.find((x) => x.id === b.planetId);
      for (const s of p?.slots ?? []) {
        if (s.destroyed || s.infra?.allianceId !== b.defenderAllianceId) continue;
        extras.push(`Objective des Verteidigers: ${OBJECTIVE_ABILITY[s.infra.type]} (${INFRA[s.infra.type].name})`);
      }
    }
    for (const m of state.modifiers.filter((x) => x.phaseNumber === b.phaseNumber)) {
      if (m.kind === 'RANDOM_THEATRE' && !boarding) extras.push(`${eventName(state, m)}: Theatre wird ausgewürfelt`);
      if (m.kind === 'SUPPORT_FACILITIES_INACTIVE') extras.push(`${eventName(state, m)}: Support Facilities inaktiv`);
      if (m.kind === 'ARCHEOTECH' && m.planetIds?.includes(b.planetId!)) extras.push(`${eventName(state, m)}: Sieg zählt für die Archeotech Riches`);
      if (m.kind === 'COORDINATED_OPPOSITION' && (m.allianceId === b.attackerAllianceId || m.allianceId === b.defenderAllianceId)) extras.push(`${eventName(state, m)}: Gegner erhalten ±1`);
    }
    if (lastPhaseRule(state, b.phaseNumber, 'doubleGains')) extras.push('Letzte Phase: PL-Gewinne des Siegers zählen doppelt');
  }
  const sum = b.attackType ? OUTCOME_SUMMARY[b.attackType] : null;
  return {
    mission,
    theatre,
    bonuses,
    extras,
    stacked: extras.length > 1,
    outcomes: campaign && sum ? { attacker: sum.A, defender: sum.D, draw: DRAW_SUMMARY } : null,
  };
}
