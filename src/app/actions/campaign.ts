'use server';

import { publicError, isDomainError } from '@/server/errors';
import crypto from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { changePassword, validateNewPassword } from '@/server/auth';
import { allowed, authorize, sessionPrincipal } from '@/server/authz';
import { z } from 'zod';
import { parseInput } from '@/server/actionInput';
import { createCampaign, deleteCampaign, getCampaign, regenerateToken, runCommand, setArchived, setPublicEnabled, undo, type RunResult } from '@/server/campaigns';
import { saveUpload, UPLOAD_KINDS, type UploadKind } from '@/server/uploads';
import { setPlanetArt, setSetting } from '@/server/db';
import type { Command } from '@/engine/commands';
import type { MapDef } from '@/engine/map';
import { deleteMapTemplate, listMapTemplates, saveMapTemplate } from '@/server/mapTemplates';
import { forkMap } from '@/engine/map';
import { audit } from '@/server/audit';
import { getCampaignTemplate } from '@/server/campaignTemplates';
import type { CampaignTemplateData } from '@/engine/campaignTemplate';

export async function runCommandAction(campaignId: string, baseRev: number, cmd: Command, opts: { force?: boolean; reason?: string; diceMode?: 'DIGITAL' | 'MANUAL'; manualDice?: number[] } = {}): Promise<RunResult> {
  const admin = await authorize('campaign.write', { campaignId });
  try {
    const r = runCommand(campaignId, baseRev, cmd, { ...opts, author: `SL: ${admin.username}` });
    if (r.ok) revalidatePath(`/admin/c/${campaignId}`, 'layout');
    return r;
  } catch (e) {
    return { ok: false, kind: 'error', error: publicError(e) };
  }
}

export async function undoAction(campaignId: string, baseRev: number, confirmed = false) {
  const admin = await authorize('campaign.write', { campaignId });
  const r = undo(campaignId, baseRev, confirmed);
  if (r.ok) {
    audit(admin.username, 'Rückgängig gemacht', `Rev. ${baseRev} → ${r.revision}`, campaignId);
    revalidatePath(`/admin/c/${campaignId}`, 'layout');
  }
  return r;
}

/**
 * Neue Kampagne – nur Admins (SPEC N5.2: Co-Warmaster haben volle Rechte nur in freigegebenen Kampagnen,
 * die Zuordnung von Kampagnen ist Sache der Admins). Kartenvorlage nach N5.5: Vespator oder eine
 * gespeicherte eigene Karte, die als eigenständige Kopie mit frischen Planeten-IDs übernommen wird.
 */
export async function createCampaignAction(_prev: string | null, form: FormData): Promise<string | null> {
  const admin = await authorize('campaign.create').catch(() => null);
  if (!admin) return 'Neue Kampagnen dürfen nur Admins anlegen';
  const name = String(form.get('name') ?? '').trim();
  const phaseCount = Number(form.get('phaseCount'));
  const allianceCount = Number(form.get('allianceCount'));
  const prev = String(form.get('previous') ?? '') || null;
  if (!name) return 'Name fehlt';
  if (!Number.isInteger(phaseCount) || phaseCount < 1 || phaseCount > 20) return 'Phasenanzahl 1–20';
  if (allianceCount !== 2 && allianceCount !== 3) return '2 oder 3 Allianzen';
  if (prev && !allowed(await sessionPrincipal(), 'campaign.read', { campaignId: prev })) return 'Kein Zugriff auf die Vorkampagne';
  // NTH2 2.6: Kampagnen-Vorlage (Regeln, Karte, Missionen, Größen, Rhythmus, Texte) – ersetzt die Kartenwahl
  const campaignTpl = String(form.get('campaignTemplate') ?? '');
  let template: CampaignTemplateData | null = null;
  if (campaignTpl) {
    try {
      template = getCampaignTemplate(campaignTpl);
    } catch (e) {
      return isDomainError(e) ? e.message : 'Vorlage ist beschädigt';
    }
    if (!template) return 'Kampagnen-Vorlage nicht gefunden';
  }
  const tpl = template ? '' : String(form.get('mapTemplate') ?? '');
  let map: MapDef | undefined;
  if (tpl && tpl !== 'vespator') {
    const found = listMapTemplates().find((m) => m.id === tpl);
    if (!found) return 'Kartenvorlage nicht gefunden';
    map = forkMap(found.map).map;
  }
  const id = createCampaign({ name, intro: String(form.get('intro') ?? ''), phaseCount, allianceCount, previousCampaignId: prev, map, author: `SL: ${admin.username}`, template });
  audit(admin.username, 'Kampagne angelegt', template ? `${name} · ${template.map.name}` : map ? `${name} · ${map.name}` : name, id);
  redirect(`/admin/c/${id}`);
}

export async function campaignAdminAction(campaignId: string, action: 'archive' | 'unarchive' | 'regenerate-token' | 'public-on' | 'public-off' | 'delete', confirmName?: string) {
  const admin = await authorize('campaign.write', { campaignId });
  if (action === 'delete' && !allowed(await sessionPrincipal(), 'campaign.delete', { campaignId })) return { ok: false, error: 'Löschen dürfen nur Admins' };
  const row = getCampaign(campaignId);
  if (!row) return { ok: false, error: 'Nicht gefunden' };
  const LABEL = {
    archive: 'Kampagne archiviert',
    unarchive: 'Archivierung aufgehoben',
    'regenerate-token': 'Öffentlichen Link neu erzeugt',
    'public-on': 'Leseansicht eingeschaltet',
    'public-off': 'Leseansicht ausgeschaltet',
    delete: 'Kampagne gelöscht',
  } as const;
  if (!Object.hasOwn(LABEL, action)) return { ok: false, error: 'Unbekannte Aktion' };
  if (action === 'delete' && confirmName !== row.name) return { ok: false, error: 'Name stimmt nicht überein' };
  // Sandboxes (NTH2 2.1) haben keine Leseansicht und werden über Verwerfen/Übernehmen beendet
  if (row.sandbox_of && action !== 'public-off') return { ok: false, error: 'In einer Sandbox nicht möglich' };
  audit(admin.username, LABEL[action], row.name, campaignId);
  switch (action) {
    case 'archive':
      setArchived(campaignId, true);
      break;
    case 'unarchive':
      setArchived(campaignId, false);
      break;
    case 'regenerate-token':
      regenerateToken(campaignId);
      break;
    case 'public-on':
      setPublicEnabled(campaignId, true);
      break;
    case 'public-off':
      setPublicEnabled(campaignId, false);
      break;
    case 'delete':
      deleteCampaign(campaignId);
      redirect('/admin');
  }
  revalidatePath(`/admin/c/${campaignId}`, 'layout');
  return { ok: true };
}

/** Bild-Upload: mit Kampagne für alle mit Zugriff darauf, globale Uploads (ohne Kampagne) nur für Admins */
export async function uploadAction(form: FormData): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const campaignId = form instanceof FormData ? String(form.get('campaignId') ?? '') || null : null;
  const admin = await authorize(campaignId ? 'campaign.upload' : 'upload.global', { campaignId }).catch((e: Error) => e);
  if (admin instanceof Error) return { ok: false, error: admin.message };
  const file = form.get('file');
  const kind = String(form.get('kind')) as UploadKind;
  if (!(file instanceof File)) return { ok: false, error: 'Keine Datei' };
  if (!UPLOAD_KINDS.includes(kind)) return { ok: false, error: 'Ungültiger Typ' };
  if (campaignId && !getCampaign(campaignId)) return { ok: false, error: 'Unbekannte Kampagne' };
  try {
    const id = await saveUpload(file, kind, campaignId, undefined, `a:${admin.id}`);
    audit(admin.username, 'Bild hochgeladen', `${kind} · ${id}`, campaignId);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: publicError(e) };
  }
}

export async function changePasswordAction(_prev: string | null, form: FormData): Promise<string | null> {
  const a = await authorize('account.self');
  const n = String(form.get('new') ?? '');
  const policy = validateNewPassword(n);
  if (policy) return policy;
  if (n !== String(form.get('new2') ?? '')) return 'Passwörter stimmen nicht überein';
  try {
    await changePassword(a.id, String(form.get('old') ?? ''), n);
    audit(a.username, 'Passwort geändert');
  } catch (e) {
    return publicError(e);
  }
  redirect('/login');
}

export async function regenerateHallTokenAction() {
  const a = await authorize('instance.manage');
  setSetting('hallToken', crypto.randomBytes(32).toString('base64url'));
  audit(a.username, 'Hall-of-Fame-Link neu erzeugt');
  revalidatePath('/admin/settings');
}

export async function loadRevisionStateAction(campaignId: string, revision: number) {
  await authorize('campaign.read', { campaignId });
  parseInput(z.number().int().positive(), revision);
  const { loadState } = await import('@/server/campaigns');
  return loadState(campaignId, revision);
}

/** Installationsweit: Planetenporträts und -landschaften als Bilder statt prozeduraler Grafik */
export async function setPlanetArtAction(formData: FormData) {
  const a = await authorize('instance.manage');
  const on = formData.get('planetArt') === 'on';
  setPlanetArt(on);
  audit(a.username, 'Planetenbilder umgeschaltet', on ? 'on' : 'off');
  revalidatePath('/', 'layout');
}

/** Karte als Vorlage speichern (gleicher Name überschreibt) */
export async function saveMapTemplateAction(map: MapDef): Promise<{ ok: boolean; error?: string }> {
  const a = await authorize('account.self');
  try {
    saveMapTemplate(map, a.role === 'ADMIN');
    audit(a.username, 'Kartenvorlage gespeichert', map.name);
    revalidatePath('/admin', 'layout');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteMapTemplateAction(id: string) {
  const a = await authorize('instance.manage');
  parseInput(z.string().max(64), id);
  const name = listMapTemplates().find((m) => m.id === id)?.name ?? id;
  deleteMapTemplate(id);
  audit(a.username, 'Kartenvorlage gelöscht', name);
  revalidatePath('/admin', 'layout');
}
