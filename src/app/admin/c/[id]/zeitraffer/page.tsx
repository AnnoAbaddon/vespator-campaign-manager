import { notFound } from 'next/navigation';
import { getCampaign } from '@/server/campaigns';
import { timelapseData } from '@/server/public';
import { Timelapse } from '@/components/public/Timelapse';
import { adminLocale, tFor } from '@/i18n/server';
import type { Metadata } from 'next';
import { authorizePage } from '@/server/authz';

export async function generateMetadata(): Promise<Metadata> {
  return { title: tFor(await adminLocale())('Zeitraffer') };
}

export default async function AdminTimelapse({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Zugriff hier prüfen – Layouts schützen Seiten nicht zuverlässig (RSC-Anfragen können sie überspringen)
  await authorizePage('campaign.read', { campaignId: id });
  if (!getCampaign(id)) notFound();
  // Ein Bildschirm: Kopfzeile + Gehäuse mit Schirm und Bedienpult
  return (
    <main className="mx-auto h-[calc(100dvh-var(--hdr))] max-w-[1760px] px-3 pb-3 pt-[calc(var(--gap)+4px)] sm:px-4">
      <Timelapse data={timelapseData(id)} />
    </main>
  );
}
