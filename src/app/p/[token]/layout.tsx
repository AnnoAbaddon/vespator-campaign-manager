import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadPlayer } from '@/server/authz';
import { ImperialHeader } from '@/components/ImperialHeader';
import { AutoRefresh } from '@/components/public/PublicParts';
import { LocaleProvider } from '@/i18n/client';
import { PlanetImagesProvider } from '@/components/map/planetImages';
import { planetArtEnabled } from '@/server/db';
import { playerLocale, readerLocale, tFor } from '@/i18n/server';
import { LangSwitch } from '@/components/LangSwitch';
import { ThemeSwitch } from '@/components/ThemeSwitch';
import { setPlayerLocaleAction } from '@/app/actions/player';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const s = loadPlayer(token);
  return { title: s ? `${s.player.nickname} · ${s.state.meta.name}` : tFor(await readerLocale())('Spielerseite'), robots: { index: false, follow: false }, referrer: 'no-referrer' };
}

/** Persönliche Spielerseite (N1) – Zugang nur über den geheimen Link */
export default async function PlayerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = loadPlayer(token);
  if (!s) notFound();
  const locale = await playerLocale(s.player, s.state);
  const t = tFor(locale);
  return (
    <LocaleProvider locale={locale}>
      <PlanetImagesProvider value={planetArtEnabled()}>
        <AutoRefresh />
        <ImperialHeader href={`/p/${token}`} subtitle={t('Kommando · {name}', { name: s.player.nickname })} locale={locale} lang={
            <span className="flex items-center gap-2">
              <ThemeSwitch size="sm" />
              <LangSwitch persist={setPlayerLocaleAction.bind(null, token)} />
            </span>
          }>
          {/* Regeln und FAQ in der Sprache des Spielers (?lang= setzt die Sprache der Leseansicht) */}
          <Link className="btn btn-sm btn-ghost" href={`/v/${s.publicToken}/rules?lang=${locale}`} prefetch={false}>
            {t('Regeln')}
          </Link>
          <Link className="btn btn-sm btn-ghost" href={`/v/${s.publicToken}/faq?lang=${locale}`} prefetch={false}>
            {t('FAQ')}
          </Link>
          {/* Kurzhilfe zum Umgang mit der Spielerseite (docs/GUIDE*.md, Abschnitt Spieler) */}
          <Link className="btn btn-sm btn-ghost" href={`/p/${token}/hilfe`} prefetch={false}>
            {t('Hilfe')}
          </Link>
        </ImperialHeader>
        {children}
      </PlanetImagesProvider>
    </LocaleProvider>
  );
}
