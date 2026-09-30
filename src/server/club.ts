import 'server-only';
import crypto from 'node:crypto';
import { isIsoDate, neutralTime } from '@/engine/logTime';
import { db, getSetting, setSetting } from './db';
import { loadState } from './campaigns';
import { tableClashes, tableRelevant, type TableBooking } from '@/engine/p1';
import type { Command } from '@/engine/commands';
import type { CampaignState } from '@/engine/types';
import { planetName } from '@/engine/map';
import { battleKindName } from '@/components/battleName';
import type { T } from '@/i18n/core';

/**
 * Club-Kalender (NTH2 2.5): Spieltische bzw. Räume als Club-Einstellung, alle vereinbarten Termine aller
 * laufenden Kampagnen, Kollisionsprüfung je Tisch und ein Nur-Lese-.ics-Abo für den Club.
 */

export interface ClubTable {
  id: string;
  name: string;
}

export function clubTables(): ClubTable[] {
  try {
    const v = JSON.parse(getSetting('clubTables') ?? '[]') as ClubTable[];
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string') : [];
  } catch {
    return [];
  }
}

/** Tische speichern: Namen getrimmt, eindeutig, höchstens 40; neue Tische erhalten eine ID */
export function setClubTables(list: { id?: string; name: string }[]): ClubTable[] {
  const seen = new Set<string>();
  const out: ClubTable[] = [];
  for (const x of list.slice(0, 40)) {
    const name = String(x.name ?? '')
      .trim()
      .slice(0, 60);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const id = x.id && /^[\w-]{1,40}$/.test(x.id) ? x.id : crypto.randomBytes(6).toString('base64url');
    out.push({ id, name });
  }
  setSetting('clubTables', JSON.stringify(out));
  return out;
}

let running: { sig: string; list: { id: string; state: CampaignState }[] } | null = null;

/**
 * Laufende Kampagnen (nicht archiviert, keine Sandbox) mit aktuellem Stand. Zwischengespeichert, bis sich eine davon
 * ändert (F9: Tischauswahl und Terminprüfung laden sonst bei jedem Aufruf alle Zustände); die Zustände nicht verändern.
 */
function runningCampaigns(): { id: string; state: CampaignState }[] {
  const rows = db().prepare('SELECT id, current_rev FROM campaign WHERE archived = 0 AND sandbox_of IS NULL').all() as { id: string; current_rev: number }[];
  const sig = rows.map((r) => `${r.id}:${r.current_rev}`).join(',');
  if (running?.sig === sig) return running.list;
  const out: { id: string; state: CampaignState }[] = [];
  for (const r of rows) {
    try {
      out.push({ id: r.id, state: loadState(r.id, r.current_rev) });
    } catch {}
  }
  running = { sig, list: out };
  return out;
}

export function tableBookings(campaigns = runningCampaigns()): TableBooking[] {
  const out: TableBooking[] = [];
  // gespeicherte Altwerte (Zahl, ungültiges Datum) überspringen – eine kaputte Zeile darf die Belegung nie sprengen
  for (const c of campaigns) for (const b of c.state.battles) if (b.table && isIsoDate(b.scheduledAt) && tableRelevant(b)) out.push({ campaignId: c.id, battleId: b.id, tableId: b.table.id, at: b.scheduledAt });
  return out;
}

export interface CalendarEntry {
  campaignId: string;
  campaignName: string;
  battleId: string;
  phase: number;
  title: string;
  at: string;
  tableId: string | null;
  tableName: string | null;
  attacker: string;
  defender: string;
  players: string[];
  status: string;
  /** andere Schlachten am selben Tisch innerhalb von 3 h */
  clashes: { campaignId: string; battleId: string }[];
}

/** Alle vereinbarten Termine laufender Kampagnen, optional auf bestimmte Kampagnen beschränkt */
export function calendarEntries(t: T, only: string[] | 'ALL' = 'ALL'): CalendarEntry[] {
  const all = runningCampaigns();
  const bookings = tableBookings(all);
  const out: CalendarEntry[] = [];
  for (const c of all) {
    if (only !== 'ALL' && !only.includes(c.id)) continue;
    const st = c.state;
    const nick = (id: string) => st.players.find((p) => p.id === id)?.nickname ?? '?';
    const al = (id: string) => st.alliances.find((a) => a.id === id)?.name ?? '?';
    for (const b of st.battles) {
      if (!isIsoDate(b.scheduledAt) || !tableRelevant(b)) continue;
      out.push({
        campaignId: c.id,
        campaignName: st.meta.name,
        battleId: b.id,
        phase: b.phaseNumber,
        title: `${battleKindName(b, t)}${b.planetId ? ` · ${planetName(b.planetId)}` : ''}`,
        at: b.scheduledAt,
        tableId: b.table?.id ?? null,
        tableName: b.table?.name ?? null,
        attacker: al(b.attackerAllianceId),
        defender: al(b.defenderAllianceId),
        players: [...b.attackers, ...b.defenders].map((p) => nick(p.playerId)),
        status: b.status,
        clashes: b.table ? tableClashes(bookings, b.table.id, b.scheduledAt, { campaignId: c.id, battleId: b.id }).map((x) => ({ campaignId: x.campaignId, battleId: x.battleId })) : [],
      });
    }
  }
  return out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

/**
 * Kurzbeschreibung einer Buchung für Meldungen. Fremde Kampagnen bleiben verborgen (Spieler und Co-Warmaster sehen
 * nur „belegt“ mit der Uhrzeit); Schlachten der eigenen Kampagne werden mit Namen genannt.
 */
function describeBooking(x: TableBooking, t: T, own: { campaignId: string; state: CampaignState }): string {
  try {
    const tz = own.state.meta.timezone || 'Europe/Berlin';
    const when = neutralTime(x.at, tz);
    if (x.campaignId !== own.campaignId) return when;
    const b = own.state.battles.find((y) => y.id === x.battleId);
    return b ? `${battleKindName(b, t)}${b.planetId ? ` ${planetName(b.planetId)}` : ''} · ${when}` : when;
  } catch {
    return x.at;
  }
}

/**
 * Serverseitige Vorprüfung für BATTLE_TABLE_SET (die Engine kennt nur ihre eigene Kampagne): Tisch muss zu
 * den Club-Tischen gehören und darf zum Termin der Schlacht nicht schon belegt sein. Liefert eine Meldung
 * oder null. Sandboxes werden nicht geprüft.
 */
export function tableCommandError(campaignId: string, state: CampaignState, cmd: Command, t: T): string | null {
  if (cmd.type !== 'BATTLE_TABLE_SET' || !cmd.table || state.meta.sandbox) return null;
  const table = clubTables().find((x) => x.id === cmd.table!.id);
  if (!table) return 'Unbekannter Spieltisch';
  // der Name kommt immer aus der Club-Einstellung
  cmd.table.name = table.name;
  const b = state.battles.find((x) => x.id === cmd.battleId);
  if (!b?.scheduledAt) return null;
  const clash = tableClashes(tableBookings(), table.id, b.scheduledAt, { campaignId, battleId: b.id });
  if (!clash.length) return null;
  return `${table.name} ist zu dieser Zeit belegt: ${clash.map((x) => describeBooking(x, t, { campaignId, state })).join('; ')}`;
}

/**
 * Nachprüfung nach der Ausführung (QUALITY 4): Jede Schlacht mit Spieltisch, deren Termin oder Tisch der Command
 * geändert hat (Verschieben, Termin annehmen, Tischwahl), darf den Tisch nicht doppelt belegen – weder mit anderen
 * Kampagnen noch innerhalb der eigenen. Sandboxes werden nicht geprüft.
 */
export function tableStateError(campaignId: string, before: CampaignState, after: CampaignState, t: T): string | null {
  if (after.meta.sandbox) return null;
  const changed = after.battles.filter((b) => {
    if (!b.table || !b.scheduledAt || !tableRelevant(b)) return false;
    const old = before.battles.find((x) => x.id === b.id);
    return !old || old.scheduledAt !== b.scheduledAt || old.table?.id !== b.table.id || !tableRelevant(old);
  });
  if (!changed.length) return null;
  // Belegung: andere laufende Kampagnen aus der Datenbank, die eigene aus dem neuen Stand
  const others = tableBookings(runningCampaigns().filter((c) => c.id !== campaignId));
  const mine = tableBookings([{ id: campaignId, state: after }]);
  for (const b of changed) {
    const clash = tableClashes([...others, ...mine], b.table!.id, b.scheduledAt!, { campaignId, battleId: b.id });
    if (clash.length) return `${b.table!.name} ist zu dieser Zeit belegt: ${clash.map((x) => describeBooking(x, t, { campaignId, state: after })).join('; ')}`;
  }
  return null;
}

export interface TableOption {
  id: string;
  name: string;
  /** Belegung zum Termin der Schlacht (leer = frei) */
  busy: string[];
}

/** Tische mit Belegung zum Termin einer Schlacht (für die Auswahl beim Spieler und im Cockpit) */
export function tableOptions(campaignId: string, state: CampaignState, battleId: string, t: T): TableOption[] {
  const b = state.battles.find((x) => x.id === battleId);
  const bookings = tableBookings();
  return clubTables().map((tb) => ({
    ...tb,
    busy: b?.scheduledAt ? tableClashes(bookings, tb.id, b.scheduledAt, { campaignId, battleId }).map((x) => describeBooking(x, t, { campaignId, state })) : [],
  }));
}

// ─── .ics-Abo des Clubs ─────────────────────────────────────────────────────

function clubSecret(): string {
  const row = db().prepare("SELECT value FROM settings WHERE key = 'calendarSecret'").get() as { value: string } | undefined;
  if (row) return row.value;
  db().prepare("INSERT OR IGNORE INTO settings(key, value) VALUES('calendarSecret', ?)").run(crypto.randomBytes(32).toString('base64url'));
  return (db().prepare("SELECT value FROM settings WHERE key = 'calendarSecret'").get() as { value: string }).value;
}

/** Nur-Lese-Schlüssel des Club-Kalenders; „neu erzeugen“ wechselt die Generation und macht alte Links ungültig */
export function clubCalendarKey(): string {
  const gen = getSetting('clubCalendarGen') ?? '0';
  return crypto.createHmac('sha256', clubSecret()).update(`club:${gen}`).digest('base64url').slice(0, 32);
}

export function regenerateClubCalendarKey() {
  setSetting('clubCalendarGen', crypto.randomBytes(6).toString('base64url'));
}

export function checkClubCalendarKey(key: string): boolean {
  const a = Buffer.from(clubCalendarKey());
  const b = Buffer.from(key);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
