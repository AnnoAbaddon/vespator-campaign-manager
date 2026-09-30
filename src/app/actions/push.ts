'use server';

import { publicError } from '@/server/errors';
import { authorize, playerGate, type Action } from '@/server/authz';
import { deletePushSub, deliverPush, hasPushSub, parseSubscription, savePushSub, type PushOwner } from '@/server/push';
import { db } from '@/server/db';
import { makeT, type Locale } from '@/i18n/core';
import { contextLocale } from '@/server/locale';

/**
 * Web-Push abonnieren (NTH2 1.1): je Gerät für einen Spielerlink oder ein Spielleiter-Konto.
 * Nach dem Abonnieren kommt sofort eine Probenachricht – so sieht man gleich, ob es funktioniert.
 */
type Res = { ok: true; active: boolean; warning?: string } | { ok: false; error: string };

/** Besitzer eines Push-Abos aus dem Spielerlink; abonnieren nur aktive Spieler, abbestellen jeder gültige Link */
function playerOwner(token: string, action: Action): { owner: PushOwner; locale: Locale } | null {
  const g = playerGate(token, action);
  if (!g.ok || g.session.archived) return null;
  const s = g.session;
  return { owner: { kind: 'PLAYER', campaignId: s.campaignId, playerId: s.playerId, tokenHash: s.principal.tokenHash }, locale: contextLocale(s.player.locale, s.state.meta.locale) };
}

const adminOwner = (a: { id: number; locale: Locale }): { owner: PushOwner; locale: Locale } => ({ owner: { kind: 'ADMIN', adminId: a.id }, locale: a.locale });

/** Probenachricht direkt (ohne Outbox) an das eben gespeicherte Abonnement */
async function probe(owner: PushOwner, endpoint: string, locale: Locale, url: string): Promise<string | undefined> {
  const t = makeT(locale);
  const row = db()
    .prepare('SELECT id FROM push_sub WHERE owner = ? AND endpoint = ?')
    .get(owner.kind === 'PLAYER' ? `p:${owner.campaignId}:${owner.playerId}` : `a:${owner.adminId}`, endpoint) as { id: string } | undefined;
  if (!row) return 'Ungültiges Push-Abonnement';
  try {
    const r = await deliverPush(row.id, JSON.stringify({ title: 'Vespator Front', body: t('Push-Benachrichtigungen sind auf diesem Gerät aktiv.'), url, tag: 'vf-probe' }));
    if (r.kind === 'SENT') return undefined;
    // Antworten des Push-Dienstes (Status, Fehlertexte) gehen nicht an den Browser zurück
    return r.kind === 'ERROR' ? 'Der Push-Dienst hat die Nachricht nicht angenommen' : r.kind === 'RETRY' ? undefined : 'Push-Abonnement abgelaufen – entfernt';
  } catch (e) {
    console.error('Push-Probenachricht fehlgeschlagen', e);
    return 'Push-Dienst nicht erreichbar';
  }
}

async function subscribe(o: { owner: PushOwner; locale: Locale } | null, raw: unknown, url: string): Promise<Res> {
  if (!o) return { ok: false, error: 'Link ungültig oder gesperrt' };
  const sub = parseSubscription(raw);
  if (!sub) return { ok: false, error: 'Ungültiges Push-Abonnement' };
  savePushSub(o.owner, sub);
  const warning = await probe(o.owner, sub.endpoint, o.locale, url);
  return { ok: true, active: hasPushSub(o.owner, sub.endpoint), warning };
}

export async function playerPushStatusAction(token: string, endpoint: string): Promise<boolean> {
  const o = playerOwner(token, 'player.unlink');
  return !!o && typeof endpoint === 'string' && hasPushSub(o.owner, endpoint);
}

export async function playerPushSubscribeAction(token: string, sub: unknown): Promise<Res> {
  const o = playerOwner(token, 'player.devices');
  return subscribe(o, sub, `/p/${token}`);
}

export async function playerPushUnsubscribeAction(token: string, endpoint: string): Promise<Res> {
  const o = playerOwner(token, 'player.unlink');
  if (!o) return { ok: false, error: 'Link ungültig oder gesperrt' };
  deletePushSub(o.owner, String(endpoint));
  return { ok: true, active: false };
}

export async function adminPushStatusAction(endpoint: string): Promise<boolean> {
  const o = adminOwner(await authorize('account.self'));
  return typeof endpoint === 'string' && hasPushSub(o.owner, endpoint);
}

export async function adminPushSubscribeAction(sub: unknown): Promise<Res> {
  try {
    return await subscribe(adminOwner(await authorize('account.self')), sub, '/admin');
  } catch (e) {
    return { ok: false, error: publicError(e) };
  }
}

export async function adminPushUnsubscribeAction(endpoint: string): Promise<Res> {
  const o = adminOwner(await authorize('account.self'));
  deletePushSub(o.owner, String(endpoint));
  return { ok: true, active: false };
}
