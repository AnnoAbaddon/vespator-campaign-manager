import type { MapDef } from './map';
import type { HouseRuleId } from './houseRules';
import type { AttackType, BattleSize, EventCode, InfraType, MedalId, OpType, TheatreId } from './data/vespator';

export type { AttackType, BattleSize, EventCode, InfraType, MedalId, OpType, TheatreId };

export const SCHEMA_VERSION = 2;

export interface Alliance {
  id: string;
  name: string;
  color: string;
  logo: string | null; // Upload-ID
  /** Wappen-Symbol (Icon-Schlüssel, siehe components/icons/registry) */
  emblem?: string | null;
  lore: string;
  /** Lore in weiteren Sprachen (NTH2 7.3) */
  loreTr?: import('./contentLang').TextTr;
  leaderPlayerId: string | null;
  strongholdDestroyed: boolean;
  order: number;
}

export interface Membership {
  allianceId: string;
  fromPhase: number; // gültig ab Phase (0 = Setup)
  toPhase: number | null; // gültig bis einschließlich
}

export interface Player {
  id: string;
  nickname: string;
  realName: string;
  email: string;
  discord: string;
  avatar: string | null;
  notes: string;
  faction: string;
  subfaction: string;
  /** Verlauf der gespielten Armeen (ab welcher Phase) */
  factionHistory?: { faction: string; subfaction: string; fromPhase: number }[];
  memberships: Membership[];
  active: boolean;
  isGameMaster: boolean;
  /** Kommandant (N3.4) */
  commander?: { name: string; title: string; portrait: string | null };
  honors?: Mark[];
  scars?: Mark[];
  /** vom Warmaster entfernte automatische Ehrungen – werden nicht erneut vergeben */
  suppressedAuto?: AutoHonor[];
  /** Sprache der Spielerseite und der E-Mails (N5.4); fehlend = Standard der Kampagne */
  locale?: 'de' | 'en' | 'fr' | 'es' | 'pl';
  /** Benachrichtigungen (N1.4): Kategorie → an/aus; fehlend = an */
  notify?: Partial<Record<NotifyCategory, boolean>>;
  /** Abwesenheit (A5): Phasen, in denen der Spieler nicht spielen kann */
  absences?: number[];
  /** Nemesis (C5): gewählter Rivale */
  nemesisId?: string | null;
  /** Geheime persönliche Ziele (C4) – nur Spieler und Warmaster sehen sie */
  goals?: import('./narrative').PersonalGoal[];
  /** Crusade-Anbindung (NTH2 3.2): leichte Order of Battle */
  crusade?: import('./crusade').CrusadeRoster;
  /** Bemal-Chronik (D5): Hobby-Fortschritt, öffentlich */
  hobby?: import('./hobby').HobbyEntry[];
}

export type NotifyCategory = 'PHASE' | 'RESULTS' | 'DEADLINES' | 'PERSONAL';

export type AutoHonor = 'STREAK' | 'WORLDBREAKER' | 'BULWARK' | 'VETERAN';

/** Ehrung oder Narbe eines Kommandanten (N3.4) */
export interface Mark {
  id: string;
  title: string;
  reason: string;
  phase: number | null;
  battleId: string | null;
  /** automatisch vergebene Ehrung */
  auto?: AutoHonor;
  /** Ehrung für ein geheimes persönliches Ziel (C4): Anlass bleibt bis Kampagnenende verdeckt */
  goal?: boolean;
}

/** Ergebnis-Entwurf eines Spielers (N1.2): gilt erst nach Bestätigung durch die Gegenseite */
export interface ResultDraft {
  byPlayerId: string;
  at: string;
  update: import('./phase').BattleUpdate;
  decisions: Record<string, OutcomeDecision>;
  status: 'PENDING' | 'DISPUTED';
  disputeReason?: string;
  disputedBy?: string;
}

/** Terminvorschlag (N1.5) */
export interface TimeProposal {
  id: string;
  byPlayerId: string | null;
  side: 'ATTACKER' | 'DEFENDER' | 'GM';
  times: string[];
  at: string;
}

/** Allianz-Notiz (N1.3), nur für die Allianz sichtbar */
export interface AllianceNote {
  id: string;
  allianceId: string;
  /** null = Spielleiter */
  playerId: string | null;
  text: string;
  at: string;
}

export interface Fleet {
  id: string;
  allianceId: string;
  name: string;
  planetId: string | null;
  /** phaseNumber -> playerId */
  commanders: Record<string, string>;
  /** Reserveflotte (N2.5): ohne Position, keine Befehle, bis sie aktiviert wird */
  reserve?: boolean;
  activated?: { phase: number; planetId: string } | null;
}

/** Einzelspiel einer Schlacht (N2.3) */
export interface BattleGame {
  id: string;
  attackers: Participant[];
  defenders: Participant[];
  playedAt: string | null;
  size: string | null;
  missionName: string;
  vp: { attacker: number; defender: number } | null;
  battleReady: { attacker: boolean; defender: boolean };
  report: string;
  /** Fotos dieses Einzelspiels (Upload-IDs, N2.3) */
  photos?: string[];
}

/** Eintrag der Missionsliste einer Kampagne (N2.2) */
export interface MissionDef {
  id: string;
  name: string;
  /** Herkunft, z. B. „Chapter Approved 2025–26“ oder „eigene“ */
  source: string;
  note: string;
  /** zulässige Angriffsarten; leer = alle */
  attackTypes: AttackType[];
}

/** Frei definierbare Spielgröße (N2.6) */
export interface BattleSizeDef {
  id: string;
  name: string;
  points: number;
  /** Spieldauer, Freitext (z. B. „2–3 h“) */
  duration: string;
  /** Strategic-Reserves-Limit (Purge and Burn) */
  reserves: number;
}

export interface Slot {
  destroyed: boolean;
  infra: { type: InfraType; allianceId: string } | null;
}

export interface PlanetState {
  id: string;
  power: Record<string, number>;
  destroyed: boolean;
  slots: Slot[];
  lore: string;
  notes: string;
  /** Lore in weiteren Sprachen (NTH2 7.3) */
  loreTr?: import('./contentLang').TextTr;
  /** Eigenes Planetenporträt und Landschaftsbild (Upload-IDs, NTH2 4.2); fehlend = prozedurale bzw. Vespator-Grafik */
  portrait?: string | null;
  landscape?: string | null;
}

export type OpStatus = 'PLANNED' | 'RESOLVED' | 'CANCELLED' | 'VOID';

export interface Operation {
  id: string;
  fleetId: string;
  allianceId: string;
  slot: 1 | 2;
  type: OpType | 'NONE';
  attackType?: AttackType;
  targetPlanetId?: string;
  targetAllianceId?: string;
  targetFleetId?: string;
  destinationPlanetId?: string;
  infraType?: InfraType;
  killTeamPlanetId?: string;
  /** Deploy Kill Teams (N4.1): würfeln (Regel) oder als Kill-Team-Spiel austragen */
  killTeamMode?: 'DICE' | 'GAME';
  /** Planet der Flotte zum Zeitpunkt der Erklärung */
  originPlanetId: string | null;
  isDefault: boolean;
  revealed: boolean;
  status: OpStatus;
  note?: string;
  /** nur in der öffentlichen Projektion: verdeckt */
  hidden?: boolean;
  /** Standardoperation wegen Abwesenheit des Kommandanten (A5) */
  absence?: boolean;
}

export type PhaseStep = 'OPS' | 'REVEAL' | 'EDIFICES' | 'BATTLES' | 'PROCESS' | 'ARRIVAL' | 'RESISTANCE' | 'RESULTS' | 'MOVE' | 'BUILD';

export const PHASE_STEPS: PhaseStep[] = ['OPS', 'REVEAL', 'EDIFICES', 'BATTLES', 'PROCESS', 'ARRIVAL', 'RESISTANCE', 'RESULTS', 'MOVE', 'BUILD'];

export type SetupStep = 'W0' | 'W1' | 'W2' | 'W3' | 'W4' | 'W5';
export const SETUP_STEPS: SetupStep[] = ['W0', 'W1', 'W2', 'W3', 'W4', 'W5'];

export type Stage = { kind: 'SETUP'; step: SetupStep } | { kind: 'PHASE'; phase: number; step: PhaseStep } | { kind: 'TIEBREAK' } | { kind: 'ENDED' };

export interface BuildRecord {
  allianceId: string;
  type: InfraType;
  planetId: string;
}

export interface Phase {
  number: number;
  startDate: string | null;
  opsDeadline: string | null;
  battlesDeadline: string | null;
  endDate: string | null;
  operations: Operation[];
  /** fleetId -> Pfad (1 oder 2 Planeten bei Star of the Voidfarer); leer = bleibt */
  moves: Record<string, string[]>;
  /** Erledigte Schritt-Aktionen: revealed, edifices, arrival, resistance, scored, eventsGenerated, movesApplied, buildStarted */
  flags: Record<string, boolean>;
  /** Manuelle Verarbeitungsreihenfolge (Battle-IDs) */
  processOrder: string[] | null;
  /** Flotten, die in Move Fleets nicht ziehen dürfen (Boarding Action) */
  noMoveFleets: string[];
  buildOrder: string[];
  builds: Record<string, BuildRecord | 'SKIP'>;
  stepStatus: Partial<Record<PhaseStep, 'DONE' | 'SKIPPED'>>;
  notes: string;
  openTomeRevealed: boolean;
  archeotechResolved: boolean;
  /** Ergebnis der Archeotech-Auswertung je Planet (Phasenbericht): Sieger oder niemand, erhöhte Planeten */
  archeotechResults?: { planetId: string; allianceId: string | null; increments: string[] }[];
  /** Phasen-Puls (B4): Stimmungsabfrage über die Spielerlinks, nur für den Warmaster */
  pulse?: import('./lifecycle').PulseEntry[];
  /** „Bild der Phase“ (NTH2 4.3/D1), vom Warmaster gewählt */
  photo?: import('./gallery').PhasePhoto | null;
  /** Abstimmung der Spieler über das Bild der Phase (je Spieler eine Stimme) */
  photoVotes?: import('./gallery').PhotoVote[];
}

export type Victor = 'ATTACKER' | 'DEFENDER' | 'DRAW';

export type BattleStatus = 'SCHEDULED' | 'PLAYED' | 'UNPLAYED_RESOLVED' | 'VOID' | 'PROCESSED';

export interface Participant {
  playerId: string;
  faction: string;
}

export interface Battle {
  id: string;
  phaseNumber: number;
  /** KILL_TEAM (N4.1) und INTERCEPT (Void-Leap-Abfangen, N4.2) sind Nebengefechte ohne Campaign Outcome */
  kind: 'CAMPAIGN' | 'FINAL_TIEBREAK' | 'KILL_TEAM' | 'INTERCEPT';
  operationIds: string[];
  attackType: AttackType | null;
  planetId: string | null;
  attackerAllianceId: string;
  defenderAllianceId: string;
  attackers: Participant[];
  defenders: Participant[];
  status: BattleStatus;
  playedAt: string | null;
  createdSeq: number;
  /** ID einer Spielgröße (Standard oder eigene, siehe battleSizes) */
  size: string | null;
  /** VESPATOR = Mission der Angriffsart; LIST = Missionsliste der Kampagne (N2.2); SPACE = Raumkampf (N4.2) */
  mission: { source: 'VESPATOR' | 'EXTERNAL' | 'LIST' | 'SPACE'; externalName: string; missionId?: string };
  /** Mehrere Einzelspiele (N2.3); Gesamtsieger nach Mehrheit, dann VP-Summe */
  games?: BattleGame[];
  theatre: TheatreId | null;
  theatreChosenBy: 'ATTACKER' | 'DEFENDER_AUXILIA' | 'RANDOM' | null;
  twist: { d6: number; name: string } | null;
  vp: { attacker: number; defender: number } | null;
  battleReady: { attacker: boolean; defender: boolean };
  victor: Victor | null;
  victorOverride: boolean;
  /** operationId -> Entscheidungen */
  decisions: Record<string, OutcomeDecision>;
  applied: string[];
  report: string;
  photos: string[];
  notes: string;
  processedOrder: number | null;
  unplayedResolution: 'ATTACKER_WINS' | 'DEFENDER_WINS' | 'VOID' | 'POSTPONED' | null;
  postponedFrom: string | null;
  draft?: ResultDraft | null;
  proposals?: TimeProposal[];
  /** bestätigter Termin (N1.5) */
  scheduledAt?: string | null;
  /** Gastspieler ohne Konto (B3); zählen nicht für Spielerstatistik, Spiellast und Paarungen */
  guests?: BattleGuest[];
  /** Hausregel „Auswürfeln statt verfallen“ (B1): W6-Duell einer ungespielten Schlacht */
  unplayedRoll?: UnplayedRoll | null;
  /** Spieltisch bzw. Raum des Clubs (NTH2 2.5); Name als Kopie, falls der Tisch später entfernt wird */
  table?: { id: string; name: string } | null;
}

/** ±2 nur mit Hausregel F-15 (Quellen stapeln) */
export type PowerShift = -2 | -1 | 0 | 1 | 2;

export type OutcomeDecision =
  | { type: 'SEIZE_A'; captureSlot: number | null; fallbackType: InfraType | null; bonusType: InfraType | null; shift: PowerShift }
  | { type: 'SEIZE_D'; build: { type: InfraType; planetId: string } | null; shift: PowerShift }
  | { type: 'PURGE_A'; shift: PowerShift }
  | { type: 'PURGE_D'; redistributions: string[]; bonusPlanetId: string | null; shift: PowerShift }
  | { type: 'ORBITAL_A'; shift: PowerShift }
  | { type: 'ORBITAL_D'; otherPlanetId: string | null; direction: 'OUT' | 'IN'; slots: number[]; shift: PowerShift }
  | { type: 'BOMBARD_A'; slot: number | null; roll: number | null; shift: PowerShift }
  | { type: 'BOMBARD_D'; planetId: string | null; strikes: { slot: number; roll: number | null }[]; shift: PowerShift }
  | { type: 'RAID_A'; strikes: { planetId: string; roll: number | null }[]; shift: PowerShift }
  | { type: 'RAID_D'; reducePlanetId: string | null; shift: PowerShift }
  | { type: 'BOARDING_A'; targetFleetId: string | null; path: string[]; shift: PowerShift }
  | { type: 'BOARDING_D'; ownFleetId: string | null; toPlanetId: string | null; shift: PowerShift }
  | { type: 'DRAW' };

/** CUSTOM: eigenes Ereignis aus dem Baukasten (D2) */
export type EventCategory = 'FORTUNES' | 'PERILS' | 'DESPERATE' | 'CUSTOM';

/** Code eines Event-Eintrags: Regelbuch-Event oder eigenes Ereignis (D2) */
export type EventRecordCode = EventCode | 'CUSTOM';

export interface EventRecord {
  id: string;
  phaseNumber: number;
  category: EventCategory;
  code: EventRecordCode;
  /** eigenes Ereignis (D2): Stand der Definition beim Auslösen */
  custom?: import('./customEvents').CustomEventSnapshot;
  /** per Override erzwungen (NTH2 2.2, nur Sandbox) */
  forced?: boolean;
  allianceId: string | null; // dominierend / zurückliegend
  status: 'PENDING' | 'APPLIED';
  data: Record<string, unknown>;
  applied: string[];
  /** verdeckte Spielereingaben (EVENT_INPUT), je Spieler eine; wirksam erst mit „Event anwenden“ */
  inputs?: EventInput[];
}

/** Spielereingabe zu einem Event (Daten im Format von EVENT_APPLY) */
export interface EventInput {
  playerId: string;
  allianceId: string;
  at: string;
  data: import('./events').EventData;
}

export type ModifierKind = 'NO_VOID_LEAP' | 'SUPPORT_FACILITIES_INACTIVE' | 'NO_LOGISTICAL_AUXILIA' | 'RANDOM_THEATRE' | 'ARCHEOTECH' | 'COORDINATED_OPPOSITION' | 'OPEN_TOME' | 'DEFIANT_ZEAL' | 'STAR_OF_VOIDFARER';

export interface Modifier {
  id: string;
  source: string;
  kind: ModifierKind;
  phaseNumber: number;
  allianceId: string | null;
  planetIds?: string[];
}

export type DiceKind = 'D3' | 'D6' | 'D33';

export interface DiceRoll {
  id: string;
  at: string;
  context: string;
  kind: DiceKind;
  modifier: number;
  results: number[];
  final: number;
  mode: 'DIGITAL' | 'MANUAL';
  public: boolean;
  /** Phase, in der gewürfelt wurde (null = Setup/Ende) */
  phaseNumber?: number | null;
}

export interface Dispatch {
  id: string;
  at: string;
  title: string;
  body: string;
  pinned: boolean;
  public: boolean;
  /** Fassungen in weiteren Sprachen (NTH2 7.3) */
  tr?: import('./contentLang').DispatchTr;
}

export interface MedalAward {
  medal: MedalId;
  allianceId: string;
  playerIds: string[];
  value: number | null;
  note: string;
}

export interface InheritedMedal {
  medal: MedalId;
  fromCampaignId: string;
  /** Spieler-IDs (in dieser Kampagne), die die Medaille tragen */
  holderPlayerIds: string[];
  assignedAllianceId: string | null | undefined; // undefined = offen, null = verworfen
}

export interface RuleToggles {
  events: { fortunesOfWar: boolean; perilsOfPower: boolean; desperateMeasures: boolean; disabled: EventCode[] };
  theatreTwists: boolean;
  medals: boolean;
  operations: {
    voidLeap: boolean;
    raiseEdifices: boolean;
    logisticalAuxilia: boolean;
    killTeams: boolean;
    attackTypes: Record<AttackType, boolean>;
  };
  setupInfraCount: number;
  /** Hausregel Void-Leap-Abfangen (N4.2) */
  voidLeapIntercept?: boolean;
  /** Spiellast (N1.6): Warnungen, nie blockierend */
  load?: { maxPerPlayer: number | null; minOnePerAlliance: boolean };
  /** Anreize für die letzte Phase (N2.4), je einzeln schaltbar */
  lastPhase?: { mandatoryBattle: boolean; doubleGains: boolean; noVoidLeap: boolean };
  /** Alternativen zu FAQ-Entscheidungen (N2.1); fehlend = FAQ-Standard */
  houseRules?: Partial<Record<HouseRuleId, boolean>>;
  /** Hausregel Wiederholungssperre (A1): dieselbe Mission nicht zweimal hintereinander; fehlend = nur Hinweis */
  missionRepeatLock?: boolean;
  /** Hausregel harte Obergrenze (A4) je Spieler und Phase; Überschreiten nur per Override mit Begründung */
  loadCap?: { maxDefences: number | null; maxGames: number | null };
  /** Hausregel „Auswürfeln statt verfallen“ (B1) */
  unplayedRollOff?: { enabled: boolean; plModifier: boolean };
  /** Hausregel „Freie Gefechte“ (B5) */
  freeSkirmishes?: { enabled: boolean; reward: 'STATS' | 'POINTS'; pointsPerWin: number; maxBonus: number };
  /** Hausregel Nebel über dem Punktestand (C1): Leseansicht und Spieler sehen nur Rangfolge und Tendenz */
  fog?: boolean;
  /** Hausregel alternative Endwertung (C2); fehlend = Buch (Kampagnenpunkte) */
  endScoring?: import('./finale').EndScoring;
  /** Finale „Großschlacht“ (C6) in der letzten Phase */
  grandFinale?: import('./finale').GrandFinaleRules;
  /** Spieler-Lebenszyklus und Erzählung (R2), je einzeln schaltbar */
  narrative?: { pulse?: boolean; secretGoals?: boolean; nemesis?: boolean; lateJoinBonus?: boolean };
  /** Crusade-Anbindung (NTH2 3.2): XP aus Kampagnenergebnissen; fehlend = aus */
  crusade?: import('./crusade').CrusadeRules;
}

export interface SetupAllianceChoice {
  strongholdPlanetId: string | null;
  pl3: string[];
  pl2: string[];
}

export interface SetupInfraChoice {
  id: string;
  allianceId: string;
  type: InfraType;
  planetId: string | null;
  built: boolean;
  /** Muss nach Konflikt neu gewählt werden */
  bounced: boolean;
}

export interface SetupState {
  fleetsPerAlliance: Record<string, number>;
  strongholds: Record<string, SetupAllianceChoice>;
  strongholdsRevealed: boolean;
  wreathApplied: boolean;
  infra: SetupInfraChoice[];
  infraRevealed: boolean;
  fleetStarts: Record<string, string>;
  fleetsRevealed: boolean;
  daggerSwaps: number;
  daggerDone: boolean;
  laurel: { allianceId: string; planetId: string | null } | null;
  messages: string[];
}

export interface CampaignState {
  schemaVersion: number;
  /** Karte der Kampagne (N5.5), ab Schema 2 */
  map: MapDef;
  /** Schlachten, in denen die Siegerseite etwas zerstört hat (Ehrung Weltenbrecher, „battleId:SIDE“) */
  destructions?: string[];
  /** Allianz-Notizen (N1.3) */
  allianceNotes?: AllianceNote[];
  meta: {
    name: string;
    intro: string;
    /** Intro in weiteren Sprachen (NTH2 7.3) */
    introTr?: import('./contentLang').TextTr;
    phaseCount: number;
    allianceCount: 2 | 3;
    createdAt: string;
    timezone: string;
    /** Standardsprache der Leseansicht und der Spielerseiten (N5.4) */
    locale?: 'de' | 'en' | 'fr' | 'es' | 'pl';
    /** Edition der Kampagne (N2.6); fehlend = 11 */
    edition?: '10' | '11';
    /** eigene Spielgrößen; fehlend = Incursion/Strike Force/Onslaught */
    battleSizes?: BattleSizeDef[];
    /** eigene Missionen (N2.2); die Vespator-Missionen und Vorlagen sind fest */
    missions?: MissionDef[];
    /** Regel-Anmerkungen des Warmasters je Angriffsart (Markdown, im Briefing) */
    attackNotes?: Partial<Record<AttackType, string>>;
    /** Missions-Pool je Angriffsart (A1): 1–3 Missions-IDs aus allMissions; fehlend = Vespator-Mission */
    missionPool?: Partial<Record<AttackType, string[]>>;
    /** Gelände-Layouts je Theatre/Mission (A8) */
    terrainLayouts?: TerrainLayout[];
    /** Szenario-Sandbox (NTH2 2.1): Kopie einer Kampagne; fehlend = echte Kampagne */
    sandbox?: { of: string; baseRev: number; originalName: string };
    /** Phasenrhythmus aus einer Kampagnen-Vorlage (NTH2 2.6), Abstände ab Phasenbeginn in ms */
    rhythm?: { ops: number; battles: number; end: number };
    /** Regelmodul der Kampagne (NTH2 3.3); fehlend = 'vespator' (migrateState ergänzt es) */
    module?: string;
  };
  /** Eigene Ereignisse (D2): Baukasten-Definitionen */
  customEvents?: import('./customEvents').CustomEventDef[];
  /** Kampagnenpunkte-Boni und -Mali aus eigenen Ereignissen (D2) */
  pointsBonus?: { id: string; allianceId: string; points: number; source: string; phaseNumber: number }[];
  toggles: RuleToggles;
  alliances: Alliance[];
  players: Player[];
  fleets: Fleet[];
  planets: PlanetState[];
  phases: Phase[];
  stage: Stage;
  battles: Battle[];
  battleSeq: number;
  events: EventRecord[];
  stellarStormsUsed: boolean;
  modifiers: Modifier[];
  dice: DiceRoll[];
  dispatches: Dispatch[];
  medals: MedalAward[];
  inheritedMedals: InheritedMedal[];
  setup: SetupState;
  pointsHistory: { phaseNumber: number; points: Record<string, number>; powerSum: Record<string, number>; planets?: Record<string, Record<string, number>> }[];
  result: {
    winnerAllianceId: string | null;
    tiebreak: 'NONE' | 'STRONGHOLD' | 'FINAL_BATTLE';
    tied: string[];
    /** Endwertung (C2/C6): Grundwert je Allianz, Boni und Summe */
    scores?: import('./finale').FinalScores;
  } | null;
  /** Warmaster-Sonderziele je Phase (C3), öffentlich (außer verdeckte bis zur Auswertung) */
  objectives?: import('./narrative').PhaseObjective[];
  /** Liste der persönlichen Ziele (C4), vom Warmaster gepflegt */
  goalList?: import('./narrative').GoalDef[];
  /** Punkte-Boni nur für die Endwertung (C3), zählen nicht zu den Kampagnenpunkten */
  endBonus?: { id: string; allianceId: string; points: number; reason: string; phaseNumber: number | null }[];
  /** Finale „Großschlacht“ (C6) */
  grandBattle?: import('./finale').GrandBattle | null;
  /** nur in der öffentlichen Projektion: Nebel über dem Punktestand (C1) */
  fog?: import('./fog').FogView;
  /** Kampagnenweite Markierung für die öffentliche Anzeige vorläufiger Punkte */
  publishedAfterResistance: boolean;
  /** Freie Gefechte ohne Operation (B5) */
  skirmishes?: Skirmish[];
  /** Planeten-Merkmale (A9): Crusade-Schlagworte je Planet, vom Warmaster gepflegt */
  planetTraits?: Record<string, import('./crusade').PlanetTrait[]>;
  /** Eigene Textbausteine des Dekret-Baukastens (NTH2 4.1) */
  decreeBlocks?: import('./decree').DecreeBlock[];
  /** Galerie (NTH2 4.3): Spieler stimmen über das Bild der Phase ab */
  gallery?: { vote: boolean };
  /** Modul-eigener Zustand (NTH2 3.3), je Modul-ID; Vespator nutzt ihn nicht */
  moduleState?: Record<string, unknown>;
}

// ─── Nice-to-have Stufe 2, Block R1 ────────────────────────────────────────

/** Gastspieler einer Schlacht (B3): Name und Armee, ohne Spielerlink */
export interface BattleGuest {
  side: 'ATTACKER' | 'DEFENDER';
  name: string;
  faction: string;
}

/** W6-Duell einer ungespielten Schlacht (B1); Modifikator +1 für die Seite mit höherem PL (optional) */
export interface UnplayedRoll {
  attacker: number;
  defender: number;
  modAttacker: number;
  modDefender: number;
}

/** Gelände-Layout (A8): gilt für ein Theatre, eine Mission oder beides */
export interface TerrainLayout {
  id: string;
  theatre: TheatreId | null;
  missionId: string | null;
  title: string;
  /** Upload-ID eines Layout-Bilds */
  image: string | null;
  /** externer Link (http/https), z. B. zu einer Skizze */
  link: string;
  note: string;
}

/** Freies Gefecht zwischen zwei Allianzen ohne Operation (B5) */
export interface Skirmish {
  id: string;
  phaseNumber: number;
  playedAt: string | null;
  a: { allianceId: string; players: Participant[] };
  b: { allianceId: string; players: Participant[] };
  vp: { a: number; b: number } | null;
  winner: 'A' | 'B' | 'DRAW';
  mission: string;
  note: string;
  /** meldender Spieler (null = Spielleiter) */
  byPlayerId: string | null;
  status: 'PENDING' | 'CONFIRMED';
  at: string;
}
