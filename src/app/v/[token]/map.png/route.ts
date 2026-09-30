import { loadState } from '@/server/campaigns';
import { requireViewerRow } from '@/server/authz';
import { mapPng } from '@/server/mapPng';
import { toPublicView } from '@/engine/publicView';
import { pngCache } from '@/server/pngCache';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const row = requireViewerRow(token);
  if (!row) return new Response('Nicht gefunden', { status: 404 });
  // Rendern kostet; je Kampagne und Revision nur einmal (kleiner LRU im Speicher)
  const png = await pngCache.get(`${row.id}:${row.current_rev}`, () => mapPng(toPublicView(loadState(row.id, row.current_rev))));
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=60', 'X-Robots-Tag': 'noindex' } });
}
