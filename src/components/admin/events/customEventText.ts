import { INFRA } from '@/engine/data/vespator';
import { MODIFIER_LABEL, type AllianceRef, type CustomEffect, type PlanetRef } from '@/engine/customEvents';
import { planetName } from '@/engine/map';
import type { CampaignState } from '@/engine/types';
import type { T } from '@/i18n/core';

/** Lesbarer Text eines Allianz-Bezugs (D2) */
export function allianceRefText(ref: AllianceRef | null, state: Pick<CampaignState, 'alliances'>, t: T): string {
  switch (ref) {
    case null:
      return t('alle');
    case 'TARGET':
      return t('Ziel-Allianz');
    case 'OTHERS':
      return t('alle außer der Ziel-Allianz');
    case 'ALL':
      return t('alle Allianzen');
    case 'LEADER':
      return t('führende Allianz');
    case 'TRAILING':
      return t('letzte Allianz');
    default:
      return state.alliances.find((a) => a.id === ref)?.name ?? '?';
  }
}

/** Lesbarer Text eines Planeten-Bezugs (D2) */
export function planetRefText(ref: PlanetRef, t: T): string {
  switch (ref) {
    case 'CHOSEN':
      return t('gewählter Planet');
    case 'ALL':
      return t('alle Planeten');
    case 'STRONGHOLD':
      return t('Stronghold-Planet');
    default:
      return planetName(ref);
  }
}

const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

/** Ein Baustein als Satz (Anzeige im Baukasten, im Event und in der Vorschau) */
export function effectText(e: CustomEffect, state: Pick<CampaignState, 'alliances'>, t: T): string {
  const a = allianceRefText(e.alliance, state, t);
  switch (e.kind) {
    case 'PL':
      return t('Power Level {delta}: {alliance} auf {planet}', { delta: signed(e.delta), alliance: a, planet: planetRefText(e.planet, t) });
    case 'INFRA_DESTROY':
      return t('Infrastruktur zerstören: {alliance} auf {planet}', { alliance: a, planet: planetRefText(e.planet, t) });
    case 'INFRA_BUILD':
      return t('{infra} bauen: {alliance} auf {planet}', { infra: INFRA[e.infra].name, alliance: a, planet: planetRefText(e.planet, t) });
    case 'MOVE':
      return t('Flotten versetzen: {alliance} nach {planet}', { alliance: a, planet: planetRefText(e.planet, t) });
    case 'POINTS':
      return t('Kampagnenpunkte {delta}: {alliance}', { delta: signed(e.delta), alliance: a });
    case 'MODIFIER':
      return t('Nächste Phase: {modifier}{alliance}', { modifier: t(MODIFIER_LABEL[e.modifier]), alliance: e.alliance ? ` (${a})` : '' });
  }
}

/** Bezeichnungen der Bausteine im Baukasten */
export const EFFECT_LABEL: Record<CustomEffect['kind'], string> = {
  PL: 'Power Level ±',
  INFRA_DESTROY: 'Infrastruktur zerstören',
  INFRA_BUILD: 'Infrastruktur bauen',
  MOVE: 'Flotten versetzen',
  POINTS: 'Kampagnenpunkte ±',
  MODIFIER: 'Modifikator nächste Phase',
};
