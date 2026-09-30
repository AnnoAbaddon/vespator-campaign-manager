// Stammdaten der Vespator-Front-Karte (SPEC Kap. 6). Fest eingebaut, nicht editierbar.
// NTH2 3.3: gehört zum Regelmodul „Vespator Front“; `@/engine/data/vespator` re-exportiert diese Datei.

export type TheatreId = 'SPACEPORT' | 'DESOLATE_WASTES' | 'XENOFLORA_JUNGLE' | 'RAD_ZONE' | 'FORGE_COMPLEX' | 'HAB_SPRAWL' | 'DELVESITE_FACILITY' | 'DEAD_LANDS' | 'TOMB_COMPLEX';

export interface PlanetDef {
  id: string;
  name: string;
  system: string;
  slots: number;
  theatres: TheatreId[];
  /** Position in % der Kartenbreite/-höhe */
  x: number;
  y: number;
  /** Nur im Karteneditor (NTH2 4.2): eigene Bilder eines Planeten, MAP_SET übernimmt sie in den Planetenzustand */
  portrait?: string | null;
  landscape?: string | null;
}

export const PLANETS: PlanetDef[] = [
  { id: 'norallus', name: 'Norallus', system: 'Gorund System', slots: 3, theatres: ['RAD_ZONE', 'DELVESITE_FACILITY', 'HAB_SPRAWL'], x: 18.5, y: 21.7 },
  { id: 'masnet', name: 'Masnet', system: 'Kasphos System', slots: 2, theatres: ['DEAD_LANDS', 'SPACEPORT', 'HAB_SPRAWL'], x: 40.5, y: 27.5 },
  { id: 'felgris-secundas', name: 'Felgris Secundas', system: 'Osymanden System', slots: 3, theatres: ['XENOFLORA_JUNGLE', 'FORGE_COMPLEX'], x: 56.9, y: 15.1 },
  { id: 'tarkad-vindix', name: 'Tarkad Vindix', system: 'Reiya System', slots: 3, theatres: ['DESOLATE_WASTES', 'RAD_ZONE'], x: 71.0, y: 31.2 },
  { id: 'jawardet', name: 'Jawardet', system: 'Esvar System', slots: 2, theatres: ['DEAD_LANDS', 'TOMB_COMPLEX', 'HAB_SPRAWL'], x: 91.3, y: 35.3 },
  { id: 'karabas', name: 'Karabas', system: 'Salem System', slots: 4, theatres: ['FORGE_COMPLEX', 'DELVESITE_FACILITY'], x: 11.8, y: 56.4 },
  { id: 'kryndaer', name: 'Kryndaer', system: 'Zur Mortalis System', slots: 2, theatres: ['TOMB_COMPLEX', 'DELVESITE_FACILITY', 'XENOFLORA_JUNGLE'], x: 34.2, y: 49.5 },
  { id: 'novamagnor', name: 'Novamagnor', system: 'Heliodras System', slots: 2, theatres: ['TOMB_COMPLEX', 'SPACEPORT'], x: 57.3, y: 55.4 },
  { id: 'astarthem', name: 'Astarthem', system: 'Orphon System', slots: 4, theatres: ['FORGE_COMPLEX', 'DESOLATE_WASTES'], x: 80.3, y: 57.1 },
  { id: 'caltus-novem', name: 'Caltus Novem', system: 'Vespator System', slots: 3, theatres: ['DEAD_LANDS', 'FORGE_COMPLEX', 'XENOFLORA_JUNGLE'], x: 37.7, y: 72.9 },
  { id: 'marvinius', name: 'Marvinius', system: 'Diodecis System', slots: 3, theatres: ['RAD_ZONE', 'HAB_SPRAWL'], x: 21.1, y: 88.8 },
  { id: 'vikus-decima', name: 'Vikus Decima', system: 'Vikulum System', slots: 2, theatres: ['DESOLATE_WASTES', 'SPACEPORT'], x: 52.7, y: 89.4 },
  { id: 'ikaron-prime', name: 'Ikaron Prime', system: 'Ikaron System', slots: 3, theatres: ['RAD_ZONE', 'DELVESITE_FACILITY', 'HAB_SPRAWL'], x: 86.2, y: 83.4 },
];

export const CONNECTIONS: [string, string][] = [
  ['norallus', 'masnet'],
  ['norallus', 'karabas'],
  ['norallus', 'kryndaer'],
  ['masnet', 'felgris-secundas'],
  ['masnet', 'tarkad-vindix'],
  ['felgris-secundas', 'tarkad-vindix'],
  ['tarkad-vindix', 'jawardet'],
  ['tarkad-vindix', 'novamagnor'],
  ['jawardet', 'astarthem'],
  ['jawardet', 'ikaron-prime'],
  ['karabas', 'kryndaer'],
  ['kryndaer', 'caltus-novem'],
  ['novamagnor', 'astarthem'],
  ['novamagnor', 'ikaron-prime'],
  ['caltus-novem', 'marvinius'],
  ['caltus-novem', 'vikus-decima'],
  ['caltus-novem', 'ikaron-prime'],
  ['marvinius', 'vikus-decima'],
];

export const THEATRES: Record<TheatreId, { name: string; twists: [string, string, string] }> = {
  SPACEPORT: { name: 'Spaceport', twists: ['Coordinate Lock', 'Vid-feed Network', 'Embarkation Shrines'] },
  DESOLATE_WASTES: { name: 'Desolate Wastes', twists: ['Open Ground', 'Eye of Judgement', 'Exposed Combatants'] },
  XENOFLORA_JUNGLE: { name: 'Xenoflora Jungle', twists: ['Slaughter Spores', 'Green Hell', 'Predatory Plantlife'] },
  RAD_ZONE: { name: 'Rad Zone', twists: ['Toxic Ash Storm', 'Rad Malaise', 'Esoteric Interference'] },
  FORGE_COMPLEX: { name: 'Forge Complex', twists: ['Thermic Corrosion', 'Plasmic Venting', 'Volatile Combustibles'] },
  HAB_SPRAWL: { name: 'Hab Sprawl', twists: ['Roiling Fumes', 'Firing Positions', 'Into the Depths'] },
  DELVESITE_FACILITY: { name: 'Delvesite Facility', twists: ['Sanctified Charges', 'Crumbling Bedrock', 'Tectonic Shock'] },
  DEAD_LANDS: { name: 'Dead Lands', twists: ['Bleak Expanse', 'Rocky Outcroppings', 'Shroud of Dust'] },
  TOMB_COMPLEX: { name: 'Tomb Complex', twists: ['Space-time Compression', 'Overpowering Energies', 'Quantum Shielding'] },
};

/** Twist-Index (0..2) aus einem W6-Ergebnis */
export function twistIndex(d6: number): number {
  return d6 <= 2 ? 0 : d6 <= 4 ? 1 : 2;
}

export type InfraType = 'STRONGHOLD' | 'STAGING_GROUNDS' | 'SUPPORT_FACILITY' | 'FORTIFICATION_LINE';

export const INFRA: Record<InfraType, { name: string; max: number; short: string }> = {
  STRONGHOLD: { name: 'Stronghold', max: 1, short: 'SH' },
  STAGING_GROUNDS: { name: 'Staging Grounds', max: 3, short: 'SG' },
  SUPPORT_FACILITY: { name: 'Support Facility', max: 3, short: 'SF' },
  FORTIFICATION_LINE: { name: 'Fortification Line', max: 5, short: 'FL' },
};

export const BUILDABLE_TYPES: InfraType[] = ['FORTIFICATION_LINE', 'SUPPORT_FACILITY', 'STAGING_GROUNDS'];

export type AttackType = 'SEIZE_POWER_BASE' | 'PURGE_AND_BURN' | 'ORBITAL_INVASION' | 'PLANETARY_BOMBARDMENT' | 'SUPPLY_BASE_RAID' | 'BOARDING_ACTION';

export const ATTACK_TYPES: Record<AttackType, { name: string; attackerFirst: boolean }> = {
  SEIZE_POWER_BASE: { name: 'Seize Power Base', attackerFirst: true },
  PURGE_AND_BURN: { name: 'Purge and Burn', attackerFirst: false },
  ORBITAL_INVASION: { name: 'Orbital Invasion', attackerFirst: false },
  PLANETARY_BOMBARDMENT: { name: 'Planetary Bombardment', attackerFirst: true },
  SUPPLY_BASE_RAID: { name: 'Supply Base Raid', attackerFirst: true },
  BOARDING_ACTION: { name: 'Boarding Action', attackerFirst: false },
};

export type OpType = 'BATTLE' | 'VOID_LEAP' | 'RAISE_EDIFICES' | 'LOGISTICAL_AUXILIA' | 'KILL_TEAMS';

export const OP_TYPES: Record<OpType, { name: string }> = {
  BATTLE: { name: 'Battle Operation' },
  VOID_LEAP: { name: 'Void Leap Operation' },
  RAISE_EDIFICES: { name: 'Raise Edifices Operation' },
  LOGISTICAL_AUXILIA: { name: 'Logistical Auxilia Operation' },
  KILL_TEAMS: { name: 'Deploy Kill Teams Operation' },
};

export type BattleSize = 'INCURSION' | 'STRIKE_FORCE' | 'ONSLAUGHT';
export const BATTLE_SIZES: Record<BattleSize, { name: string; points: number; reserves: number }> = {
  INCURSION: { name: 'Incursion', points: 1000, reserves: 500 },
  STRIKE_FORCE: { name: 'Strike Force', points: 2000, reserves: 1000 },
  ONSLAUGHT: { name: 'Onslaught', points: 3000, reserves: 1500 },
};

/** Empfohlene Flottenzahl je Allianz ([R] Recommended Force Allocation) */
export function recommendedFleets(players: number, alliances: number): number {
  if (alliances === 2) return 3;
  if (players <= 6) return 2;
  if (players <= 9) return 3;
  if (players <= 12) return 4;
  return 0; // 13+: 1 je Spieler
}

export type MedalId = 'LAUREL' | 'WREATH' | 'STAR' | 'DAGGER';
export const MEDALS: Record<MedalId, { name: string }> = {
  LAUREL: { name: 'Laurel of Victory' },
  WREATH: { name: 'Penumbral Wreath' },
  STAR: { name: 'Star of the Voidfarer' },
  DAGGER: { name: 'Sable Dagger' },
};

export type EventCode = 'FW_11' | 'FW_12' | 'FW_13' | 'FW_21' | 'FW_22' | 'FW_23' | 'FW_31' | 'FW_32' | 'FW_33' | 'PP_1' | 'PP_2' | 'PP_3' | 'DM_1' | 'DM_2' | 'DM_3';

export const EVENTS: Record<EventCode, { name: string; category: 'FORTUNES' | 'PERILS' | 'DESPERATE'; summary: string }> = {
  FW_11: { name: 'Lull in the Fighting', category: 'FORTUNES', summary: 'Kampfpause: Jede Allianz darf eine Infrastruktur bauen und ihre Flotten je einen Planeten weit ziehen.' },
  FW_12: { name: 'Void Piracy', category: 'FORTUNES', summary: 'Nächste Phase: kein Void Leap, Support Facilities wirkungslos.' },
  FW_13: { name: 'Tides of War', category: 'FORTUNES', summary: 'Jede Allianz darf ihren intakten Stronghold auf einen anderen Planeten verlegen.' },
  FW_21: { name: 'Sinister Omens', category: 'FORTUNES', summary: 'Nächste Phase: kein Logistical Auxilia, Theatres werden zufällig bestimmt.' },
  FW_22: { name: 'Archeotech Riches', category: 'FORTUNES', summary: 'Auf den drei schwächsten Welten liegen Schätze. Wer dort nächste Phase die meisten Schlachten gewinnt, erhält bis zu 3 Power Level.' },
  FW_23: { name: 'Starvation and Disease', category: 'FORTUNES', summary: 'Alle Allianzen verlieren auf jedem Planeten 1 Power Level.' },
  FW_31: { name: 'Xenobeast Migration', category: 'FORTUNES', summary: 'Alle Flotten müssen auf einen nicht verbundenen Planeten ausweichen.' },
  FW_32: { name: 'Machinations of Fate', category: 'FORTUNES', summary: 'Spieler dürfen die Allianz wechseln.' },
  FW_33: { name: 'Stellar Storms', category: 'FORTUNES', summary: 'Welten mit nur einer intakten Infrastructure Location können diese verlieren.' },
  PP_1: { name: 'Cult Uprisings', category: 'PERILS', summary: 'Aufstand auf einer Hochburg der dominierenden Allianz: Infrastruktur und Power Level in Gefahr.' },
  PP_2: { name: 'Coordinated Opposition', category: 'PERILS', summary: 'Nächste Phase: Gegner der dominierenden Allianz dürfen ihr Power Level ±1 behandeln.' },
  PP_3: { name: 'An Open Tome', category: 'PERILS', summary: 'Nächste Phase: Die dominierende Allianz muss ihre Operationen zuerst offenlegen.' },
  DM_1: { name: 'A Costly Bargain', category: 'DESPERATE', summary: 'Die zurückliegende Allianz tauscht auf einem Planeten ihr Power Level mit einer gegnerischen Allianz.' },
  DM_2: { name: 'Defiant Zeal', category: 'DESPERATE', summary: 'Nächste Phase: Jede Flotte der zurückliegenden Allianz darf eine zusätzliche Operation erklären.' },
  DM_3: { name: 'Smuggled Assets', category: 'DESPERATE', summary: 'Die zurückliegende Allianz darf Infrastruktur verlegen und eine zusätzliche bauen.' },
};

export const ALLIANCE_COLORS = ['#e5484d', '#3e9bff', '#46c46e', '#f5a524', '#b57cff', '#1fc7c7'];
