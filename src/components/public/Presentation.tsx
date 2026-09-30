'use client';

import { TENDENCY_LABEL } from '@/engine/fog';
import { useEffect, useRef, useState } from 'react';
import type { Battle, CampaignState } from '@/engine/types';
import { ATTACK_TYPES } from '@/engine/data/vespator';
import { mapOf, planetName } from '@/engine/map';
import { MapSvg, compactSize } from '@/components/map/MapSvg';
import { usePortraitMap } from '@/components/map/usePortrait';
import { usePlanetImages } from '@/components/map/planetImages';
import { GameIcon } from '@/components/icons/GameIcon';
import { allianceEmblem } from '@/components/icons/registry';
import { Timelapse, type TimelapseData } from './Timelapse';
import type { FeedItem } from './feed';
import { groupBattles } from './presentGroups';
import { useNow } from './useNow';
import { PresentAudio } from './PresentAudio';
import { useIntlLocale, useLocale, useT } from '@/i18n/client';

type View = 'map' | 'ranking' | 'chronicle' | 'timelapse';

/**
 * Präsentationsmodus (N3.3) für Beamer/Fernseher als bildschirmfüllendes Kommandodisplay: nur öffentliche Daten,
 * wechselt automatisch Karte, Rangliste, Chronik und Zeitraffer; rechts die angesetzten Schlachten, unten ein
 * Meldungsband. Anhalten über die Taste oder die Leertaste, Pfeiltasten wechseln die Ansicht.
 * Bewegung (Fortschrittsbalken, Laufband) entfällt bei „reduzierter Bewegung“.
 */
export function Presentation({
  state,
  feed,
  timelapse,
  seconds,
  players,
}: {
  state: CampaignState;
  feed: FeedItem[];
  timelapse: TimelapseData;
  seconds: number;
  players: { nickname: string; wins: number; battles: number }[];
}) {
  const t = useT();
  const il = useIntlLocale();
  const now = useNow();
  const views: View[] = timelapse.frames.length > 1 ? ['map', 'ranking', 'chronicle', 'timelapse'] : ['map', 'ranking', 'chronicle'];
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const iv = setInterval(() => setI((x) => (x + 1) % views.length), seconds * 1000);
    return () => clearInterval(iv);
  }, [paused, seconds, views.length, i]);
  // Leertaste hält an bzw. setzt fort, Pfeiltasten blättern (nicht in Eingabefeldern oder auf Knöpfen)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag)) return;
      if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === 'ArrowRight') setI((x) => (x + 1) % views.length);
      else if (e.key === 'ArrowLeft') setI((x) => (x - 1 + views.length) % views.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [views.length]);
  const view = views[i % views.length];
  const last = state.pointsHistory.at(-1);
  // C1: Nebel über dem Punktestand – Rangfolge und Tendenz statt Punkten
  const fog = state.fog;
  const tendency = (id: string) => (fog ? t(TENDENCY_LABEL[fog.tendency[id]]) : '');
  const ranking = [...state.alliances].sort((a, b) => (fog ? fog.rank[a.id] - fog.rank[b.id] : (last?.points[b.id] ?? 0) - (last?.points[a.id] ?? 0)));
  const maxPts = Math.max(1, ...ranking.map((a) => last?.points[a.id] ?? 0));
  const phase = state.stage.kind === 'PHASE' ? state.stage.phase : null;
  const groups = groupBattles(state, now);
  const openBattles = groups.running.length + groups.today.length + groups.next.length;
  // rechte Spalte: Schlachten, sonst letzte Meldungen (nicht neben der Chronik), sonst keine – die Ansicht nutzt dann die volle Breite
  const side: 'battles' | 'news' | null = openBattles ? 'battles' : feed.length && view !== 'chronicle' ? 'news' : null;
  const tz = state.meta.timezone;
  const ticker = feed.slice(0, 10);
  const alName = (id: string) => state.alliances.find((a) => a.id === id)?.name;
  const alColor = (id: string) => state.alliances.find((a) => a.id === id)?.color ?? '#b3975f';
  const battleTitle = (b: Battle) => (b.attackType ? ATTACK_TYPES[b.attackType].name : b.kind === 'FINAL_TIEBREAK' ? t('Entscheidungsschlacht') : b.kind === 'KILL_TEAM' ? 'Kill Team' : t('Gefecht'));
  const when = (b: Battle, timeOnly: boolean) =>
    b.scheduledAt
      ? new Date(b.scheduledAt).toLocaleString(
          il,
          timeOnly ? { timeZone: tz, hour: '2-digit', minute: '2-digit' } : { timeZone: tz, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' },
        )
      : t('ohne Termin');
  const sections: [string, Battle[], boolean][] = [
    [t('Läuft gerade'), groups.running, true],
    [t('Heute'), groups.today, true],
    [t('Als Nächstes'), groups.next, false],
  ];
  const TITLES: Record<View, string> = { map: t('Taktische Sektorkarte'), ranking: t('Rangliste'), chronicle: t('Chronik'), timelapse: t('Zeitraffer') };

  return (
    <div className="present fixed inset-0 z-[70] flex flex-col gap-[var(--gap)] overflow-hidden bg-void p-2 sm:p-[var(--gap)]">
      {/* Kopfband: Kampagne, Phase, Punkte, Ansichtsleuchten, Anhalten */}
      <header className="hud frame relative flex flex-wrap items-center gap-x-6 gap-y-2 px-3 py-2 sm:px-5">
        <div aria-hidden className="pointer-events-none hidden h-10 w-24 shrink-0 bg-[url('/ui/emblem-winged.webp')] bg-contain bg-center bg-no-repeat lg:block" />
        {/* Titel vollständig: bis zu zwei Zeilen in etwas kleinerer Schrift (Zuschauer sehen keinen Tooltip) */}
        <div className="relative z-[1] min-w-0 flex-1 basis-[18rem]">
          <h1 className="line-clamp-2 text-balance text-[21px] leading-[1.12] [overflow-wrap:break-word] sm:text-[24px] lg:text-[26px]" title={state.meta.name}>
            {state.meta.name}
          </h1>
          <p className="truncate font-serif text-[15px] text-dim lg:text-lg">
            {phase ? t('Phase {n}', { n: `${phase}/${state.meta.phaseCount}` }) : t('Kampagne')} · {mapOf(state).name}
          </p>
        </div>
        <div className="relative z-[1] flex flex-wrap items-center gap-x-5 gap-y-1" aria-label={t('Kampagnenpunkte')}>
          {ranking.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-2 text-[17px] lg:text-2xl">
              <GameIcon name={allianceEmblem(a)} size={26} color={a.color} className="drop-shadow-[0_1px_0_rgba(0,0,0,0.9)]" />
              <span className="text-ink">{a.name}</span>
              {fog ? <span className="text-[15px] text-dim lg:text-xl">{tendency(a.id)}</span> : <b className="font-mono text-[22px] text-[#f3e2b4] lg:text-[32px]">{last?.points[a.id] ?? '–'}</b>}
            </span>
          ))}
        </div>
        <div className="relative z-[1] flex items-center gap-3">
          {/* NTH2 4.4: Klangteppich, erst nach Klick */}
          <PresentAudio feedKeys={ticker.map((f) => f.key)} />
          <button type="button" className="btn" aria-pressed={paused} onClick={() => setPaused((p) => !p)} title={t('Leertaste: anhalten oder fortsetzen')}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden className="inline-block">
              {paused ? <path d="M4 2.5v11l9-5.5z" fill="currentColor" /> : <path d="M4 2.5h2.5v11H4zM9.5 2.5H12v11H9.5z" fill="currentColor" />}
            </svg>
            {paused ? t('Fortsetzen') : t('Anhalten')}
          </button>
        </div>
        {/* Fortschritt bis zum nächsten Wechsel */}
        <span aria-hidden className="absolute inset-x-3 bottom-1 z-[1] h-[3px] overflow-hidden bg-black/60">
          <span
            key={`${i}-${paused}`}
            className="present-progress block h-full bg-[linear-gradient(90deg,#8c7443,#f3e2b4)]"
            style={{ animationDuration: `${seconds}s`, animationPlayState: paused ? 'paused' : 'running' }}
          />
        </span>
      </header>

      <div className={`flex min-h-0 flex-1 flex-col gap-[var(--gap)] lg:grid lg:grid-rows-[minmax(0,1fr)] ${side ? 'lg:grid-cols-[minmax(0,1fr)_minmax(340px,28vw)]' : 'lg:grid-cols-1'}`}>
        <section className="hud frame flex min-h-0 flex-1 flex-col p-2 pt-6 sm:p-3 sm:pt-7" aria-label={TITLES[view]}>
          <span className="plate plate-head">{TITLES[view]}</span>
          {view === 'map' && (
            <div className="screen relative z-[1] min-h-0 flex-1">
              <PresentMap state={state} />
            </div>
          )}
          {view === 'ranking' && (
            <div className="relative z-[1] grid min-h-0 flex-1 gap-4 overflow-hidden p-1 sm:grid-cols-2 lg:gap-8 lg:p-4">
              <div className="min-h-0">
                <h2 className="section-title text-[17px] lg:text-2xl">{fog ? t('Rangfolge') : t('Kampagnenpunkte')}</h2>
                <ol className="space-y-3 lg:space-y-5">
                  {ranking.map((a, k) => {
                    const v = last?.points[a.id] ?? 0;
                    return (
                      <li key={a.id} className="slab-present px-3 py-2 lg:px-5 lg:py-4">
                        <div className="flex items-center gap-3 lg:gap-4">
                          <span className="font-display text-2xl font-bold text-brass lg:text-5xl">{fog ? fog.rank[a.id] : k + 1}</span>
                          <GameIcon name={allianceEmblem(a)} size={40} color={a.color} className="drop-shadow-[0_1px_0_rgba(0,0,0,0.9)]" />
                          <span className="min-w-0 flex-1 truncate font-display text-xl font-bold text-ink lg:text-4xl">{a.name}</span>
                          {fog ? <span className="text-xl text-dim lg:text-3xl">{tendency(a.id)}</span> : <b className="font-mono text-3xl text-[#f3e2b4] lg:text-6xl">{last ? v : '–'}</b>}
                        </div>
                        {!fog && (
                          <span aria-hidden className="mt-2 block h-2 bg-black/60 lg:h-3">
                            <span className="block h-full" style={{ width: `${(v / maxPts) * 100}%`, background: a.color, boxShadow: `0 0 10px ${a.color}` }} />
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
              <div className="min-h-0">
                <h2 className="section-title text-[17px] lg:text-2xl">{t('Spieler')}</h2>
                <ol className="space-y-1.5 lg:space-y-2.5">
                  {players.slice(0, 10).map((p, k) => (
                    <li key={p.nickname} className="flex items-center gap-3 border-b border-brass-dark/40 pb-1 text-[17px] lg:text-2xl">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-[14px] font-bold lg:h-9 lg:w-9 lg:text-[17px] ${k === 0 ? 'bg-[radial-gradient(circle_at_35%_35%,#ffe9b5,#dda94d_60%,#7a5418)] text-black' : 'text-brass shadow-[inset_0_0_0_1px_#b3975f]'}`}
                      >
                        {k + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-ink">{p.nickname}</span>
                      <span className="whitespace-nowrap tabular-nums text-dim">{t('{w} S · {n} Sp.', { w: p.wins, n: p.battles })}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
          {view === 'chronicle' && (
            <div className="relative z-[1] min-h-0 flex-1 overflow-hidden p-1 lg:p-4">
              {feed.length === 0 && <p className="text-xl text-dim">{t('Noch keine Meldungen von der Front.')}</p>}
              <ul className="space-y-3 lg:space-y-5">
                {feed.slice(0, 8).map((f) => (
                  <li key={f.key} className="slab-present flex items-start gap-3 border-l-4 px-3 py-2 lg:gap-4 lg:px-5 lg:py-3" style={{ borderLeftColor: f.color ?? '#665333' }}>
                    {f.icon && <GameIcon name={f.icon} size={34} color={f.color ?? '#b3975f'} />}
                    <span className="min-w-0">
                      <span className="block text-[18px] font-semibold text-ink lg:text-[26px]">{f.title}</span>
                      {f.body && <span className="block text-[15px] text-dim lg:text-xl">{f.body}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {view === 'timelapse' && (
            <div className="relative z-[1] min-h-0 flex-1">
              <Timelapse key={i} data={timelapse} autoplay compact />
            </div>
          )}
        </section>

        {side === 'battles' && (
          <aside className="hud frame flex max-h-[30dvh] min-h-0 shrink-0 flex-col p-3 pt-6 lg:max-h-none lg:p-4 lg:pt-7" aria-label={t('Angesetzte Schlachten')}>
            <span className="plate plate-head">{t('Angesetzte Schlachten')}</span>
            <div className="relative z-[1] min-h-0 flex-1 space-y-4 overflow-y-auto pr-1" tabIndex={0}>
              {sections
                .filter(([, list]) => list.length > 0)
                .map(([label, list, timeOnly]) => (
                  <section key={label}>
                    <h2 className="section-title text-[15px] lg:text-lg">{label}</h2>
                    <ul className="space-y-2">
                      {list.map((b) => (
                        <li key={b.id} className="slab-present border-l-4 px-3 py-2" style={{ borderLeftColor: alColor(b.attackerAllianceId) }}>
                          <b className="block text-[17px] text-ink lg:text-xl">
                            {battleTitle(b)}
                            {b.planetId ? ` · ${planetName(b.planetId)}` : ''}
                          </b>
                          <span className="block text-[15px] text-dim lg:text-lg">{t('{a} gegen {d}', { a: alName(b.attackerAllianceId), d: alName(b.defenderAllianceId) })}</span>
                          <span className="block font-mono text-[15px] text-[#f3e2b4] lg:text-lg">{when(b, timeOnly)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
            </div>
          </aside>
        )}
        {/* Keine offenen Schlachten: statt leerer Spalte die letzten Meldungen (sonst entfällt die Spalte) */}
        {side === 'news' && (
          <aside className="hud frame flex max-h-[30dvh] min-h-0 shrink-0 flex-col p-3 pt-6 lg:max-h-none lg:p-4 lg:pt-7" aria-label={t('Letzte Meldungen')}>
            <span className="plate plate-head">{t('Letzte Meldungen')}</span>
            <p className="relative z-[1] mb-3 text-[16px] text-dim lg:text-lg">{t('Keine offenen Schlachten.')}</p>
            <ul className="relative z-[1] min-h-0 flex-1 space-y-2.5 overflow-hidden">
              {feed.slice(0, 6).map((f) => (
                <li key={f.key} className="slab-present flex items-start gap-3 border-l-4 px-3 py-2" style={{ borderLeftColor: f.color ?? '#665333' }}>
                  {f.icon && <GameIcon name={f.icon} size={26} color={f.color ?? '#b3975f'} />}
                  <span className="min-w-0">
                    <span className="block text-[17px] font-semibold text-ink lg:text-xl">{f.title}</span>
                    {f.body && <span className="line-clamp-2 block text-[15px] text-dim lg:text-lg">{f.body}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>

      {/* Meldungsband */}
      <div className="hud relative flex h-11 shrink-0 items-center overflow-hidden lg:h-14" role="marquee" aria-label={t('Meldungen')}>
        <span className="plate relative z-[2] ml-2 shrink-0 text-[13px] lg:text-[15px]">{t('Meldungen')}</span>
        <div className="relative z-[1] ml-2 min-w-0 flex-1 overflow-hidden whitespace-nowrap text-[16px] text-ink lg:text-2xl">
          {/* ohne Meldungen steht der Hinweis still und vollständig im Band (kein Lauftext, der rechts abgeschnitten wird) */}
          {ticker.length === 0 ? (
            <span className="line-clamp-2 block whitespace-normal px-2 text-[14px] leading-tight text-dim lg:px-6 lg:text-xl">{t('Noch keine Meldungen von der Front.')}</span>
          ) : (
            <div className="ticker inline-block">
              {[...ticker, ...ticker].map((f, k) => (
                <span key={`${f.key}-${k}`} className="mx-8 inline-flex items-center gap-2" aria-hidden={k >= ticker.length || undefined}>
                  <span className="inline-block h-2 w-2 rotate-45" style={{ background: f.color ?? '#b3975f' }} />
                  {f.title}
                </span>
              ))}
            </div>
          )}
        </div>
        <ol className="relative z-[1] hidden shrink-0 items-center gap-1 border-l border-brass-dark/60 px-2 md:flex" aria-label={t('Ansichten')}>
          {views.map((v, k) => (
            <li key={v}>
              <button
                type="button"
                onClick={() => setI(k)}
                className="flex min-h-11 items-center gap-2 rounded-[2px] px-2 font-serif text-[16px] text-dim hover:text-ink lg:text-[18px]"
                aria-current={k === i ? 'true' : undefined}
              >
                <span className={`lamp ${k === i ? 'lamp-on' : ''}`} aria-hidden />
                <span className={k === i ? 'text-ink' : ''}>{TITLES[v]}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/**
 * Karte für den Präsentationsmodus: Übersichtskarte über die ganze Fläche, Namen, Power-Level-Zahlen und Symbole
 * gegenüber der Arbeitskarte um gut ein Drittel vergrößert (Lesbarkeit aus einigen Metern Abstand), ohne Bedienung.
 */
function PresentMap({ state }: { state: CampaignState }) {
  const locale = useLocale();
  const planetImages = usePlanetImages();
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 1200, h: 800 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Hochformat nur auf Handys (Fenster < 1024 px), sonst Buchausrichtung
  const portrait = usePortraitMap(box.w, box.h);
  // Seitenverhältnis der Fläche: die Übersicht nutzt die volle Höhe (wie im Cockpit)
  const aspect = Math.round((box.h / Math.max(1, box.w)) * 100) / 100;
  const csz = compactSize(portrait, aspect);
  const unit = Math.max(0.8, csz.w / Math.max(1, box.w), csz.h / Math.max(1, box.h)) * PRESENT_SCALE;
  return (
    <div ref={ref} className="absolute inset-0">
      <MapSvg
        state={state}
        variant="compact"
        portrait={portrait}
        aspect={aspect}
        unit={unit}
        // Handy (Hochformat): PL-Zahlen wären zu klein – nur Namen, Machtringe und Flotten in großem Maßstab;
        // die Punkte je Allianz stehen im Kopfband
        dense={!portrait}
        markerScale={portrait ? 1.25 : 1}
        points={state.pointsHistory.at(-1)?.points ?? null}
        preserveAspectRatio="xMidYMid meet"
        className="block h-full w-full"
        locale={locale}
        planetImages={planetImages}
      />
    </div>
  );
}
/** Vergrößerung der Kartenbeschriftung im Präsentationsmodus */
const PRESENT_SCALE = 1.35;
