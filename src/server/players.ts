import 'server-only';
import crypto from 'node:crypto';
import { db } from './db';
import { currentState, runCommand, type RunResult } from './campaigns';
import { authorizePlayer } from '@/engine/playerActions';
import type { Command } from '@/engine/commands';
import type { CampaignState, Player } from '@/engine/types';
import { makeT, translateMessage, type Locale } from '@/i18n/core';
import { contextLocale } from './locale';

/**
 * Persönliche Spieler-Links (N1.1). Das Token liegt nur hier in der Datenbank (nicht im Kampagnenzustand,
 * nicht in Exporten). Nachgeschlagen wird über den SHA-256-Hash – so hängt die Laufzeit nicht vom Token ab.
 */
const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

/**
 * Aktiver Link eines Spielers. Mit `create` wird nur für Spieler, die noch **nie** einen Link hatten,
 * einer erzeugt – ein gesperrter Link bleibt gesperrt (null), bis der Spielleiter ihn ausdrücklich neu erzeugt.
 */
export function playerTokenFor(campaignId: string, playerId: string, create = false): string | null {
  const row = db().prepare('SELECT token FROM player_token WHERE campaign_id = ? AND player_id = ? AND revoked = 0 ORDER BY created_at DESC LIMIT 1').get(campaignId, playerId) as { token: string } | undefined;
  if (row) return row.token;
  if (!create) return null;
  if (db().prepare('SELECT 1 FROM player_token WHERE campaign_id = ? AND player_id = ? LIMIT 1').get(campaignId, playerId)) return null;
  return regeneratePlayerToken(campaignId, playerId);
}

/** Neuen Link erzeugen; alle bisherigen Links des Spielers werden ungültig */
export function regeneratePlayerToken(campaignId: string, playerId: string): string {
  const token = crypto.randomBytes(32).toString('base64url');
  db().prepare('UPDATE player_token SET revoked = 1 WHERE campaign_id = ? AND player_id = ?').run(campaignId, playerId);
  db().prepare('INSERT INTO player_token(token_hash, token, campaign_id, player_id, revoked, created_at) VALUES(?,?,?,?,0,?)').run(hash(token), token, campaignId, playerId, new Date().toISOString());
  return token;
}

/** Link sperren (ohne neuen zu erzeugen) */
export function revokePlayerToken(campaignId: string, playerId: string) {
  db().prepare('UPDATE player_token SET revoked = 1 WHERE campaign_id = ? AND player_id = ?').run(campaignId, playerId);
}

export function playerLinkStatus(campaignId: string): Record<string, 'ACTIVE' | 'REVOKED'> {
  const rows = db().prepare('SELECT player_id, MIN(revoked) AS r FROM player_token WHERE campaign_id = ? GROUP BY player_id').all(campaignId) as { player_id: string; r: number }[];
  return Object.fromEntries(rows.map((r) => [r.player_id, r.r === 0 ? 'ACTIVE' : 'REVOKED']));
}

/** Aktive Links aller Spieler einer Kampagne (für den Spielleiter) */
export function playerLinks(campaignId: string, origin: string): Record<string, string> {
  const rows = db().prepare('SELECT player_id, token FROM player_token WHERE campaign_id = ? AND revoked = 0').all(campaignId) as { player_id: string; token: string }[];
  return Object.fromEntries(rows.map((r) => [r.player_id, `${origin}/p/${r.token}`]));
}

/**
 * Nur-Lese-Schlüssel für das Kalender-Abo (N1.5) – darf an Kalenderdienste gehen, ohne Schreibrechte.
 * An den gültigen Spielerlink gebunden: Sperren oder Erneuern des Links macht auch das Abo ungültig.
 */
export function calendarKey(campaignId: string, playerId: string): string | null {
  const row = db().prepare('SELECT token_hash FROM player_token WHERE campaign_id = ? AND player_id = ? AND revoked = 0 ORDER BY created_at DESC LIMIT 1').get(campaignId, playerId) as { token_hash: string } | undefined;
  if (!row) return null;
  return crypto.createHmac('sha256', calendarSecret()).update(`${campaignId}:${playerId}:${row.token_hash}`).digest('base64url').slice(0, 32);
}

function calendarSecret(): string {
  const row = db().prepare("SELECT value FROM settings WHERE key = 'calendarSecret'").get() as { value: string } | undefined;
  if (row) return row.value;
  const s = crypto.randomBytes(32).toString('base64url');
  db().prepare("INSERT OR IGNORE INTO settings(key, value) VALUES('calendarSecret', ?)").run(s);
  return (db().prepare("SELECT value FROM settings WHERE key = 'calendarSecret'").get() as { value: string }).value;
}

export function checkCalendarKey(campaignId: string, playerId: string, key: string): boolean {
  const expected = calendarKey(campaignId, playerId);
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(key);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface PlayerSession {
  campaignId: string;
  playerId: string;
  state: CampaignState;
  player: Player;
  revision: number;
  archived: boolean;
  publicToken: string;
}

/** Spielerlink nur in der Datenbank prüfen (ohne Kampagnenzustand) – erste Stufe jeder Spieler-Berechtigung */
export function playerTokenRow(token: string): { campaignId: string; playerId: string; tokenHash: string } | null {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{30,80}$/.test(token)) return null;
  const h = hash(token);
  const row = db().prepare('SELECT campaign_id, player_id FROM player_token WHERE token_hash = ? AND revoked = 0').get(h) as { campaign_id: string; player_id: string } | undefined;
  return row ? { campaignId: row.campaign_id, playerId: row.player_id, tokenHash: h } : null;
}

/** Zustand zu einem bereits geprüften Spielerlink laden */
export function loadPlayerSession(campaignId: string, playerId: string): PlayerSession | null {
  try {
    const { row: c, state } = currentState(campaignId);
    const player = state.players.find((p) => p.id === playerId);
    if (!player) return null;
    return { campaignId, playerId, state, player, revision: c.current_rev, archived: !!c.archived, publicToken: c.public_token };
  } catch {
    return null;
  }
}

export function resolvePlayerToken(token: string): PlayerSession | null {
  const row = playerTokenRow(token);
  return row ? loadPlayerSession(row.campaignId, row.playerId) : null;
}

/**
 * Deaktivierter oder gelöschter Spieler (F3): Link sperren und alles, was daran hängt – Push-Abos, Discord-Verknüpfung
 * und -Codes. Kalender-Abo und Einmal-Links sind an den Hash des Links gebunden und werden damit ebenfalls ungültig.
 */
export function revokePlayerAccess(campaignId: string, playerId: string) {
  revokePlayerToken(campaignId, playerId);
  db().prepare('DELETE FROM push_sub WHERE campaign_id = ? AND player_id = ?').run(campaignId, playerId);
  db().prepare('DELETE FROM discord_link WHERE campaign_id = ? AND player_id = ?').run(campaignId, playerId);
  db().prepare('DELETE FROM discord_code WHERE campaign_id = ? AND player_id = ?').run(campaignId, playerId);
}

// Schreib-Limit je Link: 30 Aktionen bzw. 10 Uploads pro Minute
const hits = new Map<string, number[]>();
let calls = 0;
/** Abgelaufene Schlüssel entfernen, damit die Map nicht mit jedem je benutzten Link wächst */
export function pruneRateLimits(now = Date.now()) {
  for (const [k, list] of hits) if (!list.some((t) => now - t < 60_000)) hits.delete(k);
}
export const rateLimitKeys = () => hits.size;
function limited(key: string, max: number): boolean {
  const now = Date.now();
  if (++calls % 100 === 0) pruneRateLimits(now);
  const list = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(key, list);
  return list.length > max;
}
const rateLimited = (token: string) => limited(token, 30);
export const uploadLimited = (token: string) => limited(`upload:${token}`, 10);
/** Tischbelegung (lädt alle laufenden Kampagnen): 20 Abfragen pro Minute und Link */
export const tableOptionsLimited = (key: string) => limited(`tables:${key}`, 20);

/**
 * Führt einen Command im Namen eines Spielers aus: Berechtigung prüfen, dann die normale Engine –
 * Warnungen darf ein Spieler nicht übergehen (nur der Spielleiter).
 */
export function runPlayerCommand(token: string, cmd: Command): RunResult {
  const s = resolvePlayerToken(token);
  if (!s) return { ok: false, kind: 'error', error: 'Link ungültig oder gesperrt' };
  return runAsPlayer(s, cmd, token);
}

/**
 * Gemeinsamer Weg aller Spieler-Aktionen (Spielerlink, Einmal-Link NTH2 1.5, Discord-Bot NTH2 1.2):
 * dieselbe Berechtigungsprüfung, dasselbe Rate-Limit und dieselbe Behandlung von Warnungen.
 */
export function runAsPlayer(s: Pick<PlayerSession, 'campaignId' | 'state' | 'player' | 'archived'>, cmd: Command, rateKey: string): RunResult {
  if (s.archived) return { ok: false, kind: 'error', error: 'Die Kampagne ist archiviert' };
  if (rateLimited(rateKey)) return { ok: false, kind: 'error', error: 'Zu viele Aktionen – bitte eine Minute warten' };
  const denied = authorizePlayer(s.state, s.player, cmd);
  if (denied) return { ok: false, kind: 'error', error: denied };
  const actor = { kind: 'player', playerId: s.player.id } as const;
  let r = runCommand(s.campaignId, -1, cmd, { force: false, author: `Spieler: ${s.player.nickname}`, actor });
  // Reine Bestätigungen des Regelfalls (kein Override) blockieren Spieler nicht – sie gelten als bestätigt
  if (!r.ok && r.kind === 'confirm' && !r.needsReason) r = runCommand(s.campaignId, -1, cmd, { force: true, author: `Spieler: ${s.player.nickname}`, actor });
  // Echte Warnungen (Override) darf nur der Spielleiter übergehen: für Spieler ein verständlicher Fehler
  if (!r.ok && r.kind === 'confirm') {
    // zusammengesetzte Meldung gleich in der Sprache des Spielers (die Einzelteile sind Engine-Meldungen)
    const l: Locale = contextLocale(s.player.locale, s.state.meta.locale);
    const warnings = r.warnings.map((w) => translateMessage(l, w)).join(' · ');
    return { ok: false, kind: 'error', error: makeT(l)('Nicht möglich: {warnings} – bitte beim Spielleiter melden', { warnings }) };
  }
  if (!r.ok && r.kind === 'dice') return { ok: false, kind: 'error', error: 'Für diese Aktion wird gewürfelt – bitte beim Spielleiter melden' };
  return r;
}

/** SHA-256 eines Spielerlinks (wie in player_token gespeichert) */
export const playerTokenHash = hash;

/** Hash des gültigen Spielerlinks (für Bindungen wie Push-Abo und Discord-Verknüpfung) */
export function activeTokenHash(campaignId: string, playerId: string): string | null {
  const row = db().prepare('SELECT token_hash FROM player_token WHERE campaign_id = ? AND player_id = ? AND revoked = 0 ORDER BY created_at DESC LIMIT 1').get(campaignId, playerId) as { token_hash: string } | undefined;
  return row?.token_hash ?? null;
}
