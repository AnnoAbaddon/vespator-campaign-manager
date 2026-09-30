import { EVENTS, INFRA, type EventCode, type InfraType } from './data/vespator';
import { planetIds } from './map';
import { fail, log, type Ctx } from './ctx';
import { allianceName, build, campaignPoints, canBuild, decrease, destroyInfra, increase, planet, planetName, strongholdPlanet } from './board';
import type { CampaignState, EventRecord, ModifierKind } from './types';

/**
 * Eigene Ereignisse (D2): Der Warmaster setzt Ereignisse aus Effekt-Bausteinen zusammen. Sie werden
 * – für eine Phase eingeplant (treten beim Generieren der Events dieser Phase ein),
 * – ersetzen einen Eintrag der Event-Tabellen (Tabelle erweitern) oder
 * – werden in Schritt 3 von Hand ausgelöst.
 * Angewendet werden sie wie Regelbuch-Events (EVENT_APPLY) und laufen damit über Undo und Override.
 */

/** Allianz-Bezug: TARGET = Ziel-Allianz des Ereignisses, OTHERS = alle außer ihr, LEADER/TRAILING = meiste/wenigste Kampagnenpunkte, sonst eine Allianz-ID */
export type AllianceRef = 'TARGET' | 'OTHERS' | 'ALL' | 'LEADER' | 'TRAILING' | (string & {});
/** Planeten-Bezug: CHOSEN = beim Anwenden gewählt, ALL = alle intakten, STRONGHOLD = Stronghold-Planet der Allianz, sonst eine Planeten-ID */
export type PlanetRef = 'CHOSEN' | 'ALL' | 'STRONGHOLD' | (string & {});

/** Modifikatoren, die ein eigenes Ereignis für die nächste Phase setzen kann */
export const CUSTOM_MODIFIERS = [
  'NO_VOID_LEAP',
  'SUPPORT_FACILITIES_INACTIVE',
  'NO_LOGISTICAL_AUXILIA',
  'RANDOM_THEATRE',
  'COORDINATED_OPPOSITION',
  'OPEN_TOME',
  'DEFIANT_ZEAL',
] as const satisfies readonly ModifierKind[];
export type CustomModifier = (typeof CUSTOM_MODIFIERS)[number];
/** Modifikatoren, die für eine bestimmte Allianz gelten */
export const ALLIANCE_MODIFIERS: ReadonlySet<CustomModifier> = new Set(['COORDINATED_OPPOSITION', 'OPEN_TOME', 'DEFIANT_ZEAL']);

export const MODIFIER_LABEL: Record<CustomModifier, string> = {
  NO_VOID_LEAP: 'kein Void Leap',
  SUPPORT_FACILITIES_INACTIVE: 'Support Facilities inaktiv',
  NO_LOGISTICAL_AUXILIA: 'kein Logistical Auxilia',
  RANDOM_THEATRE: 'zufällige Theatres',
  COORDINATED_OPPOSITION: 'Coordinated Opposition',
  OPEN_TOME: 'An Open Tome',
  DEFIANT_ZEAL: 'Defiant Zeal',
};

export type CustomEffect =
  /** Power Level ± (−2 … +2) */
  | { kind: 'PL'; alliance: AllianceRef; planet: PlanetRef; delta: number }
  /** Infrastruktur der Allianz auf dem Planeten zerstören (ohne Stronghold) */
  | { kind: 'INFRA_DESTROY'; alliance: AllianceRef; planet: PlanetRef }
  /** Infrastruktur bauen (Limits gelten; ohne freie Location entfällt der Bau) */
  | { kind: 'INFRA_BUILD'; alliance: AllianceRef; planet: PlanetRef; infra: InfraType }
  /** Flotten der Allianz auf einen Planeten versetzen */
  | { kind: 'MOVE'; alliance: AllianceRef; planet: PlanetRef }
  /** Kampagnenpunkte ± (−5 … +5), dauerhaft */
  | { kind: 'POINTS'; alliance: AllianceRef; delta: number }
  /** Modifikator für die nächste Phase */
  | { kind: 'MODIFIER'; modifier: CustomModifier; alliance: AllianceRef | null };

export type CustomEffectKind = CustomEffect['kind'];
export const EFFECT_KINDS: CustomEffectKind[] = ['PL', 'INFRA_DESTROY', 'INFRA_BUILD', 'MOVE', 'POINTS', 'MODIFIER'];

export interface CustomEventDef {
  id: string;
  name: string;
  description: string;
  effects: CustomEffect[];
  /** eingeplant für diese Phase (null = nicht eingeplant) */
  phase: number | null;
  /** ersetzt diesen Tabelleneintrag, wenn er ausgewürfelt wird (null = keiner) */
  replaces: EventCode | null;
  /** Ziel-Allianz bei eingeplanten Ereignissen: LEADER, TRAILING, eine Allianz-ID oder null (beim Anwenden wählen) */
  target: string | null;
}

/** Stand der Definition beim Auslösen – spätere Änderungen am Baukasten wirken nicht zurück */
export interface CustomEventSnapshot {
  defId: string;
  name: string;
  description: string;
  effects: CustomEffect[];
}

/** Anzeigename eines Event-Eintrags (Regelbuch oder eigenes Ereignis) */
export function eventName(e: Pick<EventRecord, 'code' | 'custom'>): string {
  if (e.code === 'CUSTOM') return e.custom?.name ?? 'Eigenes Ereignis';
  return EVENTS[e.code].name;
}

/** Kurzbeschreibung eines Event-Eintrags (Regelbuch-Texte sind Übersetzungsschlüssel, eigene Texte Nutzereingaben) */
export function eventSummary(e: Pick<EventRecord, 'code' | 'custom'>): string {
  if (e.code === 'CUSTOM') return e.custom?.description ?? '';
  return EVENTS[e.code].summary;
}

const SPECIAL_ALLIANCES = new Set(['TARGET', 'OTHERS', 'ALL', 'LEADER', 'TRAILING']);
const SPECIAL_PLANETS = new Set(['CHOSEN', 'ALL', 'STRONGHOLD']);

const effectAlliances = (e: CustomEffect): (AllianceRef | null)[] => [e.alliance];
const effectPlanet = (e: CustomEffect): PlanetRef | null => ('planet' in e ? e.planet : null);

/** Braucht das Ereignis eine Ziel-Allianz (TARGET/OTHERS)? */
export function needsTarget(effects: CustomEffect[]): boolean {
  return effects.some((e) => effectAlliances(e).some((a) => a === 'TARGET' || a === 'OTHERS'));
}

/** Braucht das Ereignis einen beim Anwenden gewählten Planeten? */
export function needsPlanet(effects: CustomEffect[]): boolean {
  return effects.some((e) => effectPlanet(e) === 'CHOSEN');
}

/** Prüft eine Definition; liefert einen Fehlertext oder null */
export function validateCustomEvent(st: CampaignState, d: CustomEventDef): string | null {
  if (!d.id || !d.name.trim()) return 'Das Ereignis braucht einen Namen';
  if (d.name.length > 80 || d.description.length > 2000) return 'Name oder Beschreibung zu lang';
  if (!d.effects.length) return 'Mindestens einen Baustein wählen';
  if (d.effects.length > 12) return 'Höchstens 12 Bausteine';
  if (d.phase !== null && (!Number.isInteger(d.phase) || d.phase < 1 || d.phase >= st.meta.phaseCount)) return `Einplanen nur für Phase 1–${st.meta.phaseCount - 1} (in der letzten Phase gibt es keine Events)`;
  if (d.replaces !== null && !(d.replaces in EVENTS)) return 'Unbekannter Tabelleneintrag';
  if (d.target !== null && !['LEADER', 'TRAILING'].includes(d.target) && !st.alliances.some((a) => a.id === d.target)) return 'Unbekannte Ziel-Allianz';
  const ids = new Set(planetIds(st));
  for (const e of d.effects) {
    const a = e.alliance;
    if (a !== null && !SPECIAL_ALLIANCES.has(a) && !st.alliances.some((x) => x.id === a)) return 'Unbekannte Allianz in einem Baustein';
    const p = effectPlanet(e);
    if (p !== null && !SPECIAL_PLANETS.has(p) && !ids.has(p)) return 'Unbekannter Planet in einem Baustein';
    switch (e.kind) {
      case 'PL':
        if (!Number.isInteger(e.delta) || e.delta === 0 || Math.abs(e.delta) > 2) return 'Power Level: Änderung −2 bis +2';
        break;
      case 'POINTS':
        if (!Number.isInteger(e.delta) || e.delta === 0 || Math.abs(e.delta) > 5) return 'Kampagnenpunkte: Änderung −5 bis +5';
        break;
      case 'INFRA_BUILD':
        if (!(e.infra in INFRA) || e.infra === 'STRONGHOLD') return 'Bau: keine gültige Infrastruktur';
        break;
      case 'MOVE':
        if (e.planet === 'ALL') return 'Bewegung: einen Zielplaneten wählen';
        break;
      case 'MODIFIER':
        if (!(CUSTOM_MODIFIERS as readonly string[]).includes(e.modifier)) return 'Unbekannter Modifikator';
        if (ALLIANCE_MODIFIERS.has(e.modifier) && !e.alliance) return 'Dieser Modifikator gilt für eine Allianz';
        break;
      case 'INFRA_DESTROY':
        break;
      default:
        return 'Unbekannter Baustein';
    }
  }
  return null;
}

// ─── Befehle zum Baukasten ────────────────────────────────────────────────

export function upsertCustomEvent(ctx: Ctx, def: CustomEventDef) {
  const st = ctx.state;
  const d: CustomEventDef = { ...structuredClone(def), id: def.id || ctx.newId('cev'), name: def.name.trim(), description: def.description ?? '' };
  const err = validateCustomEvent(st, d);
  if (err) fail(err);
  if (d.replaces && (st.customEvents ?? []).some((x) => x.id !== d.id && x.replaces === d.replaces)) fail(`${EVENTS[d.replaces].name} wird bereits von einem anderen eigenen Ereignis ersetzt`);
  const list = st.customEvents ?? [];
  const i = list.findIndex((x) => x.id === d.id);
  st.customEvents = i >= 0 ? list.map((x, j) => (j === i ? d : x)) : [...list, d];
  log(ctx, `Eigenes Ereignis „${d.name}“ gespeichert`);
}

export function deleteCustomEvent(ctx: Ctx, id: string) {
  const st = ctx.state;
  const d = (st.customEvents ?? []).find((x) => x.id === id);
  if (!d) fail('Eigenes Ereignis nicht gefunden');
  st.customEvents = (st.customEvents ?? []).filter((x) => x.id !== id);
  log(ctx, `Eigenes Ereignis „${d.name}“ gelöscht`);
}

/** Legt einen Event-Eintrag für ein eigenes Ereignis an (Status offen) */
export function addCustomRecord(ctx: Ctx, phaseNumber: number, def: CustomEventDef, allianceId: string | null, note = ''): EventRecord {
  const st = ctx.state;
  const e: EventRecord = {
    id: ctx.newId('event'),
    phaseNumber,
    category: 'CUSTOM',
    code: 'CUSTOM',
    custom: { defId: def.id, name: def.name, description: def.description, effects: structuredClone(def.effects) },
    allianceId,
    status: 'PENDING',
    data: {},
    applied: [],
  };
  st.events.push(e);
  log(ctx, `Eigenes Ereignis: ${def.name}${allianceId ? ` (${allianceName(st, allianceId)})` : ''}${note ? ` – ${note}` : ''}`);
  return e;
}

/** Allianzen mit den meisten (LEADER) bzw. wenigsten (TRAILING) Kampagnenpunkten; bei Gleichstand alle gleichauf */
export function pointsExtremes(st: CampaignState, which: 'LEADER' | 'TRAILING'): string[] {
  if (!st.alliances.length) return [];
  const pts = st.alliances.map((a) => ({ id: a.id, p: campaignPoints(st, a.id) }));
  const v = which === 'LEADER' ? Math.max(...pts.map((x) => x.p)) : Math.min(...pts.map((x) => x.p));
  return pts.filter((x) => x.p === v).map((x) => x.id);
}

/** Ziel-Allianz eines eingeplanten Ereignisses (eindeutig oder null = beim Anwenden wählen) */
export function resolveDefTarget(st: CampaignState, target: string | null): string | null {
  if (!target) return null;
  if (target === 'LEADER' || target === 'TRAILING') {
    const x = pointsExtremes(st, target);
    return x.length === 1 ? x[0] : null;
  }
  return st.alliances.some((a) => a.id === target) ? target : null;
}

/** Eingeplante eigene Ereignisse einer Phase anlegen (beim Generieren der Events) */
export function addScheduledCustomEvents(ctx: Ctx, phaseNumber: number) {
  for (const d of (ctx.state.customEvents ?? []).filter((x) => x.phase === phaseNumber)) addCustomRecord(ctx, phaseNumber, d, resolveDefTarget(ctx.state, d.target), 'eingeplant');
}

/** Ein Tabelleneintrag, der durch ein eigenes Ereignis ersetzt wird (Tabelle erweitern) */
export function replacementFor(st: CampaignState, code: EventCode): CustomEventDef | null {
  return (st.customEvents ?? []).find((d) => d.replaces === code) ?? null;
}

/** Ein eigenes Ereignis in Schritt 3 von Hand auslösen */
export function triggerCustomEvent(ctx: Ctx, phaseNumber: number, defId: string, targetAllianceId: string | null) {
  const st = ctx.state;
  const d = (st.customEvents ?? []).find((x) => x.id === defId);
  if (!d) fail('Eigenes Ereignis nicht gefunden');
  if (targetAllianceId && !st.alliances.some((a) => a.id === targetAllianceId)) fail('Unbekannte Allianz');
  addCustomRecord(ctx, phaseNumber, d, targetAllianceId ?? resolveDefTarget(st, d.target), 'ausgelöst');
}

function resolveAlliances(st: CampaignState, ref: AllianceRef, target: string | null): string[] {
  switch (ref) {
    case 'ALL':
      return st.alliances.map((a) => a.id);
    case 'TARGET':
      if (!target) fail('Ziel-Allianz wählen');
      return [target];
    case 'OTHERS':
      if (!target) fail('Ziel-Allianz wählen');
      return st.alliances.filter((a) => a.id !== target).map((a) => a.id);
    case 'LEADER':
    case 'TRAILING':
      return pointsExtremes(st, ref as 'LEADER' | 'TRAILING');
    default:
      if (!st.alliances.some((a) => a.id === ref)) fail('Unbekannte Allianz in einem Baustein');
      return [ref];
  }
}

function resolvePlanets(st: CampaignState, ref: PlanetRef, allianceId: string | null, chosen: string | undefined): string[] {
  switch (ref) {
    case 'ALL':
      return st.planets.filter((p) => !p.destroyed).map((p) => p.id);
    case 'CHOSEN':
      if (!chosen) fail('Planeten wählen');
      planet(st, chosen);
      return [chosen];
    case 'STRONGHOLD': {
      const sh = allianceId ? strongholdPlanet(st, allianceId) : null;
      return sh ? [sh] : [];
    }
    default:
      planet(st, ref);
      return [ref];
  }
}

/** Daten beim Anwenden eines eigenen Ereignisses */
export interface CustomApplyData {
  targetAllianceId?: string;
  planetId?: string;
}

/** Wendet die Bausteine eines eigenen Ereignisses an (aus applyEvent) */
export function applyCustomEvent(ctx: Ctx, e: EventRecord, data: CustomApplyData) {
  const st = ctx.state;
  const c = e.custom;
  if (!c) fail('Eigenes Ereignis ohne Bausteine');
  const target = data.targetAllianceId || e.allianceId || null;
  if (target && !st.alliances.some((a) => a.id === target)) fail('Unbekannte Allianz');
  if (needsTarget(c.effects) && !target) fail('Ziel-Allianz wählen');
  if (needsPlanet(c.effects) && !data.planetId) fail('Planeten wählen');
  e.allianceId = target;
  const why = c.name;
  for (const ef of c.effects) {
    switch (ef.kind) {
      case 'PL':
        for (const a of resolveAlliances(st, ef.alliance, target))
          for (const p of resolvePlanets(st, ef.planet, a, data.planetId)) {
            if (ef.delta > 0) increase(ctx, a, p, ef.delta, why);
            else decrease(ctx, a, p, -ef.delta, why);
          }
        break;
      case 'INFRA_DESTROY':
        for (const a of resolveAlliances(st, ef.alliance, target))
          for (const p of resolvePlanets(st, ef.planet, a, data.planetId)) {
            const slots = planet(st, p)
              .slots.map((s, i) => ({ s, i }))
              .filter(({ s }) => !s.destroyed && s.infra?.allianceId === a && s.infra.type !== 'STRONGHOLD');
            if (!slots.length) log(ctx, `${why}: keine Infrastruktur von ${allianceName(st, a)} auf ${planetName(p)}`);
            for (const { i } of slots) destroyInfra(ctx, p, i, why);
          }
        break;
      case 'INFRA_BUILD':
        for (const a of resolveAlliances(st, ef.alliance, target))
          for (const p of resolvePlanets(st, ef.planet, a, data.planetId)) {
            const err = canBuild(st, a, ef.infra, p);
            if (err) log(ctx, `${why}: Bau entfällt – ${err}`);
            else build(ctx, a, ef.infra, p, { why });
          }
        break;
      case 'MOVE':
        for (const a of resolveAlliances(st, ef.alliance, target)) {
          const to = resolvePlanets(st, ef.planet, a, data.planetId)[0];
          if (!to) {
            log(ctx, `${why}: kein Zielplanet für ${allianceName(st, a)}`);
            continue;
          }
          if (planet(st, to).destroyed) fail(`${planetName(to)} ist zerstört`);
          for (const f of st.fleets.filter((x) => x.allianceId === a && !x.reserve && x.planetId && x.planetId !== to)) {
            f.planetId = to;
            log(ctx, `${f.name} wird nach ${planetName(to)} versetzt (${why})`);
          }
        }
        break;
      case 'POINTS':
        for (const a of resolveAlliances(st, ef.alliance, target)) {
          st.pointsBonus = [...(st.pointsBonus ?? []), { id: ctx.newId('bonus'), allianceId: a, points: ef.delta, source: e.id, phaseNumber: e.phaseNumber }];
          log(ctx, `${allianceName(st, a)}: ${ef.delta > 0 ? '+' : '−'}${Math.abs(ef.delta)} Kampagnenpunkte (${why})`);
        }
        break;
      case 'MODIFIER': {
        const als = ALLIANCE_MODIFIERS.has(ef.modifier) ? resolveAlliances(st, ef.alliance ?? 'TARGET', target) : [null];
        for (const a of als) {
          st.modifiers.push({ id: ctx.newId('mod'), source: e.id, kind: ef.modifier, phaseNumber: e.phaseNumber + 1, allianceId: a });
          log(ctx, `Phase ${e.phaseNumber + 1}: ${MODIFIER_LABEL[ef.modifier]}${a ? ` (${allianceName(st, a)})` : ''} (${why})`);
        }
        break;
      }
    }
  }
}
