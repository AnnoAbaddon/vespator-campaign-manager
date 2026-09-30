'use server';

import { publicError } from '@/server/errors';
import { revalidatePath } from 'next/cache';
import { authorize } from '@/server/authz';
import { z } from 'zod';
import { parseInput } from '@/server/actionInput';
import { audit } from '@/server/audit';
import { currentState } from '@/server/campaigns';
import { clearErrors, setErrorWebhook } from '@/server/health';
import { deletePlayerContact, exportPlayer, runPrivacyCleanup, setPrivacySettings, type PrivacySettings } from '@/server/privacy';
import { i18nOverrides, saveI18nOverrides } from '@/server/i18nStore';
import { PACKS } from '@/i18n/packs';
import { buildCatalog, importCatalog } from '@/i18n/catalog';
import type { Locale } from '@/i18n/core';

type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: publicError(e) });

// ─── Datenschutz (NTH2 6.4) ────────────────────────────────────────────────

/** Alle Daten eines Spielers als JSON (auf Wunsch des Spielers); protokolliert */
export async function exportPlayerDataAction(campaignId: string, playerId: string): Promise<Res<{ json: string; filename: string }>> {
  try {
    const a = await authorize('campaign.write', { campaignId });
    parseInput(z.string().max(64), playerId);
    const data = exportPlayer(campaignId, playerId);
    if (!data) return { ok: false, error: 'Spieler nicht gefunden' };
    audit(a.username, 'Spielerdaten exportiert', data.player.nickname, campaignId);
    return { ok: true, json: JSON.stringify(data, null, 2), filename: `spielerdaten-${data.player.nickname.replace(/[^\p{L}\p{N}]+/gu, '-')}.json` };
  } catch (e) {
    return fail(e);
  }
}

/** Kontaktdaten eines Spielers löschen – in allen Revisionen und in der Outbox; protokolliert */
export async function deletePlayerContactAction(campaignId: string, playerId: string): Promise<Res<{ revisions: number }>> {
  try {
    const a = await authorize('campaign.write', { campaignId });
    parseInput(z.string().max(64), playerId);
    if (!currentState(campaignId).state.players.some((p) => p.id === playerId)) return { ok: false, error: 'Spieler nicht gefunden' };
    const revisions = deletePlayerContact(campaignId, playerId, a.username);
    revalidatePath(`/admin/c/${campaignId}`, 'layout');
    return { ok: true, revisions };
  } catch (e) {
    return fail(e);
  }
}

export async function setPrivacySettingsAction(s: PrivacySettings): Promise<Res> {
  try {
    const a = await authorize('instance.manage');
    parseInput(z.object({ days: z.number().nullable(), contact: z.boolean(), notes: z.boolean(), pulse: z.boolean() }), s);
    setPrivacySettings(s);
    audit(a.username, 'Datenschutz-Einstellungen geändert', s.days ? `${s.days} d` : 'aus');
    revalidatePath('/admin/betrieb');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function runPrivacyCleanupAction(): Promise<Res<{ campaigns: number }>> {
  try {
    await authorize('instance.manage');
    const done = runPrivacyCleanup();
    revalidatePath('/admin/betrieb');
    return { ok: true, campaigns: done.length };
  } catch (e) {
    return fail(e);
  }
}

// ─── Health (NTH2 6.2) ─────────────────────────────────────────────────────

export async function setErrorWebhookAction(url: string): Promise<Res> {
  try {
    const a = await authorize('instance.manage');
    parseInput(z.string().max(1000), url);
    setErrorWebhook(url.trim() || null);
    audit(a.username, url.trim() ? 'Fehler-Benachrichtigung eingerichtet' : 'Fehler-Benachrichtigung entfernt');
    revalidatePath('/admin/betrieb');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function clearErrorsAction(): Promise<Res> {
  try {
    const a = await authorize('instance.manage');
    clearErrors();
    audit(a.username, 'Fehlerprotokoll geleert');
    revalidatePath('/admin/betrieb');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ─── Übersetzungsdatei (NTH2 7.2) ──────────────────────────────────────────

/** Import einer Übersetzungsdatei (CSV oder JSON): übernimmt Abweichungen als importierte Übersetzungen */
export async function importTranslationsAction(text: string): Promise<Res<{ changed: Partial<Record<Locale, number>>; unknown: number; rejected: number }>> {
  try {
    const a = await authorize('instance.manage');
    parseInput(z.string(), text);
    if (text.length > 5_000_000) return { ok: false, error: 'Datei zu groß' };
    const res = importCatalog(text, buildCatalog(PACKS));
    const cur = i18nOverrides();
    const next: Partial<Record<Locale, Record<string, string>>> = { ...cur };
    for (const [l, dict] of Object.entries(res.overrides)) next[l as Locale] = { ...(cur[l as Locale] ?? {}), ...dict };
    saveI18nOverrides(next);
    audit(
      a.username,
      'Übersetzungen importiert',
      Object.entries(res.changed)
        .map(([l, n]) => `${l}: ${n}`)
        .join(', ') || '–',
    );
    revalidatePath('/', 'layout');
    return { ok: true, changed: res.changed, unknown: res.unknown, rejected: res.rejected.length };
  } catch (e) {
    return fail(e);
  }
}

/** Importierte Übersetzungen einer Sprache (oder aller) verwerfen – es gelten wieder die eingebauten */
export async function resetTranslationsAction(locale: Locale | 'ALL'): Promise<Res> {
  try {
    const a = await authorize('instance.manage');
    parseInput(z.enum(['ALL', 'de', 'en', 'fr', 'es', 'pl']), locale);
    const cur = { ...i18nOverrides() };
    if (locale === 'ALL') for (const k of Object.keys(cur)) delete cur[k as Locale];
    else delete cur[locale];
    saveI18nOverrides(cur);
    audit(a.username, 'Importierte Übersetzungen verworfen', locale);
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
