import { authorizeRequest } from '@/server/authz';
import { i18nOverrides } from '@/server/i18nStore';
import { PACKS } from '@/i18n/packs';
import { buildCatalog, toCsv, toJson } from '@/i18n/catalog';

export const dynamic = 'force-dynamic';

/** Übersetzungsdatei (NTH2 7.2) herunterladen: ?format=csv (Standard) oder json; eingebaute plus importierte Übersetzungen. Nur Admins. */
export async function GET(req: Request) {
  const auth = await authorizeRequest('instance.manage');
  if (!auth.ok) return auth.response;
  const format = new URL(req.url).searchParams.get('format') === 'json' ? 'json' : 'csv';
  const rows = buildCatalog(PACKS);
  const ov = i18nOverrides();
  const body = format === 'json' ? toJson(rows, ov) : toCsv(rows, ov);
  return new Response(body, {
    headers: {
      'Content-Type': format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="vespator-uebersetzungen.${format}"`,
      'Cache-Control': 'no-store',
    },
  });
}
