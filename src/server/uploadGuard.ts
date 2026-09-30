import 'server-only';
import { db } from './db';
import { referencedUploadIds } from '@/engine/uploads';
import type { CampaignState } from '@/engine/types';

/** Wer einen Command ausführt: Spielleitung (Konto) oder ein Spieler (Link, Einmal-Link, Discord) */
export type CommandActor = { kind: 'gm' } | { kind: 'player'; playerId: string };

/** Bildarten, die ein Spieler selbst hochladen und verwenden darf */
const PLAYER_KINDS = new Set(['AVATAR', 'BATTLE_PHOTO']);

/** Verwendete Bilder inklusive der Fotos offener Ergebnis-Entwürfe (geprüft beim Melden, nicht erst beim Bestätigen) */
function refs(st: CampaignState): string[] {
  const out = referencedUploadIds(st);
  for (const b of st.battles) {
    const u = b.draft?.update;
    if (!u) continue;
    for (const id of u.photos ?? []) if (typeof id === 'string') out.push(id);
    for (const g of u.games ?? []) for (const id of g.photos ?? []) if (typeof id === 'string') out.push(id);
  }
  return out;
}

/** Kampagne samt Original bzw. Sandboxes (NTH2 2.1): Bilder dürfen innerhalb dieser Familie wandern */
function campaignFamily(campaignId: string): Set<string> {
  const row = db().prepare('SELECT sandbox_of FROM campaign WHERE id = ?').get(campaignId) as { sandbox_of: string | null } | undefined;
  const root = row?.sandbox_of ?? campaignId;
  const ids = (db().prepare('SELECT id FROM campaign WHERE id = ? OR sandbox_of = ?').all(root, root) as { id: string }[]).map((r) => r.id);
  return new Set([campaignId, root, ...ids]);
}

/**
 * F6: Neu verwendete Bild-IDs eines Commands müssen zu dieser Kampagne gehören; Spieler dürfen nur eigene Avatare und
 * Fotos verwenden. Geprüft wird der Unterschied zwischen altem und neuem Stand – so gilt die Regel für jeden Command
 * und jedes Feld (auch Bild-Links in Texten). Bilder ohne Kampagne (Vorlagen) darf nur die Spielleitung verwenden.
 * Liefert eine Fehlermeldung (Übersetzungsschlüssel) oder null.
 */
export function uploadRefError(campaignId: string, before: CampaignState, after: CampaignState, actor: CommandActor): string | null {
  const known = new Set(refs(before));
  const fresh = refs(after).filter((id) => !known.has(id));
  if (!fresh.length) return null;
  const family = campaignFamily(campaignId);
  const get = db().prepare('SELECT campaign_id, kind, uploader FROM upload WHERE id = ?');
  for (const id of fresh) {
    const row = get.get(id) as { campaign_id: string | null; kind: string; uploader: string | null } | undefined;
    // unbekannte IDs sind harmlos (das Bild existiert nicht, zufällige IDs lassen sich nicht vorhersagen)
    if (!row) continue;
    if (actor.kind === 'player') {
      if (row.campaign_id !== campaignId || !PLAYER_KINDS.has(row.kind) || (row.uploader !== null && row.uploader !== `p:${actor.playerId}`)) return 'Dieses Bild kann hier nicht verwendet werden';
    } else if (row.campaign_id !== null && !family.has(row.campaign_id)) return 'Dieses Bild kann hier nicht verwendet werden';
  }
  return null;
}
