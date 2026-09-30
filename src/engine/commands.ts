import type { AttackType, BattleSizeDef, MissionDef } from './types';
import { house } from './houseRules';
import * as pa from './playerActions';
import * as cmdr from './commanders';
import type { MapDef } from './map';
import { BUILDABLE_TYPES, type InfraType, type MedalId } from './data/vespator';
import { DiceNeeded, RuleError, fail, log, makeCtx, overridesWarnings, warn, type Ctx, type DiceSource } from './ctx';
import { alliance, allianceName, minPL, planet, planetName } from './board';
import * as setup from './setup';
import * as phase from './phase';
import type * as events from './events';
import * as custom from './customEvents';
import { carryCommanders, recordFactionChange, setMembership, stagePhase } from './players';
import { registerMap, withMap } from './map';
import type { CampaignState, ModifierKind, OutcomeDecision, Player, RuleToggles, Stage } from './types';
import * as r1 from './r1Commands';
import * as r2 from './r2Commands';
import * as p2 from './p2Commands';
import { cleanDispatchTr, cleanTextTr, originalLang, type DispatchTr, type TextTr } from './contentLang';
import * as p1 from './p1';
import * as p3 from './crusade';
import { closeObjectives, evaluateObjectives } from './narrative';
import { moduleOf } from './modules/registry';
import type { CampaignModule, ModuleOpInput } from './modules/types';
import { parseCommand } from './commandSchema';

export type Command =
  // Stammdaten
  | {
      type: 'META_UPDATE';
      name?: string;
      intro?: string;
      timezone?: string;
      edition?: '10' | '11';
      battleSizes?: BattleSizeDef[];
      attackNotes?: Partial<Record<AttackType, string>>;
      missions?: MissionDef[];
      /** Intro in weiteren Sprachen (NTH2 7.3) */
      introTr?: TextTr;
      locale?: 'de' | 'en' | 'fr' | 'es' | 'pl';
    }
  | { type: 'TOGGLES_UPDATE'; toggles: RuleToggles }
  | { type: 'ALLIANCE_UPSERT'; id?: string; name: string; color: string; logo?: string | null; emblem?: string | null; lore?: string; loreTr?: TextTr; leaderPlayerId?: string | null }
  | { type: 'ALLIANCE_DELETE'; id: string }
  | { type: 'PLAYER_UPSERT'; id?: string; data: Partial<Omit<Player, 'id' | 'memberships'>>; allianceId?: string | null }
  | { type: 'PLAYER_DELETE'; id: string }
  | { type: 'FLEET_SET_COUNT'; allianceId: string; count: number }
  | { type: 'FLEET_UPDATE'; id: string; name?: string }
  | { type: 'FLEET_PLACE'; fleetId: string; planetId: string }
  | { type: 'FLEET_RESERVE_SET'; allianceId: string; count: number }
  | { type: 'FLEET_ACTIVATE'; fleetId: string; planetId: string }
  | { type: 'FLEET_COMMANDER'; fleetId: string; phase: number; playerId: string | null }
  | { type: 'PLANET_TEXT'; planetId: string; lore?: string; notes?: string; loreTr?: TextTr }
  | { type: 'DISPATCH_UPSERT'; id?: string; title: string; body: string; pinned: boolean; public: boolean; tr?: DispatchTr }
  | { type: 'DISPATCH_DELETE'; id: string }
  | { type: 'PHASE_UPDATE'; phase: number; startDate?: string | null; opsDeadline?: string | null; battlesDeadline?: string | null; endDate?: string | null; notes?: string }
  // Setup
  | { type: 'MAP_SET'; map: MapDef }
  | { type: 'SETUP_W0_DONE' }
  | { type: 'SETUP_MEDAL_SUGGEST' }
  | { type: 'SETUP_MEDAL_ASSIGN'; medal: MedalId; allianceId: string | null }
  | { type: 'SETUP_W1_DONE' }
  | { type: 'SETUP_LAUREL_PLANET'; planetId: string }
  | { type: 'SETUP_STRONGHOLDS'; allianceId: string; strongholdPlanetId: string | null; pl3: string[]; pl2: string[] }
  | { type: 'SETUP_REVEAL_STRONGHOLDS' }
  | { type: 'SETUP_WREATH'; planetIds: string[] }
  | { type: 'SETUP_W2_DONE' }
  | { type: 'SETUP_INFRA'; allianceId: string; items: { type: InfraType; planetId: string | null }[] }
  | { type: 'SETUP_INFRA_RECHOOSE'; itemId: string; planetId: string }
  | { type: 'SETUP_REVEAL_INFRA' }
  | { type: 'SETUP_W3_DONE' }
  | { type: 'SETUP_FLEET_STARTS'; starts: Record<string, string> }
  | { type: 'SETUP_REVEAL_FLEETS' }
  | { type: 'SETUP_DAGGER_SWAP'; a: string; b: string }
  | { type: 'SETUP_W4_DONE' }
  | { type: 'SETUP_START'; startDate?: string | null; opsDeadline?: string | null; battlesDeadline?: string | null; endDate?: string | null }
  // Phase
  | { type: 'OP_SET'; fleetId: string; slot: 1 | 2; op: phase.OpInput | ModuleOpInput }
  | { type: 'OP_CLEAR'; fleetId: string; slot: 1 | 2 }
  | { type: 'OPEN_TOME_REVEAL' }
  | { type: 'ADVANCE' }
  | { type: 'REVEAL_OPS' }
  | { type: 'RESOLVE_EDIFICES' }
  | { type: 'BATTLE_UPDATE'; battleId: string; update: phase.BattleUpdate }
  | { type: 'BATTLE_ROLL'; battleId: string; what: 'THEATRE' | 'TWIST' }
  | { type: 'BATTLE_DECISION'; battleId: string; opId: string; decision: OutcomeDecision }
  | { type: 'BATTLE_BUNDLE'; battleIds: string[] }
  | { type: 'RESULT_DRAFT_SUBMIT'; battleId: string; playerId: string; update: phase.BattleUpdate; decisions?: Record<string, OutcomeDecision> }
  /** draftAt: Stand der Meldung, die bestätigt bzw. angefochten wird (S4, für Spieler Pflicht) */
  | { type: 'RESULT_DRAFT_CONFIRM'; battleId: string; playerId: string | null; draftAt?: string }
  | { type: 'RESULT_DRAFT_DISPUTE'; battleId: string; playerId: string; reason: string; draftAt?: string }
  | { type: 'RESULT_DRAFT_DISCARD'; battleId: string }
  | { type: 'BATTLE_CLAIM_SIDE'; battleId: string; playerId: string; mode?: pa.ClaimMode }
  | { type: 'TIME_PROPOSE'; battleId: string; playerId: string | null; times: string[] }
  | { type: 'TIME_ACCEPT'; battleId: string; playerId: string | null; time: string }
  | { type: 'NOTE_ADD'; allianceId: string; playerId: string | null; text: string }
  | { type: 'NOTE_DELETE'; id: string }
  | { type: 'PROFILE_UPDATE'; playerId: string; update: pa.ProfileUpdate }
  | { type: 'COMMANDER_UPDATE'; playerId: string; name: string; title: string; portrait: string | null }
  | { type: 'MARK_ADD'; kind: 'HONOR' | 'SCAR'; playerId: string; title: string; reason: string; phase: number | null; battleId: string | null }
  | { type: 'MARK_REMOVE'; kind: 'HONOR' | 'SCAR'; playerId: string; id: string }
  | { type: 'BATTLE_UNBUNDLE'; battleId: string; opId: string }
  | { type: 'BATTLE_UNPLAYED'; battleId: string; resolution: 'ATTACKER_WINS' | 'DEFENDER_WINS' | 'VOID' | 'POSTPONED' }
  | { type: 'BATTLE_REOPEN'; battleId: string }
  | { type: 'BATTLE_PROCESS'; battleId: string }
  | { type: 'BATTLE_PROCESS_ALL' }
  | { type: 'PROCESS_ORDER'; battleIds: string[] }
  | { type: 'ARCHEOTECH_RESOLVE'; increments: Record<string, string[]> }
  | { type: 'RESOLVE_ARRIVAL' }
  | { type: 'INTERCEPT_ADD'; opId: string; allianceId: string }
  | { type: 'RESOLVE_KILL_TEAMS' }
  | { type: 'SCORE' }
  | { type: 'EVENTS_GENERATE' }
  | { type: 'EVENT_APPLY'; eventId: string; data: events.EventData }
  | { type: 'EVENT_DISCARD'; eventId: string }
  | { type: 'EVENT_INPUT'; eventId: string; playerId: string; data: events.EventData }
  // Eigene Ereignisse (D2) und Ereignis erzwingen (NTH2 2.2, nur Sandbox)
  | { type: 'CUSTOM_EVENT_UPSERT'; def: custom.CustomEventDef }
  | { type: 'CUSTOM_EVENT_DELETE'; id: string }
  | { type: 'CUSTOM_EVENT_TRIGGER'; defId: string; allianceId: string | null }
  | { type: 'EVENT_FORCE'; code: import('./types').EventRecordCode; allianceId: string | null; customId?: string }
  | { type: 'MOVE_SET'; fleetId: string; path: string[] }
  | { type: 'MOVES_APPLY' }
  | { type: 'BUILD_START' }
  | { type: 'BUILD_SET'; allianceId: string; choice: { type: InfraType; planetId: string } | 'SKIP' }
  // Ende
  | { type: 'CAMPAIGN_END' }
  | { type: 'TIEBREAK_ADD'; attackerAllianceId: string; defenderAllianceId: string }
  | { type: 'TIEBREAK_DECIDE'; winnerAllianceId: string }
  | { type: 'MEDAL_OVERRIDE'; medal: MedalId; allianceId: string | null }
  // Overrides
  | { type: 'OVERRIDE_PL'; allianceId: string; planetId: string; value: number }
  | { type: 'OVERRIDE_SLOT'; planetId: string; slot: number; destroyed: boolean; infra: { type: InfraType; allianceId: string } | null }
  | { type: 'OVERRIDE_FLEET'; fleetId: string; planetId: string }
  | { type: 'OVERRIDE_STRONGHOLD'; allianceId: string; destroyed: boolean }
  | { type: 'OVERRIDE_PLANET_DESTROYED'; planetId: string; destroyed: boolean }
  | { type: 'OVERRIDE_MODIFIER_ADD'; kind: ModifierKind; phaseNumber: number; allianceId: string | null; planetIds?: string[] }
  | { type: 'OVERRIDE_MODIFIER_REMOVE'; id: string }
  | { type: 'OVERRIDE_STAGE'; stage: Stage }
  | { type: 'OVERRIDE_POINTS'; phaseNumber: number; allianceId: string; points: number }
  // Regelmodul (NTH2 3.3): eigene Aktion eines Moduls, ohne die Command-Union zu erweitern
  | { type: 'MODULE_ACTION'; action: string; data?: Record<string, unknown> }
  // Nice-to-have 2, Block R1 (Missions-Pool, Gelände, Auswürfeln, Gäste, freie Gefechte)
  | r1.R1Command
  // Nice-to-have 2, Block R2 (Abwesenheit, Übergabe, Puls, Sonderziele, persönliche Ziele, Nemesis, Großschlacht)
  | r2.R2Command
  // Nice-to-have 2, Block P2 (Dekret-Bausteine, Planetenbilder, Galerie, Bemal-Chronik)
  | p2.P2Command
  // Nice-to-have 2, Block P1 (Spieltisch je Schlacht)
  | p1.P1Command
  // Nice-to-have 2, Block P3 (Crusade-Anbindung, Planeten-Merkmale)
  | p3.P3Command;

export const OVERRIDE_TYPES = new Set<Command['type']>([
  'OVERRIDE_PL',
  'OVERRIDE_SLOT',
  'OVERRIDE_FLEET',
  'OVERRIDE_STRONGHOLD',
  'OVERRIDE_PLANET_DESTROYED',
  'OVERRIDE_MODIFIER_ADD',
  'OVERRIDE_MODIFIER_REMOVE',
  'OVERRIDE_STAGE',
  'OVERRIDE_POINTS',
  'EVENT_DISCARD',
  'MEDAL_OVERRIDE',
  'EVENT_FORCE',
]);

/**
 * Ist der Command selbst ein Override (Begründung Pflicht, ⚠ im Log)? Neben den Korrekturen zählen dazu
 * die Abweichungen vom Regelfall bei ungespielten Schlachten (SPEC 9.5): verfällt, Verteidiger siegt,
 * verschieben. „Angreifer siegt“ ist der Regelfall und braucht keine Begründung.
 */
export function isOverrideCommand(cmd: Command): boolean {
  if (OVERRIDE_TYPES.has(cmd.type)) return true;
  return cmd.type === 'BATTLE_UNPLAYED' && cmd.resolution !== 'ATTACKER_WINS';
}

/** Regelspezifischer Command: dem Modul übergeben, sonst ablehnen (NTH2 3.3) */
function moduleCommand(ctx: Ctx, mod: CampaignModule, cmd: Command) {
  if (!mod.dispatch?.(ctx, cmd)) fail(`Diese Aktion gibt es im Regelmodul ${mod.name} nicht`);
}

function dispatch(ctx: Ctx, cmd: Command) {
  const st = ctx.state;
  // NTH2 3.3: Regelmodul der Kampagne – Setup, Operationen, Ablauf, Wertung, Events und Ende laufen darüber
  const mod = moduleOf(st);
  switch (cmd.type) {
    case 'META_UPDATE':
      if (cmd.name !== undefined) {
        if (!cmd.name.trim()) fail('Name darf nicht leer sein');
        st.meta.name = cmd.name.trim();
      }
      if (cmd.intro !== undefined) st.meta.intro = cmd.intro;
      if (cmd.introTr !== undefined) st.meta.introTr = cleanTextTr(cmd.introTr, originalLang(st));
      if (cmd.timezone) st.meta.timezone = cmd.timezone;
      if (cmd.edition) st.meta.edition = cmd.edition;
      if (cmd.battleSizes) {
        const ids = new Set<string>();
        for (const b of cmd.battleSizes) {
          if (!b.id || !b.name.trim()) fail('Jede Spielgröße braucht einen Namen');
          if (ids.has(b.id)) fail('Doppelte Spielgröße');
          if (!(b.points > 0) || b.reserves < 0) fail(`${b.name}: Punkte und Reserves-Limit prüfen`);
          ids.add(b.id);
        }
        if (!cmd.battleSizes.length) fail('Mindestens eine Spielgröße nötig');
        const used = st.battles.filter((b) => b.size && !ids.has(b.size));
        if (used.length) warn(ctx, `${used.length} Schlacht(en) nutzen eine entfernte Spielgröße`);
        st.meta.battleSizes = cmd.battleSizes;
      }
      if (cmd.attackNotes) st.meta.attackNotes = cmd.attackNotes;
      if (cmd.locale) st.meta.locale = (['de', 'en', 'fr', 'es', 'pl'] as const).find((l) => l === cmd.locale) ?? 'de';
      if (cmd.missions) {
        const ids = new Set<string>();
        for (const m of cmd.missions) {
          if (!m.id || ids.has(m.id) || m.id.startsWith('tpl-')) fail('Ungültige Missions-ID');
          if (!m.name.trim()) fail('Jede Mission braucht einen Namen');
          ids.add(m.id);
        }
        const used = st.battles.filter((b) => b.mission.source === 'LIST' && b.mission.missionId && !b.mission.missionId.startsWith('tpl-') && !ids.has(b.mission.missionId));
        if (used.length) warn(ctx, `${used.length} Schlacht(en) nutzen eine entfernte Mission`);
        st.meta.missions = cmd.missions;
      }
      log(ctx, 'Kampagnendaten aktualisiert');
      return;
    case 'TOGGLES_UPDATE':
      if (st.stage.kind !== 'SETUP') warn(ctx, 'Regel-Schalter werden während der laufenden Kampagne geändert');
      st.toggles = cmd.toggles;
      log(ctx, 'Regel-Schalter geändert');
      return;
    case 'ALLIANCE_UPSERT': {
      if (!cmd.name.trim()) fail('Name fehlt');
      if (cmd.id) {
        const a = alliance(st, cmd.id);
        a.name = cmd.name.trim();
        a.color = cmd.color;
        if (cmd.logo !== undefined) a.logo = cmd.logo;
        if (cmd.emblem !== undefined) a.emblem = cmd.emblem;
        if (cmd.lore !== undefined) a.lore = cmd.lore;
        if (cmd.loreTr !== undefined) a.loreTr = cleanTextTr(cmd.loreTr, originalLang(st));
        if (cmd.leaderPlayerId !== undefined) a.leaderPlayerId = cmd.leaderPlayerId;
        log(ctx, `Allianz ${a.name} aktualisiert`);
      } else {
        if (st.stage.kind !== 'SETUP' || st.stage.step !== 'W0') fail('Allianzen können nur im Setup angelegt werden');
        if (st.alliances.length >= st.meta.allianceCount) fail(`Diese Kampagne hat ${st.meta.allianceCount} Allianzen`);
        st.alliances.push({
          id: ctx.newId('al'),
          name: cmd.name.trim(),
          color: cmd.color,
          logo: cmd.logo ?? null,
          emblem: cmd.emblem ?? null,
          lore: cmd.lore ?? '',
          leaderPlayerId: null,
          strongholdDestroyed: false,
          order: st.alliances.length,
        });
        log(ctx, `Allianz ${cmd.name} angelegt`);
      }
      return;
    }
    case 'ALLIANCE_DELETE': {
      if (st.stage.kind !== 'SETUP' || st.stage.step !== 'W0') fail('Allianzen können nur im Setup-Schritt W0 gelöscht werden');
      const a = alliance(st, cmd.id);
      st.alliances = st.alliances.filter((x) => x.id !== cmd.id);
      st.alliances.forEach((x, i) => (x.order = i));
      st.fleets = st.fleets.filter((f) => f.allianceId !== cmd.id);
      for (const p of st.players) p.memberships = p.memberships.filter((m) => m.allianceId !== cmd.id);
      log(ctx, `Allianz ${a.name} gelöscht`);
      return;
    }
    case 'PLAYER_UPSERT': {
      let p = cmd.id ? st.players.find((x) => x.id === cmd.id) : undefined;
      if (cmd.id && !p) fail('Spieler nicht gefunden');
      if (!p) {
        if (!cmd.data.nickname?.trim()) fail('Nickname fehlt');
        p = { id: ctx.newId('pl'), nickname: '', realName: '', email: '', discord: '', avatar: null, notes: '', faction: '', subfaction: '', memberships: [], active: true, isGameMaster: false };
        st.players.push(p);
      }
      const { nickname, ...rest } = cmd.data;
      const prevFaction = { faction: p.faction, subfaction: p.subfaction };
      if (nickname !== undefined) {
        if (!nickname.trim()) fail('Nickname fehlt');
        p.nickname = nickname.trim();
      }
      Object.assign(p, rest);
      // Nach den Schlachten einer Phase (Schritt 3–5) gilt ein Armeewechsel erst ab der nächsten Phase
      if (p.faction !== prevFaction.faction || p.subfaction !== prevFaction.subfaction || !p.factionHistory) recordFactionChange(st, p, prevFaction);
      if (cmd.allianceId !== undefined) {
        const cur = p.memberships.find((m) => m.toPhase === null)?.allianceId ?? null;
        if (cur !== cmd.allianceId) {
          if (cmd.allianceId) alliance(st, cmd.allianceId);
          const from = stagePhase(st);
          if (st.stage.kind !== 'SETUP' && cur) warn(ctx, `${p.nickname} wechselt ab Phase ${from} die Allianz`);
          setMembership(p, cmd.allianceId, from);
          // Flotten der alten Allianz, die der Spieler in dieser Phase führt, bekommen einen neuen Kommandanten
          if (st.stage.kind === 'PHASE') {
            const key = String(st.stage.phase);
            const lost = st.fleets.filter((f) => f.commanders[key] === p!.id && f.allianceId !== cmd.allianceId);
            for (const f of lost) delete f.commanders[key];
            if (lost.length) {
              carryCommanders(st, st.stage.phase);
              warn(ctx, `${p.nickname} führte ${lost.map((f) => f.name).join(', ')} – Kommando wird neu vergeben`);
            }
          }
          log(ctx, `${p.nickname}: ${cmd.allianceId ? `Allianz ${allianceName(st, cmd.allianceId)}` : 'keine Allianz'}${st.stage.kind === 'SETUP' ? '' : ` (ab Phase ${from})`}`);
        }
      }
      log(ctx, `Spieler ${p.nickname} gespeichert`);
      return;
    }
    case 'PLAYER_DELETE': {
      const p = st.players.find((x) => x.id === cmd.id);
      if (!p) fail('Spieler nicht gefunden');
      const used = st.battles.some((b) => [...b.attackers, ...b.defenders].some((x) => x.playerId === cmd.id)) || st.fleets.some((f) => Object.values(f.commanders).includes(cmd.id));
      if (used) {
        p.active = false;
        warn(ctx, `${p.nickname} ist in Schlachten/Flotten eingetragen und wird nur deaktiviert`);
        log(ctx, `Spieler ${p.nickname} deaktiviert`);
      } else {
        st.players = st.players.filter((x) => x.id !== cmd.id);
        for (const a of st.alliances) if (a.leaderPlayerId === cmd.id) a.leaderPlayerId = null;
        log(ctx, `Spieler ${p.nickname} gelöscht`);
      }
      return;
    }
    case 'FLEET_SET_COUNT':
      setup.setFleetCount(ctx, cmd.allianceId, cmd.count);
      return;
    case 'FLEET_UPDATE': {
      const f = st.fleets.find((x) => x.id === cmd.id);
      if (!f) fail('Flotte nicht gefunden');
      if (cmd.name?.trim()) f.name = cmd.name.trim();
      log(ctx, `Flotte ${f.name} umbenannt`);
      return;
    }
    case 'FLEET_RESERVE_SET':
      return setup.setReserveCount(ctx, cmd.allianceId, cmd.count);
    case 'FLEET_ACTIVATE':
      return setup.activateReserve(ctx, cmd.fleetId, cmd.planetId);
    case 'FLEET_PLACE': {
      // Erstplatzierung einer Flotte, die nach dem Setup hinzugekommen ist (keine Position)
      const f = st.fleets.find((x) => x.id === cmd.fleetId);
      if (!f) fail('Flotte nicht gefunden');
      if (f.planetId) fail(`${f.name} hat bereits eine Position – Verschieben nur per Override`);
      if (st.stage.kind === 'SETUP' && !st.setup.fleetsRevealed) fail('Im Setup werden Startplaneten in Schritt W4 festgelegt');
      if (st.stage.kind === 'PHASE' && st.stage.step !== 'OPS') warn(ctx, 'Die Flotte wird mitten in der Phase platziert');
      if (planet(st, cmd.planetId).destroyed) warn(ctx, `${planetName(cmd.planetId)} ist zerstört`);
      f.planetId = cmd.planetId;
      log(ctx, `${f.name} wird auf ${planetName(cmd.planetId)} platziert`);
      return;
    }
    case 'FLEET_COMMANDER': {
      const f = st.fleets.find((x) => x.id === cmd.fleetId);
      if (!f) fail('Flotte nicht gefunden');
      if (cmd.playerId) {
        const p = st.players.find((x) => x.id === cmd.playerId);
        if (!p) fail('Spieler nicht gefunden');
        f.commanders[String(cmd.phase)] = cmd.playerId;
        log(ctx, `${f.name}: Kommandant Phase ${cmd.phase} = ${p.nickname}`);
      } else delete f.commanders[String(cmd.phase)];
      // A5: Standardoperation folgt dem (ab- oder anwesenden) neuen Kommandanten
      r2.afterPhaseStart(ctx);
      return;
    }
    case 'PLANET_TEXT': {
      const p = planet(st, cmd.planetId);
      if (cmd.lore !== undefined) p.lore = cmd.lore;
      if (cmd.notes !== undefined) p.notes = cmd.notes;
      if (cmd.loreTr !== undefined) p.loreTr = cleanTextTr(cmd.loreTr, originalLang(st));
      log(ctx, `Texte zu ${planetName(cmd.planetId)} aktualisiert`);
      return;
    }
    case 'DISPATCH_UPSERT': {
      if (!cmd.title.trim()) fail('Titel fehlt');
      const d = cmd.id ? st.dispatches.find((x) => x.id === cmd.id) : undefined;
      // NTH2 7.3: Fassungen in weiteren Sprachen (fehlend = unverändert)
      const tr = cmd.tr !== undefined ? cleanDispatchTr(cmd.tr, originalLang(st)) : d?.tr;
      if (d) Object.assign(d, { title: cmd.title, body: cmd.body, pinned: cmd.pinned, public: cmd.public, tr });
      else st.dispatches.push({ id: ctx.newId('disp'), at: ctx.now, title: cmd.title, body: cmd.body, pinned: cmd.pinned, public: cmd.public, ...(tr ? { tr } : {}) });
      log(ctx, `Dispatch „${cmd.title}“ gespeichert`);
      return;
    }
    case 'DISPATCH_DELETE':
      st.dispatches = st.dispatches.filter((x) => x.id !== cmd.id);
      log(ctx, 'Dispatch gelöscht');
      return;
    case 'PHASE_UPDATE': {
      const ph = st.phases.find((p) => p.number === cmd.phase);
      if (!ph) fail('Phase nicht gefunden');
      for (const k of ['startDate', 'opsDeadline', 'battlesDeadline', 'endDate', 'notes'] as const) if (cmd[k] !== undefined) (ph as unknown as Record<string, unknown>)[k] = cmd[k];
      log(ctx, `Phase ${cmd.phase}: Termine/Notizen aktualisiert`);
      return;
    }

    case 'MAP_SET':
      return setup.setMap(ctx, cmd.map);
    case 'SETUP_START':
      mod.startCampaign(ctx, cmd);
      // A5: Abwesende der ersten Phase erhalten sofort ihre Standardoperation
      return r2.afterPhaseStart(ctx);

    case 'OP_SET':
      return mod.operations.set(ctx, cmd.fleetId, cmd.slot, cmd.op);
    case 'OP_CLEAR':
      return mod.operations.clear(ctx, cmd.fleetId, cmd.slot);
    case 'ADVANCE':
    case 'REVEAL_OPS': {
      // N1.6: Spiellast nach dem Ansetzen der Schlachten (Reveal) als Hinweis
      const n = st.stage.kind === 'PHASE' ? st.stage.phase : null;
      const was = n !== null && !!st.phases.find((p) => p.number === n)?.flags.revealed;
      // C3: Sonderziele der Phase, die beim Verlassen der Wertung noch offen sind, verfallen
      if (cmd.type === 'ADVANCE' && st.stage.kind === 'PHASE' && st.stage.step === 'RESULTS' && st.stage.phase < st.meta.phaseCount) closeObjectives(ctx, st.stage.phase);
      if (cmd.type === 'ADVANCE') mod.advance(ctx);
      else moduleCommand(ctx, mod, cmd);
      // A5: neue Phase – Standardoperation für Flotten abwesender Kommandanten
      if (cmd.type === 'ADVANCE') r2.afterPhaseStart(ctx);
      if (n !== null && !was && st.phases.find((p) => p.number === n)?.flags.revealed) pa.hintLoadPhase(ctx, n);
      return;
    }
    case 'BATTLE_UPDATE': {
      const prev = st.battles.find((x) => x.id === cmd.battleId);
      const before = prev ? { attackers: [...prev.attackers], defenders: [...prev.defenders] } : null;
      phase.updateBattle(ctx, cmd.battleId, cmd.update);
      // A4: harte Obergrenze für neu eingetragene Spieler (Override mit Begründung)
      if (before) r1.checkCapAfterUpdate(ctx, cmd.battleId, before);
      const b = st.battles.find((x) => x.id === cmd.battleId)!;
      if (cmd.update.attackers || cmd.update.defenders || cmd.update.games) pa.warnLoad(ctx, b);
      return;
    }
    case 'RESULT_DRAFT_SUBMIT':
      return pa.submitDraft(ctx, cmd.battleId, cmd.playerId, cmd.update, cmd.decisions);
    case 'RESULT_DRAFT_CONFIRM':
      return pa.confirmDraft(ctx, cmd.battleId, cmd.playerId, cmd.draftAt);
    case 'RESULT_DRAFT_DISPUTE':
      return pa.disputeDraft(ctx, cmd.battleId, cmd.playerId, cmd.reason, cmd.draftAt);
    case 'RESULT_DRAFT_DISCARD':
      return pa.discardDraft(ctx, cmd.battleId);
    case 'BATTLE_CLAIM_SIDE':
      return pa.claimSide(ctx, cmd.battleId, cmd.playerId, cmd.mode ?? 'TAKE_OVER');
    case 'TIME_PROPOSE':
      return pa.proposeTimes(ctx, cmd.battleId, cmd.playerId, cmd.times);
    case 'TIME_ACCEPT':
      return pa.acceptTime(ctx, cmd.battleId, cmd.playerId, cmd.time);
    case 'NOTE_ADD':
      return pa.addNote(ctx, cmd.allianceId, cmd.playerId, cmd.text);
    case 'NOTE_DELETE':
      return pa.deleteNote(ctx, cmd.id);
    case 'PROFILE_UPDATE':
      return pa.updateProfile(ctx, cmd.playerId, cmd.update);
    case 'COMMANDER_UPDATE':
      return cmdr.updateCommander(ctx, cmd.playerId, cmd);
    case 'MARK_ADD':
      return cmdr.addMark(ctx, cmd.kind, cmd.playerId, cmd);
    case 'MARK_REMOVE':
      return cmdr.removeMark(ctx, cmd.kind, cmd.playerId, cmd.id);
    case 'BATTLE_BUNDLE':
      phase.bundleBattles(ctx, cmd.battleIds);
      for (const b of st.battles.filter((x) => cmd.battleIds.includes(x.id))) pa.warnLoad(ctx, b);
      return;
    case 'BATTLE_UNBUNDLE':
      return phase.unbundleOp(ctx, cmd.battleId, cmd.opId);
    case 'BATTLE_UNPLAYED':
      return phase.resolveUnplayed(ctx, cmd.battleId, cmd.resolution);
    case 'BATTLE_REOPEN':
      return phase.reopenBattle(ctx, cmd.battleId);
    case 'BATTLE_PROCESS':
      if (!mod.battles) return moduleCommand(ctx, mod, cmd);
      return mod.battles.process(ctx, cmd.battleId);
    case 'BATTLE_PROCESS_ALL':
      if (!mod.battles) return moduleCommand(ctx, mod, cmd);
      mod.battles.processAll(ctx);
      return;
    case 'PROCESS_ORDER':
      return phase.setProcessOrder(ctx, cmd.battleIds);
    case 'SCORE':
      // C3: „Planet halten“-Sonderziele werden am Phasenende vor der Punktewertung ausgewertet
      evaluateObjectives(ctx);
      return mod.scorePhase(ctx);
    case 'EVENTS_GENERATE':
      if (!mod.generateEvents) fail(`Das Regelmodul ${mod.name} kennt keine Ereignisse`);
      return mod.generateEvents(ctx);
    case 'CUSTOM_EVENT_UPSERT':
      return custom.upsertCustomEvent(ctx, cmd.def);
    case 'CUSTOM_EVENT_DELETE':
      return custom.deleteCustomEvent(ctx, cmd.id);
    case 'CUSTOM_EVENT_TRIGGER':
      if (st.stage.kind !== 'PHASE' || st.stage.step !== 'RESULTS') fail('Events nur in Schritt 3');
      return custom.triggerCustomEvent(ctx, st.stage.phase, cmd.defId, cmd.allianceId);
    case 'CAMPAIGN_END':
      return mod.endCampaign(ctx);
    case 'MODULE_ACTION':
      if (!mod.action) fail(`Das Regelmodul ${mod.name} hat keine eigenen Aktionen`);
      return mod.action(ctx, cmd.action, cmd.data ?? {});

    case 'MISSION_POOL_SET':
    case 'TERRAIN_LAYOUTS_SET':
    case 'BATTLE_ROLL_OFF':
    case 'BATTLE_GUEST_SET':
    case 'SKIRMISH_REPORT':
    case 'SKIRMISH_CONFIRM':
    case 'SKIRMISH_DELETE':
      return r1.dispatchR1(ctx, cmd);

    case 'ABSENCE_SET':
    case 'PLAYER_HANDOVER':
    case 'PLAYER_JOIN':
    case 'PULSE_SUBMIT':
    case 'OBJECTIVE_UPSERT':
    case 'OBJECTIVE_DELETE':
    case 'OBJECTIVE_RESOLVE':
    case 'GOAL_LIST_SET':
    case 'GOAL_ASSIGN':
    case 'GOAL_CHOOSE':
    case 'GOAL_CLAIM':
    case 'GOAL_RESOLVE':
    case 'GOAL_REMOVE':
    case 'NEMESIS_SET':
    case 'GRAND_UPDATE':
    case 'GRAND_JOIN':
      return r2.dispatchR2(ctx, cmd);

    case 'CRUSADE_RULES_SET':
    case 'CRUSADE_ROSTER_SET':
    case 'CRUSADE_UNIT_UPSERT':
    case 'CRUSADE_UNIT_DELETE':
    case 'CRUSADE_BATTLE_UNITS':
    case 'CRUSADE_XP_ADJUST':
    case 'PLANET_TRAITS_SET':
      return p3.dispatchP3(ctx, cmd);

    case 'BATTLE_TABLE_SET':
      return p1.dispatchP1(ctx, cmd);

    case 'DECREE_BLOCKS_SET':
    case 'PLANET_IMAGE_SET':
    case 'PHASE_PHOTO_SET':
    case 'PHOTO_VOTE_MODE':
    case 'PHOTO_VOTE':
    case 'HOBBY_ADD':
    case 'HOBBY_DELETE':
      return p2.dispatchP2(ctx, cmd);

    case 'OVERRIDE_PL': {
      const p = planet(st, cmd.planetId);
      alliance(st, cmd.allianceId);
      if (!Number.isInteger(cmd.value) || cmd.value < 0 || cmd.value > (house(st, 'F17_PL_FIVE') ? 5 : 4)) fail(house(st, 'F17_PL_FIVE') ? 'Wert 0–5' : 'Wert 0–4');
      const min = minPL(st, cmd.allianceId, cmd.planetId);
      if (cmd.value < min) warn(ctx, `Wert liegt unter dem Minimum (${min})`);
      if (p.destroyed && cmd.value !== 0) warn(ctx, 'Planet ist zerstört – Power Level sollte 0 sein');
      const before = p.power[cmd.allianceId];
      p.power[cmd.allianceId] = cmd.value;
      log(ctx, `Override: ${allianceName(st, cmd.allianceId)} PL ${planetName(cmd.planetId)} ${before}→${cmd.value}`);
      return;
    }
    case 'OVERRIDE_SLOT': {
      const p = planet(st, cmd.planetId);
      const s = p.slots[cmd.slot];
      if (!s) fail('Location existiert nicht');
      if (cmd.infra) {
        alliance(st, cmd.infra.allianceId);
        if (cmd.destroyed) fail('Zerstörte Location kann keine Infrastruktur tragen');
      }
      s.destroyed = cmd.destroyed;
      s.infra = cmd.infra;
      const allDestroyed = p.slots.every((x) => x.destroyed);
      if (allDestroyed && !p.destroyed) warn(ctx, 'Alle Locations zerstört – Planet ggf. als zerstört markieren');
      log(ctx, `Override: Location ${cmd.slot + 1} auf ${planetName(cmd.planetId)} → ${cmd.destroyed ? 'zerstört' : cmd.infra ? `${cmd.infra.type} (${allianceName(st, cmd.infra.allianceId)})` : 'frei'}`);
      return;
    }
    case 'OVERRIDE_FLEET': {
      const f = st.fleets.find((x) => x.id === cmd.fleetId);
      if (!f) fail('Flotte nicht gefunden');
      planet(st, cmd.planetId);
      f.planetId = cmd.planetId;
      log(ctx, `Override: ${f.name} → ${planetName(cmd.planetId)}`);
      return;
    }
    case 'OVERRIDE_STRONGHOLD':
      alliance(st, cmd.allianceId).strongholdDestroyed = cmd.destroyed;
      log(ctx, `Override: Stronghold ${allianceName(st, cmd.allianceId)} ${cmd.destroyed ? 'zerstört' : 'intakt'}`);
      return;
    case 'OVERRIDE_PLANET_DESTROYED': {
      const p = planet(st, cmd.planetId);
      p.destroyed = cmd.destroyed;
      if (cmd.destroyed) for (const a of Object.keys(p.power)) p.power[a] = 0;
      else for (const a of st.alliances) p.power[a.id] = Math.max(1, p.power[a.id] ?? 1);
      log(ctx, `Override: ${planetName(cmd.planetId)} ${cmd.destroyed ? 'zerstört' : 'wiederhergestellt'}`);
      return;
    }
    case 'OVERRIDE_MODIFIER_ADD':
      st.modifiers.push({ id: ctx.newId('mod'), source: 'override', kind: cmd.kind, phaseNumber: cmd.phaseNumber, allianceId: cmd.allianceId, planetIds: cmd.planetIds });
      log(ctx, `Override: Modifier ${cmd.kind} für Phase ${cmd.phaseNumber}`);
      return;
    case 'OVERRIDE_MODIFIER_REMOVE':
      st.modifiers = st.modifiers.filter((m) => m.id !== cmd.id);
      log(ctx, 'Override: Modifier entfernt');
      return;
    case 'OVERRIDE_STAGE':
      st.stage = cmd.stage;
      if (cmd.stage.kind === 'PHASE') {
        const n = cmd.stage.phase;
        if (!st.phases.some((p) => p.number === n)) fail('Phase existiert nicht');
      }
      log(ctx, `Override: Ablauf auf ${JSON.stringify(cmd.stage)} gesetzt`);
      return;
    case 'OVERRIDE_POINTS': {
      const e = st.pointsHistory.find((p) => p.phaseNumber === cmd.phaseNumber);
      if (!e) fail('Für diese Phase gibt es noch keine Punkte');
      e.points[cmd.allianceId] = cmd.points;
      log(ctx, `Override: Punkte Phase ${cmd.phaseNumber} ${allianceName(st, cmd.allianceId)} = ${cmd.points}`);
      return;
    }
    default:
      // NTH2 3.3: regelspezifische Commands (z. B. Vespator-Setup W0–W4, Events, Bewegung, Bau)
      return moduleCommand(ctx, mod, cmd);
  }
}

export type ExecResult =
  /** override: Warnungen wurden übergangen (nicht nur der Regelfall bestätigt) – im Log als ⚠ markieren */
  | { ok: true; state: CampaignState; log: string[]; warnings: string[]; hints: string[]; override: boolean; summary: string }
  | { ok: false; kind: 'error'; error: string }
  /** needsReason: mindestens eine echte Warnung – Fortfahren nur mit Begründung (SPEC 14.1) */
  | { ok: false; kind: 'confirm'; warnings: string[]; needsReason: boolean }
  | { ok: false; kind: 'dice'; dice: { kind: 'D3' | 'D6'; context: string; index: number } };

export interface ExecOptions {
  force?: boolean;
  reason?: string;
  dice?: DiceSource;
  now?: string;
  idGen?: (p: string) => string;
}

export function executeCommand(state: CampaignState, input: Command, opts: ExecOptions = {}): ExecResult {
  // S2: jeder Command läuft durch das Schema (unbekannte Felder fallen weg, Zeitpunkte und Zahlen streng geprüft)
  const parsed = parseCommand(input);
  if (!parsed.ok) return { ok: false, kind: 'error', error: parsed.error };
  const cmd = parsed.cmd;
  const draft = structuredClone(state);
  const dice: DiceSource = opts.dice ?? { mode: 'DIGITAL', manual: [], random: (n) => 1 + Math.floor(Math.random() * n) };
  const ctx = makeCtx(draft, dice, opts.now, opts.idGen);
  if (OVERRIDE_TYPES.has(cmd.type) && !opts.reason?.trim()) return { ok: false, kind: 'error', error: 'Für Overrides ist eine Begründung Pflicht' };
  // SPEC 9.5: verfallen lassen, Verteidiger siegen lassen oder verschieben nur mit Begründung
  if (isOverrideCommand(cmd) && !opts.reason?.trim()) return { ok: false, kind: 'error', error: 'Für diese Wertung einer ungespielten Schlacht ist eine Begründung Pflicht' };
  try {
    // S6: Planeten-Nachschlagen nur in der Karte dieser Kampagne (nie in der globalen Registry anderer Kampagnen)
    withMap(draft, () => dispatch(ctx, cmd));
  } catch (e) {
    if (e instanceof DiceNeeded) return { ok: false, kind: 'dice', dice: { kind: e.kind, context: e.context, index: e.index } };
    if (e instanceof RuleError) return { ok: false, kind: 'error', error: e.message };
    throw e;
  }
  const override = overridesWarnings(ctx);
  if (ctx.warnings.length && !opts.force) return { ok: false, kind: 'confirm', warnings: ctx.warnings, needsReason: override };
  // SPEC 14.1: Wer Warnungen übergeht, begründet das (Pflichtfeld, wird geloggt); der bestätigte Regelfall nicht
  if (override && !opts.reason?.trim()) return { ok: false, kind: 'error', error: 'Zum Übergehen der Warnungen ist eine Begründung Pflicht' };
  // Neue Karte erst registrieren, wenn der Command wirklich gilt (nicht bei Rückfrage/Abbruch)
  if (cmd.type === 'MAP_SET' && draft.map) registerMap(draft.map);
  const summary = ctx.log.length ? ctx.log[0] + (ctx.log.length > 1 ? ` (+${ctx.log.length - 1})` : '') : cmd.type;
  return { ok: true, state: draft, log: ctx.log, warnings: ctx.warnings, hints: ctx.hints, override, summary };
}

export { BUILDABLE_TYPES };
