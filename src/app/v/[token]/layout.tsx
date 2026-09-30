import type { Metadata } from 'next';
import { loadPublic } from '@/server/public';
import { AutoRefresh } from '@/components/public/PublicParts';
import { PublicFrame, PublicHeaderGate } from '@/components/public/PublicShell';
import { stageTrack } from '@/components/public/stageSteps';
import { stageLabel } from '@/components/stageLabel';
import { ImperialHeader } from '@/components/ImperialHeader';
import { LocaleProvider } from '@/i18n/client';
import { PlanetImagesProvider } from '@/components/map/planetImages';
import { planetArtEnabled } from '@/server/db';
import { publicLocale, readerLocale, tFor } from '@/i18n/server';
import { LangSwitch } from '@/components/LangSwitch';
import { ThemeSwitch } from '@/components/ThemeSwitch';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  let state;
  try {
    ({ state } = loadPublic(token));
  } catch {
    // ungültiger Link: das Layout zeigt die 404-Seite – hier nur ein sprechender Titel statt eines leeren
    return { title: tFor(await readerLocale())('Link ungültig'), robots: { index: false, follow: false } };
  }
  const t = tFor(await publicLocale(state));
  return {
    title: { default: state.meta.name, template: `%s · ${state.meta.name}` },
    robots: { index: false, follow: false },
    openGraph: { title: `${state.meta.name} – Vespator Front`, description: t('Kampagnenstand: Karte, Punkte, Schlachten'), images: [`/v/${token}/map.png`] },
  };
}

export default async function PublicLayout({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { state } = loadPublic(token);
  const base = `/v/${token}`;
  const locale = await publicLocale(state);
  const t = tFor(locale);
  return (
    <LocaleProvider locale={locale}>
      <PlanetImagesProvider value={planetArtEnabled()}>
        <AutoRefresh />
        {/* Präsentation (Vollbild): Kopfzeile gar nicht rendern – sonst erhielte sie hinter der Fläche den Tastaturfokus */}
        <PublicHeaderGate base={base}>
          <ImperialHeader
            href={base}
            subtitle={t('Lagebericht')}
            locale={locale}
            lang={
              <span className="flex items-center gap-2">
                <ThemeSwitch size="sm" />
                <LangSwitch />
              </span>
            }
          />
        </PublicHeaderGate>
        <PublicFrame base={base} name={state.meta.name} stage={stageLabel(state, t)} track={stageTrack(state, t)}>
          {children}
        </PublicFrame>
      </PlanetImagesProvider>
    </LocaleProvider>
  );
}
