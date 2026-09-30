import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadPublic } from '@/server/public';
import { PlanetDossier } from '@/components/public/PlanetDossier';
import { publicLocale, tFor } from '@/i18n/server';
import { planetArtEnabled } from '@/server/db';
import { ArrowLeftIcon } from '@/components/icons';
import { planetDef } from '@/engine/map';

type Props = { params: Promise<{ token: string; pid: string }> };

export async function generateMetadata({ params }: Props) {
  const { pid } = await params;
  return { title: planetDef(pid)?.name ?? pid };
}

/** Planetenakte als eigene Seite (nur lesend, gleiche Akte wie in der Kartenansicht, auf breiten Schirmen zweispaltig) */
export default async function PublicPlanet({ params }: Props) {
  const { token, pid } = await params;
  const { state } = loadPublic(token);
  if (!state.planets.some((p) => p.id === pid)) notFound();
  const locale = await publicLocale(state);
  const t = tFor(locale);
  return (
    // .planet-page (globals.css): Umgebungstypen als gleichmäßige Spalten; ab 1280 px Bild links neben den Planetendaten
    <div className="planet-page mx-auto w-full max-w-[680px] space-y-3 xl:max-w-[1180px]">
      <Link className="link inline-flex items-center gap-1 text-[15px]" href={`/v/${token}`}>
        <ArrowLeftIcon size={14} />
        {t('Zur Lage')}
      </Link>
      <PlanetDossier state={state} planetId={pid} base={`/v/${token}`} locale={locale} planetImages={planetArtEnabled()} />
    </div>
  );
}
