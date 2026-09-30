import type { CampaignState } from './types';

/**
 * Hausregel-Schalter zu den FAQ-Entscheidungen (N2.1). Standard ist jeweils unsere FAQ-Entscheidung;
 * ein gesetzter Schalter aktiviert die Alternative. Gespeichert in `state.toggles.houseRules`.
 */
export type HouseRuleId =
  | 'F1_BUILD_ORDER_POINTS'
  | 'F3_BOARDING_NEEDS_FLEET'
  | 'F5_ZEAL_DIFFERENT'
  | 'F6_AUXILIA_ANYWAY'
  | 'F7_EDIFICES_BLOCK'
  | 'F8_NO_BUNDLING'
  | 'F10_SEIZE_KEEP'
  | 'F11_STAGING_SAME_PLANET'
  | 'F12_LINE_NOT_SUBTRACT'
  | 'F13_STRONGHOLD_FIXED'
  | 'F15_TREAT_STACKS'
  | 'F16_LINES_NOT_CUMULATIVE'
  | 'F17_PL_FIVE'
  | 'F18_FACILITY_MOVE_ONLY'
  | 'F20_ARCHEOTECH_ROLLOFF'
  | 'F22_MEDAL_TIE_NONE'
  | 'F23_POINTS_CAP'
  | 'A6_HANDICAP_NO_TEST';

export interface HouseRuleDef {
  id: HouseRuleId;
  faq: string;
  title: string;
  /** unsere FAQ-Entscheidung */
  standard: string;
  /** Alternative bei gesetztem Schalter */
  alternative: string;
}

export const HOUSE_RULES: HouseRuleDef[] = [
  { id: 'F1_BUILD_ORDER_POINTS', faq: 'F-1', title: 'Bau-Reihenfolge', standard: 'Summe der Power Level (ohne Stronghold-Bonus)', alternative: 'Kampagnenpunkte (mit +3 für den Stronghold)' },
  { id: 'F3_BOARDING_NEEDS_FLEET', faq: 'F-3', title: 'Boarding Action ohne gegnerische Flotte', standard: 'erlaubt, mit Warnung', alternative: 'nur erlaubt, wenn eine gegnerische Flotte auf dem Zielplaneten steht' },
  { id: 'F5_ZEAL_DIFFERENT', faq: 'F-5', title: 'Defiant Zeal', standard: 'zweite Operation darf dieselbe sein', alternative: 'zweite Operation muss eine andere Art sein' },
  {
    id: 'F6_AUXILIA_ANYWAY',
    faq: 'F-6',
    title: 'Flotte ohne Befehl bei verbotenem Logistical Auxilia',
    standard: 'keine Operation',
    alternative: 'erhält trotzdem Logistical Auxilia (Verbot gilt nur für gewählte Befehle)',
  },
  { id: 'F7_EDIFICES_BLOCK', faq: 'F-7', title: 'Raise Edifices am Limit', standard: 'Befehl möglich (Warnung), wird in 2.2 annulliert', alternative: 'Befehl wird schon bei der Eingabe abgelehnt' },
  { id: 'F8_NO_BUNDLING', faq: 'F-8', title: 'Mehrspieler-Schlachten', standard: 'Operationen können zu einer Schlacht gebündelt werden', alternative: 'keine Bündelung, jede Operation ist eine eigene Schlacht' },
  { id: 'F10_SEIZE_KEEP', faq: 'F-10', title: 'Seize Power Base, Angreifer am Limit', standard: 'Stück des Verteidigers wird trotzdem entfernt', alternative: 'Stück des Verteidigers bleibt stehen' },
  { id: 'F11_STAGING_SAME_PLANET', faq: 'F-11', title: 'Seize Power Base, Staging Grounds des Verteidigers', standard: 'auch auf einem verbundenen Planeten', alternative: 'nur auf dem umkämpften Planeten' },
  {
    id: 'F12_LINE_NOT_SUBTRACT',
    faq: 'F-12',
    title: 'Purge and Burn, Fortification Line bei Umverteilung',
    standard: 'zerstörte Line zählt als Senkung',
    alternative: 'nur echte PL-Senkungen erlauben eine Umverteilung',
  },
  {
    id: 'F13_STRONGHOLD_FIXED',
    faq: 'F-13',
    title: 'Stronghold verlegen (Orbital Invasion, Smuggled Assets)',
    standard: 'Stronghold darf mit umziehen',
    alternative: 'Stronghold bleibt stehen (bei Orbital Invasion und Smuggled Assets)',
  },
  { id: 'F15_TREAT_STACKS', faq: 'F-15', title: '„Treat Power Level as 1 higher or lower“', standard: 'Quellen stapeln nicht (höchstens ±1)', alternative: 'Quellen stapeln (±1 je Quelle)' },
  { id: 'F16_LINES_NOT_CUMULATIVE', faq: 'F-16', title: 'Mehrere Fortification Lines', standard: 'kumulativ (Minimum 1 + Anzahl Lines)', alternative: 'nicht kumulativ (Minimum 2, egal wie viele Lines)' },
  { id: 'F17_PL_FIVE', faq: 'F-17', title: 'Power Level über 4', standard: 'höchstens 4', alternative: 'Penumbral Wreath und Archeotech Riches dürfen bis 5 erhöhen' },
  { id: 'F18_FACILITY_MOVE_ONLY', faq: 'F-18', title: 'Reichweite der Support Facility', standard: 'gilt für alle Regeln mit „connected“', alternative: 'gilt nur für die Flottenbewegung' },
  { id: 'F20_ARCHEOTECH_ROLLOFF', faq: 'F-20', title: 'Archeotech Riches bei Gleichstand der Siege', standard: 'niemand sichert die Riches', alternative: 'Roll-off unter den Gleichauf-Liegenden' },
  { id: 'F22_MEDAL_TIE_NONE', faq: 'F-22', title: 'Medaillen bei Gleichstand', standard: 'Roll-off', alternative: 'Medaille wird nicht vergeben' },
  { id: 'F23_POINTS_CAP', faq: 'F-23', title: 'Mehr als 55 Punkte', standard: 'wird normal weitergezählt', alternative: 'Kampagnenpunkte sind auf 55 begrenzt' },
  // A6 (Online-Feedback): Handicap-Events ohne Würfeltest
  {
    id: 'A6_HANDICAP_NO_TEST',
    faq: 'A6',
    title: 'Handicap-Events (Perils of Power / Desperate Measures)',
    standard: 'W6-Test (4+), wenn eine Allianz dominiert bzw. zurückliegt',
    alternative: 'ohne W6-Test: bei erfüllter Bedingung tritt das Event immer ein',
  },
];

/** Ist die Alternative zu einer FAQ-Entscheidung aktiv? */
export function house(state: Pick<CampaignState, 'toggles'>, id: HouseRuleId): boolean {
  return state.toggles.houseRules?.[id] === true;
}

export function activeHouseRules(state: Pick<CampaignState, 'toggles'>): HouseRuleDef[] {
  return HOUSE_RULES.filter((r) => house(state, r.id));
}
