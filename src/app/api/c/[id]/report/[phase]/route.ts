import { authorizeRequest } from '@/server/authz';
import { configuredAppUrl } from '@/server/origin';
import { currentState } from '@/server/campaigns';
import { phaseReport } from '@/server/report';
import { toPublicView } from '@/engine/publicView';
import { normLocale } from '@/i18n/core';
import { originalLang, otherLang } from '@/engine/contentLang';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ id: string; phase: string }> }) {
  const { id, phase } = await ctx.params;
  const auth = await authorizeRequest('campaign.read', { campaignId: id });
  if (!auth.ok) return auth.response;
  let data;
  try {
    data = currentState(id);
  } catch {
    return new Response('Nicht gefunden', { status: 404 });
  }
  const url = new URL(req.url);
  const origin = configuredAppUrl() ?? url.origin;
  const lang = url.searchParams.get('lang');
  const pub = toPublicView(data.state);
  const opts = { emoji: url.searchParams.get('emoji') !== '0', origin, publicUrl: data.row.public_enabled ? `${origin}/v/${data.row.public_token}` : undefined };
  // Sprache: ?lang=de|en|fr|es|pl, sonst Standard der Kampagne; ?lang=both = Kampagnensprache und ihre zweite Sprache nacheinander (NTH2 7.4)
  const first = originalLang(data.state);
  const md =
    lang === 'both'
      ? [phaseReport(pub, Number(phase), { ...opts, locale: first }), '---', phaseReport(pub, Number(phase), { ...opts, locale: otherLang(first) })].join('\n\n')
      : phaseReport(pub, Number(phase), { ...opts, locale: normLocale(lang) ?? undefined });
  const download = url.searchParams.get('download') === '1';
  return new Response(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(download ? { 'Content-Disposition': `attachment; filename="phase-${phase}.md"` } : {}),
    },
  });
}
