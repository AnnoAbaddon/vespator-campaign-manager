'use client';

import { useState } from 'react';
import type { Battle } from '@/engine/types';
import { draftOverdue, timeClashes } from '@/engine/playerActions';
import { battleTitle } from './common';
import { useCmd } from '../CommandProvider';
import { DraftSummary } from './DraftSummary';
import { useIntlLocale, useT } from '@/i18n/client';
import { TablePick } from '@/components/club/TablePick';

const dt = (iso: string, tz: string, il: string) => new Date(iso).toLocaleString(il, { timeZone: tz, dateStyle: 'short', timeStyle: 'short' });

/** Eingaben der Spieler zu einer Schlacht (N1.2/N1.5): gemeldetes Ergebnis und Termine */
export function PlayerInput({ battle: b }: { battle: Battle }) {
  const { state, run, busy, campaignId } = useCmd();
  const t = useT();
  const il = useIntlLocale();
  const [now] = useState(() => Date.now());
  const [time, setTime] = useState('');
  const tz = state.meta.timezone;
  const name = (id: string | null) => (id ? (state.players.find((p) => p.id === id)?.nickname ?? '?') : t('Warmaster'));
  const d = b.draft;
  const proposals = b.proposals ?? [];
  if (!d && !proposals.length && !b.scheduledAt && b.status !== 'SCHEDULED') return null;
  // Terminkollisionen der Beteiligten (±3 h) für bestätigten Termin und Vorschläge
  const clashes = (time: string) =>
    timeClashes(state, b, time).map((c) => {
      const o = state.battles.find((x) => x.id === c.battleId);
      return t('{name} spielt am {date} bereits {battle}', { name: name(c.playerId), date: dt(c.at, tz, il), battle: o ? battleTitle(o, t) : '?' });
    });
  const scheduledClash = b.scheduledAt && b.status === 'SCHEDULED' ? clashes(b.scheduledAt) : [];
  return (
    <div className="inset space-y-2 p-3 text-[15px]">
      {d && (
        <div className="space-y-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className={`lamp ${d.status === 'DISPUTED' || draftOverdue(b, now) ? 'lamp-alert' : 'lamp-on'}`} aria-hidden />
            <b>{t('Gemeldetes Ergebnis')}</b> {t('von {name} ({date})', { name: name(d.byPlayerId), date: dt(d.at, tz, il) })}
          </p>
          <DraftSummary state={state} battle={b} draft={d} />
          {d.status === 'DISPUTED' && <p className="text-danger">{t('Angefochten von {name}: {reason}', { name: name(d.disputedBy ?? null), reason: d.disputeReason })}</p>}
          {d.status === 'PENDING' && (
            <p className={draftOverdue(b, now) ? 'text-warn' : 'text-dim'}>{draftOverdue(b, now) ? t('Seit über 48 h unbestätigt – bitte entscheiden.') : t('Wartet auf Bestätigung der Gegenseite.')}</p>
          )}
          <div className="flex gap-2">
            <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => run({ type: 'RESULT_DRAFT_CONFIRM', battleId: b.id, playerId: null })}>
              {t('Übernehmen')}
            </button>
            <button className="btn btn-sm" disabled={busy} onClick={() => run({ type: 'RESULT_DRAFT_DISCARD', battleId: b.id })}>
              {t('Verwerfen')}
            </button>
          </div>
        </div>
      )}
      {scheduledClash.length > 0 && <p className="notice">{t('Terminüberschneidung:')} {scheduledClash.join(' · ')}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-dim">{t('Termin:')}</span>
        {b.scheduledAt ? <b>{dt(b.scheduledAt, tz, il)}</b> : <span className="text-faint">{t('offen')}</span>}
        {proposals.flatMap((p) =>
          p.times.map((tm) => (
            <button
              key={`${p.id}-${tm}`}
              className="btn btn-sm"
              disabled={busy}
              title={[t('Vorschlag von {name}', { name: name(p.byPlayerId) }), ...clashes(tm)].join(' · ')}
              onClick={() => run({ type: 'TIME_ACCEPT', battleId: b.id, playerId: null, time: tm })}
            >
              {t('{date} festlegen', { date: dt(tm, tz, il) })}
              {clashes(tm).length > 0 && <span className="text-warn"> ({t('Überschneidung')})</span>}
            </button>
          )),
        )}
        <input className="input w-auto" type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} aria-label={t('Termin vorschlagen')} />
        <button className="btn btn-sm btn-ghost" disabled={busy || !time} onClick={() => run({ type: 'TIME_PROPOSE', battleId: b.id, playerId: null, times: [new Date(time).toISOString()] })}>
          {t('Vorschlagen')}
        </button>
      </div>
      {/* NTH2 2.5: Spieltisch des Clubs zum Termin */}
      {b.scheduledAt && (b.status === 'SCHEDULED' || b.status === 'PLAYED') && <TablePick battle={b} access={{ campaignId }} playerId={null} />}
    </div>
  );
}
