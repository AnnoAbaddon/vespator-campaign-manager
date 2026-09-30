'use client';

import { Motto } from '@/components/Motto';
import { MOTTO } from '@/flavor';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useState } from 'react';
import type { CampaignState } from '@/engine/types';
import { mapOf, planetDef } from '@/engine/map';
import { CampaignMap } from '@/components/map/CampaignMap';
import { usePlanetImages } from '@/components/map/planetImages';
import { GameIcon } from '@/components/icons/GameIcon';
import { BookIcon } from '@/components/icons';
import { HeaderPortal } from '@/components/HeaderPortal';
import { CreditsLink } from '@/components/CreditsLink';
import { useIsDesktop } from '@/components/ui';
import { useLocale, useT } from '@/i18n/client';
import { usePublicArrows } from './PublicParts';
import { PlanetDossier } from './PlanetDossier';
import { DossierSheet } from './DossierSheet';
import { MoreSheet } from '@/components/MoreSheet';
import { HourglassIcon, Housing, MOBILE_KEY_CLASS, MOBILE_NAV_CLASS, MobileKey, PointsBar, QuestionIcon, SectorDecor, StageStatus, StepTrack, TERM_GRID, TermAside } from './Terminal';
import type { StageTrack } from './stageSteps';

type HomeView = 'map' | 'lage';
/** Mobile Ansicht der Startseite (Karte oder Lage) – bleibt über Seitenwechsel im Layout erhalten */
const ViewCtx = createContext<{ view: HomeView; setView: (v: HomeView) => void }>({ view: 'lage', setView: () => undefined });

type NavId = 'lage' | 'stats' | 'zeitraffer' | 'codex' | 'gallery' | 'rules' | 'faq';

/**
 * Rahmen der Leseansicht im Stil des Kommandoterminals (Layout aller /v/{token}-Seiten):
 * links Navigationstasten, Kampagnentitel, Schrittfolge und Kathedrale; die Seiten füllen Mitte und
 * rechte Spalte. Unterseiten stehen in einer großen Einhausung, die innen scrollt. Mobil: eine Ansicht,
 * Leiste unten. Der Präsentationsmodus bringt seine eigene Vollbildfläche mit.
 */
export function PublicFrame({ base, name, stage, track, children }: { base: string; name: string; stage: string; track: StageTrack; children: React.ReactNode }) {
  const t = useT();
  const locale = useLocale();
  const path = (usePathname() ?? base).replace(/\/+$/, '');
  const [view, setView] = useState<HomeView>('lage');
  const [more, setMore] = useState(false);
  if (path === `${base}/present`) return <>{children}</>;
  const home = path === base;
  const sub = path.slice(base.length);

  const NAV: { id: NavId; href: string; label: string; icon: React.ReactNode }[] = [
    { id: 'lage', href: base, label: t('Lage'), icon: <GameIcon name="ui_PLANET" size={20} color="currentColor" /> },
    { id: 'stats', href: `${base}/stats`, label: t('Statistik'), icon: <GameIcon name="ui_TROPHY" size={20} color="currentColor" /> },
    { id: 'zeitraffer', href: `${base}/zeitraffer`, label: t('Zeitraffer'), icon: <HourglassIcon size={20} /> },
    { id: 'codex', href: `${base}/codex`, label: 'Codex', icon: <BookIcon size={20} /> },
    { id: 'gallery', href: `${base}/gallery`, label: t('Galerie'), icon: <GalleryIcon /> },
    { id: 'rules', href: `${base}/rules`, label: t('Regeln'), icon: <GameIcon name="ui_SCROLL" size={20} color="currentColor" /> },
    { id: 'faq', href: `${base}/faq`, label: 'FAQ', icon: <QuestionIcon size={20} /> },
  ];
  // Spielerakten gehören zur Statistik (Rangliste); Schlachten- und Planetenseiten zur Lage
  const active: NavId = sub.startsWith('/players/') ? 'stats' : ((NAV.find((n) => n.id !== 'lage' && (sub === n.href.slice(base.length) || sub.startsWith(`${n.href.slice(base.length)}/`)))?.id ?? 'lage') as NavId);

  const navKeys = (ids: NavId[]) => (
    <ul className="space-y-1.5">
      {NAV.filter((n) => ids.includes(n.id)).map((n) => (
        <li key={n.id}>
          <Link href={n.href} className="navkey" aria-current={active === n.id ? 'page' : undefined} onClick={() => setMore(false)}>
            <span className={active === n.id ? 'text-[#f3e2b4]' : 'text-brass'}>{n.icon}</span>
            <span className="flex-1 truncate">{n.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );

  // Titel der Einhausung auf Unterseiten
  const titles: [RegExp, string][] = [
    [/^\/stats/, t('Statistik')],
    [/^\/zeitraffer/, t('Zeitraffer')],
    [/^\/codex/, 'Codex'],
    [/^\/gallery/, t('Galerie')],
    [/^\/rules/, t('Kampagnenregeln')],
    [/^\/faq/, t('Regel-FAQ')],
    [/^\/planets\//, t('Planetenakte')],
    [/^\/players\//, t('Spielerakte')],
    [/^\/battles\/[^/]+\/briefing/, 'Briefing'],
    [/^\/battles\//, t('Schlachtbericht')],
  ];
  const subTitle = titles.find(([re]) => re.test(sub))?.[1] ?? name;

  return (
    <ViewCtx.Provider value={{ view, setView }}>
      <HeaderPortal>
        <StageStatus track={track} locale={locale} />
      </HeaderPortal>
      <div className={`term-grid ${TERM_GRID} ${home ? 'bay-3' : ''}`}>
        <TermAside locale={locale} label={t('Leseansicht')} steps={track.items.length ? <StepTrack track={track} /> : undefined}>
          <div>
            <h1 className="text-[20px] leading-tight lg:text-[17px]">{name}</h1>
            <p className="readout mt-0.5">{stage}</p>
          </div>
          {navKeys(NAV.map((n) => n.id))}
        </TermAside>
        <main className={`h-full min-w-0 lg:col-span-2 lg:min-h-0 ${home ? 'lg:grid lg:grid-cols-subgrid lg:grid-rows-[minmax(0,1fr)] lg:gap-[var(--gap)]' : ''}`}>
          {home ? (
            children
          ) : (
            <Housing title={subTitle} className="term-housing" bodyClass="lg:pr-2">
              {/* Spalte in voller Höhe: Seiten mit .page-fill (Statistik, Zeitraffer, Codex) füllen den Rest */}
              <div className="term-page flex h-full flex-col gap-4 lg:px-2">{children}</div>
            </Housing>
          )}
        </main>
      </div>

      {/* Mobil: „Mehr“-Blatt mit restlichen Seiten und Schrittfolge (Sprachschalter steht in der Kopfzeile) */}
      {more && (
        <MoreSheet title={t('Weitere Seiten')} onClose={() => setMore(false)}>
          <div className="space-y-5">
            <div>
              <p className="text-[20px] font-display font-bold uppercase leading-tight text-ink">{name}</p>
              <p className="readout mt-0.5">{stage}</p>
            </div>
            {navKeys(['zeitraffer', 'gallery', 'rules', 'faq'])}
            <StepTrack track={track} />
            <CreditsLink locale={locale} className="border-t border-line/60 pt-3" />
          </div>
        </MoreSheet>
      )}

      <nav className={`${MOBILE_NAV_CLASS} grid-cols-5`} aria-label={t('Leseansicht (mobil)')}>
        {(
          [
            [t('Karte'), 'ui_PLANET', home && view === 'map' && !more, 'map'],
            [t('Lage'), 'ui_SCROLL', home && view === 'lage' && !more, 'lage'],
          ] as const
        ).map(([label, icon, on, v]) => (
          <Link
            key={v}
            href={base}
            onClick={() => {
              setView(v);
              setMore(false);
            }}
            aria-current={on ? 'page' : undefined}
            className={`${MOBILE_KEY_CLASS} ${on ? 'text-accent' : 'text-dim'}`}
          >
            <MobileKey label={label} on={on} icon={<GameIcon name={icon} size={22} color={on ? '#dda94d' : '#b3975f'} />} />
          </Link>
        ))}
        {(
          [
            [t('Statistik'), 'stats', <GameIcon key="i" name="ui_TROPHY" size={22} color={active === 'stats' && !more ? '#dda94d' : '#b3975f'} />],
            ['Codex', 'codex', <BookIcon key="i" size={22} className={active === 'codex' && !more ? 'text-accent' : 'text-brass'} />],
          ] as const
        ).map(([label, id, icon]) => {
          const on = active === id && !more;
          return (
            <Link key={id} href={`${base}/${id}`} onClick={() => setMore(false)} aria-current={on ? 'page' : undefined} className={`${MOBILE_KEY_CLASS} ${on ? 'text-accent' : 'text-dim'}`}>
              <MobileKey label={label} on={on} icon={icon} />
            </Link>
          );
        })}
        {(() => {
          const on = more || ['zeitraffer', 'gallery', 'rules', 'faq'].includes(active);
          return (
            <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} className={`${MOBILE_KEY_CLASS} ${on ? 'text-accent' : 'text-dim'}`}>
              <MobileKey label={t('Mehr')} on={on} icon={<GameIcon name="ui_COG" size={22} color={on ? '#dda94d' : '#b3975f'} />} />
            </button>
          );
        })()}
      </nav>
    </ViewCtx.Provider>
  );
}

/** Kopfzeile der Leseansicht: im Präsentationsmodus (eigene Vollbildfläche) nicht gerendert, damit sie keinen Fokus erhält */
export function PublicHeaderGate({ base, children }: { base: string; children: React.ReactNode }) {
  const path = (usePathname() ?? base).replace(/\/+$/, '');
  return path === `${base}/present` ? null : <>{children}</>;
}

type Side = 'lage' | 'chronik' | 'planet';

/**
 * Startseite der Leseansicht: Mitte die taktische Sektorkarte mit Punkteleiste, rechts Lagebericht,
 * Chronik oder – nach Wahl eines Planeten – die Planetenakte (nur lesend). Mobil: Karte oder Lage,
 * die Planetenakte als Blatt über der Leiste.
 */
export function PublicHome({ state, base, stage, head, lage, chronik }: { state: CampaignState; base: string; stage: string; head: React.ReactNode; lage: React.ReactNode; chronik: React.ReactNode }) {
  const t = useT();
  const locale = useLocale();
  const planetImages = usePlanetImages();
  const desktop = useIsDesktop();
  const { view } = useContext(ViewCtx);
  const arrows = usePublicArrows(state);
  const [selected, setSelectedRaw] = useState<string | null>(null);
  const [side, setSide] = useState<Side>('lage');
  const select = (id: string | null) => {
    setSelectedRaw(id);
    setSide(id ? 'planet' : 'lage');
  };
  const pts = state.pointsHistory.at(-1)?.points ?? null;
  const map = mapOf(state);
  const dossier = selected && <PlanetDossier state={state} planetId={selected} locale={locale} planetImages={planetImages} base={base} onClose={() => select(null)} />;
  const tabs: [Side, string, React.ReactNode, boolean][] = [
    ['lage', t('Lagebericht'), <GameIcon key="i" name="ui_SCROLL" size={16} color="#b3975f" />, true],
    ['chronik', t('Chronik'), <BookIcon key="i" size={16} className="text-brass" />, true],
    ['planet', t('Planetenakte'), <GameIcon key="i" name="ui_PLANET" size={16} color="#b3975f" />, !!selected && desktop],
  ];
  const plate = side === 'planet' && selected ? t('Planetenakte') : side === 'chronik' ? t('Chronik') : t('Lagebericht');

  return (
    <>
      <section className={`hud frame flex-col p-2 pt-6 sm:p-3 sm:pt-6 lg:flex lg:h-full lg:min-h-0 ${view === 'map' ? 'flex h-full' : 'hidden'}`} aria-label={t('Taktische Sektorkarte')}>
        <span className="plate plate-head hidden lg:inline-flex">{t('Taktische Sektorkarte')}</span>
        <Motto text={MOTTO.map} />
        <div className="screen relative min-h-0 flex-1">
          <SectorDecor name={map.name} stage={stage} planets={map.planets.length} locale={locale} />
          <CampaignMap fit state={state} arrows={arrows} points={pts} selected={selected} onPlanet={(id) => select(selected === id ? null : id)} />
        </div>
        <PointsBar state={state} locale={locale}>
          <span className="font-mono text-[13px] text-faint">{selected ? t('Gewählt: {name}', { name: planetDef(selected)?.name ?? selected }) : t('Planet wählen für die Planetenakte')}</span>
        </PointsBar>
      </section>

      <div className={`min-h-0 lg:block lg:h-full ${view === 'lage' ? 'h-full' : 'hidden'}`}>
        <Housing title={plate} label={plate}>
          <div className="tabbar mb-3" role="tablist" aria-label={t('Rechte Spalte')}>
            {tabs.map(([k, label, icon, enabled]) =>
              k === 'planet' && !desktop ? null : (
                <button key={k} type="button" role="tab" aria-selected={side === k} className="tabkey" disabled={!enabled} title={enabled ? undefined : t('Planet auf der Karte wählen')} onClick={() => setSide(k)}>
                  {icon} {label}
                </button>
              ),
            )}
          </div>
          <div className={`space-y-3 ${side === 'lage' || (side === 'planet' && !desktop) ? '' : 'hidden'}`}>
            {/* Serverelemente einzeln einhängen (sonst Schlüsselwarnung für statische Geschwister) */}
            <div>{head}</div>
            <div className="space-y-3">{lage}</div>
          </div>
          <div className={`space-y-3 ${side === 'chronik' ? '' : 'hidden'}`}>{chronik}</div>
          {desktop && side === 'planet' && dossier}
        </Housing>
      </div>

      {/* Mobil: Planetenakte als Blatt über der Leiste (fester Aktenkopf, Karte abgedunkelt) */}
      {!desktop && selected && view === 'map' && (
        <DossierSheet planetId={selected} onClose={() => select(null)}>
          {/* Kopf (Name, Schließen) liefert das Blatt */}
          <PlanetDossier state={state} planetId={selected} locale={locale} planetImages={planetImages} base={base} head={false} />
        </DossierSheet>
      )}
    </>
  );
}

/** Bilderrahmen mit Berg (Galerie, NTH2 4.3) im Stil der Liniensymbole */
function GalleryIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="15" rx="1" />
      <path d="M3.5 17l5-5.5 4 4 2.5-2.5 5.5 5" />
      <circle cx="15.5" cy="9" r="1.6" />
    </svg>
  );
}
