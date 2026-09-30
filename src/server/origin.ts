import 'server-only';
import { db, getSetting, setSetting } from './db';

/**
 * Öffentliche Basis-URL. Reihenfolge: Umgebungsvariable APP_URL → vom Admin ausdrücklich gespeicherte Adresse
 * (Einstellung `publicUrl`). Aus Anfrage-Kopfzeilen wird nie etwas gespeichert – ein gefälschter Host-Header
 * könnte sonst die Links in E-Mails, Push und Discord umlenken.
 */
export function configuredAppUrl(): string | null {
  const env = process.env.APP_URL?.trim();
  if (env) return env.replace(/\/$/, '');
  return getSetting('publicUrl');
}

/** Basis-URL für Links in Nachrichten (E-Mail, Push, Discord); ohne Einstellung die lokale Standardadresse */
export function appUrl(): string {
  return configuredAppUrl() ?? 'http://localhost:3000';
}

/** Prüft und normalisiert eine vom Admin eingegebene Adresse (nur http/https, ohne Pfad, Anmeldedaten oder Query) */
export function normalizePublicUrl(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password || u.search || u.hash) return null;
  if (u.pathname !== '/' && u.pathname !== '') return null;
  return `${u.protocol}//${u.host}`;
}

/** Öffentliche Adresse speichern (nur Admins); leer = entfernen. Liefert eine Fehlermeldung oder null. */
export function setPublicUrl(input: string): string | null {
  if (!input.trim()) {
    db().prepare("DELETE FROM settings WHERE key = 'publicUrl'").run();
    return null;
  }
  const url = normalizePublicUrl(input);
  if (!url) return 'Bitte eine Adresse wie https://kampagne.example angeben (ohne Pfad)';
  setSetting('publicUrl', url);
  return null;
}

/**
 * Basis-URL für Links, die nur der Aufrufer selbst sieht (Verwaltung, Spielerseite, QR-Codes): APP_URL bzw. die
 * gespeicherte Adresse, sonst aus den (Proxy-)Headern abgeleitet. Wird nicht gespeichert.
 */
export function publicOrigin(h: Headers): string {
  const fixed = configuredAppUrl();
  if (fixed) return fixed;
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/**
 * CSRF-Schutz für eigene POST-Route-Handler (ASVS 3.5, OWASP „Fetch Metadata“): Server Actions prüft Next.js selbst,
 * Route Handler nicht. Abgelehnt wird, wenn der Browser die Anfrage als seitenfremd kennzeichnet (Sec-Fetch-Site
 * nicht same-origin/none) oder der Origin-Header nicht zum Host (bzw. X-Forwarded-Host oder der festen Adresse)
 * passt. Anfragen ohne beide Kopfzeilen (Server-zu-Server wie Discord, alte Clients) lässt die Prüfung durch – die
 * Anmeldung bzw. Signatur prüft der Handler ohnehin.
 */
export function sameOriginCheck(h: Pick<Headers, 'get'>, fixedOrigin: string | null = configuredAppUrl()): boolean {
  const site = h.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = h.get('origin');
  if (!origin) return true;
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return false; // auch „null“
  }
  const hosts = [h.get('x-forwarded-host'), h.get('host')].flatMap((x) => (x ? x.split(',').map((v) => v.trim().toLowerCase()) : []));
  if (fixedOrigin) {
    try {
      hosts.push(new URL(fixedOrigin).host.toLowerCase());
    } catch {}
  }
  return hosts.includes(o.host.toLowerCase());
}

/** Antwort 403 für seitenfremde POST-Anfragen, sonst null */
export function rejectCrossOrigin(req: Request): Response | null {
  return sameOriginCheck(req.headers) ? null : Response.json({ error: 'Anfrage von fremder Seite abgelehnt' }, { status: 403 });
}
