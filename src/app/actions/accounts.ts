'use server';

import { publicError } from '@/server/errors';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { acceptInvite, createInvite, deleteAccount, grantAccess, revokeAccess, setLocale, USERNAME_RE, validateNewPassword, type Role } from '@/server/auth';
import { authorize, can, inviteAccess } from '@/server/authz';
import { z } from 'zod';
import { parseInput } from '@/server/actionInput';
import { getCampaign } from '@/server/campaigns';
import { publicOrigin, setPublicUrl } from '@/server/origin';
import { audit } from '@/server/audit';
import { db, setDefaultLocale } from '@/server/db';
import { LANG_COOKIE } from '@/server/requestLocale';
import { toLocale, type Locale } from '@/i18n/core';

const nameOf = (id: number) => (db().prepare('SELECT username FROM admin WHERE id = ?').get(id) as { username: string } | undefined)?.username ?? `#${id}`;

/** Einladungslink für ein neues Konto (N5.2) – nur Admins */
export async function createInviteAction(role: Role, campaignIds: string[]): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const a = await authorize('instance.manage');
  if (role !== 'ADMIN' && role !== 'COWARMASTER') return { ok: false, error: 'Ungültige Rolle' };
  const list = parseInput(z.array(z.string().max(64)).max(200), campaignIds);
  const ids = list.filter((c) => getCampaign(c));
  const token = createInvite(a.id, role, ids);
  audit(a.username, 'Einladung erzeugt', `${role}${ids.length ? ` · ${ids.join(', ')}` : ''}`);
  return { ok: true, url: `${publicOrigin(await headers())}/einladung/${token}` };
}

export async function setAccessAction(adminId: number, campaignId: string, grant: boolean) {
  const a = await authorize('instance.manage');
  parseInput(z.tuple([z.number().int().positive(), z.string().max(64), z.boolean()]), [adminId, campaignId, grant]);
  if (!getCampaign(campaignId)) return;
  if (grant) grantAccess(adminId, campaignId);
  else revokeAccess(adminId, campaignId);
  audit(a.username, grant ? 'Kampagne freigegeben' : 'Freigabe entzogen', nameOf(adminId), campaignId);
  revalidatePath('/admin/settings');
}

export async function deleteAccountAction(id: number): Promise<{ ok: boolean; error?: string }> {
  const a = await authorize('instance.manage');
  // Laufzeit-Typprüfung: „1“ als Text würde sonst den Vergleich mit dem eigenen Konto umgehen
  if (!z.number().int().positive().safeParse(id).success) return { ok: false, error: 'Ungültige Eingabe' };
  if (a.id === id) return { ok: false, error: 'Das eigene Konto kann nicht gelöscht werden' };
  try {
    const name = nameOf(id);
    deleteAccount(id);
    audit(a.username, 'Konto gelöscht', name);
    revalidatePath('/admin/settings');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e) };
  }
}

/** Sprache der Verwaltung je Konto (N5.4); setzt auch das Sprach-Cookie, damit Wahl und Konto übereinstimmen */
export async function setLocaleAction(locale: Locale) {
  const a = await authorize('account.self');
  const l = toLocale(locale);
  setLocale(a.id, l);
  (await cookies()).set(LANG_COOKIE, l, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  audit(a.username, 'Sprache geändert', l);
  revalidatePath('/', 'layout');
}

/** Globale Standardsprache (Rückfall für Anmeldung, Leseansicht, Spielerseiten und neue Kampagnen) – nur Admins */
export async function setDefaultLocaleAction(locale: Locale) {
  const a = await authorize('instance.manage');
  const l = toLocale(locale);
  setDefaultLocale(l);
  audit(a.username, 'Standardsprache geändert', l);
  revalidatePath('/', 'layout');
}

/**
 * Öffentliche Adresse für Links in Nachrichten (E-Mail, Push, Discord) – nur Admins, nur ausdrücklich gesetzt.
 * Ohne APP_URL und ohne diese Einstellung zeigen Links auf http://localhost:3000.
 */
export async function setPublicUrlAction(_prev: string | null, form: FormData): Promise<string | null> {
  const a = await authorize('instance.manage');
  if (process.env.APP_URL?.trim()) return 'Die Adresse ist über APP_URL fest eingestellt';
  const value = String(form.get('publicUrl') ?? '').slice(0, 300);
  const err = setPublicUrl(value);
  if (err) return err;
  audit(a.username, 'Öffentliche Adresse geändert', value.trim() || '–');
  revalidatePath('/admin/settings');
  return value.trim() ? 'Adresse gespeichert' : 'Adresse entfernt';
}

/** Konto über eine Einladung anlegen (einmalig) */
export async function acceptInviteAction(token: string, _prev: string | null, form: FormData): Promise<string | null> {
  if (can(inviteAccess(token), 'invite.accept')) return 'Einladung ungültig oder abgelaufen';
  const username = String(form.get('username') ?? '').trim();
  const pw = String(form.get('password') ?? '');
  if (!USERNAME_RE.test(username)) return 'Benutzername: 3–32 Zeichen (Buchstaben, Ziffern, _ . -)';
  const policy = validateNewPassword(pw);
  if (policy) return policy;
  if (pw !== String(form.get('password2') ?? '')) return 'Passwörter stimmen nicht überein';
  try {
    // Kontosprache: die Sprache, in der die Einladung angezeigt wurde
    await acceptInvite(token, username, pw, toLocale(form.get('locale')));
    audit(username, 'Konto über Einladung angelegt');
  } catch (e) {
    return publicError(e);
  }
  redirect('/admin');
}
