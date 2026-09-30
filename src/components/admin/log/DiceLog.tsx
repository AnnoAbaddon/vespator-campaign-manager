'use client';

import { useState } from 'react';
import type { CampaignState } from '@/engine/types';
import { Empty, fmtDate } from '@/components/ui';
import { DiceIcon, HandIcon } from '@/components/icons';
import { useMsg, useT, useLocale } from '@/i18n/client';

/** Würfelprotokoll (SPEC 13): alle Würfe mit Kontext, Modifikator, Modus und Zeitpunkt */
export function DiceLog({ state }: { state: CampaignState }) {
  const t = useT();
  const lc = useLocale();
  const msg = useMsg();
  const [q, setQ] = useState('');
  const [phase, setPhase] = useState('');
  const [mode, setMode] = useState('');
  const list = [...state.dice]
    .reverse()
    .filter((d) => (!q || d.context.toLowerCase().includes(q.toLowerCase()) || msg(d.context).toLowerCase().includes(q.toLowerCase())) && (!mode || d.mode === mode) && (!phase || String(d.phaseNumber ?? 0) === phase));
  const phases = [...new Set(state.dice.map((d) => d.phaseNumber ?? 0))].sort((a, b) => a - b);
  return (
    <div className="space-y-3">
      <p className="text-[15px] text-dim">{t('{n} Würfe', { n: state.dice.length })}</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input className="input" placeholder={t('Kontext suchen (z. B. Kill Teams, Roll-off)')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Würfe durchsuchen')} />
        <select className="select" value={phase} onChange={(e) => setPhase(e.target.value)} aria-label={t('Phase')}>
          <option value="">{t('Alle Phasen')}</option>
          {phases.map((p) => (
            <option key={p} value={p}>
              {p === 0 ? t('Setup/Ende') : t('Phase {n}', { n: p })}
            </option>
          ))}
        </select>
        <select className="select" value={mode} onChange={(e) => setMode(e.target.value)} aria-label={t('Modus')}>
          <option value="">{t('digital + manuell')}</option>
          <option value="DIGITAL">{t('nur digital')}</option>
          <option value="MANUAL">{t('nur manuell')}</option>
        </select>
      </div>
      {list.length ? (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>{t('Zeit')}</th>
                <th>{t('Ph.')}</th>
                <th>{t('Kontext')}</th>
                <th className="text-right">{t('Wurf')}</th>
                <th className="text-right">{t('Mod.')}</th>
                <th className="text-right">{t('Ergebnis')}</th>
                <th>{t('Modus')}</th>
                <th>{t('Öffentl.')}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id}>
                  <td className="whitespace-nowrap font-mono text-[13px] text-dim">{fmtDate(d.at, true, lc)}</td>
                  <td className="font-mono text-[13px]">{d.phaseNumber ?? '–'}</td>
                  <td>{msg(d.context)}</td>
                  <td className="text-right font-mono">{d.kind === 'D33' ? `${t('W33')} (${d.results.join('·')})` : `${d.kind === 'D3' ? t('W3') : t('W6')} ${d.results.join('/')}`}</td>
                  <td className="text-right font-mono">{d.modifier ? (d.modifier > 0 ? `+${d.modifier}` : d.modifier) : ''}</td>
                  <td className="text-right font-mono font-bold text-accent">{d.final}</td>
                  <td className="whitespace-nowrap font-mono text-[13px]">
                    <span className="inline-flex items-center gap-1">
                      {d.mode === 'DIGITAL' ? <DiceIcon size={13} /> : <HandIcon size={13} />}
                      {d.mode === 'DIGITAL' ? t('digital') : t('manuell')}
                    </span>
                  </td>
                  <td className="text-[13px]">{d.public ? t('ja') : t('privat')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>{t('Keine Würfe.')}</Empty>
      )}
    </div>
  );
}
