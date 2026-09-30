import { loadPublic } from '@/server/public';
import { faqForCampaign } from '@/server/faq';
import { publicLocale, tFor } from '@/i18n/server';
import { FaqDoc } from '@/components/public/FaqDoc';
import { parseFaq } from '@/components/public/faqParse';

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props) {
  const { token } = await params;
  const locale = await publicLocale(loadPublic(token).state);
  return { title: tFor(locale)('Regel-FAQ') };
}

/** Regel-FAQ als Nachschlagewerk: Verzeichnis mit Sprungmarken, Entscheidung je Frage zuerst */
export default async function PublicFaq({ params }: Props) {
  const { token } = await params;
  const { state } = loadPublic(token); // prüft auch den Token (404 bei ungültigem Link)
  const locale = await publicLocale(state);
  return <FaqDoc doc={parseFaq(faqForCampaign(state, locale))} locale={locale} />;
}
