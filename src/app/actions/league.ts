'use server';

import { publicError } from '@/server/errors';
import { revalidatePath } from 'next/cache';
import { authorize } from '@/server/authz';
import { z } from 'zod';
import { parseInput } from '@/server/actionInput';
import { audit } from '@/server/audit';
import { createSeason, deleteSeason, getSeason, regenerateSeasonToken, updateSeason } from '@/server/league';
import type { SeasonData } from '@/server/leagueCompute';

type Res = { ok: true; id?: string } | { ok: false; error: string };
const err = (e: unknown): Res => ({ ok: false, error: publicError(e) });

/** Liga (NTH2 3.1): Saison anlegen – nur Admins */
export async function createSeasonAction(name: string): Promise<Res> {
  try {
    const a = await authorize('instance.manage');
    parseInput(z.string().max(200), name);
    if (!name.trim()) return { ok: false, error: 'Bitte einen Namen angeben' };
    const id = createSeason(name);
    audit(a.username, 'Saison angelegt', name.trim());
    revalidatePath('/admin/liga');
    return { ok: true, id };
  } catch (e) {
    return err(e);
  }
}

export async function updateSeasonAction(id: string, patch: { name?: string; data?: Partial<SeasonData> }): Promise<Res> {
  try {
    const a = await authorize('instance.manage');
    parseInput(z.string().max(64), id);
    parseInput(z.object({ name: z.string().max(200).optional(), data: z.record(z.string(), z.unknown()).optional() }), patch);
    const s = getSeason(id);
    if (!s) return { ok: false, error: 'Saison nicht gefunden' };
    updateSeason(id, patch);
    audit(a.username, 'Saison geändert', patch.name ?? s.name);
    revalidatePath('/admin/liga');
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

export async function seasonTokenAction(id: string): Promise<Res> {
  try {
    const a = await authorize('instance.manage');
    parseInput(z.string().max(64), id);
    const s = getSeason(id);
    if (!s) return { ok: false, error: 'Saison nicht gefunden' };
    regenerateSeasonToken(id);
    audit(a.username, 'Ruhmeshallen-Link der Saison erneuert', s.name);
    revalidatePath('/admin/liga');
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

export async function deleteSeasonAction(id: string): Promise<Res> {
  try {
    const a = await authorize('instance.manage');
    parseInput(z.string().max(64), id);
    const s = getSeason(id);
    if (!s) return { ok: false, error: 'Saison nicht gefunden' };
    deleteSeason(id);
    audit(a.username, 'Saison gelöscht', s.name);
    revalidatePath('/admin/liga');
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}
