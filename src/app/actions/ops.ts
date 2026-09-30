'use server';

import { publicError } from '@/server/errors';
import { revalidatePath } from 'next/cache';
import { authorize, unsubscribeAccess, can } from '@/server/authz';
import { isSingleEmail } from '@/server/actionInput';
import { getCampaign, runCommand } from '@/server/campaigns';
import { retryOutbox, sendTest, setDiscordWebhook, setSmtpConfig, smtpConfig, flushOutbox, playerForUnsubscribe, testMailLimited, unsubscribeCategories } from '@/server/notify';
import { backupCampaign, restoreBackup } from '@/server/autoBackup';
import type { NotifyCategory } from '@/engine/types';
import { audit } from '@/server/audit';

type R = { ok: true; message?: string; id?: string } | { ok: false; error: string };
const err = (e: unknown): R => ({ ok: false, error: publicError(e) });

// ─── Benachrichtigungen (N1.4) ─────────────────────────────────────────────

export async function setDiscordWebhookAction(campaignId: string, url: string): Promise<R> {
  const a = await authorize('campaign.write', { campaignId });
  if (typeof url !== 'string' || url.length > 1000) return { ok: false, error: 'Ungültige Eingabe' };
  if (!getCampaign(campaignId)) return { ok: false, error: 'Unbekannte Kampagne' };
  try {
    setDiscordWebhook(campaignId, url.trim() || null);
    audit(a.username, url.trim() ? 'Discord-Webhook gespeichert' : 'Discord-Webhook entfernt', null, campaignId);
    revalidatePath(`/admin/c/${campaignId}`, 'layout');
    return { ok: true, message: url.trim() ? 'Webhook gespeichert' : 'Webhook entfernt' };
  } catch (e) {
    return err(e);
  }
}

/**
 * Testnachricht: Discord für alle mit Zugriff auf die Kampagne; E-Mail nur für Admins, an genau eine geprüfte Adresse
 * und höchstens 5 pro Stunde (F10 – der Club-SMTP darf kein Versandrelais werden).
 */
export async function sendTestAction(campaignId: string, email: string | null): Promise<R> {
  const a = await authorize(email === null ? 'campaign.write' : 'mail.test', { campaignId }).catch((e: Error) => e);
  if (a instanceof Error) return { ok: false, error: a.message };
  if (email !== null && !isSingleEmail(email)) return { ok: false, error: 'Ungültige E-Mail-Adresse' };
  if (email !== null && testMailLimited(`a:${a.id}`)) return { ok: false, error: 'Zu viele Testnachrichten – bitte später erneut versuchen' };
  try {
    sendTest(campaignId, email);
    audit(a.username, 'Testnachricht verschickt', email ?? 'Discord', campaignId);
    await flushOutbox();
    revalidatePath(`/admin/c/${campaignId}`, 'layout');
    return { ok: true, message: 'Testnachricht verschickt – Status siehe Versandprotokoll' };
  } catch (e) {
    return err(e);
  }
}

export async function retryOutboxAction(campaignId: string): Promise<R> {
  const a = await authorize('campaign.write', { campaignId });
  retryOutbox(campaignId);
  audit(a.username, 'Fehlgeschlagene Nachrichten erneut gesendet', null, campaignId);
  await flushOutbox();
  revalidatePath(`/admin/c/${campaignId}`, 'layout');
  return { ok: true, message: 'Erneut versucht' };
}

export async function setSmtpAction(_prev: string | null, form: FormData): Promise<string | null> {
  const a = await authorize('instance.manage');
  const host = String(form.get('host') ?? '').trim();
  if (!host) {
    setSmtpConfig(null);
    audit(a.username, 'SMTP-Einstellungen entfernt');
    return 'SMTP-Einstellungen entfernt';
  }
  const from = String(form.get('from') ?? '').trim();
  if (!from.includes('@')) return 'Absender (From) fehlt';
  const port = Number(form.get('port') ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return 'Ungültiger Port';
  const prev = smtpConfig();
  const pass = String(form.get('pass') ?? '') || prev?.pass || '';
  const secure = form.get('secure') === 'on';
  // Opt-out für lokale Relays: ohne erzwungenes TLS (nur ohne direktes TLS sinnvoll)
  const insecure = !secure && form.get('insecure') === 'on';
  setSmtpConfig({ host, port, secure, user: String(form.get('user') ?? ''), pass, from, ...(insecure ? { insecure: true } : {}) });
  audit(a.username, 'SMTP-Einstellungen gespeichert', `${host}:${port}${insecure ? ' · ohne TLS-Pflicht' : ''}`);
  return 'Gespeichert';
}

/** Abmeldelink aus einer E-Mail (N1.4) – bestätigt per Formular, nicht schon beim Öffnen des Links */
export async function unsubscribeAction(campaignId: string, playerId: string, sig: string, category: NotifyCategory | 'ALL'): Promise<R> {
  if (can(unsubscribeAccess(campaignId, playerId, sig), 'unsubscribe', { campaignId })) return { ok: false, error: 'Ungültiger Abmeldelink' };
  // nur bekannte Kategorien – der Wert kommt vom Client und landet sonst ungeprüft im Spielerprofil
  const cats = unsubscribeCategories(category);
  if (!cats) return { ok: false, error: 'Ungültige Kategorie' };
  const p = playerForUnsubscribe(campaignId, playerId);
  if (!p) return { ok: false, error: 'Spieler nicht gefunden' };
  const r = runCommand(campaignId, -1, { type: 'PROFILE_UPDATE', playerId, update: { notify: Object.fromEntries(cats.map((c) => [c, false])) } }, { force: true, author: 'Abmeldelink' });
  return r.ok ? { ok: true, message: 'Abgemeldet' } : { ok: false, error: 'error' in r ? r.error : 'Fehler' };
}

// ─── Backups (N5.1) ────────────────────────────────────────────────────────

export async function backupNowAction(campaignId: string): Promise<R> {
  const a = await authorize('campaign.write', { campaignId });
  try {
    const b = backupCampaign(campaignId, true);
    audit(a.username, 'Backup erstellt', b.file, campaignId);
    revalidatePath(`/admin/c/${campaignId}`, 'layout');
    return { ok: true, message: `Backup erstellt (${Math.round(b.size / 1024)} KB)` };
  } catch (e) {
    return err(e);
  }
}

/** Wiederherstellen legt eine neue Kampagne an – wie Anlegen und Importieren nur für Admins (F4); die Kopie ist nicht öffentlich */
export async function restoreBackupAction(campaignId: string, file: string): Promise<R> {
  const admin = await authorize('campaign.restore', { campaignId }).catch((e: Error) => e);
  if (admin instanceof Error) return { ok: false, error: admin.message };
  if (typeof file !== 'string') return { ok: false, error: 'Ungültige Datei' };
  try {
    const id = restoreBackup(campaignId, file, admin.username);
    revalidatePath('/admin');
    return { ok: true, id, message: 'Als neue Kampagne wiederhergestellt – die Leseansicht ist ausgeschaltet' };
  } catch (e) {
    return err(e);
  }
}
