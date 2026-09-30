import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadPlayer } from '@/server/authz';
import { loadGuide } from '@/server/guide';
import { playerLocale, tFor } from '@/i18n/server';
import { contextLocale } from '@/server/locale';
import { GuideDoc } from '@/components/public/GuideDoc';
import { parseGuide, playerGuide } from '@/components/public/guideParse';
import { ArrowLeftIcon } from '@/components/icons';
import { Housing } from '@/components/public/Terminal';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = loadPlayer(token);
  const t = tFor(s ? await playerLocale(s.player, s.state) : contextLocale());
  return { title: t('Hilfe'), robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
}

/** Kurzhilfe für Spieler: die Abschnitte „Spieler“ und „Probleme und häufige Fragen“ der Hilfe (docs/GUIDE*.md) */
export default async function PlayerHelp({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = loadPlayer(token);
  if (!s) notFound();
  const locale = await playerLocale(s.player, s.state);
  const t = tFor(locale);
  const guide = loadGuide(locale);
  return (
    <main className="term-grid mx-auto h-[calc(100dvh-var(--hdr))] max-w-[1100px] p-3 lg:p-[var(--gap)] lg:pt-[calc(var(--gap)+4px)]">
      <Housing
        title={t('Hilfe')}
        className="term-housing"
        actions={
          <Link className="btn btn-sm mr-auto" href={`/p/${token}`}>
            <ArrowLeftIcon size={14} /> {t('Zurück')}
          </Link>
        }
      >
        <GuideDoc doc={playerGuide(parseGuide(guide.markdown))} locale={locale} fallback={guide.fallback} lead={t('Kurzhilfe für Spieler. Thema im Verzeichnis wählen.')} />
      </Housing>
    </main>
  );
}
