'use server';

import { publicError } from '@/server/errors';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { LANG_COOKIE } from '@/server/requestLocale';
import { authorize, playerGate } from '@/server/authz';
import { getCampaign, type RunResult } from '@/server/campaigns';
import { regeneratePlayerToken, revokePlayerToken, runAsPlayer, uploadLimited } from '@/server/players';
import { saveUpload } from '@/server/uploads';
import type { Command } from '@/engine/commands';
import { audit } from '@/server/audit';
import { currentState } from '@/server/campaigns';
import { toLocale, type Locale } from '@/i18n/core';

/** Aktion über den persönlichen Spieler-Link (N1) */
export async function runPlayerCommandAction(token: string, cmd: Command): Promise<RunResult> {
  const g = playerGate(token, 'player.command');
  if (!g.ok) return { ok: false, kind: 'error', error: g.error };
  try {
    const r = runAsPlayer(g.session, cmd, token);
    if (r.ok) {
      revalidatePath(`/p/${token}`, 'layout');
      revalidatePath(`/admin/c/${g.session.campaignId}`, 'layout');
    }
    return r;
  } catch (e) {
    return { ok: false, kind: 'error', error: publicError(e) };
  }
}

/** Sprachschalter der Spielerseite: speichert die Sprache im Profil des Spielers und setzt das Sprach-Cookie */
export async function setPlayerLocaleAction(token: string, locale: Locale): Promise<void> {
  const g = playerGate(token, 'player.command');
  const l = toLocale(locale);
  (await cookies()).set(LANG_COOKIE, l, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  if (!g.ok || g.session.archived || g.session.player.locale === l) return;
  await runPlayerCommandAction(token, { type: 'PROFILE_UPDATE', playerId: g.session.playerId, update: { locale: l } });
}

/** Fotos/Avatar vom Spieler (Rate-Limit über die Command-Aktion, hier nur Token und Typ prüfen) */
export async function playerUploadAction(token: string, form: FormData): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const g = playerGate(token, 'player.upload');
  if (!g.ok) return g;
  const s = g.session;
  if (s.archived) return { ok: false, error: 'Die Kampagne ist archiviert' };
  if (uploadLimited(token)) return { ok: false, error: 'Zu viele Uploads – bitte eine Minute warten' };
  const file = form.get('file');
  const kind = String(form.get('kind'));
  if (!(file instanceof File)) return { ok: false, error: 'Keine Datei' };
  if (kind !== 'AVATAR' && kind !== 'BATTLE_PHOTO') return { ok: false, error: 'Ungültiger Typ' };
  try {
    // HEIC-Fairness je Spielerlink (Hash statt Klartext-Token im Speicher); das Bild gehört diesem Spieler (F6)
    const owner = `player:${s.principal.tokenHash.slice(0, 32)}`;
    return { ok: true, id: await saveUpload(file, kind, s.campaignId, owner, `p:${s.playerId}`) };
  } catch (e) {
    return { ok: false, error: publicError(e) };
  }
}

/** Spielerlink neu erzeugen oder sperren (Spielleiter) */
export async function playerLinkAction(campaignId: string, playerId: string, action: 'regenerate' | 'revoke') {
  const a = await authorize('campaign.write', { campaignId });
  if (!getCampaign(campaignId)) return { ok: false as const, error: 'Unbekannte Kampagne' };
  if (action !== 'regenerate' && action !== 'revoke') return { ok: false as const, error: 'Unbekannte Aktion' };
  const nick = currentState(campaignId).state.players.find((p) => p.id === playerId)?.nickname;
  if (!nick) return { ok: false as const, error: 'Spieler nicht gefunden' };
  if (action === 'regenerate') regeneratePlayerToken(campaignId, playerId);
  else revokePlayerToken(campaignId, playerId);
  audit(a.username, action === 'regenerate' ? 'Spielerlink neu erzeugt' : 'Spielerlink gesperrt', nick, campaignId);
  revalidatePath(`/admin/c/${campaignId}`, 'layout');
  return { ok: true as const };
}
