'use client';

import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CampaignState } from '@/engine/types';
import { Empty } from '@/components/ui';
import { useT } from '@/i18n/client';
import { allianceMomentum, frontHighlights, heatmap, planetVolatility, playerActivity } from './frontStats';

const axis = { stroke: '#8c7443', tick: { fill: '#b7ae98', fontSize: 13 }, fontFamily: 'var(--font-techmono)' };
const grid = { stroke: 'rgba(102,83,51,0.45)', strokeDasharray: '3 4' };
const tip = {
  contentStyle: { background: '#151918', border: '1px solid #665333', borderRadius: 2, fontSize: 14, color: '#e8dfc9' },
  labelStyle: { color: '#f3e2b4', fontFamily: 'var(--font-cinzel)' },
  itemStyle: { color: '#e8dfc9' },
  cursor: { stroke: '#b3975f', strokeOpacity: 0.5 },
};

/**
 * Front-Analyse (D4) als Module der Statistik: Kennzahlen, Heatmap Planet × Phase, Momentum der Allianzen,
 * volatilste Planeten und aktivste Spieler mit Serien. `className` steuert die Sichtbarkeit (mobiles Register).
 */
export function FrontAnalysis({ state, className = 'flex', playerHref }: { state: CampaignState; className?: string; playerHref?: (id: string) => string }) {
  const t = useT();
  const hl = useMemo(() => frontHighlights(state), [state]);
  const heat = useMemo(() => heatmap(state), [state]);
  const momentum = useMemo(() => allianceMomentum(state), [state]);
  const vol = useMemo(() => planetVolatility(state).slice(0, 6), [state]);
  const act = useMemo(() => playerActivity(state).slice(0, 8), [state]);
  const [mode, setMode] = useState<'battles' | 'swing'>('battles');
  const swingOk = heat.max.swing > 0;
  const m = mode === 'swing' && swingOk ? 'swing' : 'battles';
  const link = (id: string, name: string) =>
    playerHref ? (
      <a className="link" href={playerHref(id)}>
        {name}
      </a>
    ) : (
      name
    );
  const series = momentum.map((p) => ({ phase: `P${p.phase}`, ...Object.fromEntries(state.alliances.map((a) => [a.id, p.momentum[a.id]])) }));

  return (
    <>
      <Module title={t('Front-Analyse')} className={`${className} lg:col-span-2`}>
        <div className="grid gap-2 sm:grid-cols-3">
          <Tile label={t('Volatilster Planet')} value={hl.volatile?.name ?? '–'}>
            {hl.volatile
              ? hl.hasHistory
                ? t('{n} PL-Änderungen · {b} Schlachten', { n: hl.volatile.changes, b: hl.volatile.battles })
                : t('{b} Schlachten', { b: hl.volatile.battles })
              : t('Noch keine Bewegung an der Front.')}
          </Tile>
          <Tile label={t('Aktivster Spieler')} value={hl.active ? link(hl.active.playerId, hl.active.nickname) : '–'}>
            {hl.active ? t('{n} Schlachten in {p} Phasen', { n: hl.active.battles, p: hl.active.phases }) : t('Noch keine gewertete Schlacht.')}
          </Tile>
          <Tile label={t('Längste Siegesserie')} value={hl.streak ? link(hl.streak.playerId, hl.streak.nickname) : '–'}>
            {hl.streak ? t('{n} Siege in Folge', { n: hl.streak.bestStreak }) : t('Noch keine Siegesserie.')}
          </Tile>
        </div>
        {!hl.hasHistory && state.fog && <p className="mt-2 text-[14px] text-dim">{t('Nebel über dem Punktestand: Die Analyse zählt nur Schlachten, keine PL-Werte.')}</p>}
      </Module>

      <Module title={t('Heatmap: Planet × Phase')} className={`${className} lg:col-span-2`}>
        {heat.phases.length === 0 ? (
          <Empty>{t('Noch keine Phase gespielt.')}</Empty>
        ) : (
          <div className="space-y-2">
            <div className="inset inline-flex p-0.5" role="group" aria-label={t('Wert der Heatmap')}>
              {(
                [
                  ['battles', t('Schlachten')],
                  ['swing', t('PL-Bewegung')],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={m === k}
                  disabled={k === 'swing' && !swingOk}
                  onClick={() => setMode(k)}
                  className={`min-h-9 rounded-[2px] px-3 text-[14px] disabled:opacity-40 ${m === k ? 'bg-[#262b28] text-ink shadow-[inset_0_0_0_1px_rgba(179,151,95,0.6)]' : 'text-faint hover:text-dim'}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="xscroll overflow-x-auto" role="region" tabIndex={0} aria-label={t('Heatmap: Planet × Phase')}>
              <table className="border-separate border-spacing-[2px] text-[14px]">
                <thead>
                  <tr>
                    <th className="text-left font-normal text-dim">{t('Planet')}</th>
                    {heat.phases.map((p) => (
                      <th key={p} className="min-w-12 text-center font-mono font-normal text-dim">
                        P{p}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heat.rows.map((r) => (
                    <tr key={r.planetId}>
                      <td className="whitespace-nowrap pr-2 text-ink">{r.name}</td>
                      {r.cells.map((c, i) => {
                        const v = m === 'battles' ? c.battles : c.swing;
                        const max = m === 'battles' ? heat.max.battles : heat.max.swing;
                        const k = v && max ? v / max : 0;
                        const title = t('{planet}, Phase {n}: {b} Schlachten, PL-Bewegung {s}', { planet: r.name, n: heat.phases[i], b: c.battles, s: c.swing ?? '–' });
                        return (
                          <td
                            key={i}
                            title={title}
                            aria-label={title}
                            className={`h-8 rounded-[2px] text-center font-mono ${k > 0.55 ? 'text-[#1d1608]' : v ? 'text-ink' : 'text-faint'}`}
                            style={{ background: v ? `rgba(221,169,77,${0.14 + k * 0.76})` : 'rgba(255,255,255,0.03)' }}
                          >
                            {v ?? '–'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[13px] text-dim">
              {m === 'battles' ? t('Zahl = Schlachten auf dem Planeten in der Phase; je heller, desto mehr.') : t('Zahl = Summe der PL-Änderungen aller Allianzen in der Phase; je heller, desto mehr.')}
            </p>
          </div>
        )}
      </Module>

      <Module title={t('Momentum der Allianzen')} className={className}>
        {series.length ? (
          <div className="space-y-2">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 10, right: 16, left: -18, bottom: 0 }}>
                  <CartesianGrid {...grid} vertical={false} />
                  <XAxis dataKey="phase" {...axis} />
                  <YAxis {...axis} allowDecimals={false} />
                  <ReferenceLine y={0} stroke="#8c7443" />
                  <Tooltip {...tip} />
                  {state.alliances.map((a) => (
                    <Line key={a.id} type="linear" dataKey={a.id} name={a.name} stroke={a.color} strokeWidth={2} dot={{ r: 4, fill: a.color, stroke: '#0b0e0d', strokeWidth: 2 }} isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[14px] text-ink">
              {state.alliances.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4" style={{ background: a.color }} aria-hidden />
                  {a.name}
                </span>
              ))}
            </p>
            <p className="text-[13px] text-dim">{t('Momentum = Siege minus Niederlagen der Allianz in dieser und der vorigen Phase.')}</p>
          </div>
        ) : (
          <Empty>{t('Noch keine Phase gespielt.')}</Empty>
        )}
      </Module>

      <div className={`min-w-0 flex-col gap-3 ${className}`}>
        <Module title={t('Volatilste Planeten')}>
          {vol.some((v) => v.changes || v.battles) ? (
            <table className="table w-full text-[14px]">
              <thead>
                <tr>
                  <th>{t('Planet')}</th>
                  <th className="text-right">{t('PL-Änderungen')}</th>
                  <th className="text-right">{t('Besitzwechsel')}</th>
                  <th className="text-right">{t('Schlachten')}</th>
                </tr>
              </thead>
              <tbody>
                {vol.map((v) => (
                  <tr key={v.planetId}>
                    <td>{v.name}</td>
                    <td className="text-right font-mono">{hl.hasHistory ? v.changes : '–'}</td>
                    <td className="text-right font-mono">{hl.hasHistory ? v.flips : '–'}</td>
                    <td className="text-right font-mono">{v.battles}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>{t('Noch keine Bewegung an der Front.')}</Empty>
          )}
        </Module>
        <Module title={t('Aktivste Spieler und Serien')}>
          {act.length ? (
            <table className="table w-full text-[14px]">
              <thead>
                <tr>
                  <th>{t('Spieler')}</th>
                  <th className="text-right">{t('Schlachten')}</th>
                  <th className="text-right">{t('Beste Serie')}</th>
                  <th className="text-right">{t('Aktuell')}</th>
                </tr>
              </thead>
              <tbody>
                {act.map((p) => (
                  <tr key={p.playerId}>
                    <td>{link(p.playerId, p.nickname)}</td>
                    <td className="text-right font-mono">{p.battles}</td>
                    <td className="text-right font-mono">{p.bestStreak || '–'}</td>
                    <td className={`text-right font-mono ${p.current > 0 ? 'text-ok' : p.current < 0 ? 'text-danger' : 'text-faint'}`}>
                      {p.current > 0 ? t('{n} S', { n: p.current }) : p.current < 0 ? t('{n} N', { n: -p.current }) : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>{t('Noch keine gewertete Schlacht.')}</Empty>
          )}
          <p className="mt-2 text-[13px] text-dim">{t('Aktuell: laufende Serie aus Siegen (S) oder Niederlagen (N).')}</p>
        </Module>
      </div>
    </>
  );
}

function Tile({ label, value, children }: { label: string; value: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="inset p-2.5">
      <p className="text-[13px] text-dim">{label}</p>
      <p className="truncate font-display text-[17px] font-bold text-ink">{value}</p>
      <p className="text-[14px] text-dim">{children}</p>
    </div>
  );
}

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
