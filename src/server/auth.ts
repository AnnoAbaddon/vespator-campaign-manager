import 'server-only';
import crypto from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { db, tx } from './db';
import { DEFAULT_LOCALE, toLocale, type Locale } from '@/i18n/core';
import { isCommonPassword } from './commonPasswords';

/** Gleitende Sitzungsdauer (wird bei Nutzung verlängert) */
export const SESSION_DAYS = 30;
/** Absolute Höchstdauer einer Sitzung ab Anmeldung (ASVS 7.3.2) – danach ist eine neue Anmeldung nötig */
export const SESSION_MAX_DAYS = 90;
const DAY_MS = 86_400_000;

/** Sitzungs-Cookies nur über HTTPS (außer lokal/INSECURE_COOKIES=1) */
export const secureCookies = () => process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1';
export const LEGACY_SESSION_COOKIE = 'vf_session';
/**
 * Name des Sitzungs-Cookies: mit Secure das Präfix `__Host-` (an Host, Secure und Path=/ gebunden – keine
 * untergeschobenen Cookies von Nachbar-Subdomains); ohne Secure (lokale HTTP-Tests) der alte Name.
 */
export const sessionCookieName = (secure = secureCookies()) => (secure ? '__Host-vf_session' : LEGACY_SESSION_COOKIE);
/** Sitzungs-IDs stehen nur als SHA-256-Hash in der Datenbank – Datenbank-Backups enthalten keine gültigen Cookies */
export const sessionKey = (id: string) => crypto.createHash('sha256').update(id).digest('hex');

// ─── Passwortregeln für neue Passwörter (ASVS 6.2) ─────────────────────────
export const MIN_PASSWORD_LEN = 10;
export const MAX_PASSWORD_LEN = 256;
/** Prüft ein neu gewähltes Passwort; liefert eine Fehlermeldung (deutscher Schlüssel) oder null */
export function validateNewPassword(pw: string): string | null {
  if (pw.length < MIN_PASSWORD_LEN) return 'Passwort: mindestens 10 Zeichen';
  if (pw.length > MAX_PASSWORD_LEN) return 'Passwort: höchstens 256 Zeichen';
  if (isCommonPassword(pw)) return 'Dieses Passwort ist zu verbreitet – bitte ein anderes wählen';
  return null;
}
/** Benutzernamen: gleiche Regel für Ersteinrichtung und Einladung */
export const USERNAME_RE = /^[\p{L}\p{N}_.-]{3,32}$/u;

type Argon2Fn = (alg: string, params: { message: string | Buffer; nonce: Buffer; parallelism: number; tagLength: number; memory: number; passes: number }, cb: (err: Error | null, key: Buffer) => void) => void;

function argon2(message: string, nonce: Buffer, memory = 19456, passes = 2, parallelism = 1): Promise<Buffer> {
  const fn = (crypto as unknown as { argon2?: Argon2Fn }).argon2;
  if (!fn) throw new Error('Node.js ≥ 24.7 mit crypto.argon2 erforderlich');
  return new Promise((res, rej) => fn('argon2id', { message, nonce, parallelism, tagLength: 32, memory, passes }, (e, k) => (e ? rej(e) : res(k))));
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await argon2(pw, salt);
  return `argon2id$19456$2$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, m, t, p, salt, hash] = stored.split('$');
  if (alg !== 'argon2id') return false;
  const key = await argon2(pw, Buffer.from(salt, 'base64'), Number(m), Number(t), Number(p));
  const ref = Buffer.from(hash, 'base64');
  return ref.length === key.length && crypto.timingSafeEqual(ref, key);
}

export function adminExists(): boolean {
  return !!db().prepare('SELECT 1 FROM admin LIMIT 1').get();
}

export async function createAdmin(username: string, password: string, locale: Locale = DEFAULT_LOCALE) {
  if (adminExists()) throw new Error('Admin existiert bereits');
  const policy = validateNewPassword(password);
  if (policy) throw new Error(policy);
  const h = await hashPassword(password);
  // erneut prüfen, atomar mit dem Einfügen – parallele Ersteinrichtungen erzeugen nur ein Konto
  const r = db().prepare('INSERT INTO admin(username, password_hash, created_at, locale) SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM admin)').run(username, h, new Date().toISOString(), toLocale(locale));
  if (r.changes !== 1) throw new Error('Admin existiert bereits');
}

export async function changePassword(adminId: number, oldPw: string, newPw: string) {
  const row = db().prepare('SELECT password_hash FROM admin WHERE id = ?').get(adminId) as { password_hash: string } | undefined;
  if (!row || !(await verifyPassword(oldPw, row.password_hash))) throw new Error('Altes Passwort falsch');
  const policy = validateNewPassword(newPw);
  if (policy) throw new Error(policy);
  db()
    .prepare('UPDATE admin SET password_hash = ? WHERE id = ?')
    .run(await hashPassword(newPw), adminId);
  db().prepare('DELETE FROM session WHERE admin_id = ?').run(adminId);
}

// ─── Login-Rate-Limit (5 Fehlversuche / 15 min je IP), in der DB gespeichert ──
const WINDOW_MS = 15 * 60_000;
/** Schlüssel ohne vertrauenswürdigen Proxy: Next.js gibt Server Actions keine Socket-Adresse – alle teilen sich ein Limit */
export const DIRECT_CLIENT = 'direct';

/**
 * Adresse des Aufrufers für das Rate-Limit. X-Forwarded-For / X-Real-IP gelten nur mit TRUST_PROXY=1 (die App läuft
 * hinter dem eigenen Reverse Proxy, der die Kopfzeilen setzt) – sonst könnte jeder Client sie frei wählen.
 */
export function clientIpFrom(h: Pick<Headers, 'get'>, trustProxy = process.env.TRUST_PROXY === '1'): string {
  if (!trustProxy) return DIRECT_CLIENT;
  // Der eigene Reverse Proxy hängt die echte Adresse hinten an – frühere Einträge kann der Client fälschen
  const xff = h
    .get('x-forwarded-for')
    ?.split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return (xff?.at(-1) || h.get('x-real-ip') || DIRECT_CLIENT).slice(0, 100);
}
export async function clientIp(): Promise<string> {
  return clientIpFrom(await headers());
}

export type LoginGate = { blocked: true } | { blocked: false; slow: boolean; attempt: number };

/**
 * Prüft und zählt einen Anmeldeversuch in einem Schritt (ohne await dazwischen – parallele Anfragen können das
 * Limit so nicht unterlaufen). Hart gesperrt wird je IP (max. Versuche im Fenster); je Benutzername wird nur
 * gebremst (slow), damit Fremde ein Konto nicht aussperren können.
 */
export function beginLoginAttempt(ip: string, userKey: string, now = Date.now(), maxIp = 5, maxUser = 20): LoginGate {
  return tx(() => {
    const since = now - WINDOW_MS;
    db().prepare('DELETE FROM login_attempt WHERE at < ?').run(since);
    const count = (k: string) => (db().prepare('SELECT COUNT(*) AS n FROM login_attempt WHERE ip = ? AND at >= ?').get(k, since) as { n: number }).n;
    if (count(ip) >= maxIp) return { blocked: true } as const;
    const slow = count(userKey) >= maxUser;
    const r = db().prepare('INSERT INTO login_attempt(ip, at) VALUES(?, ?)').run(ip, now);
    db().prepare('INSERT INTO login_attempt(ip, at) VALUES(?, ?)').run(userKey, now);
    return { blocked: false, slow, attempt: Number(r.lastInsertRowid) } as const;
  });
}

/**
 * Erfolgreiche Anmeldung: den eben gezählten Versuch dieser IP zurücknehmen (frühere Fehlversuche der IP bleiben
 * bestehen) und den Zähler des Benutzernamens leeren.
 */
export function finishLoginAttempt(attempt: number, userKey: string) {
  db().prepare('DELETE FROM login_attempt WHERE rowid = ?').run(attempt);
  clearFailures(userKey);
}
export function rateLimited(ip: string, max = 5): boolean {
  const since = Date.now() - WINDOW_MS;
  db().prepare('DELETE FROM login_attempt WHERE at < ?').run(since);
  const r = db().prepare('SELECT COUNT(*) AS n FROM login_attempt WHERE ip = ? AND at >= ?').get(ip, since) as { n: number };
  return r.n >= max;
}
export function recordFailure(ip: string) {
  db().prepare('INSERT INTO login_attempt(ip, at) VALUES(?, ?)').run(ip, Date.now());
}
/** Nach erfolgreicher Anmeldung die gezählten Versuche verwerfen */
export function clearFailures(key: string) {
  db().prepare('DELETE FROM login_attempt WHERE ip = ?').run(key);
}

let dummyHash: string | null = null;

export async function login(username: string, password: string): Promise<boolean> {
  const row = db().prepare('SELECT id, password_hash FROM admin WHERE username = ?').get(username) as { id: number; password_hash: string } | undefined;
  if (!row) {
    // gleiche Rechenzeit wie bei existierenden Namen – keine Rückschlüsse auf Benutzernamen
    dummyHash ??= await hashPassword(crypto.randomBytes(16).toString('hex'));
    await verifyPassword(password, dummyHash);
    return false;
  }
  if (!(await verifyPassword(password, row.password_hash))) return false;
  await startSession(row.id);
  return true;
}

async function startSession(adminId: number) {
  const c = await cookies();
  // Eine vorhandene Sitzung dieses Browsers beenden, bevor die neue ausgegeben wird (ASVS 7.2.4)
  for (const name of new Set([sessionCookieName(), LEGACY_SESSION_COOKIE])) {
    const prev = c.get(name)?.value;
    if (prev) db().prepare('DELETE FROM session WHERE id = ?').run(sessionKey(prev));
  }
  const id = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  const expires = new Date(now + SESSION_DAYS * DAY_MS);
  db().prepare('INSERT INTO session(id, admin_id, expires_at, created_at) VALUES(?, ?, ?, ?)').run(sessionKey(id), adminId, expires.toISOString(), new Date(now).toISOString());
  const secure = secureCookies();
  if (secure) c.delete(LEGACY_SESSION_COOKIE);
  c.set(sessionCookieName(secure), id, { httpOnly: true, sameSite: 'lax', secure, path: '/', expires });
}

export async function logout() {
  const c = await cookies();
  for (const name of new Set([sessionCookieName(), LEGACY_SESSION_COOKIE])) {
    const id = c.get(name)?.value;
    if (!id) continue;
    db().prepare('DELETE FROM session WHERE id = ?').run(sessionKey(id));
    // __Host-Cookies lassen sich nur mit denselben Attributen (Secure, Path=/) überschreiben
    if (name === LEGACY_SESSION_COOKIE) c.delete(name);
    else c.set(name, '', { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 0 });
  }
}

export type Role = 'ADMIN' | 'COWARMASTER';
/** Rolle aus der Datenbank: nur 'ADMIN' ist Admin, alles andere (auch Unbekanntes) die geringste Rolle */
export const normalizeRole = (r: unknown): Role => (r === 'ADMIN' ? 'ADMIN' : 'COWARMASTER');
export interface Account {
  id: number;
  username: string;
  role: Role;
  locale: Locale;
}

export async function currentAdmin(): Promise<Account | null> {
  const c = await cookies();
  const id = c.get(sessionCookieName())?.value;
  if (!id) return null;
  return sessionAccount(id);
}

/**
 * Konto zu einer Sitzungs-ID (Klartext aus dem Cookie). Abgelaufene Sitzungen zählen nicht, laufende werden verlängert
 * (Sliding Expiry) – höchstens bis SESSION_MAX_DAYS nach der Anmeldung; ältere Sitzungen werden gelöscht.
 */
export function sessionAccount(id: string, now = Date.now()): Account | null {
  const key = sessionKey(id);
  const row = db().prepare('SELECT a.id, a.username, a.role, a.locale, s.expires_at, s.created_at FROM session s JOIN admin a ON a.id = s.admin_id WHERE s.id = ?').get(key) as
    { id: number; username: string; role: Role; locale: string; expires_at: string; created_at: string | null } | undefined;
  if (!row || row.expires_at < new Date(now).toISOString()) return null;
  // ohne Anlegezeit (sollte nach der Migration nicht vorkommen) gilt die Sitzung als abgelaufen
  const created = row.created_at ? Date.parse(row.created_at) : NaN;
  const hardEnd = created + SESSION_MAX_DAYS * DAY_MS;
  if (!Number.isFinite(created) || now >= hardEnd) {
    db().prepare('DELETE FROM session WHERE id = ?').run(key);
    return null;
  }
  // Sliding Expiry: verlängern, wenn weniger als die Hälfte übrig ist – nie über die absolute Grenze hinaus
  const left = new Date(row.expires_at).getTime() - now;
  if (left < (SESSION_DAYS / 2) * DAY_MS) {
    const exp = new Date(Math.min(now + SESSION_DAYS * DAY_MS, hardEnd)).toISOString();
    db().prepare('UPDATE session SET expires_at = ? WHERE id = ?').run(exp, key);
  }
  // unbekannte Rollen erhalten die geringsten Rechte – nie Admin
  return { id: row.id, username: row.username, role: normalizeRole(row.role), locale: toLocale(row.locale) };
}

// ─── Rollen und Kampagnenzugriff (N5.2) ────────────────────────────────────

/**
 * Kampagnenzugriff eines Kontos (Baustein der Richtlinie in authz.ts – Aufrufer nutzen `can`/`authorize`):
 * Admins sehen alles; Co-Warmaster nur die ihnen freigegebenen Kampagnen.
 */
export function canAccess(a: Account | null, campaignId: string): boolean {
  if (!a) return false;
  if (a.role === 'ADMIN') return true;
  // Szenario-Sandbox (NTH2 2.1): Zugriff wie auf die Originalkampagne
  const sb = db().prepare('SELECT sandbox_of FROM campaign WHERE id = ?').get(campaignId) as { sandbox_of: string | null } | undefined;
  const id = sb?.sandbox_of ?? campaignId;
  return !!db().prepare('SELECT 1 FROM campaign_access WHERE admin_id = ? AND campaign_id = ?').get(a.id, id);
}

export function grantAccess(adminId: number, campaignId: string) {
  db().prepare('INSERT OR IGNORE INTO campaign_access(admin_id, campaign_id) VALUES(?, ?)').run(adminId, campaignId);
}

export function revokeAccess(adminId: number, campaignId: string) {
  db().prepare('DELETE FROM campaign_access WHERE admin_id = ? AND campaign_id = ?').run(adminId, campaignId);
}

export function listAccounts(): { id: number; username: string; role: Role; created_at: string; campaigns: string[] }[] {
  const rows = db().prepare('SELECT id, username, role, created_at FROM admin ORDER BY id').all() as { id: number; username: string; role: Role; created_at: string }[];
  return rows.map((r) => ({ ...r, campaigns: (db().prepare('SELECT campaign_id FROM campaign_access WHERE admin_id = ?').all(r.id) as { campaign_id: string }[]).map((x) => x.campaign_id) }));
}

export function deleteAccount(id: number) {
  const admins = db().prepare("SELECT COUNT(*) AS n FROM admin WHERE role = 'ADMIN' AND id != ?").get(id) as { n: number };
  const target = db().prepare('SELECT role FROM admin WHERE id = ?').get(id) as { role: Role } | undefined;
  if (!target) throw new Error('Konto nicht gefunden');
  if (target.role === 'ADMIN' && admins.n === 0) throw new Error('Das letzte Admin-Konto kann nicht gelöscht werden');
  tx(() => {
    db().prepare('DELETE FROM session WHERE admin_id = ?').run(id);
    // Push-Abonnements des Kontos entfernen – sonst erhielte ein später angelegtes Konto mit derselben ID sie weiter
    db().prepare('DELETE FROM push_sub WHERE admin_id = ?').run(id);
    db().prepare('DELETE FROM admin WHERE id = ?').run(id);
  });
}

export function setLocale(id: number, locale: Locale) {
  db().prepare('UPDATE admin SET locale = ? WHERE id = ?').run(locale, id);
}

// ─── Einladungen ───────────────────────────────────────────────────────────

const inviteHash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

/** Einladungslink erzeugen (7 Tage gültig, einmalig) */
export function createInvite(createdBy: number, role: Role, campaignIds: string[]): string {
  const token = crypto.randomBytes(32).toString('base64url');
  db()
    .prepare('INSERT INTO invite(token_hash, role, campaign_ids, created_by, created_at, expires_at) VALUES(?,?,?,?,?,?)')
    .run(inviteHash(token), role, JSON.stringify(campaignIds), createdBy, new Date().toISOString(), new Date(Date.now() + 7 * 86400_000).toISOString());
  return token;
}

export function checkInvite(token: string): { role: Role; campaignIds: string[] } | null {
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) return null;
  const row = db().prepare('SELECT role, campaign_ids, expires_at, used_at FROM invite WHERE token_hash = ?').get(inviteHash(token)) as
    { role: Role; campaign_ids: string; expires_at: string; used_at: string | null } | undefined;
  if (!row || row.used_at || row.expires_at < new Date().toISOString()) return null;
  return { role: normalizeRole(row.role), campaignIds: JSON.parse(row.campaign_ids) };
}

/** Konto über eine Einladung anlegen und direkt anmelden */
export async function acceptInvite(token: string, username: string, password: string, locale: Locale = DEFAULT_LOCALE) {
  const inv = checkInvite(token);
  if (!inv) throw new Error('Einladung ungültig oder abgelaufen');
  const policy = validateNewPassword(password);
  if (policy) throw new Error(policy);
  if (db().prepare('SELECT 1 FROM admin WHERE username = ?').get(username)) throw new Error('Benutzername ist vergeben');
  const h = await hashPassword(password);
  // Einladung verbrauchen und Konto anlegen in einer Transaktion: parallele Einlösungen erzeugen kein zweites
  // Konto, und ein inzwischen vergebener Name verbrennt die Einladung nicht
  const id = tx(() => {
    if (db().prepare('SELECT 1 FROM admin WHERE username = ?').get(username)) throw new Error('Benutzername ist vergeben');
    const claim = db().prepare('UPDATE invite SET used_at = ? WHERE token_hash = ? AND used_at IS NULL').run(new Date().toISOString(), inviteHash(token));
    if (claim.changes !== 1) throw new Error('Einladung ungültig oder abgelaufen');
    const r = db().prepare('INSERT INTO admin(username, password_hash, created_at, role, locale) VALUES(?, ?, ?, ?, ?)').run(username, h, new Date().toISOString(), inv.role, toLocale(locale));
    const newId = Number(r.lastInsertRowid);
    for (const c of inv.campaignIds) if (db().prepare('SELECT 1 FROM campaign WHERE id = ?').get(c)) grantAccess(newId, c);
    return newId;
  });
  await startSession(id);
}
