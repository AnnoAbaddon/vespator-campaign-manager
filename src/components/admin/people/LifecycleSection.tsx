'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { absencePhases, pulseSummary, PULSE_TIME_LABEL, type PulseTime } from '@/engine/lifecycle';
import { allianceOf, stagePhase } from '@/engine/players';
import { playerLinkAction } from '@/app/actions/player';
import { AllianceTag, Empty, Field, Panel } from '@/components/ui';
import { GameIcon } from '@/components/icons/GameIcon';
import { useMsg, useT } from '@/i18n/client';
import { useCmd } from '../CommandProvider';

/**
 * Abwesenheit & Wechsel (R2): Abwesenheit je Spieler und Phase (A5), Flotte übergeben und Nachzügler
 * aufnehmen (B2), Übersicht des Phasen-Pulses (B4).
 */
export function LifecycleSection() {
  return (
    <div className="@container">
      <div className="grid items-start gap-3 @4xl:grid-cols-2">
        <AbsencePanel />
        <HandoverPanel />
        <JoinPanel />
        <PulsePanel />
      </div>
    </div>
  );
}

function AbsencePanel() {
  const { state, run, busy } = useCmd();
  const t = useT();
  const phases = absencePhases(state);
  const players = state.players.filter((p) => p.active);
  return (
    <Panel title={t('Abwesenheit')} icon={<GameIcon name="em_moon" size={18} />}>
      <p className="mb-2 text-[14px] text-dim">
        {t('Abwesende werden nicht als Verteidiger vorgeschlagen; ihre Flotten erhalten ohne eigenen Befehl Logistical Auxilia. Spieler melden sich auch selbst über ihren Link ab.')}
      </p>
      {!phases.length || !players.length ? (
        <Empty>{t('Keine offene Phase.')}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>{t('Spieler')}</th>
                {phases.map((n) => (
                  <th key={n} className="text-center">
                    {t('Ph. {n}', { n })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap">{p.nickname}</td>
                  {phases.map((n) => {
                    const on = (p.absences ?? []).includes(n);
                    return (
                      <td key={n} className="text-center">
                        <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[#dda94d]"
                            checked={on}
                            disabled={busy}
                            aria-label={t('{name} abwesend in Phase {n}', { name: p.nickname, n })}
                            onChange={(e) => run({ type: 'ABSENCE_SET', playerId: p.id, phases: [n], absent: e.target.checked })}
                          />
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function HandoverPanel() {
  const { state, run, busy, campaignId, toast } = useCmd();
  const t = useT();
  const msg = useMsg();
  const router = useRouter();
  const cur = stagePhase(state);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [nick, setNick] = useState('');
  const [faction, setFaction] = useState('');
  const [retire, setRetire] = useState(true);
  const [revoke, setRevoke] = useState(true);
  const ended = state.stage.kind === 'ENDED' || state.stage.kind === 'TIEBREAK';
  const candidates = state.players.filter((p) => p.active && allianceOf(p, cur));
  const fromP = state.players.find((p) => p.id === from);
  const al = fromP ? allianceOf(fromP, cur) : null;
  const mates = state.players.filter((p) => p.active && p.id !== from && (allianceOf(p, cur) === al || !allianceOf(p, cur)));
  const fleets = state.fleets.filter((f) => Object.entries(f.commanders).some(([k, v]) => v === from && Number(k) >= cur));
  const isNew = to === '__new';
  const submit = async () => {
    const ok = await run({ type: 'PLAYER_HANDOVER', input: { fromPlayerId: from, toPlayerId: isNew ? null : to, newPlayer: isNew ? { nickname: nick, faction } : undefined, retire } });
    if (!ok) return;
    if (retire && revoke) {
      const r = await playerLinkAction(campaignId, from, 'revoke');
      if (!r.ok) toast('error', msg(r.error));
      router.refresh();
    }
    setFrom('');
    setTo('');
    setNick('');
    setFaction('');
  };
  return (
    <Panel title={t('Flotte übergeben')} icon={<GameIcon name="ui_FLEET" size={18} />}>
      <p className="mb-2 text-[14px] text-dim">
        {t('Kommandos ab der laufenden Phase, offene Schlachten und die Anführerrolle gehen an einen Allianzkollegen oder einen neuen Spieler. Gespielte Schlachten und Ehrungen bleiben in der Historie.')}
      </p>
      {ended ? (
        <Empty>{t('Die Kampagne ist beendet.')}</Empty>
      ) : (
        <div className="space-y-2">
          <div className="grid gap-2 @md:grid-cols-2">
            <Field label={t('Abgebender Spieler')}>
              <select
                className="select"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setTo('');
                }}
              >
                <option value="">{t('– wählen –')}</option>
                {candidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nickname}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('Übernimmt')}>
              <select className="select" value={to} disabled={!from} onChange={(e) => setTo(e.target.value)}>
                <option value="">{t('– wählen –')}</option>
                {mates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nickname}
                    {allianceOf(p, cur) ? '' : ` (${t('ohne Allianz')})`}
                  </option>
                ))}
                <option value="__new">{t('Neuer Spieler …')}</option>
              </select>
            </Field>
          </div>
          {fromP && (
            <p className="text-[14px] text-dim">
              <AllianceTag alliance={state.alliances.find((a) => a.id === al)} /> · {fleets.length ? t('Flotten: {list}', { list: fleets.map((f) => f.name).join(', ') }) : t('führt keine Flotte')}
            </p>
          )}
          {isNew && (
            <div className="grid gap-2 @md:grid-cols-2">
              <Field label={t('Nickname')}>
                <input className="input" value={nick} onChange={(e) => setNick(e.target.value)} />
              </Field>
              <Field label={t('Armee')}>
                <input className="input" list="faction-list" value={faction} onChange={(e) => setFaction(e.target.value)} />
              </Field>
            </div>
          )}
          <label className="flex min-h-8 items-start gap-2.5 text-[15px]">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#dda94d]" checked={retire} onChange={(e) => setRetire(e.target.checked)} />
            <span>{t('Abgebender scheidet aus (deaktivieren, Allianz verlassen)')}</span>
          </label>
          {retire && (
            <label className="flex min-h-8 items-start gap-2.5 pl-7 text-[15px]">
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#dda94d]" checked={revoke} onChange={(e) => setRevoke(e.target.checked)} />
              <span>{t('Alten Spielerlink sperren')}</span>
            </label>
          )}
          <button className="btn btn-primary" disabled={busy || !from || !to || (isNew && !nick.trim())} onClick={submit}>
            {t('Übergeben')}
          </button>
          {isNew && <p className="text-[13px] text-faint">{t('Den Link des neuen Spielers findest du danach unter Spieler · Bearbeiten.')}</p>}
        </div>
      )}
    </Panel>
  );
}

function JoinPanel() {
  const { state, run, busy } = useCmd();
  const t = useT();
  const first = state.stage.kind === 'PHASE' ? state.stage.phase : 1;
  const [nick, setNick] = useState('');
  const [faction, setFaction] = useState('');
  const [al, setAl] = useState(state.alliances[0]?.id ?? '');
  const [from, setFrom] = useState(first);
  const ended = state.stage.kind === 'ENDED' || state.stage.kind === 'TIEBREAK';
  const phases = Array.from({ length: Math.max(0, state.meta.phaseCount - first + 1) }, (_, i) => first + i);
  return (
    <Panel title={t('Nachzügler aufnehmen')} icon={<GameIcon name="fa_marines" size={18} />}>
      {ended || state.stage.kind === 'SETUP' ? (
        <Empty>{state.stage.kind === 'SETUP' ? t('Im Setup einfach unter Spieler anlegen.') : t('Die Kampagne ist beendet.')}</Empty>
      ) : (
        <div className="space-y-2">
          <div className="grid gap-2 @md:grid-cols-2">
            <Field label={t('Nickname')}>
              <input className="input" value={nick} onChange={(e) => setNick(e.target.value)} />
            </Field>
            <Field label={t('Armee')}>
              <input className="input" list="faction-list" value={faction} onChange={(e) => setFaction(e.target.value)} />
            </Field>
            <Field label={t('Allianz')}>
              <select className="select" value={al} onChange={(e) => setAl(e.target.value)}>
                {state.alliances.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('Ab Phase')}>
              <select className="select" value={from} onChange={(e) => setFrom(Number(e.target.value))}>
                {phases.map((n) => (
                  <option key={n} value={n}>
                    {t('Phase {n}', { n })}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <button
            className="btn btn-primary"
            disabled={busy || !nick.trim() || !al}
            onClick={async () => {
              if (await run({ type: 'PLAYER_JOIN', nickname: nick, faction, allianceId: al, fromPhase: from })) {
                setNick('');
                setFaction('');
              }
            }}
          >
            {t('Aufnehmen')}
          </button>
          <p className="text-[13px] text-faint">
            {state.toggles.narrative?.lateJoinBonus ? t('Hausregel aktiv: Der Kommandant erhält die Ehrung „Späte Verstärkung“.') : t('Freie Flotten der laufenden Phase übernimmt der Nachzügler sofort.')}
          </p>
        </div>
      )}
    </Panel>
  );
}

const TIMES: PulseTime[] = ['MUCH', 'LITTLE', 'NONE'];

function PulsePanel() {
  const { state } = useCmd();
  const t = useT();
  const done = state.phases.filter((p) => (p.pulse ?? []).length).map((p) => p.number);
  const [sel, setSel] = useState<number | null>(null);
  const phase = sel ?? done.at(-1) ?? null;
  const enabled = state.toggles.narrative?.pulse === true;
  const sum = phase ? pulseSummary(state, phase) : null;
  const nick = (id: string) => state.players.find((p) => p.id === id)?.nickname ?? '?';
  return (
    <Panel title={t('Phasen-Puls')} icon={<GameIcon name="ui_SCROLL" size={18} />}>
      {!enabled && !done.length ? (
        <Empty>{t('Aus – einschalten unter Einstellungen · Regeln · Spielerbetreuung und Erzählung.')}</Empty>
      ) : (
        <div className="space-y-3 text-[15px]">
          {done.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Phase')}</th>
                  <th className="text-right">{t('Antworten')}</th>
                  <th className="text-right">{t('Spaß')}</th>
                  {TIMES.map((k) => (
                    <th key={k} className="text-right">
                      {t(PULSE_TIME_LABEL[k])}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {done.map((n) => {
                  const s = pulseSummary(state, n);
                  return (
                    <tr key={n} data-active={n === phase ? 'true' : undefined}>
                      <td>
                        <button type="button" className="link" onClick={() => setSel(n)}>
                          {t('Phase {n}', { n })}
                        </button>
                      </td>
                      <td className="text-right font-mono">{s.count}</td>
                      <td className="text-right font-mono">{s.fun ?? '–'}</td>
                      {TIMES.map((k) => (
                        <td key={k} className={`text-right font-mono ${k === 'NONE' && s.time[k] ? 'text-warn' : ''}`}>
                          {s.time[k]}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {sum && (
            <div className="space-y-1">
              <p className="section-title">{t('Kommentare Phase {n}', { n: sum.phase })}</p>
              {sum.comments.length ? (
                <ul className="space-y-1">
                  {sum.comments.map((c, i) => (
                    <li key={i} className="border-l-2 border-line pl-2">
                      <span className="whitespace-pre-wrap">{c.text}</span>
                      <span className="block text-[13px] text-faint">
                        {c.by ?? t('anonym')} · {t('Spaß {n}/5', { n: c.fun })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-faint">{t('Keine Kommentare.')}</p>
              )}
              {sum.missing.length > 0 && <p className="text-[14px] text-dim">{t('Noch ohne Antwort: {list}', { list: sum.missing.map(nick).join(', ') })}</p>}
            </div>
          )}
          {!done.length && <p className="text-faint">{t('Noch keine Antworten. Die Spieler werden ab Schritt 3 jeder Phase gefragt.')}</p>}
        </div>
      )}
    </Panel>
  );
}
