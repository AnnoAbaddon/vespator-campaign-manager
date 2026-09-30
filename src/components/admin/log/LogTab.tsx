'use client';

import { useMemo, useState } from 'react';
import { loadRevisionStateAction } from '@/app/actions/campaign';
import type { CampaignState } from '@/engine/types';
import { MapSvg } from '@/components/map/MapSvg';
import { Empty, TabPanel, Tabs } from '@/components/ui';
import { DiceIcon, UndoIcon, WarnIcon } from '@/components/icons';
import { GameIcon } from '@/components/icons/GameIcon';
import { stageLabel } from '@/components/stageLabel';
import { useCmd } from '../CommandProvider';
import type { RevisionInfo } from '../types';
import { DiceLog } from './DiceLog';
import { commandLabel, readableSummary } from './commandLabels';
import { useIntlLocale, useLocale, useMsg, useT } from '@/i18n/client';

export function LogTab({ revisions, snapshots }: { revisions: RevisionInfo[]; snapshots: { phase: number; revision: number }[] }) {
  const { campaignId, undo, busy, readOnly, revision, state } = useCmd();
  const t = useT();
  const msg = useMsg();
  const locale = useLocale();
  const intl = useIntlLocale();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [onlyOverride, setOnlyOverride] = useState(false);
  const [showUndone, setShowUndone] = useState(true);
  const [open, setOpen] = useState<number | null>(null);
  const [view, setView] = useState<{ rev: number; state: CampaignState } | null>(null);
  const [loading, setLoading] = useState<number | null>(null);
  const [sec, setSec] = useState<'log' | 'dice' | 'time'>('log');
  const tz = state.meta.timezone;

  /** angezeigter Text einer Revision: Befehlscodes werden zu lesbaren Meldungen */
  const text = (r: RevisionInfo) => {
    const s = readableSummary(r.summary, r.commandType);
    return s.isCode ? t(s.text) : msg(s.text);
  };

  const types = useMemo(() => [...new Set(revisions.map((r) => r.commandType))].sort(), [revisions]);
  const list = revisions.filter((r) => {
    if (type && r.commandType !== type) return false;
    if (onlyOverride && !r.isOverride) return false;
    if (!showUndone && !r.active) return false;
    if (q) {
      // Suche im Original und in der angezeigten Übersetzung
      const s = q.toLowerCase();
      const hit = (x: string) => x.toLowerCase().includes(s) || msg(x).toLowerCase().includes(s);
      return hit(r.summary) || hit(text(r)) || r.log.some(hit) || (r.reason ?? '').toLowerCase().includes(s);
    }
    return true;
  });

  // Einträge nach Kalendertag gruppieren (in der Zeitzone der Kampagne)
  const dayKey = (iso: string) => new Date(iso).toLocaleDateString(intl, { timeZone: tz, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const groups: { day: string; items: RevisionInfo[] }[] = [];
  for (const r of list) {
    const d = dayKey(r.createdAt);
    if (groups.at(-1)?.day === d) groups.at(-1)!.items.push(r);
    else groups.push({ day: d, items: [r] });
  }
  const time = (iso: string) => new Date(iso).toLocaleTimeString(intl, { timeZone: tz, hour: '2-digit', minute: '2-digit' });

  const show = async (rev: number) => {
    setLoading(rev);
    try {
      setView({ rev, state: await loadRevisionStateAction(campaignId, rev) });
      setSec('time');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-3">
      <Tabs
        sticky
        idBase="log"
        label={t('Log & Würfel')}
        value={sec}
        onChange={setSec}
        tabs={[
          { id: 'log', label: t('Aktions-Log'), icon: <GameIcon name="ui_SCROLL" size={16} /> },
          { id: 'dice', label: t('Würfelprotokoll'), icon: <DiceIcon size={16} /> },
          { id: 'time', label: t('Zeitreise'), icon: <GameIcon name="ui_PLANET" size={16} /> },
        ]}
      />
      <TabPanel idBase="log" value={sec}>
        {sec === 'log' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-auto text-[15px] text-dim">{t('{n} Revisionen', { n: revisions.length })}</p>
              <button className="btn btn-sm" onClick={() => undo()} disabled={busy || readOnly}>
                <UndoIcon /> {t('Letzte Aktion rückgängig machen')}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input className="input" type="search" placeholder={t('Suchen (Planet, Allianz, Begründung …)')} aria-label={t('Log durchsuchen')} value={q} onChange={(e) => setQ(e.target.value)} />
              <select className="select" value={type} aria-label={t('Befehlstyp')} onChange={(e) => setType(e.target.value)}>
                <option value="">{t('Alle Typen')}</option>
                {types.map((ty) => (
                  <option key={ty} value={ty}>
                    {t(commandLabel(ty))}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-dim">
              <label className="inline-flex min-h-10 items-center gap-1.5">
                <input type="checkbox" className="accent-[#dda94d]" checked={onlyOverride} onChange={(e) => setOnlyOverride(e.target.checked)} /> {t('nur Overrides')} <WarnIcon size={13} className="text-warn" />
              </label>
              <label className="inline-flex min-h-10 items-center gap-1.5">
                <input type="checkbox" className="accent-[#dda94d]" checked={showUndone} onChange={(e) => setShowUndone(e.target.checked)} /> {t('rückgängig gemachte zeigen')}
              </label>
            </div>
            {!list.length && <Empty>{t('Keine Einträge.')}</Empty>}
            {groups.map((g) => (
              <section key={g.day} aria-label={g.day}>
                <p className="section-title sticky top-12 z-[2] mb-0 bg-[#111514] py-1.5">{g.day}</p>
                <ol className="divide-y divide-line/50">
                  {g.items.map((r) => {
                    const cur = r.number === revision;
                    const tone = !r.active ? 'shadow-[inset_3px_0_0_#c9453b]' : r.isOverride ? 'shadow-[inset_3px_0_0_#dda94d]' : cur ? 'shadow-[inset_3px_0_0_#b3975f]' : '';
                    return (
                      <li key={r.number} className={`py-2 pl-3 pr-1 ${tone}`}>
                        <button className="block w-full text-left" onClick={() => setOpen(open === r.number ? null : r.number)} aria-expanded={open === r.number}>
                          {/* Metazeile: Nummer, Uhrzeit, Urheber, Kennzeichen */}
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[13px] text-faint">
                            <span>#{r.number}</span>
                            <span>{time(r.createdAt)}</span>
                            {r.author && <span className="font-sans text-dim">{msg(r.author)}</span>}
                            {cur && <span className="chip border-brass text-brass">{t('aktueller Stand')}</span>}
                            {!r.active && (
                              <span className="chip border-danger text-danger">
                                <UndoIcon size={12} /> {t('rückgängig gemacht')}
                              </span>
                            )}
                            {r.isOverride && (
                              <span className="chip border-warn text-warn">
                                <WarnIcon size={12} /> {t('Override')}
                              </span>
                            )}
                          </span>
                          <span className={`mt-0.5 block text-[15px] hover:text-accent ${r.active ? 'text-ink' : 'text-dim line-through'}`}>{text(r)}</span>
                        </button>
                        {r.isOverride && r.reason && (
                          <p className="mt-0.5 flex items-start gap-1.5 text-[14px] text-warn">
                            <WarnIcon size={13} className="mt-1 shrink-0" />
                            <span>
                              <span className="sr-only">{t('Override:')}</span> {msg(r.reason)}
                            </span>
                          </p>
                        )}
                        {open === r.number && (
                          <div className="mt-2 space-y-2 border-t border-line/40 pt-2">
                            {r.log.length > 0 && (
                              <ul className="list-disc space-y-0.5 pl-5 text-[14px] text-dim">
                                {r.log.map((l, i) => (
                                  <li key={i}>{msg(l)}</li>
                                ))}
                              </ul>
                            )}
                            <div className="flex flex-wrap items-center gap-2">
                              <button className="btn btn-sm" disabled={loading === r.number} onClick={() => show(r.number)}>
                                {loading === r.number ? t('Lädt…') : t('Karte zu diesem Zeitpunkt')}
                              </button>
                              <span className="font-mono text-[12px] text-faint" title={t('Technischer Befehlscode')}>
                                {r.commandType}
                              </span>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
        {sec === 'time' && (
          <div className="space-y-4">
            <div>
              <p className="section-title">{t('Phasen-Snapshots')}</p>
              {!snapshots.length && <Empty>{t('Noch keine abgeschlossene Phase.')}</Empty>}
              <div className="flex flex-wrap gap-2">
                {snapshots.map((s) => (
                  <button key={s.phase} className="btn btn-sm" aria-pressed={view?.rev === s.revision} onClick={() => show(s.revision)}>
                    {t('Ende Phase {n}', { n: s.phase })}
                  </button>
                ))}
              </div>
            </div>
            {view && (
              <div className="space-y-2 border-t border-line/60 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="section-title mb-0 flex-1">{t('Zeitreise: Revision #{n}', { n: view.rev })}</p>
                  <a className="btn btn-sm" href={`/api/c/${campaignId}/map.png?rev=${view.rev}`} target="_blank" rel="noreferrer">
                    PNG
                  </a>
                  <button className="btn btn-sm" onClick={() => setView(null)}>
                    {t('Schließen')}
                  </button>
                </div>
                <p className="font-mono text-[13px] text-dim">
                  {stageLabel(view.state, t)} · {t('nur lesend')}
                </p>
                <div className="screen p-2">
                  <MapSvg locale={locale} state={view.state} points={view.state.pointsHistory.at(-1)?.points ?? null} className="relative h-auto w-full" />
                </div>
                {view.state.pointsHistory.length > 0 && (
                  <p className="text-[15px]">
                    {t('Punkte:')} {view.state.alliances.map((a) => `${a.name} ${view.state.pointsHistory.at(-1)!.points[a.id]}`).join(' · ')}
                  </p>
                )}
              </div>
            )}
            {!view && snapshots.length > 0 && <p className="notice notice-muted">{t('Einen Phasenabschluss oder im Aktions-Log „Karte zu diesem Zeitpunkt“ wählen.')}</p>}
          </div>
        )}
        {sec === 'dice' && <DiceLog state={state} />}
      </TabPanel>
    </div>
  );
}
