import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, UPLOAD_DIR, db, defaultLocale, getSetting, setSetting } from './db';
import '@/i18n/packs';
import { DEFAULT_LOCALE, translate, translateMessage } from '@/i18n/core';
import { BACKUP_DIR, listBackups } from './autoBackup';

/**
 * Health-Seite (NTH2 6.2): Outbox-Stau je Kanal, letztes Backup je Kampagne, Speicherplatz, Fehler der letzten
 * 24 h, Version/Build und Laufzeit. Serverfehler landen in einem kleinen Ringpuffer (Tabelle error_log, die
 * letzten 500 Einträge); optional meldet ein Discord-Webhook neue Fehler (höchstens alle 15 Minuten).
 */

const MAX_ERRORS = 500;
const NOTIFY_EVERY_MS = 15 * 60_000;
const STARTED = new Date();

let ready = false;
function ensure() {
  if (ready) return;
  db().exec('CREATE TABLE IF NOT EXISTS error_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, source TEXT NOT NULL, message TEXT NOT NULL, detail TEXT)');
  ready = true;
}

/** Geheime Tokens in Pfaden kürzen (Spielerlinks, Leseansicht, Einladungen) */
export const maskPath = (p: string) => p.replace(/([A-Za-z0-9_-]{6})[A-Za-z0-9_-]{14,}/g, '$1…');

/** Interne Steuer-Fehler von Next (notFound, redirect) sind keine Fehler */
function ignorable(err: unknown): boolean {
  const digest = typeof err === 'object' && err !== null && 'digest' in err ? String((err as { digest: unknown }).digest) : '';
  return /^NEXT_(NOT_FOUND|REDIRECT|HTTP_ERROR_FALLBACK)/.test(digest) || digest === 'DYNAMIC_SERVER_USAGE';
}

export function recordError(source: string, err: unknown, now = new Date()) {
  if (ignorable(err)) return;
  try {
    ensure();
    const message = (err instanceof Error ? `${err.name}: ${err.message}` : String(err)).slice(0, 1000);
    const digest = typeof err === 'object' && err !== null && 'digest' in err ? ` [digest ${String((err as { digest: unknown }).digest)}]` : '';
    const stack = err instanceof Error && err.stack ? err.stack.split('\n').slice(1, 8).join('\n') : null;
    db()
      .prepare('INSERT INTO error_log(at, source, message, detail) VALUES(?,?,?,?)')
      .run(now.toISOString(), maskPath(source).slice(0, 200), message + digest, stack);
    db().prepare('DELETE FROM error_log WHERE id <= (SELECT MAX(id) FROM error_log) - ?').run(MAX_ERRORS);
    void notifyError(now);
  } catch {
    // Fehlerprotokoll darf nie selbst einen Fehler auslösen
  }
}

export interface ErrorRow {
  id: number;
  at: string;
  source: string;
  message: string;
  detail: string | null;
}

export function recentErrors(limit = 30): ErrorRow[] {
  ensure();
  return db().prepare('SELECT id, at, source, message, detail FROM error_log ORDER BY id DESC LIMIT ?').all(limit) as unknown as ErrorRow[];
}

export function errorsSince(iso: string): number {
  ensure();
  return (db().prepare('SELECT COUNT(*) AS n FROM error_log WHERE at >= ?').get(iso) as { n: number }).n;
}

export function clearErrors() {
  ensure();
  db().exec('DELETE FROM error_log');
}

// ─── Fehler-Benachrichtigung (Discord-Webhook, gedrosselt) ─────────────────

export const errorWebhook = () => getSetting('errorWebhook');

export function setErrorWebhook(url: string | null) {
  if (url && !/^https:\/\/(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)\/api\/webhooks\/\d+\/[\w-]+$/.test(url)) throw new Error('Ungültige Discord-Webhook-URL');
  setSetting('errorWebhook', url ?? '');
}

/** Darf jetzt gemeldet werden? (höchstens einmal je 15 Minuten; gezählt werden die Fehler seit der letzten Meldung) */
export function shouldNotify(lastIso: string | null, now: Date): boolean {
  if (!lastIso) return true;
  const last = Date.parse(lastIso);
  return !Number.isFinite(last) || now.getTime() - last >= NOTIFY_EVERY_MS;
}

async function notifyError(now: Date) {
  const url = errorWebhook();
  if (!url) return;
  const last = getSetting('errorWebhookLast');
  if (!shouldNotify(last, now)) return;
  setSetting('errorWebhookLast', now.toISOString());
  const n = errorsSince(last ?? new Date(now.getTime() - NOTIFY_EVERY_MS).toISOString());
  const latest = recentErrors(1)[0];
  // Betriebsmeldung in der globalen Standardsprache (kein Empfänger mit eigener Sprache)
  const l = defaultLocale() ?? DEFAULT_LOCALE;
  const content = translate(l, 'Vespator Front: {n} Serverfehler seit der letzten Meldung. Zuletzt: {source} – {message}', {
    n,
    source: latest?.source ?? '',
    message: translateMessage(l, latest?.message ?? ''),
  }).slice(0, 1900);
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(5000) });
  } catch {
    // Netzwerkfehler beim Melden werden nicht erneut protokolliert
  }
}

// ─── Kennzahlen ───────────────────────────────────────────────────────────

function dirSize(dir: string, budget = { files: 50_000 }): number {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    if (--budget.files < 0) break;
    const p = path.join(dir, e.name);
    try {
      if (e.isDirectory()) total += dirSize(p, budget);
      else if (e.isFile()) total += fs.statSync(p).size;
    } catch {
      // Datei verschwunden
    }
  }
  return total;
}

function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return null;
  }
}

export interface HealthReport {
  /** Zeitpunkt des Berichts (ms) */
  now: number;
  version: string;
  build: string | null;
  commit: string | null;
  node: string;
  startedAt: string;
  uptimeSec: number;
  outbox: { channel: string; pending: number; failed: number; sent24h: number; oldestPending: string | null }[];
  backups: { campaignId: string; name: string; last: string | null; count: number; archived: boolean }[];
  disk: { data: number; uploads: number; backups: number; free: number | null; total: number | null };
  errors24h: number;
  errors: ErrorRow[];
  webhook: boolean;
}

export function healthReport(now = new Date()): HealthReport {
  const pkg = (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as { version?: string };
    } catch {
      return {};
    }
  })();
  const since = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const rows = db().prepare('SELECT channel, status, COUNT(*) AS n, MIN(created_at) AS oldest FROM outbox GROUP BY channel, status').all() as { channel: string; status: string; n: number; oldest: string }[];
  const sent = db().prepare("SELECT channel, COUNT(*) AS n FROM outbox WHERE status = 'SENT' AND sent_at >= ? GROUP BY channel").all(since) as { channel: string; n: number }[];
  const channels = [...new Set([...rows.map((r) => r.channel), 'EMAIL', 'DISCORD'])].sort();
  const outbox = channels.map((c) => {
    const pend = rows.filter((r) => r.channel === c && (r.status === 'PENDING' || r.status === 'SENDING'));
    return {
      channel: c,
      pending: pend.reduce((s, r) => s + r.n, 0),
      failed: rows.filter((r) => r.channel === c && r.status === 'FAILED').reduce((s, r) => s + r.n, 0),
      sent24h: sent.find((r) => r.channel === c)?.n ?? 0,
      oldestPending: pend.map((r) => r.oldest).sort()[0] ?? null,
    };
  });
  const camps = db().prepare('SELECT id, name, archived FROM campaign WHERE sandbox_of IS NULL ORDER BY archived, name').all() as { id: string; name: string; archived: number }[];
  const backups = camps.map((c) => {
    let list: { at: string }[] = [];
    try {
      list = listBackups(c.id);
    } catch {
      list = [];
    }
    return { campaignId: c.id, name: c.name, last: list[0]?.at ?? null, count: list.length, archived: !!c.archived };
  });
  let free: number | null = null;
  let total: number | null = null;
  try {
    const s = fs.statfsSync(DATA_DIR);
    free = s.bavail * s.bsize;
    total = s.blocks * s.bsize;
  } catch {
    // statfs nicht verfügbar
  }
  const backupsInData = path.resolve(BACKUP_DIR).startsWith(path.resolve(DATA_DIR));
  const backupBytes = dirSize(BACKUP_DIR);
  return {
    now: now.getTime(),
    version: pkg.version ?? '?',
    build: readText(path.join(process.cwd(), process.env.NEXT_DIST_DIR ?? '.next', 'BUILD_ID')),
    commit: process.env.GIT_COMMIT ?? process.env.SOURCE_COMMIT ?? null,
    node: process.version,
    startedAt: STARTED.toISOString(),
    uptimeSec: Math.round(process.uptime()),
    outbox,
    backups,
    disk: { data: dirSize(DATA_DIR) - (backupsInData ? backupBytes : 0), uploads: dirSize(UPLOAD_DIR), backups: backupBytes, free, total },
    errors24h: errorsSince(since),
    errors: recentErrors(30),
    webhook: !!errorWebhook(),
  };
}
