'use client';

import { skirmishesActive } from '@/engine/skirmish';
import { useT } from '@/i18n/client';
import { useCmd } from '../CommandProvider';
import { SkirmishForm, SkirmishLine } from './SkirmishForm';

/** Freie Gefechte (B5) im Schlachten-Register: Liste, Bestätigen, Löschen und Eintragen durch den Spielleiter */
export function SkirmishPanel() {
  const { state, run, busy } = useCmd();
  const t = useT();
  const list = [...(state.skirmishes ?? [])].sort((a, b) => b.phaseNumber - a.phaseNumber || b.at.localeCompare(a.at));
  const active = skirmishesActive(state);
  if (!active && !list.length) return null;
  const pending = list.filter((s) => s.status === 'PENDING').length;
  return (
    <section className="space-y-2 border-t border-line/60 pt-3" aria-labelledby="skirmish-title">
      <p id="skirmish-title" className="section-title">
        {t('Freie Gefechte')}
        {pending > 0 && <span className="chip ml-2 border-accent text-accent">{t('{n} offen', { n: pending })}</span>}
      </p>
      {!active && <p className="text-[14px] text-dim">{t('Die Hausregel ist ausgeschaltet – bestehende Einträge bleiben erhalten, geben aber keinen Bonus.')}</p>}
      {list.length > 0 && (
        <ul className="space-y-1.5 text-[15px]">
          {list.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 border-l-2 border-line pl-2">
              <span className="min-w-0 flex-1">
                <SkirmishLine state={state} s={s} />
              </span>
              <span className={`chip ${s.status === 'PENDING' ? 'border-warn text-warn' : 'border-ok text-ok'}`}>{s.status === 'PENDING' ? t('wartet auf Bestätigung') : t('bestätigt')}</span>
              {s.status === 'PENDING' && (
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => run({ type: 'SKIRMISH_CONFIRM', id: s.id, playerId: null })}>
                  {t('Bestätigen')}
                </button>
              )}
              <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => run({ type: 'SKIRMISH_DELETE', id: s.id, playerId: null }, { confirm: t('Freies Gefecht löschen?') })}>
                {t('Löschen')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {active && state.stage.kind !== 'SETUP' && (
        <details className="fold">
          <summary>{t('Freies Gefecht eintragen')}</summary>
          <div className="mt-2">
            <SkirmishForm state={state} busy={busy} onSubmit={(input) => run({ type: 'SKIRMISH_REPORT', playerId: null, skirmish: input })} />
          </div>
        </details>
      )}
    </section>
  );
}
