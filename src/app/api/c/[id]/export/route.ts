import { authorizeRequest } from '@/server/authz';
import { currentState } from '@/server/campaigns';
import { db } from '@/server/db';
import { buildBackupJson, buildBackupZip } from '@/server/backup';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await authorizeRequest('campaign.read', { campaignId: id });
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const date = new Date().toISOString().slice(0, 10);
  try {
    currentState(id);
  } catch {
    // Defekte Kampagne: Rohdaten der aktuellen Revision ausliefern, damit nichts verloren geht
    const raw = db().prepare('SELECT r.state AS state FROM campaign c JOIN revision r ON r.campaign_id = c.id AND r.number = c.current_rev WHERE c.id = ?').get(id) as { state: string } | undefined;
    if (!raw) return new Response('Nicht gefunden', { status: 404 });
    return new Response(raw.state, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="campaign-raw-${id}-${date}.json"`, 'Cache-Control': 'no-store' } });
  }
  const withRevisions = url.searchParams.get('revisions') !== '0';
  if (url.searchParams.get('zip') === '1') {
    // Vollständiges Backup: Kampagne + alle Bilder
    const { zip, filename } = buildBackupZip(id, withRevisions);
    return new Response(Buffer.from(zip), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } });
  }
  // JSON-Backup: mit Historie inklusive der Zustände je Revision (B3), damit der Import sie wiederherstellt
  const { json, filename } = buildBackupJson(id, withRevisions);
  return new Response(json, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } });
}
