import type { Metadata } from 'next';
import { requestLocale } from '@/server/requestLocale';
import { legalText } from '@/server/legal';
import { makeT } from '@/i18n/core';
import { LegalPage } from '@/components/LegalPage';

/** Impressum (§ 5 DDG): nur der Text des Betreibers – ohne Eintrag ein neutraler Hinweis, nie erfundene Angaben */
export async function generateMetadata(): Promise<Metadata> {
  return { title: makeT(await requestLocale())('Impressum') };
}

export default async function ImprintPage() {
  const locale = await requestLocale();
  const t = makeT(locale);
  const text = legalText('imprint') ?? `*${t('Der Betreiber dieser Instanz hat noch kein Impressum hinterlegt.')}*`;
  return <LegalPage locale={locale} title={t('Impressum')} text={text} />;
}
