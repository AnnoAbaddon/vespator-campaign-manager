import 'server-only';
import { db } from './db';

/**
 * Protokoll der Verwaltungsaktionen (N5.2 „Jede Aktion steht mit Kontonamen im Log“).
 * Commands tragen ihren Urheber in `revision.author`; alles andere (Anlegen, Undo, Import, Löschen,
 * Freigaben, Links, Uploads, Backups, Versand-Einstellungen, Konten) landet hier.
 * `action` ist ein fester deutscher Text (Schlüssel für die Übersetzung), `detail` freier Text.
 */
export interface AuditEntry {
  id: number;
  at: string;
  campaign_id: string | null;
  author: string;
  action: string;
  detail: string | null;
}

export function audit(author: string, action: string, detail: string | null = null, campaignId: string | null = null, at = new Date().toISOString()) {
  db()
    .prepare('INSERT INTO audit(at, campaign_id, author, action, detail) VALUES(?,?,?,?,?)')
    .run(at, campaignId, author, action, detail ? detail.slice(0, 500) : null);
}

/** Letzte Einträge: alle (Admins) oder nur die der freigegebenen Kampagnen (Co-Warmaster) */
export function listAudit(scope: string[] | 'ALL', limit = 50): AuditEntry[] {
  if (scope === 'ALL') return db().prepare('SELECT id, at, campaign_id, author, action, detail FROM audit ORDER BY id DESC LIMIT ?').all(limit) as unknown as AuditEntry[];
  if (!scope.length) return [];
  const marks = scope.map(() => '?').join(',');
  return db()
    .prepare(`SELECT id, at, campaign_id, author, action, detail FROM audit WHERE campaign_id IN (${marks}) ORDER BY id DESC LIMIT ?`)
    .all(...scope, limit) as unknown as AuditEntry[];
}

/** Alle Einträge einer Kampagne (für das Backup), älteste zuerst */
export function auditForCampaign(campaignId: string): AuditEntry[] {
  return db().prepare('SELECT id, at, campaign_id, author, action, detail FROM audit WHERE campaign_id = ? ORDER BY id').all(campaignId) as unknown as AuditEntry[];
}

// ─── Anmeldeereignisse (ASVS 16.3.1) ───────────────────────────────────────

export const AUTH_AUDIT = { ok: 'Angemeldet', failed: 'Anmeldung fehlgeschlagen', blocked: 'Anmeldung gesperrt (Rate-Limit)' } as const;
export const AUTH_AUDIT_ACTIONS: string[] = Object.values(AUTH_AUDIT);
/** Anmeldeereignisse bleiben 90 Tage im Protokoll (Wartung) */
export const AUTH_AUDIT_KEEP_DAYS = 90;
/** Fehlversuche und Sperren je IP höchstens einmal pro Minute protokollieren – das Protokoll lässt sich nicht fluten */
const AUTH_THROTTLE_MS = 60_000;
const lastAuthEntry = new Map<string, number>();

/** IP-Adresse gekürzt (Datenschutz): IPv4 auf /24, IPv6 auf /48; alles andere unverändert (z. B. „direct“) */
export function maskIp(ip: string): string {
  const v4 = ip.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/i);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  if (ip.includes(':')) {
    const groups = ip.replace(/^\[|\]$/g, '').split(':');
    return `${groups.slice(0, 3).join(':')}::/48`;
  }
  return ip.slice(0, 40);
}

/** Benutzernamen aus dem Formular: ohne Steuerzeichen, gekürzt */
const cleanName = (s: string) =>
  s
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, '')
    .trim()
    .slice(0, 64);

/**
 * Anmeldeereignis protokollieren – nie das Passwort. Erfolg unter dem Kontonamen, Fehlversuch und Sperre unter
 * „Anmeldung“ mit dem eingegebenen Namen im Detail (sonst könnte ein Angreifer Einträge unter fremdem Namen erzeugen).
 */
export function auditLogin(kind: keyof typeof AUTH_AUDIT, username: string, ip: string, now = Date.now()): boolean {
  const name = cleanName(username) || '–';
  const where = maskIp(ip);
  if (kind === 'ok') {
    audit(name, AUTH_AUDIT.ok, `IP ${where}`, null, new Date(now).toISOString());
    return true;
  }
  const key = `${kind}:${where}`;
  const last = lastAuthEntry.get(key);
  if (last !== undefined && now - last < AUTH_THROTTLE_MS) return false;
  lastAuthEntry.set(key, now);
  if (lastAuthEntry.size > 5000) lastAuthEntry.clear();
  audit('Anmeldung', AUTH_AUDIT[kind], `${name} · IP ${where}`, null, new Date(now).toISOString());
  return true;
}
