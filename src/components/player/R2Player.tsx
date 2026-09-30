'use client';

import { useState } from 'react';
import type { CampaignState, Player } from '@/engine/types';
import { absencePhases, isAbsent, pulsePhase, PULSE_TIME_LABEL, type PulseTime } from '@/engine/lifecycle';
import { openGoal } from '@/engine/narrative';
import { grandEnabled } from '@/engine/finale';
import { allianceOf, stagePhase } from '@/engine/players';
import { useCmd } from '@/components/admin/CommandProvider';
import { GrandBattleView, ObjectivesList, RivalryView } from '@/components/public/R2Public';
import { useLocale, useT } from '@/i18n/client';

/**
 * Spielerseite, Block R2: Abwesenheit (A5), Phasen-Puls (B4), Sonderziele (C3), persönliche Ziele (C4),
 * Nemesis und Rivalitäten (C5), Großschlacht (C6).
 */

/** Aufgaben-Karten für den Reiter „Aufgaben“ (leere Liste, wenn nichts ansteht) */
export function r2TaskItems(state: CampaignState, me: Player, allianceId: string | null): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const phase = state.stage.kind === 'PHASE' ? state.stage.phase : null;
  if (phase && isAbsent(state, me.id, phase)) out.push(<AbsenceNotice key="r2-absent" me={me} phase={phase} />);
  const pp = pulsePhase(state);
  if (pp && !state.phases.find((p) => p.number === pp)?.pulse?.some((e) => e.playerId === me.id)) out.push(<PulseCard key="r2-pulse" me={me} phase={pp} />);
  if (phase && (state.objectives ?? []).some((o) => o.phaseNumber === phase)) out.push(<ObjectivesCard key="r2-obj" phase={phase} />);
  const goal = openGoal(me);
  if (goal || (state.toggles.narrative?.secretGoals && (state.goalList ?? []).length && state.stage.kind !== 'ENDED' && !(me.goals ?? []).length)) out.push(<GoalCard key="r2-goal" me={me} />);
  const last = phase === state.meta.phaseCount;
  if (grandEnabled(state) && allianceId && (last || state.grandBattle) && state.stage.kind === 'PHASE') out.push(<GrandCard key="r2-grand" me={me} allianceId={allianceId} />);
  return out;
}

function AbsenceNotice({ me, phase }: { me: Player; phase: number }) {
  const { run, busy } = useCmd();
  const t = useT();
  return (
    <section className="hud flex flex-wrap items-center gap-3 p-4 text-[15px]">
      <span className="lamp lamp-on shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">{t('Du bist für Phase {n} abgemeldet. Deine Flotten erhalten ohne eigenen Befehl Logistical Auxilia; du wirst nicht als Verteidiger vorgeschlagen.', { n: phase })}</p>
      <button className="btn btn-sm" disabled={busy} onClick={() => run({ type: 'ABSENCE_SET', playerId: me.id, phases: [phase], absent: false })}>
        {t('Doch dabei')}
      </button>
    </section>
  );
}

const TIMES: PulseTime[] = ['MUCH', 'LITTLE', 'NONE'];

function PulseCard({ me, phase }: { me: Player; phase: number }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const [fun, setFun] = useState(0);
  const [time, setTime] = useState<PulseTime | null>(null);
  const [comment, setComment] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [absentNext, setAbsentNext] = useState(true);
  const next = phase + 1;
  const canAbsent = next <= state.meta.phaseCount && absencePhases(state).includes(next) && !isAbsent(state, me.id, next);
  return (
    <section className="hud space-y-2 p-3 text-[15px]" aria-label={t('Phasen-Puls')}>
      <p className="section-title">{t('Phasen-Puls · Phase {n}', { n: phase })}</p>
      <fieldset>
        <legend className="label">{t('Wie viel Spaß hat dir die Phase gemacht?')}</legend>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('Spaß 1 bis 5')}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={fun === n} className={`btn min-h-11 min-w-11 ${fun === n ? 'btn-primary' : ''}`} onClick={() => setFun(n)}>
              {n}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">{t('Zeit in der nächsten Phase')}</legend>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('Zeit in der nächsten Phase')}>
          {TIMES.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={time === k} className={`btn min-h-11 ${time === k ? 'btn-primary' : ''}`} onClick={() => setTime(k)}>
              {t(PULSE_TIME_LABEL[k])}
            </button>
          ))}
        </div>
      </fieldset>
      <textarea className="textarea" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('Kommentar (optional)')} aria-label={t('Kommentar')} />
      <label className="flex min-h-8 items-start gap-2.5">
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#dda94d]" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
        <span>
          {t('Anonym')}
          <span className="block text-[13px] text-dim">{t('Dein Name steht nicht in der Auswertung des Warmasters.')}</span>
        </span>
      </label>
      {time === 'NONE' && canAbsent && (
        <label className="flex min-h-8 items-start gap-2.5">
          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#dda94d]" checked={absentNext} onChange={(e) => setAbsentNext(e.target.checked)} />
          <span>{t('Für Phase {n} abwesend melden', { n: next })}</span>
        </label>
      )}
      <button
        className="btn btn-primary"
        disabled={busy || !fun || !time}
        onClick={() => time && run({ type: 'PULSE_SUBMIT', playerId: me.id, phase, fun, time, comment, anonymous, absentNext: time === 'NONE' && canAbsent && absentNext })}
      >
        {t('Absenden')}
      </button>
    </section>
  );
}

function ObjectivesCard({ phase }: { phase: number }) {
  const { state } = useCmd();
  const t = useT();
  const locale = useLocale();
  return (
    <section className="hud space-y-2 p-3">
      <p className="section-title">{t('Sonderziele der Phase')}</p>
      <ObjectivesList state={state} phase={phase} locale={locale} />
    </section>
  );
}

const GOAL_STATUS: Record<string, string> = { OPEN: 'offen', CLAIMED: 'als erfüllt gemeldet – der Warmaster prüft', MET: 'erfüllt', FAILED: 'nicht erfüllt' };

function GoalCard({ me }: { me: Player }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const goal = openGoal(me);
  const [pick, setPick] = useState('');
  const [note, setNote] = useState('');
  const list = state.goalList ?? [];
  return (
    <section className="hud space-y-2 p-3 text-[15px]">
      <p className="section-title">{t('Geheimes Ziel')}</p>
      {goal ? (
        <>
          <p>
            <b className="text-ink">{goal.title}</b> <span className="text-[14px] text-dim">· {t(GOAL_STATUS[goal.status])}</span>
          </p>
          {goal.text && <p className="whitespace-pre-wrap text-[14px] text-dim">{goal.text}</p>}
          {goal.status === 'OPEN' && (
            <div className="flex flex-wrap gap-2">
              <input className="input min-w-40 flex-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Wann und wie? (für den Warmaster)')} aria-label={t('Notiz zur Erfüllung')} />
              <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => run({ type: 'GOAL_CLAIM', playerId: me.id, id: goal.id, note })}>
                {t('Als erfüllt melden')}
              </button>
            </div>
          )}
          <p className="text-[13px] text-faint">{t('Nur du und der Warmaster sehen dieses Ziel. Es wird am Kampagnenende aufgedeckt.')}</p>
        </>
      ) : (
        <>
          <p className="text-dim">{t('Wähle ein geheimes Ziel für deinen Kommandanten. Bei Erfüllung gibt es eine Ehrung.')}</p>
          <div className="flex flex-wrap gap-2">
            <select className="select min-w-40 flex-1" value={pick} onChange={(e) => setPick(e.target.value)} aria-label={t('Ziel wählen')}>
              <option value="">{t('– Ziel wählen –')}</option>
              {list.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
            <button className="btn btn-sm btn-primary" disabled={busy || !pick} onClick={() => run({ type: 'GOAL_CHOOSE', playerId: me.id, goalId: pick })}>
              {t('Übernehmen')}
            </button>
          </div>
          {pick && list.find((g) => g.id === pick)?.text && <p className="text-[14px] text-dim">{list.find((g) => g.id === pick)!.text}</p>}
        </>
      )}
    </section>
  );
}

function GrandCard({ me, allianceId }: { me: Player; allianceId: string }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const locale = useLocale();
  const g = state.grandBattle;
  const joined = !!g?.participants[allianceId]?.includes(me.id);
  return (
    <section className="hud space-y-2 p-3">
      <p className="section-title">{t('Finale „Großschlacht“')}</p>
      {g ? <GrandBattleView state={state} locale={locale} /> : <p className="text-[15px] text-dim">{t('Der Warmaster plant die Großschlacht aller Allianzen.')}</p>}
      {!g?.done && (
        <button className="btn btn-sm" disabled={busy} onClick={() => run({ type: 'GRAND_JOIN', playerId: me.id, join: !joined })}>
          {joined ? t('Nicht mehr teilnehmen') : t('Ich kämpfe mit')}
        </button>
      )}
    </section>
  );
}

/** Abschnitte im Profil: Abwesenheit, Nemesis und Rivalitäten, persönliche Ziele */
export function R2ProfileSections({ me }: { me: Player }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const locale = useLocale();
  const phases = absencePhases(state);
  const now = stagePhase(state);
  const mine = allianceOf(me, now);
  const foes = state.players.filter((p) => p.id !== me.id && p.active && allianceOf(p, now) && allianceOf(p, now) !== mine);
  const goals = me.goals ?? [];
  return (
    <>
      {phases.length > 0 && (
        <section className="hud space-y-2 p-3 text-[15px]">
          <p className="section-title">{t('Abwesenheit')}</p>
          <p className="text-[14px] text-dim">{t('Phasen, in denen du nicht spielen kannst: Deine Flotten erhalten Logistical Auxilia, und du wirst nicht als Verteidiger vorgeschlagen.')}</p>
          <div className="flex flex-wrap gap-1.5">
            {phases.map((n) => {
              const on = isAbsent(state, me.id, n);
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={on}
                  className={`btn min-h-11 ${on ? 'btn-primary' : ''}`}
                  disabled={busy}
                  onClick={() => run({ type: 'ABSENCE_SET', playerId: me.id, phases: [n], absent: !on })}
                >
                  {t('Phase {n}', { n })}
                  {on ? ` · ${t('abwesend')}` : ''}
                </button>
              );
            })}
          </div>
        </section>
      )}
      <section className="hud space-y-2 p-3 text-[15px]">
        <p className="section-title">{t('Rivalitäten')}</p>
        {state.toggles.narrative?.nemesis && (
          <label className="flex flex-wrap items-center gap-2">
            {t('Deine Nemesis')}
            <select className="select w-auto min-w-40" value={me.nemesisId ?? ''} disabled={busy} onChange={(e) => run({ type: 'NEMESIS_SET', playerId: me.id, nemesisId: e.target.value || null })}>
              <option value="">{t('– keine –')}</option>
              {foes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nickname}
                </option>
              ))}
              {me.nemesisId && !foes.some((p) => p.id === me.nemesisId) && <option value={me.nemesisId}>{state.players.find((p) => p.id === me.nemesisId)?.nickname ?? '?'}</option>}
            </select>
          </label>
        )}
        <RivalryView state={state} playerId={me.id} locale={locale} />
      </section>
      {(openGoal(me) || (state.toggles.narrative?.secretGoals && (state.goalList ?? []).length > 0 && state.stage.kind !== 'ENDED')) && <GoalCard me={me} />}
      {goals.length > 0 && (
        <section className="hud space-y-1 p-3 text-[15px]">
          <p className="section-title">{t('Persönliche Ziele')}</p>
          <ul className="space-y-1">
            {goals.map((g) => (
              <li key={g.id}>
                <b className="text-ink">{g.title}</b> <span className="text-[14px] text-dim">· {t(GOAL_STATUS[g.status])}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
