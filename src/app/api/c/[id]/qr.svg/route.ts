import QRCode from 'qrcode';
import { authorizeRequest } from '@/server/authz';
import { getCampaign } from '@/server/campaigns';
import { publicOrigin } from '@/server/origin';

export const dynamic = 'force-dynamic';

/** QR-Code des öffentlichen Links (nur für den Spielleiter) */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await authorizeRequest('campaign.read', { campaignId: id });
  if (!auth.ok) return auth.response;
  const row = getCampaign(id);
  if (!row) return new Response('Nicht gefunden', { status: 404 });
  if (!row.public_enabled) return new Response('Öffentlicher Link ist deaktiviert', { status: 409 });
  const origin = publicOrigin(req.headers);
  const svg = await QRCode.toString(`${origin}/v/${row.public_token}`, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#16110b', light: '#efe3c8' } });
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' } });
}
