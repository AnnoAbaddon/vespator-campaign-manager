'use server';

import { publicError } from '@/server/errors';
import { revalidatePath } from 'next/cache';
import { authorize, playerGate } from '@/server/authz';
import { z } from 'zod';
import { audit } from '@/server/audit';
import { currentState } from '@/server/campaigns';
import { regenerateClubCalendarKey, setClubTables, tableOptions, type TableOption } from '@/server/club';
import { tableOptionsLimited } from '@/server/players';
import { makeT } from '@/i18n/core';
import { contextLocale } from '@/server/locale';

/** Club-Kalender (NTH2 2.5): Spieltische, Belegung, .ics-Abo */

export type TableAccess = { token: string } | { campaignId: string };

/** Tische mit Belegung zum Termin einer Schlacht – für Spieler (Link) und Spielleitung (Konto) */
export async function tableOptionsAction(access: TableAccess, battleId: string): Promise<{ ok: true; tables: TableOption[] } | { ok: false; error: string }> {
  try {
    if ('token' in access) {
      const g = playerGate(access.token, 'player.tables');
      if (!g.ok) return g;
      const s = g.session;
      // F9: die Belegung lädt alle laufenden Kampagnen – je Link begrenzt
      if (tableOptionsLimited(s.principal.tokenHash)) return { ok: false, error: 'Zu viele Aktionen – bitte eine Minute warten' };
      return { ok: true, tables: tableOptions(s.campaignId, s.state, battleId, makeT(contextLocale(s.player.locale, s.state.meta.locale))) };
    }
    const a = await authorize('campaign.read', { campaignId: access?.campaignId });
    return { ok: true, tables: tableOptions(access.campaignId, currentState(access.campaignId).state, battleId, makeT(a.locale)) };
  } catch (e) {
    return { ok: false, error: publicError(e) };
  }
}

export async function saveClubTablesAction(list: { id?: string; name: string }[]): Promise<{ ok: boolean; error?: string; message?: string }> {
  const a = await authorize('instance.manage');
  if (
    !z
      .array(z.object({ id: z.string().max(40).optional(), name: z.string().max(200) }))
      .max(100)
      .safeParse(list).success
  )
    return { ok: false, error: 'Ungültige Eingabe' };
  const saved = setClubTables(list.map((x) => ({ id: typeof x?.id === 'string' ? x.id : undefined, name: String(x?.name ?? '') })));
  audit(a.username, 'Spieltische geändert', saved.map((x) => x.name).join(', ') || '–');
  revalidatePath('/admin/kalender');
  return { ok: true, message: 'Gespeichert' };
}

export async function regenerateClubCalendarAction(): Promise<{ ok: boolean; error?: string; message?: string }> {
  const a = await authorize('instance.manage');
  regenerateClubCalendarKey();
  audit(a.username, 'Club-Kalender-Link neu erzeugt', null);
  revalidatePath('/admin/kalender');
  return { ok: true, message: 'Neuer Link erzeugt – der alte gilt nicht mehr' };
}
