'use client';

import { useState, useTransition } from 'react';
import type { Battle, CampaignState } from '@/engine/types';
import { DraftSummary } from '@/components/admin/battles/DraftSummary';
import { battleTitle } from '@/components/admin/battles/common';
import { confirmLinkAction } from '@/app/actions/confirmLink';
import { useIntlLocale, useMsg, useT } from '@/i18n/client';
import { CheckIcon } from '@/components/icons';
import { mapOf } from '@/engine/map';

/** Entwurf mit „Bestätigen“ / „Widersprechen“ (NTH2 1.5); nach der Aktion nur noch die Rückmeldung */
export function ConfirmLinkView({ segments, state, battle: b, playerName, archived }: { segments: string[]; state: CampaignState; battle: Battle; playerName: string; archived: boolean }) {
  const t = useT();
  const msg = useMsg();
  const il = useIntlLocale();
  const [reason, setReason] = useState('');
  const [done, setDone] = useState<'CONFIRM' | 'DISPUTE' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Planetennamen eigener Karten registrieren
  mapOf(state);
  const draft = b.draft!;
  const by = state.players.find((p) => p.id === draft.byPlayerId)?.nickname ?? '?';
  const go = (action: 'CONFIRM' | 'DISPUTE') =>
    start(async () => {
      setError(null);
      try {
        const r = await confirmLinkAction(segments, action, reason);
        if (r.ok) setDone(action);
        else setError(msg(r.error));
      } catch {
        setError(t('Server nicht erreichbar – Aktion nicht ausgeführt'));
      }
    });
  return (
    <div className="space-y-3 text-[15px]">
      <p className="font-display text-[17px] font-bold uppercase leading-tight text-ink">{battleTitle(b, t)}</p>
      <p className="text-dim">
        {state.meta.name} · {t('Hallo {name},', { name: playerName })}{' '}
        {t('{by} hat am {date} dieses Ergebnis gemeldet:', { by, date: new Date(draft.at).toLocaleString(il, { timeZone: state.meta.timezone, dateStyle: 'short', timeStyle: 'short' }) })}
      </p>
      <div className="inset p-3">
        <DraftSummary state={state} battle={b} draft={draft} />
      </div>
      {done ? (
        <p role="status" className="flex items-center gap-2 text-ok">
          <CheckIcon size={18} />
          {done === 'CONFIRM' ? t('Bestätigt – das Ergebnis ist übernommen. Danke!') : t('Widerspruch gesendet – der Warmaster entscheidet.')}
        </p>
      ) : archived ? (
        <p className="text-warn">{t('Die Kampagne ist archiviert')}</p>
      ) : (
        <div className="space-y-2">
          <p className="text-[14px] text-faint">{t('Mit „Bestätigen“ übernimmst du das Ergebnis vollständig (inklusive Outcome-Entscheidungen). Dieser Link gilt nur einmal.')}</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <button type="button" className="btn btn-primary min-h-11" disabled={pending} onClick={() => go('CONFIRM')}>
              {t('Bestätigen')}
            </button>
            <input className="input min-h-11 sm:w-72" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('Grund für Widerspruch')} aria-label={t('Grund für Widerspruch')} maxLength={1000} />
            <button type="button" className="btn min-h-11" disabled={pending || !reason.trim()} onClick={() => go('DISPUTE')}>
              {t('Widersprechen')}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
