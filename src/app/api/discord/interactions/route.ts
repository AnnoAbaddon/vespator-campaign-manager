import { handleInteraction } from '@/server/discordBot';
import { rejectCrossOrigin } from '@/server/origin';

export const dynamic = 'force-dynamic';

/**
 * Discord-Interactions-Endpunkt (NTH2 1.2). In den Discord-Entwicklereinstellungen als
 * „Interactions Endpoint URL“ eintragen: https://<domain>/api/discord/interactions
 * Der Körper wird roh gelesen, weil die Ed25519-Signatur über Zeitstempel + Rohtext gebildet wird.
 */
export async function POST(req: Request) {
  // Discord ruft Server-zu-Server (ohne Origin); Browser-Anfragen fremder Seiten gar nicht erst lesen
  const cross = rejectCrossOrigin(req);
  if (cross) return cross;
  const raw = await req.text();
  if (raw.length > 100_000) return Response.json({ error: 'too large' }, { status: 413 });
  const r = handleInteraction(raw, req.headers.get('x-signature-ed25519'), req.headers.get('x-signature-timestamp'));
  return Response.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
