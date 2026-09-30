'use client';

import { useState } from 'react';
import type { Battle, CampaignState } from '@/engine/types';
import { effectiveVictor } from '@/engine/outcomes';
import { draftOverdue, loadLimit, overloadedPlayers, timeClashes } from '@/engine/playerActions';
import { useIntlLocale, useMsg, useT } from '@/i18n/client';
import type { T } from '@/i18n/core';
import { useCmd } from '../CommandProvider';
import { battleTitle } from './common';
import { reminderTarget, type ReminderReason } from '@/engine/reminders';
import { remindAction } from '@/app/actions/gmTools';
import { NoteIcon } from '@/components/icons';
import { useNow } from '@/components/public/useNow';

const REMIND_TITLE: Record<ReminderReason, string> = {
  CONFIRM: 'Gegenseite an die Bestätigung erinnern',
  DECISION: 'Siegerseite an die Outcome-Entscheidung erinnern',
  SCHEDULE: 'An die Terminabsprache erinnern',
  CLASH: 'An die Terminüberschneidung erinnern',
  DEFENDER: 'Verteidigende Allianz an die Aufstellung erinnern',
  ATTACKER: 'Angreifende Allianz an die Aufstellung erinnern',
};

/** „Erinnern“ (NTH2 2.7): gezielte Benachrichtigung an die Spieler, bei denen die Aufgabe liegt */
function RemindButton({ battle: b }: { battle: Battle }) {
  const { state, campaignId, toast } = useCmd();
  const t = useT();
  const msg = useMsg();
  const [pending, setPending] = useState(false);
  const target = reminderTarget(state, b);
  if (!target) return null;
  const names = target.playerIds.map((id) => state.players.find((p) => p.id === id)?.nickname ?? '?').join(', ');
  const title = `${t(REMIND_TITLE[target.reason])}: ${names}`;
  return (
    <button
      type="button"
      className="btn btn-sm shrink-0"
      disabled={pending}
      title={title}
      aria-label={title}
      onClick={async () => {
        setPending(true);
        try {
          const r = await remindAction(campaignId, b.id);
          if (r.ok) toast('ok', r.discord && !r.mails && !r.push ? t('Erinnerung im Discord-Kanal: {names}', { names }) : t('Erinnerung verschickt: {names}', { names }));
          else toast('error', msg(r.error));
        } catch {
          toast('error', t('Server nicht erreichbar – Aktion nicht ausgeführt'));
        } finally {
          setPending(false);
        }
      }}
    >
      <NoteIcon size={15} /> {t('Erinnern')}
    </button>
  );
}

type Flag = { key: string; label: string; cls: string };

/** Was an einer Schlacht noch zu tun ist (für die Sammelübersicht des Warmasters) */
export function battleFlags(state: CampaignState, b: Battle, now: number, t: T): Flag[] {
  const out: Flag[] = [];
  const open = b.status === 'SCHEDULED' || b.status === 'PLAYED';
  if (!open) return out;
  if (b.draft?.status === 'DISPUTED') out.push({ key: 'disputed', label: t('angefochten'), cls: 'border-danger text-danger' });
  else if (b.draft && draftOverdue(b, now)) out.push({ key: 'overdue', label: t('Meldung > 48 h offen'), cls: 'border-danger text-danger' });
  else if (b.draft) out.push({ key: 'draft', label: t('Meldung wartet auf Bestätigung'), cls: 'border-accent text-accent' });
  if (b.status === 'SCHEDULED' && !b.draft) {
    if (!b.scheduledAt) out.push({ key: 'time', label: (b.proposals ?? []).length ? t('Terminvorschlag offen') : t('kein Termin'), cls: 'border-warn text-warn' });
    else if (timeClashes(state, b, b.scheduledAt).length) out.push({ key: 'clash', label: t('Terminüberschneidung'), cls: 'border-warn text-warn' });
  }
  if (!b.defenders.length) out.push({ key: 'def', label: t('kein Verteidiger'), cls: 'border-warn text-warn' });
  if (!b.attackers.length) out.push({ key: 'att', label: t('kein Angreifer'), cls: 'border-warn text-warn' });
  const v = effectiveVictor(b);
  if (b.kind === 'CAMPAIGN' && v && v !== 'DRAW' && b.operationIds.some((o) => !b.decisions[o])) out.push({ key: 'decision', label: t('Outcome-Entscheidung fehlt'), cls: 'border-warn text-warn' });
  return out;
}

/**
 * Sammelübersicht einer Phase (Wunsch Playtest B): je Schlacht Termin, Meldung, Outcome-Entscheidung und
 * Probleme in einer Zeile; ein Klick springt zur Schlacht in der Liste. Filter „braucht Aufmerksamkeit“.
 */
export function BattleOverview({ battles, onJump }: { battles: Battle[]; onJump: (id: string) => void }) {
  const { state, readOnly } = useCmd();
  const t = useT();
  const il = useIntlLocale();
  // Uhrzeit erst im Browser: Server und erster Client-Render rechnen ohne zeitabhängige Hinweise (gleiches Markup)
  const now = useNow() ?? 0;
  // NTH2 2.7: in einer Sandbox wird niemand benachrichtigt
  const sandbox = !!state.meta.sandbox;
  const [onlyOpen, setOnlyOpen] = useState(true);
  if (!battles.length) return null;
  const rows = battles.map((b) => ({ b, flags: battleFlags(state, b, now, t) }));
  const need = rows.filter((r) => r.flags.length);
  const count = (k: string) => rows.filter((r) => r.flags.some((f) => f.key === k)).length;
  const summary = [
    [count('draft') + count('overdue'), t('{n} Meldung(en) offen')],
    [count('disputed'), t('{n} angefochten')],
    [count('time'), t('{n} ohne Termin')],
    [count('clash'), t('{n} Terminüberschneidung(en)')],
    [count('def'), t('{n} ohne Verteidiger')],
    [count('decision'), t('{n} ohne Outcome-Entscheidung')],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, s]) => (s as string).replace('{n}', String(n)));
  const shown = onlyOpen ? need : rows;
  // Spiellast über der Schwelle der Hausregel (N1.6)
  const limit = loadLimit(state);
  const over = overloadedPlayers(state, battles[0].phaseNumber);
  return (
    <div className="inset mb-3 space-y-2 p-2.5 text-[15px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="hud-title">{t('Übersicht')}</span>
        <span className={need.length ? 'text-warn' : 'text-ok'}>{need.length ? summary.join(' · ') : t('Alles erledigt – nichts offen.')}</span>
        <label className="ml-auto flex items-center gap-1.5 text-[14px] text-dim">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> {t('nur mit Handlungsbedarf')}
        </label>
      </div>
      {over.length > 0 && (
        <p className="text-warn">{t('Spiellast über {max}: {list}', { max: limit ?? '', list: over.map((o) => `${state.players.find((p) => p.id === o.playerId)?.nickname ?? '?'} (${o.count})`).join(', ') })}</p>
      )}
      {shown.length > 0 && (
        <ul className="divide-y divide-line/40">
          {shown.map(({ b, flags }) => (
            <li key={b.id} className="flex items-center gap-2">
              <button type="button" className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-left hover:bg-white/[0.03]" onClick={() => onJump(b.id)}>
                <span className="min-w-0 flex-1 basis-[10rem] truncate font-semibold text-ink" title={battleTitle(b, t)}>
                  {battleTitle(b, t)}
                </span>
                <span className="whitespace-nowrap font-mono text-[13px] text-dim">
                  {b.scheduledAt ? new Date(b.scheduledAt).toLocaleString(il, { timeZone: state.meta.timezone, dateStyle: 'short', timeStyle: 'short' }) : '–'}
                </span>
                {flags.length ? (
                  flags.map((f) => (
                    <span key={f.key} className={`chip ${f.cls}`}>
                      {f.label}
                    </span>
                  ))
                ) : (
                  <span className="chip border-ok text-ok">{t('in Ordnung')}</span>
                )}
              </button>
              {!sandbox && !readOnly && <RemindButton battle={b} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
