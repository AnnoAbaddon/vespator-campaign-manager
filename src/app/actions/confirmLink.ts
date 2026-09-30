'use server';

import { publicError } from '@/server/errors';
import { revalidatePath } from 'next/cache';
import { redeemConfirmLink } from '@/server/confirmLink';
import { can, confirmAccess } from '@/server/authz';

/** Bestätigen/Widersprechen über den Einmal-Link (NTH2 1.5) – berechtigt nur für genau diese Aktion */
export async function confirmLinkAction(segments: string[], action: 'CONFIRM' | 'DISPUTE', reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  // Signatur zuerst (ohne Kampagnenzustand); ungültige Links bekommen eine einheitliche Antwort
  const access = confirmAccess(segments);
  if (!access || can(access.principal, 'confirm.redeem', { campaignId: access.parts.cid })) return { ok: false, error: 'Dieser Link ist ungültig.' };
  const p = access.parts;
  if (action !== 'CONFIRM' && action !== 'DISPUTE') return { ok: false, error: 'Unbekannte Aktion' };
  try {
    const r = redeemConfirmLink(p, action, String(reason ?? ''));
    if (!r.ok) return { ok: false, error: 'error' in r ? r.error : 'Aktion nicht möglich' };
    revalidatePath(`/admin/c/${p.cid}`, 'layout');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e) };
  }
}
