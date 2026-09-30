'use server';

import { publicError } from '@/server/errors';
import { revalidatePath } from 'next/cache';
import { authorize, playerGate } from '@/server/authz';
import { audit } from '@/server/audit';
import { createDiscordCode, DISCORD_CODE_TTL_MS, discordBotConfig, registerDiscordCommands, setDiscordBotConfig, unlinkDiscord } from '@/server/discordBot';

/** Discord-Bot (NTH2 1.2): Einmal-Code auf der Spielerseite, Verknüpfung lösen, Einrichtung unter Konto → Dienste */

export async function discordCodeAction(token: string): Promise<{ ok: true; code: string; minutes: number } | { ok: false; error: string }> {
  const g = playerGate(token, 'player.devices');
  if (!g.ok) return g;
  const s = g.session;
  if (s.archived) return { ok: false, error: 'Link ungültig oder gesperrt' };
  if (!discordBotConfig()) return { ok: false, error: 'Der Discord-Bot ist nicht eingerichtet' };
  const code = createDiscordCode(s.campaignId, s.playerId);
  return code ? { ok: true, code, minutes: DISCORD_CODE_TTL_MS / 60_000 } : { ok: false, error: 'Link ungültig oder gesperrt' };
}

export async function discordUnlinkAction(token: string): Promise<{ ok: boolean; error?: string }> {
  const g = playerGate(token, 'player.unlink');
  if (!g.ok) return g;
  const s = g.session;
  unlinkDiscord(s.campaignId, s.playerId);
  revalidatePath(`/p/${token}`);
  return { ok: true };
}

export async function saveDiscordBotAction(_prev: string | null, form: FormData): Promise<string | null> {
  const a = await authorize('instance.manage');
  const err = setDiscordBotConfig({ appId: String(form.get('appId') ?? ''), publicKey: String(form.get('publicKey') ?? ''), token: String(form.get('token') ?? '') });
  if (err) return err;
  audit(a.username, 'Discord-Bot eingerichtet', String(form.get('appId') ?? '') || '–');
  revalidatePath('/admin/settings');
  return 'Gespeichert';
}

export async function registerDiscordCommandsAction(): Promise<{ ok: boolean; error?: string; message?: string }> {
  const a = await authorize('instance.manage');
  try {
    const err = await registerDiscordCommands();
    if (err) return { ok: false, error: err };
    audit(a.username, 'Discord-Befehle angemeldet', null);
    revalidatePath('/admin/settings');
    return { ok: true, message: 'Befehle bei Discord angemeldet' };
  } catch (e) {
    return { ok: false, error: publicError(e) };
  }
}
