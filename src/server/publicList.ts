import 'server-only';
import { db } from './db';
import { listCampaigns, type CampaignListEntry } from './campaigns';

/**
 * Öffentlich gelistete Kampagnen (Hall of Fame, Ruhmeshalle der Liga): nur mit eingeschalteter Leseansicht, keine
 * Sandbox, nicht defekt (F5 – Hall und Liga filtern mit derselben Regel).
 */
export function isPubliclyListed(c: Pick<CampaignListEntry, 'public_enabled' | 'sandbox_of' | 'broken'>): boolean {
  return !!c.public_enabled && !c.sandbox_of && !c.broken;
}

/** Kennung des Datenbestands: ändert sich mit jeder Revision, jedem Schalter der Leseansicht und jeder neuen Kampagne */
function signature(): string {
  const r = db().prepare("SELECT group_concat(id || ':' || current_rev || ':' || public_enabled || ':' || archived, ',') AS s FROM campaign WHERE sandbox_of IS NULL").get() as { s: string | null };
  return r.s ?? '';
}

let memo: { sig: string; list: CampaignListEntry[] } | null = null;

/**
 * Öffentlich gelistete Kampagnen mit geladenem Stand. Zwischengespeichert, bis sich eine Kampagne ändert (F9: Hall
 * und Liga laden sonst bei jedem anonymen Aufruf alle Zustände). Die Zustände sind geteilt – nicht verändern.
 */
export function listedCampaigns(): CampaignListEntry[] {
  const sig = signature();
  if (memo?.sig === sig) return memo.list;
  const list = listCampaigns().filter(isPubliclyListed);
  memo = { sig, list };
  return list;
}
