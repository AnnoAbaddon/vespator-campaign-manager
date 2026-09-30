import type { Metadata } from 'next';
import { ImperialHeader } from '@/components/ImperialHeader';
import { LocaleProvider } from '@/i18n/client';
import { readerLocale, tFor } from '@/i18n/server';
import { ReportJump } from './ReportJump';

export async function generateMetadata(): Promise<Metadata> {
  return { title: tFor(await readerLocale())('Ergebnis melden'), robots: { index: false, follow: false }, referrer: 'no-referrer' };
}

/**
 * Ziel des QR-Codes auf dem Ergebnisbogen (NTH2 1.3). Der Code enthält keinen persönlichen Link: Die Seite nimmt
 * den auf diesem Gerät gemerkten Spielerlink und springt zum Meldeformular genau dieser Schlacht.
 */
export default async function ReportJumpPage({ params }: { params: Promise<{ cid: string; bid: string }> }) {
  const { cid, bid } = await params;
  const locale = await readerLocale();
  const t = tFor(locale);
  return (
    <LocaleProvider locale={locale}>
      <ImperialHeader href="/" subtitle={t('Ergebnis melden')} locale={locale} />
      <main className="mx-auto max-w-xl p-4">
        <ReportJump campaignId={cid} battleId={bid} />
      </main>
    </LocaleProvider>
  );
}
