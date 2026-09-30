import type { Metadata } from 'next';
import { requestLocale } from '@/server/requestLocale';
import { defaultPrivacyText, legalText } from '@/server/legal';
import { makeT } from '@/i18n/core';
import { LegalPage } from '@/components/LegalPage';

/** Datenschutzhinweis (Art. 13 DSGVO): Text des Betreibers, sonst die neutrale Vorlage in der Sprache des Lesers */
export async function generateMetadata(): Promise<Metadata> {
  return { title: makeT(await requestLocale())('Datenschutz') };
}

export default async function PrivacyPage() {
  const locale = await requestLocale();
  return <LegalPage locale={locale} title={makeT(locale)('Datenschutz')} text={legalText('privacy') ?? defaultPrivacyText(locale)} />;
}
