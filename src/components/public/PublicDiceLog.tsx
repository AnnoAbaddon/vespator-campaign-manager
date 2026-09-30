'use client';

import { useState } from 'react';
import type { DiceRoll } from '@/engine/types';
import { DiceIcon, HandIcon } from '@/components/icons';
import { fmtDate } from '@/components/ui';
import { useLocale, useMsg, useT } from '@/i18n/client';

const PAGE = 40;

/**
 * Öffentliches Würfelprotokoll (D3, NTH2 2.4): alle Würfe des Warmasters mit Zeitpunkt, Anlass und Ergebnis.
 * Bekommt nur öffentliche Würfe (Projektion der Leseansicht bzw. Spielersicht) – verdeckte Setup-Würfe fehlen dort.
 */
export function PublicDiceLog({ dice, timeZone, compact = false }: { dice: DiceRoll[]; timeZone?: string; compact?: boolean }) {
  const t = useT();
  const msg = useMsg();
  const lc = useLocale();
  const [phase, setPhase] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const pub = dice.filter((d) => d.public);
  const phases = [...new Set(pub.map((d) => d.phaseNumber ?? 0))].sort((a, b) => a - b);
  const list = [...pub].reverse().filter((d) => !phase || String(d.phaseNumber ?? 0) === phase);
  const die = (d: DiceRoll) => (d.kind === 'D33' ? `${t('W33')} ${d.results.join('·')}` : `${d.kind === 'D3' ? t('W3') : t('W6')} ${d.results.join('/')}`);
  return (
    <section className={compact ? 'space-y-2' : 'hud space-y-3 p-3'} aria-labelledby="dice-log-title">
      <div className="relative z-[1] flex flex-wrap items-center gap-2">
        <h2 id="dice-log-title" className="section-title mb-0 flex-1">
          {t('Würfelprotokoll')}
        </h2>
        {phases.length > 1 && (
          <select className="select w-auto" value={phase} onChange={(e) => setPhase(e.target.value)} aria-label={t('Phase')}>
            <option value="">{t('Alle Phasen')}</option>
            {phases.map((p) => (
              <option key={p} value={p}>
                {p === 0 ? t('Ende') : t('Phase {n}', { n: p })}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="relative z-[1] text-[14px] text-faint">{t('Alle Würfe der Spielleitung mit Anlass – digital gewürfelt oder von Hand eingetragen.')}</p>
      {list.length ? (
        <ol className="relative z-[1] divide-y divide-line/40 text-[15px]">
          {list.slice(0, limit).map((d) => (
            <li key={d.id} className="flex items-start gap-3 py-1.5">
              <span role="img" className="mt-0.5 shrink-0 text-brass" aria-label={d.mode === 'DIGITAL' ? t('digital') : t('von Hand')} title={d.mode === 'DIGITAL' ? t('digital') : t('von Hand')}>
                {d.mode === 'DIGITAL' ? <DiceIcon size={16} /> : <HandIcon size={16} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-ink [overflow-wrap:anywhere]">{msg(d.context)}</span>
                <span className="block font-mono text-[13px] text-faint">
                  {fmtDate(d.at, true, lc, timeZone)}
                  {d.phaseNumber ? ` · ${t('Phase {n}', { n: d.phaseNumber })}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-right font-mono text-[14px] text-dim">
                {die(d)}
                {d.modifier ? ` ${d.modifier > 0 ? '+' : '−'}${Math.abs(d.modifier)}` : ''}
                <b className="ml-2 inline-block min-w-6 text-[16px] text-accent">{d.final}</b>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="relative z-[1] text-[15px] text-faint">{t('Noch keine Würfe.')}</p>
      )}
      {list.length > limit && (
        <button type="button" className="btn btn-sm relative z-[1]" onClick={() => setLimit((l) => l + PAGE)}>
          {t('Weitere {n} Würfe', { n: Math.min(PAGE, list.length - limit) })}
        </button>
      )}
    </section>
  );
}
