import { EVENTS, INFRA, type EventCode, type InfraType } from './data/vespator';
import { planetIds } from './map';
import { house } from './houseRules';
import { fail, log, orderByValue, randomPick, roll, rollD33, warn, type Ctx } from './ctx';
import { allianceName, build, campaignPoints, canBuild, decrease, destroyInfra, destroyLocation, fleetsAt, pl, planet, planetName, removeInfra, setPL, strongholdPlanet } from './board';
import { adjacent, connectedFor } from './graph';
import { curPhase } from './phase';
import { allianceOf, playersOfAlliance, setMembership } from './players';
import { mayBuild } from './playerActions';
import type { CampaignState, EventInput, EventRecord, EventRecordCode } from './types';
import { addCustomRecord, addScheduledCustomEvents, applyCustomEvent, eventName, replacementFor } from './customEvents';

function requireResults(ctx: Ctx) {
  const s = ctx.state.stage;
  if (s.kind !== 'PHASE' || s.step !== 'RESULTS') fail('Events nur in Schritt 3');
}

export function dominating(points: Record<string, number>): string | null {
  const ids = Object.keys(points);
  for (const a of ids) if (ids.every((b) => b === a || points[a] > points[b] + 5)) return a;
  return null;
}

export function trailing(points: Record<string, number>): string | null {
  const ids = Object.keys(points);
  for (const a of ids) if (ids.every((b) => b === a || points[a] < points[b] - 5)) return a;
  return null;
}

function addEvent(ctx: Ctx, code: EventCode, allianceId: string | null): EventRecord {
  const ph = curPhase(ctx);
  // D2: Tabelle erweitern – ein eigenes Ereignis ersetzt diesen Eintrag
  const rep = replacementFor(ctx.state, code);
  if (rep) return addCustomRecord(ctx, ph.number, rep, allianceId, `statt ${EVENTS[code].name}`);
  const e: EventRecord = { id: ctx.newId('event'), phaseNumber: ph.number, category: EVENTS[code].category, code, allianceId, status: 'PENDING', data: {}, applied: [] };
  ctx.state.events.push(e);
  log(ctx, `Event: ${EVENTS[code].name}${allianceId ? ` (${allianceName(ctx.state, allianceId)})` : ''}`);
  return e;
}

export function generateEvents(ctx: Ctx) {
  requireResults(ctx);
  const ph = curPhase(ctx);
  const st = ctx.state;
  if (!ph.flags.scored) fail('Erst Punkte berechnen');
  if (ph.flags.eventsGenerated) fail('Events wurden bereits generiert');
  if (ph.number >= st.meta.phaseCount) fail('In der letzten Phase gibt es keine Events');
  const t = st.toggles.events;
  const pts = st.pointsHistory.find((p) => p.phaseNumber === ph.number)!.points;
  const dis = new Set(t.disabled);
  const dom = dominating(pts);
  // A6 (Hausregel): Handicap-Events ohne W6-Test – bei erfüllter Bedingung treten sie immer ein
  const noTest = house(st, 'A6_HANDICAP_NO_TEST');
  if (t.perilsOfPower && dom) {
    if (noTest) log(ctx, `Perils of Power: ${allianceName(st, dom)} dominiert – ohne Würfeltest (Hausregel A6)`);
    const r = noTest ? 6 : roll(ctx, 'D6', `Perils of Power? (${allianceName(st, dom)} dominiert, 4+)`);
    if (r >= 4) {
      const code = pickCode(ctx, 'PP', dis, 'Perils of Power');
      if (code) addEvent(ctx, code, dom);
    }
  }
  const trail = trailing(pts);
  if (t.desperateMeasures && trail) {
    if (noTest) log(ctx, `Desperate Measures: ${allianceName(st, trail)} liegt zurück – ohne Würfeltest (Hausregel A6)`);
    const r = noTest ? 6 : roll(ctx, 'D6', `Desperate Measures? (${allianceName(st, trail)} liegt zurück, 4+)`);
    if (r >= 4) {
      const code = pickCode(ctx, 'DM', dis, 'Desperate Measures');
      if (code) addEvent(ctx, code, trail);
    }
  }
  if (t.fortunesOfWar) {
    const bonus = ph.number >= 4 ? 1 : 0;
    const r = roll(ctx, 'D6', `Fortunes of War? (4+${bonus ? ', +1 ab Phase 4' : ''})`, bonus);
    if (r >= 4) {
      // zulässige Events vorab bestimmen: ohne zulässiges Event wird gar nicht erst gewürfelt
      const fw = [11, 12, 13, 21, 22, 23, 31, 32, 33].map((v) => `FW_${v}` as EventCode);
      const eligible = fw.filter((c) => !dis.has(c) && !(c === 'FW_33' && st.stellarStormsUsed));
      if (!eligible.length) log(ctx, 'Kein zulässiges Fortunes-of-War-Event');
      else {
        let code: EventCode | null = null;
        // Regel: neu würfeln, bis ein zulässiges Event fällt; die Obergrenze greift nur als Sicherung
        for (let i = 0; i < REROLL_LIMIT && !code; i++) {
          const c = `FW_${rollD33(ctx, 'Fortunes of War (W33)')}` as EventCode;
          if (eligible.includes(c)) code = c;
          else if (c === 'FW_33' && st.stellarStormsUsed && !dis.has(c)) log(ctx, 'Stellar Storms hat bereits stattgefunden – neu würfeln');
          else log(ctx, `${EVENTS[c].name} ist deaktiviert – neu würfeln`);
        }
        addEvent(ctx, code ?? eligible[0], null);
      }
    }
  }
  // D2: eingeplante eigene Ereignisse dieser Phase
  addScheduledCustomEvents(ctx, ph.number);
  ph.flags.eventsGenerated = true;
  if (!st.events.some((e) => e.phaseNumber === ph.number)) log(ctx, 'Keine Events in dieser Phase');
}

/** Sicherung gegen endloses Neuwürfeln (bei mindestens einem zulässigen Ergebnis praktisch unerreichbar) */
const REROLL_LIMIT = 500;

function pickCode(ctx: Ctx, prefix: 'PP' | 'DM', dis: Set<EventCode>, label: string): EventCode | null {
  const eligible = [1, 2, 3].map((i) => `${prefix}_${i}` as EventCode).filter((c) => !dis.has(c));
  if (!eligible.length) {
    log(ctx, `Kein zulässiges Event für ${label}`);
    return null;
  }
  for (let i = 0; i < REROLL_LIMIT; i++) {
    const v = roll(ctx, 'D3', `${label} (W3)`);
    const c = `${prefix}_${v}` as EventCode;
    if (eligible.includes(c)) return c;
    log(ctx, `${EVENTS[c].name} ist deaktiviert – neu würfeln`);
  }
  return eligible[0];
}

/** Kandidaten für Cult Uprisings */
export function cultCandidates(ctx: Ctx | { state: Ctx['state'] }, dom: string): string[] {
  const st = ctx.state;
  const sh = strongholdPlanet(st, dom);
  const cands = st.planets.filter((p) => !p.destroyed && p.id !== sh);
  const max = Math.max(...cands.map((p) => p.power[dom] ?? 0));
  return cands.filter((p) => (p.power[dom] ?? 0) === max).map((p) => p.id);
}

/** Archeotech: drei Planeten mit der niedrigsten Gesamt-PL-Summe (ohne zerstörte) */
export function archeotechCandidates(ctx: Ctx | { state: Ctx['state'] }): { sure: string[]; tied: string[]; need: number } {
  const st = ctx.state;
  const sums = st.planets.filter((p) => !p.destroyed).map((p) => ({ id: p.id, s: Object.values(p.power).reduce((a, b) => a + b, 0) }));
  sums.sort((a, b) => a.s - b.s);
  if (sums.length <= 3) return { sure: sums.map((x) => x.id), tied: [], need: 0 };
  const border = sums[2].s;
  const sure = sums.filter((x) => x.s < border).map((x) => x.id);
  const tied = sums.filter((x) => x.s === border).map((x) => x.id);
  return { sure, tied, need: 3 - sure.length };
}

function pointsOrder(ctx: Ctx, label: string): string[] {
  const st = ctx.state;
  return orderByValue(
    ctx,
    st.alliances.map((a) => a.id),
    (a) => campaignPoints(st, a),
    label,
    (a) => allianceName(st, a),
  );
}

function addModifier(ctx: Ctx, e: EventRecord, kind: import('./types').ModifierKind, extra: { allianceId?: string | null; planetIds?: string[] } = {}) {
  ctx.state.modifiers.push({ id: ctx.newId('mod'), source: e.id, kind, phaseNumber: e.phaseNumber + 1, allianceId: extra.allianceId ?? null, planetIds: extra.planetIds });
}

export interface EventData {
  builds?: Record<string, { type: InfraType; planetId: string } | null>;
  moves?: Record<string, string | null>;
  stronghold?: Record<string, string | null>;
  planetIds?: string[];
  positions?: Record<string, string>;
  defections?: Record<string, string>;
  fleetAssignments?: Record<string, string>;
  planetId?: string;
  opponentId?: string;
  relocations?: { fromPlanetId: string; slot: number; toPlanetId: string }[];
  extra?: { type: InfraType; planetId: string } | null;
  /** eigenes Ereignis (D2): Ziel-Allianz, falls nicht schon beim Auslösen festgelegt */
  targetAllianceId?: string;
}

// ─── Spielereingaben zu Events (verdeckt, Übernahme durch den Spielleiter) ─────

/** Was ein Spieler zu einem offenen Event eintragen darf (leer = nichts) */
export interface EventInputRights {
  /** Lull in the Fighting: Allianzen, für die der Spieler baut (Anführer) */
  builds: string[];
  /** Lull in the Fighting: Flotten, die der Spieler zieht (Kommandant oder Anführer) */
  moves: string[];
  /** Tides of War: Allianzen, deren Stronghold der Spieler verlegt (Anführer) */
  stronghold: string[];
  /** Xenobeast Migration: Flotten, für die der Spieler verdeckt einen Planeten wählt */
  positions: string[];
  /** Machinations of Fate: eigener Überläuferwunsch */
  defection: boolean;
  /** A Costly Bargain: Planet und gegnerische Allianz (Anführer der zurückliegenden Allianz) */
  bargain: boolean;
  /** Smuggled Assets: Umzüge und Zusatzbau (Anführer der zurückliegenden Allianz) */
  smuggled: boolean;
  /** Archeotech Riches bei Gleichstand an der Grenze (NTH2 2.3): Anführer der Allianz mit den wenigsten Kampagnenpunkten */
  archeotech: boolean;
  /** Cult Uprisings bei mehreren Kandidaten (NTH2 2.3): Anführer der schwächsten übrigen Allianz */
  cult: boolean;
}

const NO_RIGHTS: EventInputRights = { builds: [], moves: [], stronghold: [], positions: [], defection: false, bargain: false, smuggled: false, archeotech: false, cult: false };

/**
 * Wer bei Archeotech-Gleichstand bzw. Cult Uprisings wählt (NTH2 2.3): die Allianz mit den wenigsten
 * Kampagnenpunkten (ohne `exclude`) – nur wenn eindeutig, sonst entscheidet der Warmaster.
 */
export function weakestAlliance(st: CampaignState, exclude: string | null = null): string | null {
  const pts = st.alliances.filter((a) => a.id !== exclude).map((a) => ({ id: a.id, p: campaignPoints(st, a.id) }));
  if (!pts.length) return null;
  const min = Math.min(...pts.map((x) => x.p));
  const low = pts.filter((x) => x.p === min);
  return low.length === 1 ? low[0].id : null;
}

/** Rechte eines Spielers für ein offenes Event (N1-Erweiterung): Anführer entscheiden für die Allianz, Kommandanten für ihre Flotten */
export function eventInputRights(st: CampaignState, eventId: string, playerId: string): EventInputRights {
  const e = st.events.find((x) => x.id === eventId);
  const p = st.players.find((x) => x.id === playerId);
  if (!e || e.status !== 'PENDING' || !p?.active || st.stage.kind !== 'PHASE' || st.stage.step !== 'RESULTS' || st.stage.phase !== e.phaseNumber) return { ...NO_RIGHTS };
  const n = e.phaseNumber;
  const al = allianceOf(p, n);
  if (!al) return { ...NO_RIGHTS };
  const leader = mayBuild(st, al, playerId);
  const ownFleets = st.fleets.filter((f) => f.allianceId === al && !f.reserve && f.planetId && (leader || f.commanders[String(n)] === playerId)).map((f) => f.id);
  const r: EventInputRights = { ...NO_RIGHTS, builds: [], moves: [], stronghold: [], positions: [] };
  switch (e.code) {
    case 'FW_11':
      if (leader) r.builds = [al];
      r.moves = ownFleets;
      break;
    case 'FW_13':
      if (leader && strongholdPlanet(st, al)) r.stronghold = [al];
      break;
    case 'FW_31':
      r.positions = ownFleets;
      break;
    case 'FW_32':
      r.defection = true;
      break;
    case 'DM_1':
      r.bargain = leader && al === e.allianceId;
      break;
    case 'DM_3':
      r.smuggled = leader && al === e.allianceId;
      break;
    case 'FW_22':
      r.archeotech = leader && archeotechCandidates({ state: st }).need > 0 && weakestAlliance(st) === al;
      break;
    case 'PP_1':
      // gegen die dominierende Allianz: die schwächste der übrigen Allianzen wählt den Ort des Aufstands
      r.cult = leader && !!e.allianceId && cultCandidates({ state: st }, e.allianceId).length > 1 && weakestAlliance(st, e.allianceId) === al;
      break;
  }
  return r;
}

const RECORD_KEYS = ['builds', 'moves', 'stronghold', 'positions', 'defections'] as const;

/** Alle Spielereingaben eines Events zusammengeführt (spätere überschreiben frühere) – Vorbelegung für den Spielleiter */
export function mergedEventInput(e: EventRecord): EventData {
  const out: EventData = {};
  for (const i of [...(e.inputs ?? [])].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))) {
    for (const [k, v] of Object.entries(i.data) as [keyof EventData, unknown][]) {
      if ((RECORD_KEYS as readonly string[]).includes(k)) (out as Record<string, unknown>)[k] = { ...((out[k] as object) ?? {}), ...(v as object) };
      else (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

/**
 * Spielereingabe zu einem offenen Event (EVENT_INPUT): verdeckt gespeichert, wirksam erst mit „Event anwenden“
 * durch den Spielleiter. Eine neue Eingabe desselben Spielers ersetzt seine vorige Wahl je Schlüssel.
 */
export function submitEventInput(ctx: Ctx, eventId: string, playerId: string, data: EventData) {
  requireResults(ctx);
  const st = ctx.state;
  const e = st.events.find((x) => x.id === eventId);
  if (!e) fail('Event nicht gefunden');
  if (e.status === 'APPLIED') fail('Event bereits angewendet');
  const p = st.players.find((x) => x.id === playerId);
  if (!p) fail('Spieler nicht gefunden');
  const r = eventInputRights(st, eventId, playerId);
  const n = e.phaseNumber;
  const deny = () => fail('Diese Entscheidung trifft ein anderer Spieler oder der Spielleiter');
  const clean: EventData = {};
  for (const [a, b] of Object.entries(data.builds ?? {})) {
    if (!r.builds.includes(a)) deny();
    if (b) {
      if (b.type === 'STRONGHOLD') fail('Kein Stronghold');
      const err = canBuild(st, a, b.type, b.planetId);
      if (err) fail(`${allianceName(st, a)}: ${err}`);
    }
    (clean.builds ??= {})[a] = b ?? null;
  }
  for (const [fid, to] of Object.entries(data.moves ?? {})) {
    if (!r.moves.includes(fid)) deny();
    const f = st.fleets.find((x) => x.id === fid)!;
    if (to && !connectedFor(st, f.allianceId, f.planetId!, to, n, 'move')) fail(`${f.name}: ${planetName(to)} ist nicht verbunden`);
    (clean.moves ??= {})[fid] = to ?? null;
  }
  for (const [a, to] of Object.entries(data.stronghold ?? {})) {
    if (!r.stronghold.includes(a)) deny();
    if (to && to === strongholdPlanet(st, a)) fail('Anderen Planeten wählen');
    if (to) planet(st, to);
    (clean.stronghold ??= {})[a] = to ?? null;
  }
  for (const [fid, to] of Object.entries(data.positions ?? {})) {
    if (!r.positions.includes(fid)) deny();
    const f = st.fleets.find((x) => x.id === fid)!;
    planet(st, to);
    if (to === f.planetId || adjacent(to, f.planetId!)) fail(`${f.name}: ${planetName(to)} ist gleich oder verbunden`);
    (clean.positions ??= {})[fid] = to;
  }
  for (const [pid, aid] of Object.entries(data.defections ?? {})) {
    if (!r.defection || pid !== playerId) deny();
    // leerer Wert = Wunsch zurückziehen
    if (aid) {
      if (!st.alliances.some((a) => a.id === aid)) fail('Unbekannte Allianz');
      if (aid === allianceOf(p, n)) fail('Das ist bereits deine Allianz');
    }
    (clean.defections ??= {})[pid] = aid ?? '';
  }
  if (e.code === 'FW_22' && data.planetIds !== undefined) {
    if (!r.archeotech) deny();
    const c = archeotechCandidates({ state: st });
    const extra = data.planetIds.filter((x) => !c.sure.includes(x));
    if (extra.length !== c.need || extra.some((x) => !c.tied.includes(x))) fail(`Genau ${c.need} der gleichauf liegenden Planeten wählen`);
    clean.planetIds = extra;
  } else if (e.code === 'PP_1' && data.planetId !== undefined) {
    if (!r.cult) deny();
    const cands = cultCandidates({ state: st }, e.allianceId!);
    if (!cands.includes(data.planetId)) fail(`Planeten wählen: ${cands.map(planetName).join(', ')}`);
    clean.planetId = data.planetId;
  } else if (data.planetId !== undefined || data.opponentId !== undefined) {
    if (!r.bargain) deny();
    // Review: nur eine bestehende Allianz außer der zurückliegenden (sonst entstünde ein Phantom-PL-Eintrag)
    if (data.opponentId && (data.opponentId === e.allianceId || !st.alliances.some((a) => a.id === data.opponentId))) fail('Gegnerische Allianz wählen');
    if (data.planetId) planet(st, data.planetId);
    clean.planetId = data.planetId;
    clean.opponentId = data.opponentId;
  }
  if (data.relocations !== undefined || data.extra !== undefined) {
    if (!r.smuggled) deny();
    for (const x of data.relocations ?? []) {
      const s = planet(st, x.fromPlanetId).slots[x.slot];
      if (!s?.infra || s.infra.allianceId !== e.allianceId || s.destroyed) fail('Nur eigene Infrastruktur verlegen');
      if (x.toPlanetId === x.fromPlanetId) fail('Anderen Planeten wählen');
      if (s.infra.type === 'STRONGHOLD' && house(st, 'F13_STRONGHOLD_FIXED')) fail('Hausregel (F-13): Der Stronghold darf nicht umziehen');
      if (planet(st, x.toPlanetId).destroyed) fail(`${planetName(x.toPlanetId)} ist zerstört`);
    }
    if (data.extra?.type === 'STRONGHOLD') fail('Zusatzbau: kein Stronghold');
    if (data.extra) {
      const err = canBuild(st, e.allianceId!, data.extra.type, data.extra.planetId);
      if (err) fail(err);
    }
    if (data.relocations !== undefined) clean.relocations = data.relocations;
    if (data.extra !== undefined) clean.extra = data.extra;
  }
  if (!Object.keys(clean).length) fail('Keine Eingabe');
  const prev = (e.inputs ?? []).find((x) => x.playerId === playerId);
  const merged: EventData = { ...(prev?.data ?? {}) };
  for (const [k, v] of Object.entries(clean) as [keyof EventData, unknown][]) {
    if ((RECORD_KEYS as readonly string[]).includes(k)) (merged as Record<string, unknown>)[k] = { ...((merged[k] as object) ?? {}), ...(v as object) };
    else (merged as Record<string, unknown>)[k] = v;
  }
  const entry: EventInput = { playerId, allianceId: allianceOf(p, n) ?? '', at: ctx.now, data: merged };
  e.inputs = [...(e.inputs ?? []).filter((x) => x.playerId !== playerId), entry];
  log(ctx, `Eingabe zu ${eventName(e)} von ${p.nickname} (verdeckt bis zur Anwendung)`);
}

/**
 * Machinations of Fate ([R] FW 32, F-21): Flotten bleiben bei der Allianz; der Warmaster verteilt die Spieler so,
 * dass jeder mindestens eine Flotte hat. Unbesetzte Flotten gehen an die verbleibenden Spieler. Geht das nicht auf
 * (mehr Spieler als Flotten), warnt die Engine – der Spielleiter entscheidet mit Begründung.
 */
function balanceDefections(ctx: Ctx, allianceIds: Set<string>, n: number, locked: Set<string>) {
  const st = ctx.state;
  const next = String(n + 1);
  for (const a of st.alliances.filter((x) => allianceIds.has(x.id))) {
    const players = playersOfAlliance(st, a.id, n + 1);
    const fleets = st.fleets.filter((f) => f.allianceId === a.id && !f.reserve);
    if (!players.length) {
      if (fleets.length) warn(ctx, `Machinations of Fate: ${a.name} hat ab Phase ${n + 1} keine Spieler mehr – ${fleets.length} Flotte(n) ohne Kommandant`);
      continue;
    }
    const isMember = (id: string | undefined) => !!id && players.some((p) => p.id === id);
    const cur = new Map<string, string | null>();
    for (const f of fleets) {
      const c = f.commanders[next] ?? f.commanders[String(n)];
      cur.set(f.id, isMember(c) ? c! : null);
    }
    const count = (pid: string) => [...cur.values()].filter((x) => x === pid).length;
    for (const p of players) {
      if (count(p.id) > 0) continue;
      const f = fleets.find((x) => cur.get(x.id) === null) ?? fleets.find((x) => !locked.has(x.id) && count(cur.get(x.id)!) > 1);
      if (!f) break;
      cur.set(f.id, p.id);
    }
    for (const f of fleets) {
      if (cur.get(f.id) !== null) continue;
      const least = [...players].sort((x, y) => count(x.id) - count(y.id))[0];
      cur.set(f.id, least.id);
    }
    for (const f of fleets) {
      const pid = cur.get(f.id)!;
      if (f.commanders[next] === pid) continue;
      f.commanders[next] = pid;
      log(ctx, `${f.name}: Kommandant ab Phase ${n + 1} = ${st.players.find((p) => p.id === pid)?.nickname ?? '?'} (Machinations of Fate)`);
    }
    const without = players.filter((p) => count(p.id) === 0);
    if (without.length) {
      warn(ctx, `Machinations of Fate: ${without.map((p) => p.nickname).join(', ')} ohne Flotte in ${a.name} (${players.length} Spieler, ${fleets.length} Flotte(n)) – nicht jeder Wechsel ist möglich`);
    }
  }
}

export function applyEvent(ctx: Ctx, eventId: string, data: EventData) {
  requireResults(ctx);
  const st = ctx.state;
  const e = st.events.find((x) => x.id === eventId);
  if (!e) fail('Event nicht gefunden');
  if (e.status === 'APPLIED') fail('Event bereits angewendet');
  // Verdeckte Spielereingaben (EVENT_INPUT) sind die Vorbelegung: Die Angaben des Spielleiters gehen je Eintrag vor
  // (z. B. Überläuferwunsch mit leerem Wert ablehnen), fehlende Schlüssel kommen aus den Eingaben
  const inputs = mergedEventInput(e);
  data = { ...data };
  for (const k of Object.keys(inputs) as (keyof EventData)[]) {
    if ((RECORD_KEYS as readonly string[]).includes(k)) (data as Record<string, unknown>)[k] = { ...(inputs[k] as object), ...((data[k] as object | undefined) ?? {}) };
    else if (data[k] === undefined) (data as Record<string, unknown>)[k] = inputs[k];
  }
  const before = ctx.log.length;
  const n = e.phaseNumber;
  const al = e.allianceId!;
  switch (e.code) {
    case 'FW_11': {
      const order = pointsOrder(ctx, 'Lull in the Fighting');
      for (const a of order) {
        const b = data.builds?.[a];
        if (b) {
          if (b.type === 'STRONGHOLD') fail('Kein Stronghold');
          const err = canBuild(st, a, b.type, b.planetId);
          if (err) fail(`${allianceName(st, a)}: ${err}`);
          build(ctx, a, b.type, b.planetId, { why: 'Lull in the Fighting' });
        }
        for (const f of st.fleets.filter((x) => x.allianceId === a)) {
          const to = data.moves?.[f.id];
          if (!to) continue;
          if (!f.planetId || !connectedFor(st, a, f.planetId, to, n, 'move')) fail(`${f.name}: ${planetName(to)} ist nicht verbunden`);
          f.planetId = to;
          log(ctx, `${f.name} zieht nach ${planetName(to)} (Lull in the Fighting)`);
        }
      }
      break;
    }
    case 'FW_12':
      addModifier(ctx, e, 'NO_VOID_LEAP');
      addModifier(ctx, e, 'SUPPORT_FACILITIES_INACTIVE');
      log(ctx, `Phase ${n + 1}: kein Void Leap, Support Facilities inaktiv`);
      break;
    case 'FW_13': {
      const order = pointsOrder(ctx, 'Tides of War');
      for (const a of order) {
        const to = data.stronghold?.[a];
        if (!to) continue;
        const from = strongholdPlanet(st, a);
        if (!from) fail(`${allianceName(st, a)} hat keinen intakten Stronghold`);
        if (from === to) fail('Anderen Planeten wählen');
        const slot = planet(st, from).slots.findIndex((s) => s.infra?.type === 'STRONGHOLD' && s.infra.allianceId === a);
        removeInfra(ctx, from, slot, 'Tides of War');
        const err = canBuild(st, a, 'STRONGHOLD', to, { allowStronghold: true });
        if (err) fail(`${allianceName(st, a)}: ${err}`);
        build(ctx, a, 'STRONGHOLD', to, { allowStronghold: true, why: 'Tides of War' });
      }
      break;
    }
    case 'FW_21':
      addModifier(ctx, e, 'NO_LOGISTICAL_AUXILIA');
      addModifier(ctx, e, 'RANDOM_THEATRE');
      log(ctx, `Phase ${n + 1}: kein Logistical Auxilia, zufällige Theatres`);
      break;
    case 'FW_22': {
      const c = archeotechCandidates(ctx);
      let chosen = [...c.sure];
      if (c.need > 0) {
        if (data.planetIds?.length) {
          const extra = data.planetIds.filter((p) => !c.sure.includes(p));
          if (extra.length !== c.need || extra.some((p) => !c.tied.includes(p))) fail(`Genau ${c.need} der gleichauf liegenden Planeten wählen`);
          chosen.push(...extra);
        } else {
          chosen.push(...randomPick(ctx, c.tied, c.need, 'Archeotech-Planeten', planetName));
        }
      }
      chosen = chosen.slice(0, 3);
      addModifier(ctx, e, 'ARCHEOTECH', { planetIds: chosen });
      e.data.planetIds = chosen;
      data.planetIds = chosen;
      log(ctx, `Archeotech Riches auf ${chosen.map(planetName).join(', ')}`);
      break;
    }
    case 'FW_23':
      for (const p of st.planets) for (const a of st.alliances) decrease(ctx, a.id, p.id, 1, 'Starvation and Disease');
      break;
    case 'FW_31': {
      const pos = data.positions ?? {};
      for (const f of st.fleets) {
        const to = pos[f.id];
        if (!f.planetId) continue;
        if (!to) fail(`${f.name}: neuen Planeten wählen`);
        planet(st, to);
        if (to === f.planetId || adjacent(to, f.planetId)) fail(`${f.name}: ${planetName(to)} ist gleich oder verbunden`);
      }
      for (const f of st.fleets) {
        if (!f.planetId) continue;
        f.planetId = pos[f.id];
        log(ctx, `${f.name} weicht nach ${planetName(f.planetId)} aus (Xenobeast Migration)`);
      }
      break;
    }
    case 'FW_32': {
      const def = data.defections ?? {};
      const affected = new Set<string>();
      for (const [pid, aid] of Object.entries(def)) {
        if (!aid) continue;
        const p = st.players.find((x) => x.id === pid);
        if (!p) fail('Unbekannter Spieler');
        if (!st.alliances.some((a) => a.id === aid)) fail('Unbekannte Allianz');
        const from = allianceOf(p, n);
        if (from === aid) continue;
        if (from) affected.add(from);
        affected.add(aid);
        setMembership(p, aid, n + 1);
        log(ctx, `${p.nickname} läuft zu ${allianceName(st, aid)} über (ab Phase ${n + 1})`);
      }
      const locked = new Set<string>();
      for (const [fid, pid] of Object.entries(data.fleetAssignments ?? {})) {
        const f = st.fleets.find((x) => x.id === fid);
        if (!f) fail('Unbekannte Flotte');
        if (!playersOfAlliance(st, f.allianceId, n + 1).some((p) => p.id === pid)) fail(`${f.name}: Spieler gehört ab Phase ${n + 1} nicht zur Allianz`);
        f.commanders[String(n + 1)] = pid;
        locked.add(fid);
        affected.add(f.allianceId);
      }
      // Nur betroffene Allianzen neu verteilen – ohne Überläufer gibt es nichts zu prüfen
      balanceDefections(ctx, affected, n, locked);
      break;
    }
    case 'FW_33': {
      st.stellarStormsUsed = true;
      for (const p of st.planets) {
        const intact = p.slots.map((s, i) => ({ s, i })).filter(({ s }) => !s.destroyed);
        if (intact.length !== 1) continue;
        const r = roll(ctx, 'D6', `Stellar Storms ${planetName(p.id)}`);
        if (r >= 4) {
          log(ctx, `${planetName(p.id)} wird vom Sturm getroffen (${r})`);
          destroyLocation(ctx, p.id, intact[0].i, 'Stellar Storms');
        }
        else log(ctx, `${planetName(p.id)} übersteht den Sturm (${r})`);
      }
      break;
    }
    case 'PP_1': {
      const cands = cultCandidates(ctx, al);
      const pid = data.planetId ?? (cands.length === 1 ? cands[0] : undefined);
      if (!pid || !cands.includes(pid)) fail(`Planeten wählen: ${cands.map(planetName).join(', ')}`);
      const p = planet(st, pid);
      const pieces = p.slots.map((s, i) => ({ s, i })).filter(({ s }) => !s.destroyed && s.infra);
      for (const { i } of pieces) {
        const r = roll(ctx, 'D6', `Cult Uprisings ${planetName(pid)} Location ${i + 1}`);
        if (r === 6) destroyLocation(ctx, pid, i, 'Cult Uprisings');
        else if (r >= 3) destroyInfra(ctx, pid, i, 'Cult Uprisings');
        else log(ctx, `Cult Uprisings: Location ${i + 1} bleibt verschont (${r})`);
      }
      if (!p.destroyed) {
        const levels = pl(st, al, pid);
        const fleetMod = fleetsAt(st, pid, al).length ? -1 : 0;
        for (let k = 0; k < levels; k++) {
          const r = roll(ctx, 'D6', `Cult Uprisings PL-Wurf ${k + 1}/${levels}${fleetMod ? ' (−1 Flotte)' : ''}`, fleetMod);
          if (r >= 4) decrease(ctx, al, pid, 1, 'Cult Uprisings');
          else log(ctx, `Cult Uprisings: PL-Wurf ${k + 1} ohne Wirkung (${r})`);
        }
      }
      e.data.planetId = pid;
      break;
    }
    case 'PP_2':
      addModifier(ctx, e, 'COORDINATED_OPPOSITION', { allianceId: al });
      break;
    case 'PP_3':
      addModifier(ctx, e, 'OPEN_TOME', { allianceId: al });
      break;
    case 'DM_1': {
      if (!data.planetId || !data.opponentId) fail('Planet und gegnerische Allianz wählen');
      if (data.opponentId === al || !st.alliances.some((a) => a.id === data.opponentId)) fail('Gegnerische Allianz wählen');
      const pl0 = planet(st, data.planetId);
      if (pl0.destroyed) fail('Planet ist zerstört');
      if (pl0.slots.some((s) => !s.destroyed && s.infra?.type === 'STRONGHOLD' && s.infra.allianceId !== al)) fail('Planet mit gegnerischem Stronghold ausgeschlossen');
      const mine = pl(st, al, data.planetId);
      const theirs = pl(st, data.opponentId, data.planetId);
      setPL(ctx, al, data.planetId, theirs, 'A Costly Bargain');
      setPL(ctx, data.opponentId, data.planetId, mine, 'A Costly Bargain');
      break;
    }
    case 'DM_2':
      addModifier(ctx, e, 'DEFIANT_ZEAL', { allianceId: al });
      break;
    case 'CUSTOM':
      applyCustomEvent(ctx, e, { targetAllianceId: data.targetAllianceId, planetId: data.planetId });
      break;
    case 'DM_3': {
      for (const r of data.relocations ?? []) {
        const s = planet(st, r.fromPlanetId).slots[r.slot];
        if (!s?.infra || s.infra.allianceId !== al || s.destroyed) fail('Nur eigene Infrastruktur verlegen');
        if (r.toPlanetId === r.fromPlanetId) fail('Anderen Planeten wählen');
        if (s.infra.type === 'STRONGHOLD' && house(st, 'F13_STRONGHOLD_FIXED')) fail('Hausregel (F-13): Der Stronghold darf nicht umziehen');
        const info = removeInfra(ctx, r.fromPlanetId, r.slot, 'Smuggled Assets');
        const err = canBuild(st, al, info.type, r.toPlanetId, { allowStronghold: true });
        if (err) fail(`${INFRA[info.type].name} → ${planetName(r.toPlanetId)}: ${err}`);
        build(ctx, al, info.type, r.toPlanetId, { allowStronghold: true, why: 'Smuggled Assets' });
      }
      if (data.extra) {
        if (data.extra.type === 'STRONGHOLD') fail('Zusatzbau: kein Stronghold');
        const err = canBuild(st, al, data.extra.type, data.extra.planetId);
        if (err) fail(err);
        build(ctx, al, data.extra.type, data.extra.planetId, { why: 'Smuggled Assets, Zusatzbau' });
      }
      break;
    }
  }
  e.status = 'APPLIED';
  e.data = { ...e.data, ...data };
  e.applied = ctx.log.slice(before);
}

export function deleteEvent(ctx: Ctx, eventId: string) {
  requireResults(ctx);
  const e = ctx.state.events.find((x) => x.id === eventId);
  if (!e) fail('Event nicht gefunden');
  if (e.status === 'APPLIED') fail('Angewendete Events nur per Undo entfernen');
  ctx.state.events = ctx.state.events.filter((x) => x.id !== eventId);
  log(ctx, `Event ${eventName(e)} verworfen (Override)`);
}

/**
 * Ereignis erzwingen (NTH2 2.2): nur in einer Szenario-Sandbox, als Override mit Begründung. Legt ein beliebiges
 * Regelbuch-Event oder ein eigenes Ereignis als offenen Eintrag der laufenden Phase an – ohne Würfeltest.
 */
export function forceEvent(ctx: Ctx, code: EventRecordCode, allianceId: string | null, customId?: string) {
  requireResults(ctx);
  const st = ctx.state;
  if (!st.meta.sandbox) fail('Ereignisse erzwingen geht nur in einer Szenario-Sandbox');
  const ph = curPhase(ctx);
  if (allianceId && !st.alliances.some((a) => a.id === allianceId)) fail('Unbekannte Allianz');
  let e: EventRecord;
  if (code === 'CUSTOM') {
    const d = (st.customEvents ?? []).find((x) => x.id === customId);
    if (!d) fail('Eigenes Ereignis nicht gefunden');
    e = addCustomRecord(ctx, ph.number, d, allianceId, 'erzwungen');
  } else {
    if (!(code in EVENTS)) fail('Unbekanntes Event');
    const cat = EVENTS[code].category;
    if (cat === 'PERILS' && !allianceId) fail('Dominierende Allianz wählen');
    if (cat === 'DESPERATE' && !allianceId) fail('Zurückliegende Allianz wählen');
    if (code === 'FW_33' && st.stellarStormsUsed) fail('Stellar Storms hat bereits stattgefunden');
    e = { id: ctx.newId('event'), phaseNumber: ph.number, category: cat, code, allianceId: cat === 'FORTUNES' ? null : allianceId, status: 'PENDING', data: {}, applied: [] };
    st.events.push(e);
  }
  e.forced = true;
  log(ctx, `Override: Event ${eventName(e)} erzwungen (Sandbox)${e.allianceId ? ` – ${allianceName(st, e.allianceId)}` : ''}`);
}

export function planetIdsAll(state: CampaignState) {
  return planetIds(state);
}
