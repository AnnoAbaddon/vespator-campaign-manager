import { authorizeRequest } from '@/server/authz';
import { currentState, loadState } from '@/server/campaigns';
import { mapPng, mapSvgString } from '@/server/mapPng';
import { adminLocale } from '@/server/requestLocale';
import type { Locale } from '@/i18n/core';

export const dynamic = 'force-dynamic';

/** Dateiname der Karte je Sprache (ASCII, für Content-Disposition) */
const MAP_FILE: Record<Locale, string> = { de: 'karte', en: 'map', fr: 'carte', es: 'mapa', pl: 'mapa' };

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await authorizeRequest('campaign.read', { campaignId: id });
  if (!auth.ok) return auth.response;
  const sp = new URL(req.url).searchParams;
  let state;
  try {
    state = sp.get('rev') ? loadState(id, Number(sp.get('rev'))) : currentState(id).state;
  } catch {
    return new Response('Nicht gefunden', { status: 404 });
  }
  const print = sp.get('print') === '1';
  const locale = await adminLocale();
  const file = MAP_FILE[locale];
  if (sp.get('format') === 'svg') {
    return new Response(await mapSvgString(state, { print, locale }), { headers: { 'Content-Type': 'image/svg+xml', 'Content-Disposition': `attachment; filename="${file}.svg"`, 'Cache-Control': 'no-store' } });
  }
  const png = await mapPng(state, { print, locale });
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Content-Disposition': `inline; filename="${file}.png"`, 'Cache-Control': 'no-store' } });
}
