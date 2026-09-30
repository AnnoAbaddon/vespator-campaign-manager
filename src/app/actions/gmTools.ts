'use server';

import { publicError } from '@/server/errors';
import { revalidatePath } from 'next/cache';
import { authorize } from '@/server/authz';
import { z } from 'zod';
import { parseInput } from '@/server/actionInput';
import { audit } from '@/server/audit';
import { getCampaign } from '@/server/campaigns';
import { applySandbox, createSandbox, discardSandbox } from '@/server/sandbox';
import { deleteCampaignTemplate, saveCampaignTemplate } from '@/server/campaignTemplates';
import { remindBattle } from '@/server/notify';

/**
 * Werkzeuge der Spielleitung (Welle 1, R3): Szenario-Sandbox (NTH2 2.1), Kampagnen-Vorlagen (NTH2 2.6) und
 * „Erinnern“ aus „Handlungsbedarf“ (NTH2 2.7). Fehler kommen als deutscher Text (Übersetzungsschlüssel) zurück.
 */

const errText = (e: unknown) => publicError(e);

export async function createSandboxAction(campaignId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const admin = await authorize('campaign.write', { campaignId });
  try {
    const id = createSandbox(campaignId, `SL: ${admin.username}`);
    audit(admin.username, 'Sandbox angelegt', getCampaign(id)?.name ?? id, campaignId);
    revalidatePath(`/admin/c/${campaignId}`, 'layout');
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

export async function discardSandboxAction(sandboxId: string): Promise<{ ok: true; originalId: string } | { ok: false; error: string }> {
  const admin = await authorize('campaign.write', { campaignId: sandboxId });
  try {
    const r = discardSandbox(sandboxId);
    audit(admin.username, 'Sandbox verworfen', r.name, r.of);
    revalidatePath(`/admin/c/${r.of}`, 'layout');
    return { ok: true, originalId: r.of };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

export async function applySandboxAction(sandboxId: string, reason: string, confirmed = false) {
  const admin = await authorize('campaign.write', { campaignId: sandboxId });
  const name = getCampaign(sandboxId)?.name ?? sandboxId;
  try {
    const r = applySandbox(sandboxId, { reason, confirmed, author: `SL: ${admin.username}` });
    if (r.ok) {
      audit(admin.username, 'Sandbox übernommen', `${name} · ${reason}`, r.originalId);
      revalidatePath(`/admin/c/${r.originalId}`, 'layout');
    }
    return r;
  } catch (e) {
    return { ok: false as const, error: errText(e) };
  }
}

export async function saveCampaignTemplateAction(campaignId: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await authorize('campaign.read', { campaignId });
  if (typeof name !== 'string') return { ok: false, error: 'Ungültige Eingabe' };
  try {
    saveCampaignTemplate(campaignId, name, admin.username, admin.role === 'ADMIN');
    audit(admin.username, 'Kampagnen-Vorlage gespeichert', name.trim(), campaignId);
    revalidatePath('/admin', 'layout');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

export async function deleteCampaignTemplateAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await authorize('instance.manage');
  parseInput(z.string().max(64), id);
  const name = deleteCampaignTemplate(id);
  audit(admin.username, 'Kampagnen-Vorlage gelöscht', name ?? id);
  revalidatePath('/admin', 'layout');
  return { ok: true };
}

export async function remindAction(campaignId: string, battleId: string) {
  const admin = await authorize('campaign.write', { campaignId });
  if (getCampaign(campaignId)?.sandbox_of) return { ok: false as const, error: 'In einer Sandbox werden keine Nachrichten verschickt' };
  try {
    const r = remindBattle(campaignId, battleId);
    if (r.ok) audit(admin.username, 'Erinnerung verschickt', r.names.join(', '), campaignId);
    return r;
  } catch (e) {
    return { ok: false as const, error: errText(e) };
  }
}
