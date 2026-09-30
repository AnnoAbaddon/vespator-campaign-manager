import { notFound } from 'next/navigation';
import { loadPublic } from '@/server/public';
import { Briefing } from '@/components/public/Briefing';
import { PrintButton } from '@/components/public/PrintButton';
import { publicLocale } from '@/i18n/server';
import { planetArtEnabled } from '@/server/db';

export const metadata = { title: 'Briefing' };

export default async function PublicBriefing({ params }: { params: Promise<{ token: string; bid: string }> }) {
  const { token, bid } = await params;
  const { state } = loadPublic(token);
  const b = state.battles.find((x) => x.id === bid);
  if (!b) notFound();
  const locale = await publicLocale(state);
  return (
    <div className="mx-auto w-full max-w-3xl space-y-2">
      <PrintButton />
      <Briefing state={state} battle={b} locale={locale} planetImages={planetArtEnabled()} />
    </div>
  );
}
