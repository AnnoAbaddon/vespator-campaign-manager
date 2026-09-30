import 'server-only';
import crypto from 'node:crypto';
import { db, getSetting, tx } from './db';
import { configuredAppUrl } from './origin';
import { contextLocale } from './locale';
import type { Locale } from '@/i18n/core';
import { generateVapidKeys, sendWebPush, validEndpoint, type PushOutcome, type VapidKeys } from './webpush';

/**
 * Web-Push (NTH2 1.1): VAPID-Schlüssel (beim ersten Gebrauch erzeugt und in den Einstellungen gespeichert),
 * Abonnements je Gerät und Besitzer, Zustellung für die Outbox. Besitzer ist entweder ein Spielerlink
 * (an dessen Hash gebunden – Sperren oder Erneuern des Links beendet auch das Abo) oder ein Spielleiter-Konto.
 */

export function vapidKeys(): VapidKeys {
  const raw = getSetting('vapid');
  if (raw) {
    try {
      const k = JSON.parse(raw) as VapidKeys;
      if (k.publicKey && k.privateKey) return k;
    } catch {}
  }
  const k = generateVapidKeys();
  // parallel erzeugte Schlüssel: der zuerst gespeicherte gewinnt
  db().prepare("INSERT OR IGNORE INTO settings(key, value) VALUES('vapid', ?)").run(JSON.stringify(k));
  return JSON.parse(getSetting('vapid')!) as VapidKeys;
}

export const vapidPublicKey = () => vapidKeys().publicKey;

/** Kontakt für die Push-Dienste (RFC 8292): Absender des SMTP-Servers, sonst die öffentliche Adresse */
function vapidSubject(): string {
  const from = (() => {
    try {
      return (JSON.parse(getSetting('smtp') ?? '{}') as { from?: string }).from ?? process.env.SMTP_FROM ?? '';
    } catch {
      return '';
    }
  })();
  const mail = from.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/)?.[0];
  if (mail) return `mailto:${mail}`;
  const url = configuredAppUrl() ?? '';
  return url.startsWith('https://') ? url : 'mailto:warmaster@vespator.invalid';
}

export type PushOwner = { kind: 'PLAYER'; campaignId: string; playerId: string; tokenHash: string } | { kind: 'ADMIN'; adminId: number };

const ownerKey = (o: PushOwner) => (o.kind === 'PLAYER' ? `p:${o.campaignId}:${o.playerId}` : `a:${o.adminId}`);

export interface PushSubInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Prüft ein Abonnement aus dem Browser (PushSubscription.toJSON()) */
export function parseSubscription(raw: unknown): PushSubInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (!validEndpoint(r.endpoint)) return null;
  const p = r.keys?.p256dh;
  const a = r.keys?.auth;
  if (typeof p !== 'string' || typeof a !== 'string' || !/^[\w-]{80,100}$/.test(p) || !/^[\w-]{16,40}$/.test(a)) return null;
  if (Buffer.from(p, 'base64url').length !== 65 || Buffer.from(a, 'base64url').length < 16) return null;
  return { endpoint: r.endpoint, keys: { p256dh: p, auth: a } };
}

/** Höchstzahl der Geräte je Besitzer; ein weiteres Abo verdrängt das älteste */
export const MAX_PUSH_SUBS_PER_OWNER = 5;

export function savePushSub(owner: PushOwner, sub: PushSubInput) {
  const o = ownerKey(owner);
  const pl = owner.kind === 'PLAYER' ? owner : null;
  tx(() => {
    db()
      .prepare(
        `INSERT INTO push_sub(id, owner, endpoint, p256dh, auth, campaign_id, player_id, token_hash, admin_id, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(owner, endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, token_hash = excluded.token_hash`,
      )
      .run(
        crypto.randomBytes(12).toString('base64url'),
        o,
        sub.endpoint,
        sub.keys.p256dh,
        sub.keys.auth,
        pl?.campaignId ?? null,
        pl?.playerId ?? null,
        pl?.tokenHash ?? null,
        owner.kind === 'ADMIN' ? owner.adminId : null,
        new Date().toISOString(),
      );
    // älteste Abos über der Obergrenze entfernen (das eben gespeicherte bleibt immer)
    db()
      .prepare('DELETE FROM push_sub WHERE owner = ? AND endpoint != ? AND id NOT IN (SELECT id FROM push_sub WHERE owner = ? AND endpoint != ? ORDER BY created_at DESC, rowid DESC LIMIT ?)')
      .run(o, sub.endpoint, o, sub.endpoint, MAX_PUSH_SUBS_PER_OWNER - 1);
  });
}

export function deletePushSub(owner: PushOwner, endpoint: string) {
  db().prepare('DELETE FROM push_sub WHERE owner = ? AND endpoint = ?').run(ownerKey(owner), endpoint);
}

export function hasPushSub(owner: PushOwner, endpoint: string): boolean {
  return !!db().prepare('SELECT 1 FROM push_sub WHERE owner = ? AND endpoint = ?').get(ownerKey(owner), endpoint);
}

/** Abonnements eines Spielers – nur solche, deren Spielerlink noch gilt */
export function playerPushSubIds(campaignId: string, playerId: string): string[] {
  return (
    db().prepare('SELECT s.id FROM push_sub s JOIN player_token t ON t.token_hash = s.token_hash AND t.revoked = 0 WHERE s.campaign_id = ? AND s.player_id = ? ORDER BY s.created_at').all(campaignId, playerId) as {
      id: string;
    }[]
  ).map((r) => r.id);
}

/** Abonnements der Spielleiter-Konten mit Zugriff auf die Kampagne (Admins: alle; Co-Warmaster: freigegebene) */
export function adminPushSubs(campaignId: string): { id: string; locale: Locale }[] {
  const origin = (db().prepare('SELECT sandbox_of FROM campaign WHERE id = ?').get(campaignId) as { sandbox_of: string | null } | undefined)?.sandbox_of ?? campaignId;
  const rows = db()
    .prepare(
      `SELECT s.id, a.locale FROM push_sub s JOIN admin a ON a.id = s.admin_id
       WHERE s.admin_id IS NOT NULL AND (a.role = 'ADMIN' OR EXISTS (SELECT 1 FROM campaign_access c WHERE c.admin_id = a.id AND c.campaign_id = ?)) ORDER BY s.created_at`,
    )
    .all(origin) as { id: string; locale: string }[];
  return rows.map((r) => ({ id: r.id, locale: contextLocale(r.locale) }));
}

/** Nachricht an den Browser (vom Service Worker angezeigt) */
export interface PushPayload {
  title: string;
  body: string;
  /** relativer Pfad, der beim Klick geöffnet wird */
  url: string;
  tag?: string;
}

export type DeliverResult = PushOutcome | { kind: 'MISSING' };

/**
 * Zustellung einer Outbox-Zeile. Erloschene Abonnements (404/410) werden für alle Besitzer desselben
 * Endpunkts gelöscht; gesperrte Spielerlinks gelten als erloschen.
 */
export async function deliverPush(subId: string, payload: string, fetchImpl?: typeof fetch): Promise<DeliverResult> {
  const row = db().prepare('SELECT endpoint, p256dh, auth, token_hash, admin_id FROM push_sub WHERE id = ?').get(subId) as
    { endpoint: string; p256dh: string; auth: string; token_hash: string | null; admin_id: number | null } | undefined;
  if (!row) return { kind: 'MISSING' };
  if (row.token_hash && !db().prepare('SELECT 1 FROM player_token WHERE token_hash = ? AND revoked = 0').get(row.token_hash)) {
    db().prepare('DELETE FROM push_sub WHERE id = ?').run(subId);
    return { kind: 'MISSING' };
  }
  const r = await sendWebPush({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload, vapidKeys(), vapidSubject(), { fetchImpl: fetchImpl ?? pushFetch.impl });
  if (r.kind === 'GONE') db().prepare('DELETE FROM push_sub WHERE endpoint = ?').run(row.endpoint);
  return r;
}

/** Test-Hook: eigener fetch für die Zustellung (Mock-Endpunkt in Unit-Tests) */
export const pushFetch: { impl: typeof fetch | undefined } = { impl: undefined };
