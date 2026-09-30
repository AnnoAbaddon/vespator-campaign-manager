import { can, sessionPrincipal } from '@/server/authz';
import { importBackup } from '@/server/backup';
import { rejectCrossOrigin } from '@/server/origin';
import { publicError } from '@/server/errors';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 200 * 1024 * 1024;

/**
 * Backup-Import (JSON oder ZIP). Eigene Route statt Server Action, damit das große
 * Upload-Limit nur hier gilt und die Anmeldung vor dem Lesen des Bodys geprüft wird.
 * Ein Import legt eine neue Kampagne an – das dürfen nur Admins (N5.2).
 * Fehlertexte sind deutsche Schlüssel; der Client übersetzt sie (useMsg).
 */
export async function POST(req: Request) {
  // CSRF: nur Anfragen dieser Seite (vor Anmeldung und Body)
  const cross = rejectCrossOrigin(req);
  if (cross) return cross;
  const p = await sessionPrincipal();
  if (!p) return Response.json({ error: 'Nicht angemeldet' }, { status: 401 });
  if (can(p, 'campaign.create')) return Response.json({ error: 'Neue Kampagnen dürfen nur Admins anlegen' }, { status: 403 });
  const admin = p.account;
  const len = Number(req.headers.get('content-length') ?? 0);
  if (!len) return Response.json({ error: 'Content-Length fehlt' }, { status: 411 });
  if (len > MAX_BYTES) return Response.json({ error: 'Backup größer als 200 MB' }, { status: 413 });
  const name = new URL(req.url).searchParams.get('name') ?? undefined;
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.length > MAX_BYTES) return Response.json({ error: 'Backup größer als 200 MB' }, { status: 413 });
  try {
    const id = importBackup(buf, name || undefined, { author: admin.username, action: 'Backup importiert', detail: name || null });
    return Response.json({ id });
  } catch (e) {
    return Response.json({ error: `Import fehlgeschlagen: ${publicError(e, 'import')}` }, { status: 400 });
  }
}
