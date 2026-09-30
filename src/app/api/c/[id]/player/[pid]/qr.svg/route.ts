import QRCode from 'qrcode';
import { authorizeRequest } from '@/server/authz';
import { getCampaign } from '@/server/campaigns';
import { publicOrigin } from '@/server/origin';
import { playerTokenFor } from '@/server/players';

export const dynamic = 'force-dynamic';

/** QR-Code des persönlichen Spielerlinks (nur für den Spielleiter) */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = await ctx.params;
  const auth = await authorizeRequest('campaign.read', { campaignId: id });
  if (!auth.ok) return auth.response;
  if (!getCampaign(id)) return new Response('Nicht gefunden', { status: 404 });
  const token = playerTokenFor(id, pid, false);
  if (!token) return new Response('Kein aktiver Link', { status: 404 });
  const svg = await QRCode.toString(`${publicOrigin(req.headers)}/p/${token}`, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#16110b', light: '#ffffff' } });
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' } });
}
