'use client';

import { mayConfirmSkirmish, skirmishesActive } from '@/engine/skirmish';
import type { Player } from '@/engine/types';
import { SkirmishForm, SkirmishLine } from '@/components/admin/battles/SkirmishForm';
import { useCmd } from '@/components/admin/CommandProvider';
import { useT } from '@/i18n/client';

/**
 * Freie Gefechte (B5) auf dem Spielerlink: offene Meldungen bestätigen oder ablehnen, eigene Meldungen
 * zurückziehen und ein neues Gefecht melden. Nur sichtbar, wenn die Hausregel aktiv ist.
 */
export function SkirmishPlayer({ me, allianceId }: { me: Player; allianceId: string | null }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  if (!skirmishesActive(state) || !allianceId || state.stage.kind === 'SETUP') return null;
  const list = state.skirmishes ?? [];
  const toConfirm = list.filter((s) => mayConfirmSkirmish(state, s, me.id));
  const mine = list.filter((s) => s.status === 'PENDING' && s.byPlayerId === me.id);
  const reward = state.toggles.freeSkirmishes?.reward === 'POINTS';
  return (
    <section className="hud space-y-3 p-3 text-[15px]" aria-labelledby="free-skirmish">
      <p id="free-skirmish" className="section-title">
        {t('Freie Gefechte')}
      </p>
      <p className="text-[14px] text-dim">
        {reward
          ? t('Spiele außerhalb der Befehle zählen nach Bestätigung durch den Gegner – jeder Sieg bringt deiner Allianz einen kleinen, gedeckelten Punktebonus.')
          : t('Spiele außerhalb der Befehle zählen nach Bestätigung durch den Gegner für Statistik und Chronik.')}
      </p>
      {toConfirm.length > 0 && (
        <ul className="space-y-2">
          {toConfirm.map((s) => (
            <li key={s.id} className="space-y-1 border-l-2 border-accent pl-2">
              <SkirmishLine state={state} s={s} />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => run({ type: 'SKIRMISH_CONFIRM', id: s.id, playerId: me.id })}>
                  {t('Bestätigen')}
                </button>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => run({ type: 'SKIRMISH_DELETE', id: s.id, playerId: me.id })}>
                  {t('Ablehnen')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {mine.length > 0 && (
        <ul className="space-y-2">
          {mine.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 border-l-2 border-line pl-2">
              <span className="min-w-0 flex-1">
                <SkirmishLine state={state} s={s} />
                <span className="block text-[14px] text-faint">{t('Wartet auf Bestätigung der Gegenseite.')}</span>
              </span>
              <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => run({ type: 'SKIRMISH_DELETE', id: s.id, playerId: me.id })}>
                {t('Zurückziehen')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <details className="fold">
        <summary>{t('Freies Gefecht melden')}</summary>
        <div className="mt-2">
          <SkirmishForm state={state} me={me.id} allianceId={allianceId} busy={busy} onSubmit={(input) => run({ type: 'SKIRMISH_REPORT', playerId: me.id, skirmish: input })} />
        </div>
      </details>
    </section>
  );
}
