'use client';

import { useEffect, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ATTACK_TYPES, MEDALS, OP_TYPES, type AttackType, type OpType } from '@/engine/data/vespator';
import type { Alliance, CampaignState } from '@/engine/types';
import { AllianceTag, Empty, FactionTag, MedalIcon } from '@/components/ui';
import { ArrowRightIcon } from '@/components/icons';
import { useMsg, useT } from '@/i18n/client';
import { muted } from '@/components/map/color';
import { allianceAttackStats, avg, factionStats, missionStats, niceTicks, pct, planetStats, playerStats, pointsSeries, seriesMax } from './compute';
import { MixStats } from './MixStats';
import { FrontAnalysis } from './FrontAnalysis';

/** Achsen und Raster in Messing, zurückhaltend; Tooltip als Stahlschild */
const axis = { stroke: '#8c7443', tick: { fill: '#b7ae98', fontSize: 13 }, fontFamily: 'var(--font-techmono)' };
const grid = { stroke: 'rgba(102,83,51,0.45)', strokeDasharray: '3 4' };
const tip = {
  contentStyle: { background: '#151918', border: '1px solid #665333', borderRadius: 2, fontSize: 14, color: '#e8dfc9', boxShadow: '0 6px 16px rgba(0,0,0,0.6)' },
  labelStyle: { color: '#f3e2b4', fontFamily: 'var(--font-cinzel)' },
  itemStyle: { color: '#e8dfc9' },
  cursor: { stroke: '#b3975f', strokeOpacity: 0.5, fill: 'rgba(179,151,95,0.08)' },
};

type Tab = 'points' | 'players' | 'planets' | 'battles' | 'front';

/**
 * Statistik als Lagezentrale. Alle Module stehen in natürlicher Höhe; es scrollt nur der äußere Inhaltsbereich
 * (Einhausung der Leseansicht bzw. Admin-Reiter). Desktop: Diagramme in zwei Spalten, die Spieler-Rangliste über
 * die volle Breite, darunter Planeten und Gefechte in zwei Spalten. Mobil: ein Register je Themengruppe, Module
 * untereinander. Breite Tabellen liegen in einem ausdrücklich gekennzeichneten waagrechten Scrollbereich.
 */
export function StatsView({ state, playerHref: href, playerBase }: { state: CampaignState; playerHref?: (id: string) => string; playerBase?: string }) {
  // Links zur Spielerakte: Funktion (Client) oder Basis-URL (aus Server-Komponenten serialisierbar)
  const playerHref = href ?? (playerBase ? (id: string) => `${playerBase}/${id}` : undefined);
  const t = useT();
  const msg = useMsg();
  const [tab, setTab] = useState<Tab>('points');
  const series = pointsSeries(state);
  const players = playerStats(state);
  const factions = factionStats(state);
  const planets = planetStats(state);
  const alliances = allianceAttackStats(state);
  const missions = missionStats(state);
  const types = Object.keys(ATTACK_TYPES) as AttackType[];
  const ticks = niceTicks(
    seriesMax(
      series,
      state.alliances.map((a) => a.id),
    ),
  );
  const TABS: [Tab, string][] = [
    ['points', t('Punkte')],
    ['players', t('Spieler')],
    ['planets', t('Planeten')],
    ['battles', t('Gefechte')],
    ['front', t('Front')],
  ];
  /** Sichtbarkeit je Registergruppe (mobil); Desktop zeigt alle Module */
  const vis = (g: Tab) => (tab === g ? 'flex' : 'hidden lg:flex');

  return (
    <div className="flex flex-col gap-3 pb-1">
      <div className="tabbar no-print shrink-0 lg:hidden" role="tablist" aria-label={t('Statistik')}>
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className="tabkey min-h-11 px-1 text-[15px]" onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Module title={t('Punkteverlauf')} className={vis('points')}>
          {series.length > 1 ? (
            <PointsChart state={state} series={series} ticks={ticks} />
          ) : series.length === 1 ? (
            <StartCompare state={state} row={series[0]} ticks={ticks} />
          ) : (
            <Empty>{state.fog ? t('Nebel über dem Punktestand (Hausregel): Die genauen Punkte werden am Kampagnenende aufgedeckt.') : t('Noch keine Punkte – die Kampagne ist im Setup.')}</Empty>
          )}
        </Module>

        <Module title={t('Zusammensetzung (PL-Summe + Stronghold)')} className={vis('points')}>
          {series.length ? (
            <div className="flex flex-col gap-2">
              <div className="h-[220px] lg:h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ top: 8, right: 14, left: -14, bottom: 0 }} barGap={2}>
                    <CartesianGrid {...grid} vertical={false} />
                    <XAxis dataKey="phase" {...axis} />
                    <YAxis {...axis} allowDecimals={false} domain={[0, ticks.at(-1)!]} ticks={ticks} interval={0} />
                    <Tooltip {...tip} />
                    {/* gedeckte Allianzfüllung mit klarer Kontur in voller Allianzfarbe; Stronghold-Aufsatz noch blasser */}
                    {state.alliances.map((a) => [
                      <Bar key={`${a.id}pl`} dataKey={`${a.id}_pl`} stackId={a.id} name={`${a.name} PL`} fill={muted(a.color, 0.5)} stroke={a.color} strokeWidth={1.5} isAnimationActive={false} />,
                      <Bar
                        key={`${a.id}sh`}
                        dataKey={`${a.id}_sh`}
                        stackId={a.id}
                        name={`${a.name} Stronghold`}
                        fill={muted(a.color, 0.22)}
                        stroke={a.color}
                        strokeOpacity={0.8}
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                        radius={[3, 3, 0, 0]}
                        isAnimationActive={false}
                      />,
                    ])}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Legende: Allianzfarbe = PL-Summe, blasser Aufsatz = Stronghold */}
              <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[14px] text-ink">
                {state.alliances.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3" style={{ background: muted(a.color, 0.5), boxShadow: `inset 0 0 0 1.5px ${a.color}` }} />
                    {a.name}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5 text-dim">
                  <span className="inline-block h-3 w-3 bg-[#b7ae98]/20 shadow-[inset_0_0_0_1px_#b7ae98]" />
                  {t('blass: Stronghold')}
                </span>
              </p>
            </div>
          ) : (
            <Empty>–</Empty>
          )}
        </Module>

        <Module title={t('Spieler-Rangliste')} className={`${vis('players')} lg:col-span-2`}>
          {players.length ? (
            <ScrollX label={t('Spieler-Rangliste')}>
              <table className="table w-full min-w-[760px] text-[14px] [&_th]:whitespace-nowrap">
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    <th>{t('Spieler')}</th>
                    <th className="text-right">{t('Schlachten')}</th>
                    <th className="text-right">
                      <abbr title={t('Siege / Unentschieden / Niederlagen')}>{t('S/U/N')}</abbr>
                    </th>
                    <th className="text-right">{t('Siegquote')}</th>
                    <th className="text-right">
                      <abbr title={t('Siegpunkte je Schlacht (eigene)')}>{t('Ø VP')}</abbr>
                    </th>
                    <th className="text-right">
                      <abbr title={t('Siegpunkte je Schlacht (Gegner)')}>{t('Ø VP Gegner')}</abbr>
                    </th>
                    <th className="text-right">
                      <abbr title={t('Summe eigene minus gegnerische Siegpunkte')}>{t('VP-Differenz')}</abbr>
                    </th>
                    <th className="text-right">{t('Bemalt')}</th>
                    <th className="text-right">{t('Angriff/Verteidigung')}</th>
                    <th className="text-right">{t('Medaillen')}</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p, i) => (
                    <tr key={p.playerId}>
                      <td>
                        {/* Rang erst ab der ersten gewerteten Schlacht – vorher ist die Reihenfolge nur alphabetisch */}
                        {p.battles ? (
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-display text-[12px] font-bold ${i === 0 ? 'bg-[radial-gradient(circle_at_35%_35%,#ffe9b5,#dda94d_60%,#7a5418)] text-black' : 'text-brass shadow-[inset_0_0_0_1px_#665333]'}`}
                          >
                            {i + 1}
                          </span>
                        ) : (
                          <span className="inline-flex h-6 w-6 items-center justify-center text-faint" title={t('noch kein Rang – keine gewertete Schlacht')}>
                            –
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        {playerHref ? (
                          <a className="link" href={playerHref(p.playerId)}>
                            {p.nickname}
                          </a>
                        ) : (
                          p.nickname
                        )}
                      </td>
                      <td className="text-right font-mono">{p.battles}</td>
                      <td className="whitespace-nowrap text-right font-mono">
                        {p.wins}/{p.draws}/{p.losses}
                      </td>
                      <td className="text-right font-mono">{pct(p.wins, p.battles)}</td>
                      <td className="text-right font-mono">{avg(p.vpFor, p.battles)}</td>
                      <td className="text-right font-mono">{avg(p.vpAgainst, p.battles)}</td>
                      <td className="text-right font-mono">{p.vpFor - p.vpAgainst}</td>
                      <td className="text-right font-mono">{pct(p.battleReady, p.battles)}</td>
                      <td className="text-right font-mono">
                        {p.attacks}/{p.defenses}
                      </td>
                      <td className={`text-right font-mono ${p.medals ? '' : 'text-faint'}`}>{p.medals || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollX>
          ) : (
            <Empty>{t('Noch keine Spieler.')}</Empty>
          )}
          <p className="mt-2 text-[13px] text-dim">{t('S/U/N = Siege/Unentschieden/Niederlagen · VP = Siegpunkte inkl. Bonus für bemalte Armeen')}</p>
        </Module>

        <Module title={t('Planeten – am meisten umkämpft')} className={vis('planets')}>
          <ScrollX label={t('Planeten – am meisten umkämpft')}>
            <table className="table w-full min-w-[480px] text-[14px] [&_th]:whitespace-nowrap">
              <thead>
                <tr>
                  <th>{t('Planet')}</th>
                  <th className="text-right">
                    <abbr title={t('Schlachten')}>{t('Schl.')}</abbr>
                  </th>
                  {state.alliances.map((a) => (
                    <th key={a.id} className="text-right">
                      <abbr title={t('Power Level {name}', { name: a.name })} className="no-underline">
                        <span className="inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: a.color }} aria-hidden /> PL
                      </abbr>
                    </th>
                  ))}
                  <th className="text-right">
                    <abbr title={t('zerstörte Infrastruktur-Plätze')}>{t('Loc. zerst.')}</abbr>
                  </th>
                  <th>{t('PL-Verlauf')}</th>
                </tr>
              </thead>
              <tbody>
                {planets.map((p) => (
                  <tr key={p.id} className={p.destroyed ? 'text-danger' : ''}>
                    <td className="whitespace-nowrap">
                      {p.name}
                      {p.destroyed ? ` (${t('zerstört')})` : ''}
                    </td>
                    <td className="text-right font-mono">{p.battles}</td>
                    {state.alliances.map((a) => (
                      <td key={a.id} className="text-right font-mono">
                        {p.power[a.id] ?? '–'}
                      </td>
                    ))}
                    <td className="text-right font-mono">{p.destroyedSlots || ''}</td>
                    <td>
                      <PlanetSparkline state={state} planetId={p.id} label={t('PL-Verlauf')} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
          <p className="mt-2 text-[13px] text-dim">{t('Schl. = Schlachten · PL = Power Level je Allianz · Loc. zerst. = zerstörte Infrastruktur-Plätze')}</p>
        </Module>

        <div className={`min-w-0 flex-col gap-3 ${tab === 'battles' ? 'flex' : 'hidden lg:flex'}`}>
          <Module title={t('Fraktionen')}>
            {factions.length ? (
              <ScrollX label={t('Fraktionen')}>
                <table className="table w-full min-w-[420px] text-[14px] [&_th]:whitespace-nowrap">
                  <thead>
                    <tr>
                      <th>{t('Fraktion')}</th>
                      <th className="text-right">{t('Schlachten')}</th>
                      <th className="text-right">
                        <abbr title={t('Siege / Unentschieden / Niederlagen')}>{t('S/U/N')}</abbr>
                      </th>
                      <th className="text-right">{t('Siegquote')}</th>
                      <th className="text-right">{t('Ø VP')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {factions.map((f) => (
                      <tr key={f.faction}>
                        <td>
                          <FactionTag name={f.faction === 'Unbekannt' ? t('Unbekannt') : f.faction} />
                        </td>
                        <td className="text-right font-mono">{f.battles}</td>
                        <td className="whitespace-nowrap text-right font-mono">
                          {f.wins}/{f.draws}/{f.losses}
                        </td>
                        <td className="text-right font-mono">{pct(f.wins, f.battles)}</td>
                        <td className="text-right font-mono">{avg(f.vpFor, f.battles)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollX>
            ) : (
              <Empty>{t('Noch keine gespielten Schlachten.')}</Empty>
            )}
          </Module>

          <Module title={t('Allianzen nach Attack Type (S/U/N)')}>
            <div className="space-y-3">
              <ScrollX label={t('Allianzen nach Attack Type (S/U/N)')}>
                <table className="table w-full min-w-[420px] text-[14px] [&_th]:whitespace-nowrap">
                  <thead>
                    <tr>
                      <th>{t('Attack Type')}</th>
                      {alliances.map((r) => (
                        <th key={r.alliance.id} className="text-right">
                          <AllianceTag alliance={r.alliance} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {types.map((ty) => (
                      <tr key={ty}>
                        <td className="whitespace-nowrap text-dim">{ATTACK_TYPES[ty].name}</td>
                        {alliances.map((r) => (
                          <td key={r.alliance.id} className={`text-right font-mono ${r.byType[ty].w + r.byType[ty].d + r.byType[ty].l ? 'text-ink' : 'text-faint'}`}>
                            {r.byType[ty].w}/{r.byType[ty].d}/{r.byType[ty].l}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollX>
              <p className="mb-1 text-[14px] text-dim">{t('Aufgedeckte Operationen')}</p>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[14px]">
                {alliances.map((r) => (
                  <div key={r.alliance.id} className="contents">
                    <dt>
                      <AllianceTag alliance={r.alliance} />
                    </dt>
                    <dd className="text-ink">
                      {Object.entries(r.ops)
                        .filter(([k]) => k !== 'NONE')
                        .map(([k, v]) => `${OP_TYPES[k as OpType]?.name.replace(/ Operation$/, '') ?? k} ${v}`)
                        .join(' · ') || '–'}
                    </dd>
                  </div>
                ))}
              </dl>
              {missions.length > 0 && (
                <div>
                  <h3 className="section-title">{t('Missionen')}</h3>
                  <ul className="flex flex-wrap gap-1.5">
                    {missions.map((m) => (
                      <li key={m.name} className="chip">
                        {msg(m.name)} · {m.count}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {state.medals.length > 0 && (
                <div>
                  <h3 className="section-title">{t('Medaillen')}</h3>
                  <ul className="space-y-1.5">
                    {state.medals.map((m) => (
                      <li key={m.medal} className="flex flex-wrap items-center gap-2 text-[14px]">
                        <MedalIcon medal={m.medal} /> {MEDALS[m.medal].name}: <AllianceTag alliance={state.alliances.find((a) => a.id === m.allianceId)} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Module>
          {/* A2: Mix der Angriffsarten und Missionen je Phase und Allianz */}
          <Module title={t('Mix je Phase und Allianz')}>
            <MixStats state={state} />
          </Module>
        </div>
        {/* D4: Front-Analyse (Leseansicht: öffentliche Projektion, respektiert den Nebel C1) */}
        <FrontAnalysis state={state} className={vis('front')} playerHref={playerHref} />
      </div>
    </div>
  );
}

/** Stahlmodul mit Titel in natürlicher Höhe (kein eigener Scrollbereich) */
function Module({ title, className = 'flex', children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`hud min-w-0 flex-col p-3 ${className}`} aria-label={title}>
      <h2 className="hud-title relative z-[1] mb-2 flex items-start gap-2 text-[14px] leading-tight">
        <span className="lamp lamp-on mt-1 h-2 w-2" aria-hidden />
        <span className="min-w-0">{title}</span>
      </h2>
      <div className="relative z-[1] min-w-0">{children}</div>
    </section>
  );
}

/**
 * Waagrechter Scrollbereich für breite Tabellen: fokussierbar, mit sichtbarer Leiste und – nur wenn die Tabelle
 * tatsächlich breiter ist – einem Hinweis samt Schatten an der Kante, hinter der weitere Spalten liegen.
 */
function ScrollX({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ over: false, left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const upd = () => {
      const over = el.scrollWidth > el.clientWidth + 1;
      setEdge({ over, left: over && el.scrollLeft > 2, right: over && el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    };
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    el.addEventListener('scroll', upd, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', upd);
    };
  }, []);
  return (
    <div className="min-w-0">
      {edge.over && (
        <p className="mb-1 flex items-center gap-1.5 text-[13px] text-dim">
          <ArrowRightIcon size={14} className="text-brass" /> {t('Weitere Spalten: seitlich verschieben')}
        </p>
      )}
      <div className="relative">
        <div ref={ref} className="xscroll overflow-x-auto" role="region" tabIndex={edge.over ? 0 : -1} aria-label={label}>
          {children}
        </div>
        {edge.left && <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-[#151918] to-transparent" />}
        {edge.right && <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#151918] to-transparent" />}
      </div>
    </div>
  );
}

/** Marker je Allianz: unterschiedliche Formen und nach innen kleiner werdend, damit gleiche Werte sichtbar bleiben */
const SHAPES = ['circle', 'square', 'diamond', 'triangle'] as const;
function markerSize(k: number) {
  return Math.max(3, 7.5 - k * 1.9);
}
function MarkerShape({ k, color, x, y, s = markerSize(k) }: { k: number; color: string; x: number; y: number; s?: number }) {
  const shape = SHAPES[k % SHAPES.length];
  const common = { fill: color, stroke: '#0b0e0d', strokeWidth: 1.5 };
  if (shape === 'square') return <rect x={x - s} y={y - s} width={s * 2} height={s * 2} {...common} />;
  if (shape === 'diamond') return <path d={`M${x} ${y - s * 1.25}L${x + s * 1.25} ${y}L${x} ${y + s * 1.25}L${x - s * 1.25} ${y}Z`} {...common} />;
  if (shape === 'triangle') return <path d={`M${x} ${y - s * 1.3}L${x + s * 1.2} ${y + s * 0.9}L${x - s * 1.2} ${y + s * 0.9}Z`} {...common} />;
  return <circle cx={x} cy={y} r={s} {...common} />;
}
function MarkerIcon({ k, color }: { k: number; color: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden className="shrink-0">
      <MarkerShape k={k} color={color} x={8} y={8} s={5} />
    </svg>
  );
}

/**
 * Punkteverlauf über mehrere Stände: Linien mit unterscheidbaren Markern und eine gemeinsame Werteanzeige
 * (zeigt den Stand unter dem Zeiger bzw. den letzten Stand) – gleiche Werte verdecken sich so nicht.
 */
function PointsChart({ state, series, ticks }: { state: CampaignState; series: Record<string, number | string>[]; ticks: number[] }) {
  const t = useT();
  const [hover, setHover] = useState<number | null>(null);
  const idx = hover ?? series.length - 1;
  const row = series[idx];
  return (
    <div className="flex flex-col gap-2">
      <div className="h-[220px] lg:h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={series}
            margin={{ top: 10, right: 16, left: -14, bottom: 0 }}
            onMouseMove={(s) => setHover(s?.activeTooltipIndex != null ? Number(s.activeTooltipIndex) : null)}
            onMouseLeave={() => setHover(null)}
          >
            <CartesianGrid {...grid} vertical={false} />
            <XAxis dataKey="phase" {...axis} />
            <YAxis {...axis} allowDecimals={false} domain={[0, ticks.at(-1)!]} ticks={ticks} interval={0} />
            {/* nur die Zeigerlinie – die Werte stehen in der gemeinsamen Anzeige unter dem Diagramm */}
            <Tooltip cursor={tip.cursor} content={() => null} />
            {state.alliances.map((a, k) => (
              <Line
                key={a.id}
                type="linear"
                dataKey={a.id}
                name={a.name}
                stroke={a.color}
                strokeWidth={2.5}
                dot={(p: { cx?: number; cy?: number; index?: number }) =>
                  p.cx == null || p.cy == null ? <g key={`${a.id}-${p.index}`} /> : <MarkerShape key={`${a.id}-${p.index}`} k={k} color={a.color} x={p.cx} y={p.cy} />
                }
                activeDot={(p: { cx?: number; cy?: number; index?: number }) =>
                  p.cx == null || p.cy == null ? <g key={`${a.id}-a`} /> : <MarkerShape key={`${a.id}-a`} k={k} color={a.color} x={p.cx} y={p.cy} s={markerSize(k) + 1.5} />
                }
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* Gemeinsame Werteanzeige = Legende */}
      <div className="inset px-2.5 py-1.5 text-[14px]" aria-live="polite">
        <p className="text-dim">{t('Stand {label}', { label: String(row.phase) })}</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {state.alliances.map((a, k) => (
            <li key={a.id} className="inline-flex items-center gap-1.5">
              <MarkerIcon k={k} color={a.color} />
              <span className="text-ink">{a.name}</span>
              <b className="font-mono text-[15px] text-ink">{row[a.id]}</b>
            </li>
          ))}
        </ul>
      </div>
      {/* Tabellenansicht der Kurve */}
      <ScrollX label={t('Punkteverlauf')}>
        <table className="table text-[14px] [&_th]:whitespace-nowrap">
          <thead>
            <tr>
              <th>{t('Allianz')}</th>
              {series.map((s) => (
                <th key={String(s.phase)} className="text-right">
                  {s.phase}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.alliances.map((a) => (
              <tr key={a.id}>
                <td>
                  <AllianceTag alliance={a} />
                </td>
                {series.map((s) => (
                  <td key={String(s.phase)} className="text-right font-mono">
                    {s[a.id]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollX>
    </div>
  );
}

/** Nur ein Stand erfasst: kompakte Gegenüberstellung der Werte statt eines Verlaufs aus einem Punkt */
function StartCompare({ state, row, ticks }: { state: CampaignState; row: Record<string, number | string>; ticks: number[] }) {
  const t = useT();
  const top = ticks.at(-1) || 1;
  const ranked: Alliance[] = [...state.alliances].sort((a, b) => Number(row[b.id]) - Number(row[a.id]));
  return (
    <div className="space-y-3">
      <ul className="space-y-2.5">
        {ranked.map((a) => {
          const v = Number(row[a.id]) || 0;
          return (
            <li key={a.id} className="grid grid-cols-[minmax(6.5rem,auto)_minmax(0,1fr)_3rem] items-center gap-3">
              <AllianceTag alliance={a} className="text-[15px]" />
              <span className="inset relative block h-4 overflow-hidden" aria-hidden>
                <span className="absolute inset-y-0 left-0" style={{ width: `${(v / top) * 100}%`, background: muted(a.color, 0.5), boxShadow: `inset 0 0 0 1px ${a.color}, inset -3px 0 0 ${a.color}` }} />
              </span>
              <b className="text-right font-mono text-[18px] text-ink">{v}</b>
            </li>
          );
        })}
      </ul>
      <p className="text-[14px] text-dim">{t('Bisher ist nur ein Stand erfasst ({label}). Der Verlauf erscheint nach der ersten Punktewertung.', { label: String(row.phase) })}</p>
    </div>
  );
}

/** PL-Verlauf je Allianz auf einem Planeten über die festgeschriebenen Phasen */
function PlanetSparkline({ state, planetId, label }: { state: CampaignState; planetId: string; label: string }) {
  const hist = state.pointsHistory.filter((h) => h.planets?.[planetId]);
  if (hist.length < 2) return <span className="text-faint">–</span>;
  const w = 80;
  const h = 24;
  const x = (i: number) => (i / (hist.length - 1)) * (w - 4) + 2;
  const y = (v: number) => h - 2 - (v / 4) * (h - 4);
  return (
    <svg width={w} height={h} aria-label={label} className="block">
      {/* gleiche Werte: breitere Linie unter schmalerer, statt die Werte zu verschieben */}
      {state.alliances.map((a, k) => (
        <polyline key={a.id} fill="none" stroke={a.color} strokeWidth={Math.max(1.2, 4.5 - k * 1.5)} points={hist.map((e, i) => `${x(i)},${y(e.planets![planetId][a.id] ?? 0)}`).join(' ')} />
      ))}
    </svg>
  );
}
