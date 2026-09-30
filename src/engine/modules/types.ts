// NTH2 3.3: Regelmodul-Schnittstelle. Alles, was an ein bestimmtes Kampagnensystem gebunden ist
// (Stammdaten, Setup- und Phasenablauf, Operationen, Outcomes, Ereignisse, Wertung, Kampagnenende),
// steckt in einem `CampaignModule`. Der generische Kern (Zustand, Commands, Revisionen, Würfel,
// Spieler/Allianzen, Schlachten, Entwürfe, Karten-Registry, Hausregel-Rahmen, Projektionen) ruft
// das Modul an festen Erweiterungspunkten auf. Siehe docs/MODULE.md.

import type { Command } from '../commands';
import type { Ctx } from '../ctx';
import type { HouseRuleDef, HouseRuleId } from '../houseRules';
import type { MapDef } from '../map';
import type { OpInput } from '../phase';
import type { CampaignState, PhaseStep, RuleToggles, SetupStep } from '../types';

/** Eintrag einer Stammdaten-Tabelle (Angriffsart, Operationsart, Medaille, Ereignis …) */
export interface ModuleEntry {
  /** Anzeigename (Eigenname des Systems oder deutscher Text) */
  name: string;
  /** frei nutzbare Zusatzangaben des Moduls */
  [extra: string]: unknown;
}

/** Stammdaten eines Moduls. Tabellen sind nach ID geschlüsselt; fehlende Tabellen = gibt es im System nicht. */
export interface ModuleData {
  attackTypes: Record<string, ModuleEntry>;
  opTypes: Record<string, ModuleEntry>;
  theatres?: Record<string, ModuleEntry>;
  infra?: Record<string, ModuleEntry>;
  medals?: Record<string, ModuleEntry>;
  events?: Record<string, ModuleEntry>;
}

/** Schritt im Setup- oder Phasenablauf. Die IDs sind derzeit auf die Vespator-Schritte typisiert (Stage-Union). */
export interface ModuleStep<Id extends string> {
  id: Id;
  /** deutsche Bezeichnung (Übersetzung über die Wörterbücher bzw. EN_PATTERNS in src/i18n) */
  label: string;
}

/**
 * Eingabe einer Operation (OP_SET). Vespator nutzt die engere `OpInput`; andere Module dürfen eigene
 * Operations- und Angriffsarten-IDs verwenden und prüfen sie selbst.
 */
export type ModuleOpInput = Omit<OpInput, 'type' | 'attackType'> & { type: string; attackType?: string };

/** Termine beim Kampagnenstart (SETUP_START) */
export interface StartDates {
  startDate?: string | null;
  opsDeadline?: string | null;
  battlesDeadline?: string | null;
  endDate?: string | null;
}

export interface CampaignModule {
  /** stabile ID, wird in `state.meta.module` gespeichert */
  id: string;
  /** Anzeigename */
  name: string;
  /** Version des Moduls (SemVer); ändert sich bei Regeländerungen */
  version: string;
  /** Kurzbeschreibung in eigenen Worten (keine Regeltexte aus Büchern) */
  description: string;

  // ─── Stammdaten ──────────────────────────────────────────────────────────
  data: ModuleData;
  /** Standardkarte neuer Kampagnen und älterer Stände ohne Karte */
  defaultMap(): MapDef;
  /** Setup-Schritte in Reihenfolge; der erste ist der Startschritt neuer Kampagnen */
  setupSteps: readonly ModuleStep<SetupStep>[];
  /** Phasenschritte in Reihenfolge */
  phaseSteps: readonly ModuleStep<PhaseStep>[];

  // ─── Regel-Schalter und Hausregeln ──────────────────────────────────────
  /** Regel-Schalter einer neuen Kampagne */
  defaultToggles(allianceCount: 2 | 3): RuleToggles;
  /** Hausregeln, die in diesem System angeboten werden (leer = keine) */
  houseRules: readonly HouseRuleDef[];
  /** Vorbelegung der Hausregeln (fehlend = Standard) */
  defaultHouseRules?: Partial<Record<HouseRuleId, boolean>>;

  // ─── Zustand ────────────────────────────────────────────────────────────
  /** Ergänzt einen frisch erzeugten Zustand (optional) */
  initState?(state: CampaignState): void;
  /** Modul-eigene Migration älterer Stände (läuft in migrateState nach den Kern-Migrationen) */
  migrate?(state: CampaignState): void;

  // ─── Erweiterungspunkte des Kerns ───────────────────────────────────────
  /** SETUP_START: Setup abschließen, Phase 1 anlegen */
  startCampaign(ctx: Ctx, dates: StartDates): void;
  /** OP_SET / OP_CLEAR: Operationen prüfen und verdeckt speichern */
  operations: {
    validate(ctx: Ctx, fleetId: string, slot: 1 | 2, input: ModuleOpInput): void;
    set(ctx: Ctx, fleetId: string, slot: 1 | 2, input: ModuleOpInput): void;
    clear(ctx: Ctx, fleetId: string, slot: 1 | 2): void;
  };
  /** ADVANCE: nächster Phasenschritt (inkl. Übergang in die nächste Phase) */
  advance(ctx: Ctx): void;
  /** BATTLE_PROCESS / BATTLE_PROCESS_ALL: Schlachtergebnis → Campaign Outcome (optional) */
  battles?: {
    process(ctx: Ctx, battleId: string): void;
    processAll(ctx: Ctx): unknown;
  };
  /** SCORE: Kampagnenpunkte der Phase festhalten (nach den generischen Sonderzielen) */
  scorePhase(ctx: Ctx): void;
  /** EVENTS_GENERATE: Ereignistabellen auswerten (optional; fehlend = System ohne Ereignisse) */
  generateEvents?(ctx: Ctx): void;
  /** CAMPAIGN_END: Endwertung, Sieger, ggf. Stechen */
  endCampaign(ctx: Ctx): void;
  /**
   * Regelspezifische Commands, die der Kern nicht kennt (z. B. die Vespator-Setup-Schritte).
   * Liefert true, wenn der Command behandelt wurde; sonst lehnt der Kern ihn ab.
   */
  dispatch?(ctx: Ctx, cmd: Command): boolean;
  /** MODULE_ACTION: eigene Aktionen eines Moduls ohne Änderung der Command-Union */
  action?(ctx: Ctx, action: string, data: Record<string, unknown>): void;

  // ─── Projektionen ───────────────────────────────────────────────────────
  /**
   * Öffentliche Projektion (Allowlist, Review S3): baut die modulspezifischen Teile neu auf – das öffentliche Setup
   * und den öffentlichen Teil des Modulzustands. Fehlt ein Teil, gilt: Setup vollständig, Modulzustand gar nicht.
   * `full` ist der ungefilterte Stand und darf nicht verändert werden.
   */
  publicView?(full: CampaignState, opts: { reveal?: boolean }): { setup?: CampaignState['setup']; moduleState?: CampaignState['moduleState'] };
}
