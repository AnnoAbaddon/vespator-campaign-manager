import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { db, getSetting, setSetting } from './db';
import { BACKUP_DIR, localDay } from './autoBackup';
import { CONFIRM_LINK_TTL_MS } from './confirmLink';
import { AUTH_AUDIT_ACTIONS, AUTH_AUDIT_KEEP_DAYS } from './audit';

/** wie SESSION_MAX_DAYS in auth.ts (dort nicht importiert: auth.ts hängt an next/headers) */
const SESSION_MAX_DAYS = 90;

/**
 * Wartung im Hintergrund: abgelaufene Daten entfernen und die ganze Datenbank täglich sichern.
 * Beides ist idempotent und läuft über den Scheduler.
 */

const DAY = 86_400_000;
/** verschickte Nachrichten bleiben 30 Tage in der Outbox (Versandstatus in der Verwaltung) */
export const OUTBOX_KEEP_DAYS = 30;
/** Datenbank-Sicherungen: die letzten 7 Tage */
export const DB_BACKUPS_KEEP = 7;
const DB_FILE = /^app-\d{4}-\d{2}-\d{2}\.db$/;

/** Abgelaufene Sitzungen, alte verschickte Nachrichten, verbrauchte Einmal-Links und Discord-Codes entfernen */
export function purgeExpired(now = Date.now()): { sessions: number; outbox: number; links: number; codes: number } {
  const iso = (ms: number) => new Date(ms).toISOString();
  // abgelaufen oder älter als die absolute Höchstdauer (ohne Anlegezeit: nicht mehr gültig, siehe sessionAccount)
  const sessions = db()
    .prepare('DELETE FROM session WHERE expires_at < ? OR created_at IS NULL OR created_at < ?')
    .run(iso(now), iso(now - SESSION_MAX_DAYS * DAY)).changes;
  // Anmeldeereignisse im Verwaltungsprotokoll (IP gekürzt) nach 90 Tagen entfernen
  db()
    .prepare(`DELETE FROM audit WHERE campaign_id IS NULL AND action IN (${AUTH_AUDIT_ACTIONS.map(() => '?').join(',')}) AND at < ?`)
    .run(...AUTH_AUDIT_ACTIONS, iso(now - AUTH_AUDIT_KEEP_DAYS * DAY));
  const outbox = db()
    .prepare("DELETE FROM outbox WHERE status IN ('SENT', 'SKIPPED') AND COALESCE(sent_at, created_at) < ?")
    .run(iso(now - OUTBOX_KEEP_DAYS * DAY)).changes;
  // nach Ablauf der Gültigkeit meldet der Link ohnehin „abgelaufen“ – die Liste der benutzten Links wird nicht mehr gebraucht
  const links = db()
    .prepare('DELETE FROM used_link WHERE used_at < ?')
    .run(iso(now - CONFIRM_LINK_TTL_MS - DAY)).changes;
  const codes = db().prepare('DELETE FROM discord_code WHERE expires_at < ?').run(iso(now)).changes;
  return { sessions: Number(sessions), outbox: Number(outbox), links: Number(links), codes: Number(codes) };
}

export const dbBackupDir = () => path.join(BACKUP_DIR, 'db');

export function listDbBackups(): string[] {
  const dir = dbBackupDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => DB_FILE.test(f))
    .sort()
    .reverse();
}

/**
 * Tägliche Sicherung der ganzen Datenbank (ab 03:00 Serverzeit) per `VACUUM INTO` – konsistent auch im laufenden
 * Betrieb. Die letzten 7 bleiben erhalten. Liefert den Dateinamen oder null, wenn heute schon gesichert wurde.
 */
export function backupDatabase(now = new Date(), force = false): string | null {
  const day = localDay(now);
  if (!force && (now.getHours() < 3 || getSetting('dbBackupLastDay') === day)) return null;
  const dir = dbBackupDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = `app-${day}.db`;
  const target = path.join(dir, file);
  const tmp = path.join(dir, `.${file}.tmp`);
  fs.rmSync(tmp, { force: true });
  db().prepare('VACUUM INTO ?').run(tmp);
  fs.renameSync(tmp, target);
  for (const old of listDbBackups().slice(DB_BACKUPS_KEEP)) fs.rmSync(path.join(dir, old), { force: true });
  setSetting('dbBackupLastDay', day);
  return file;
}
