import { notFound } from 'next/navigation';
import { currentState } from '@/server/campaigns';
import { Briefing } from '@/components/public/Briefing';
import { PrintShell } from '@/components/admin/PrintShell';
import { adminLocale, tFor } from '@/i18n/server';
import { authorizePage } from '@/server/authz';

export const metadata = { title: 'Briefing' };

export default async function AdminBriefing({ params }: { params: Promise<{ id: string; bid: string }> }) {
  const { id, bid } = await params;
  // Zugriff hier prüfen – Layouts schützen Seiten nicht zuverlässig (RSC-Anfragen können sie überspringen)
  await authorizePage('campaign.read', { campaignId: id });
  let state;
  try {
    state = currentState(id).state;
  } catch {
    notFound();
  }
  const b = state.battles.find((x) => x.id === bid);
  if (!b) notFound();
  const locale = await adminLocale();
  const t = tFor(locale);
  return (
    <PrintShell title="Briefing" backHref={`/admin/c/${id}`} backLabel={t('Zur Kampagne')} paperClass="max-w-3xl">
      <Briefing state={state} battle={b} locale={locale} />
    </PrintShell>
  );
}
