'use client';

import { useState } from 'react';
import { objectiveSuggestion, openGoal, type GoalDef, type ObjectiveInput, type ObjectiveRewardKind, type PhaseObjective } from '@/engine/narrative';
import { DEFAULT_GRAND_BONUS, emptyGrandBattle, grandEnabled, grandPlacement, type GrandBattle, type GrandTable } from '@/engine/finale';
import { allianceOf } from '@/engine/players';
import { AllianceTag, Empty, Field, Panel, PlanetSelect, planetName, fromLocalInput, toLocalInput } from '@/components/ui';
import { CloseIcon } from '@/components/icons';
import { GameIcon } from '@/components/icons/GameIcon';
import { useMsg, useT } from '@/i18n/client';
import { objectiveReward } from '@/components/public/R2Public';
import { useCmd } from '../CommandProvider';

/** Ziele & Finale (R2): Warmaster-Sonderziele (C3), geheime persönliche Ziele (C4), Großschlacht (C6) */
export function StorySection() {
  return (
    <div className="@container">
      <div className="grid items-start gap-3 @4xl:grid-cols-2">
        <ObjectivesPanel />
        <GoalsPanel />
        <GrandPanel />
      </div>
    </div>
  );
}

export const REWARD_LABEL: Record<ObjectiveRewardKind, string> = {
  NONE: 'nur erzählerisch',
  PL: '+PL auf einem Planeten',
  END_POINTS: 'Punkte für die Endwertung',
  HONOR: 'Ehrung für die Kommandanten',
};

const blankObjective = (phase: number): ObjectiveInput => ({
  phaseNumber: phase,
  title: '',
  text: '',
  allianceId: null,
  check: 'MANUAL',
  planetId: null,
  reward: { kind: 'NONE', value: 1, planetId: null, text: '' },
  secret: false,
});

function ObjectivesPanel() {
  const { state, run, busy } = useCmd();
  const t = useT();
  const first = state.stage.kind === 'PHASE' ? state.stage.phase : 1;
  const ended = state.stage.kind === 'ENDED' || state.stage.kind === 'TIEBREAK';
  const [d, setD] = useState<ObjectiveInput>(blankObjective(first));
  const [open, setOpen] = useState(false);
  const list = [...(state.objectives ?? [])].sort((a, b) => b.phaseNumber - a.phaseNumber);
  const phases = Array.from({ length: Math.max(0, state.meta.phaseCount - first + 1) }, (_, i) => first + i);
  const upd = (p: Partial<ObjectiveInput>) => setD((x) => ({ ...x, ...p }));
  const updR = (p: Partial<ObjectiveInput['reward']>) => setD((x) => ({ ...x, reward: { ...x.reward, ...p } }));
  return (
    <Panel
      title={t('Sonderziele der Phase')}
      icon={<GameIcon name="ui_TROPHY" size={18} />}
      actions={
        !ended && (
          <button type="button" className="btn btn-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? t('Schließen') : t('Neues Sonderziel')}
          </button>
        )
      }
    >
      {open && (
        <div className="mb-3 space-y-2 border-b border-line/60 pb-3">
          <div className="grid gap-2 @md:grid-cols-2">
            <Field label={t('Titel')}>
              <input className="input" value={d.title} onChange={(e) => upd({ title: e.target.value })} placeholder={t('z. B. Artefakt auf Masnet bergen')} />
            </Field>
            <Field label={t('Phase')}>
              <select className="select" value={d.phaseNumber} onChange={(e) => upd({ phaseNumber: Number(e.target.value) })}>
                {phases.map((n) => (
                  <option key={n} value={n}>
                    {t('Phase {n}', { n })}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('Gilt für')}>
              <select className="select" value={d.allianceId ?? ''} onChange={(e) => upd({ allianceId: e.target.value || null, secret: e.target.value ? d.secret : false })}>
                <option value="">{t('alle Allianzen')}</option>
                {state.alliances.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('Auswertung')}>
              <select className="select" value={d.check} onChange={(e) => upd({ check: e.target.value as ObjectiveInput['check'] })}>
                <option value="MANUAL">{t('Warmaster hakt ab')}</option>
                <option value="HOLD_PLANET">{t('Planet halten (automatisch am Phasenende)')}</option>
              </select>
            </Field>
            {d.check === 'HOLD_PLANET' && (
              <Field label={t('Planet')}>
                <PlanetSelect value={d.planetId} onChange={(v) => upd({ planetId: v || null })} />
              </Field>
            )}
            <Field label={t('Belohnung')}>
              <select className="select" value={d.reward.kind} onChange={(e) => updR({ kind: e.target.value as ObjectiveRewardKind })}>
                {(Object.keys(REWARD_LABEL) as ObjectiveRewardKind[]).map((k) => (
                  <option key={k} value={k}>
                    {t(REWARD_LABEL[k])}
                  </option>
                ))}
              </select>
            </Field>
            {(d.reward.kind === 'PL' || d.reward.kind === 'END_POINTS') && (
              <Field label={t('Wert')}>
                <input className="input w-24" type="number" min={1} max={10} value={d.reward.value} onChange={(e) => updR({ value: Number(e.target.value) })} />
              </Field>
            )}
            {d.reward.kind === 'PL' && (
              <Field label={t('Planet der Belohnung')}>
                <PlanetSelect value={d.reward.planetId ?? d.planetId} onChange={(v) => updR({ planetId: v || null })} />
              </Field>
            )}
            <Field label={d.reward.kind === 'HONOR' ? t('Titel der Ehrung') : t('Belohnung (Text)')}>
              <input className="input" value={d.reward.text} onChange={(e) => updR({ text: e.target.value })} />
            </Field>
          </div>
          <Field label={t('Beschreibung')}>
            <textarea className="textarea" rows={2} value={d.text} onChange={(e) => upd({ text: e.target.value })} />
          </Field>
          {d.allianceId && (
            <label className="flex min-h-8 items-start gap-2.5 text-[15px]">
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#dda94d]" checked={!!d.secret} onChange={(e) => upd({ secret: e.target.checked })} />
              <span>{t('Verdeckt: nur die Ziel-Allianz sieht das Ziel bis zur Auswertung')}</span>
            </label>
          )}
          <button
            className="btn btn-primary"
            disabled={busy || !d.title.trim()}
            onClick={async () => {
              if (await run({ type: 'OBJECTIVE_UPSERT', objective: d })) {
                setD(blankObjective(d.phaseNumber));
                setOpen(false);
              }
            }}
          >
            {t('Speichern')}
          </button>
        </div>
      )}
      {list.length ? (
        <ul className="space-y-3">
          {list.map((o) => (
            <ObjectiveRow key={o.id} o={o} />
          ))}
        </ul>
      ) : (
        <Empty>{t('Kein Sonderziel. Ein Phasenziel kann einer zurückliegenden Allianz eine Chance geben.')}</Empty>
      )}
      <p className="mt-2 text-[13px] text-faint">{t('Sonderziele sind in Leseansicht, Spielerlinks und Präsentation sichtbar; PL-Belohnungen wirken sofort, Endwertungs-Punkte erst am Kampagnenende.')}</p>
    </Panel>
  );
}

function ObjectiveRow({ o }: { o: PhaseObjective }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const msg = useMsg();
  const targets = o.allianceId ? state.alliances.filter((a) => a.id === o.allianceId) : state.alliances;
  const [who, setWho] = useState<string[]>(() => objectiveSuggestion(state, o));
  const [reason, setReason] = useState('');
  const al = (id: string | null) => state.alliances.find((a) => a.id === id) ?? null;
  return (
    <li className="border-l-2 pl-3" style={{ borderColor: o.status === 'MET' ? '#6fa56f' : o.status === 'FAILED' ? '#9a927f' : '#dda94d' }}>
      <p className="flex flex-wrap items-center gap-x-2">
        <b className="text-ink">{o.title}</b>
        <span className="chip">{t('Phase {n}', { n: o.phaseNumber })}</span>
        {o.secret && <span className="chip">{t('verdeckt')}</span>}
        <span className={`chip ${o.status === 'MET' ? 'border-ok text-ok' : o.status === 'OPEN' ? 'border-accent text-accent' : ''}`}>
          {o.status === 'MET' ? t('erfüllt') : o.status === 'FAILED' ? t('nicht erfüllt') : t('offen')}
        </span>
      </p>
      <p className="text-[14px] text-dim">
        {o.allianceId ? <AllianceTag alliance={al(o.allianceId)} /> : t('alle Allianzen')} · {o.check === 'HOLD_PLANET' ? t('{planet} halten', { planet: planetName(o.planetId) }) : t('Warmaster hakt ab')} ·{' '}
        {objectiveReward(o, t)}
      </p>
      {o.text && <p className="whitespace-pre-wrap text-[14px]">{o.text}</p>}
      {o.status !== 'OPEN' ? (
        <p className="text-[14px] text-dim">
          {o.achievedBy.length ? o.achievedBy.map((a) => al(a)?.name ?? '?').join(', ') : '–'}
          {o.reason ? ` · ${msg(o.reason)}` : ''}
        </p>
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {targets.map((a) => (
            <label key={a.id} className="flex min-h-11 items-center gap-1.5 text-[14px]">
              <input type="checkbox" className="h-4 w-4 accent-[#dda94d]" checked={who.includes(a.id)} onChange={(e) => setWho((w) => (e.target.checked ? [...w, a.id] : w.filter((x) => x !== a.id)))} />
              <AllianceTag alliance={a} />
            </label>
          ))}
          <input className="input min-w-40 flex-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('Begründung')} aria-label={t('Begründung')} />
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => run({ type: 'OBJECTIVE_RESOLVE', id: o.id, achievedBy: who, reason })}>
            {who.length ? t('Als erfüllt werten') : t('Als nicht erfüllt werten')}
          </button>
          <button className="btn btn-sm btn-ghost text-danger" disabled={busy} aria-label={t('Sonderziel löschen')} title={t('Sonderziel löschen')} onClick={() => run({ type: 'OBJECTIVE_DELETE', id: o.id })}>
            <CloseIcon />
          </button>
        </div>
      )}
    </li>
  );
}

const GOAL_STATUS: Record<string, string> = { OPEN: 'offen', CLAIMED: 'als erfüllt gemeldet', MET: 'erfüllt', FAILED: 'nicht erfüllt' };

function GoalsPanel() {
  const { state, run, busy } = useCmd();
  const t = useT();
  const [list, setList] = useState<GoalDef[]>(() => state.goalList ?? []);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(list) !== JSON.stringify(state.goalList ?? []);
  const players = state.players.filter((p) => p.active || (p.goals ?? []).length);
  return (
    <Panel title={t('Geheime persönliche Ziele')} icon={<GameIcon name="ui_SKULL" size={18} />}>
      <p className="mb-2 text-[14px] text-dim">
        {state.toggles.narrative?.secretGoals
          ? t('Spieler wählen selbst aus der Liste; nur Spieler und Warmaster sehen das Ziel. Bestätigte Ziele bringen eine Ehrung und werden am Kampagnenende aufgedeckt.')
          : t('Spieler können noch nicht selbst wählen (Einstellungen · Regeln). Zuteilen geht immer.')}
      </p>
      <details className="fold" open={!list.length}>
        <summary>{t('Zielliste ({n})', { n: list.length })}</summary>
        <ul className="mt-2 space-y-2">
          {list.map((g, i) => (
            <li key={g.id} className="flex gap-2">
              <div className="grid min-w-0 flex-1 gap-1">
                <input className="input" value={g.title} placeholder={t('Titel')} aria-label={t('Titel')} onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                <input className="input" value={g.text} placeholder={t('Beschreibung')} aria-label={t('Beschreibung')} onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
              </div>
              <button type="button" className="btn btn-sm btn-ghost self-start text-danger" aria-label={t('Ziel entfernen')} onClick={() => setList((l) => l.filter((_, j) => j !== i))}>
                <CloseIcon />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" onClick={() => setList((l) => [...l, { id: `g${Date.now().toString(36)}${l.length}`, title: '', text: '' }])}>
            {t('Ziel hinzufügen')}
          </button>
          <button type="button" className="btn btn-sm btn-primary" disabled={busy || !dirty} onClick={() => run({ type: 'GOAL_LIST_SET', goals: list })}>
            {t('Liste speichern')}
          </button>
        </div>
      </details>
      <ul className="mt-3 divide-y divide-line/60">
        {players.map((p) => {
          const cur = openGoal(p);
          return (
            <li key={p.id} className="space-y-1 py-2 text-[15px]">
              <p className="font-semibold text-ink">{p.nickname}</p>
              {(p.goals ?? []).map((g) => (
                <div key={g.id} className="flex flex-wrap items-center gap-2 pl-2">
                  <span className="min-w-0 flex-1">
                    {g.title} <span className="text-[13px] text-dim">· {t(GOAL_STATUS[g.status])}</span>
                    {g.note && <span className="block text-[13px] text-dim">{g.note}</span>}
                  </span>
                  {(g.status === 'OPEN' || g.status === 'CLAIMED') && (
                    <>
                      <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => run({ type: 'GOAL_RESOLVE', playerId: p.id, id: g.id, met: true, reason: '' })}>
                        {t('Erfüllt')}
                      </button>
                      <button className="btn btn-sm" disabled={busy} onClick={() => run({ type: 'GOAL_RESOLVE', playerId: p.id, id: g.id, met: false, reason: '' })}>
                        {t('Nicht erfüllt')}
                      </button>
                    </>
                  )}
                  <button className="btn btn-sm btn-ghost text-danger" disabled={busy} aria-label={t('Ziel entfernen')} onClick={() => run({ type: 'GOAL_REMOVE', playerId: p.id, id: g.id })}>
                    <CloseIcon />
                  </button>
                </div>
              ))}
              {!cur && p.active && (
                <div className="flex flex-wrap gap-2 pl-2">
                  <select className="select w-auto min-w-40 flex-1" value={pick[p.id] ?? ''} onChange={(e) => setPick((x) => ({ ...x, [p.id]: e.target.value }))} aria-label={t('Ziel für {name}', { name: p.nickname })}>
                    <option value="">{t('– eigenes Ziel –')}</option>
                    {(state.goalList ?? []).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </select>
                  {!pick[p.id] && (
                    <input
                      className="input min-w-40 flex-1"
                      value={custom[p.id] ?? ''}
                      onChange={(e) => setCustom((x) => ({ ...x, [p.id]: e.target.value }))}
                      placeholder={t('Titel')}
                      aria-label={t('Eigenes Ziel für {name}', { name: p.nickname })}
                    />
                  )}
                  <button
                    className="btn btn-sm"
                    disabled={busy || (!pick[p.id] && !custom[p.id]?.trim())}
                    onClick={async () => {
                      if (await run({ type: 'GOAL_ASSIGN', playerId: p.id, goalId: pick[p.id] || null, title: custom[p.id] })) setCustom((x) => ({ ...x, [p.id]: '' }));
                    }}
                  >
                    {t('Zuteilen')}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function GrandPanel() {
  const { state, run, busy } = useCmd();
  const t = useT();
  const enabled = grandEnabled(state);
  const g: GrandBattle = state.grandBattle ?? emptyGrandBattle(state);
  const [name, setName] = useState(g.name);
  const [mission, setMission] = useState(g.mission);
  const [when, setWhen] = useState(toLocalInput(g.scheduledAt));
  const [report, setReport] = useState(g.report);
  const [tables, setTables] = useState<GrandTable[]>(g.tables);
  const last = state.stage.kind === 'PHASE' && state.stage.phase === state.meta.phaseCount;
  const ended = state.stage.kind === 'ENDED' || state.stage.kind === 'TIEBREAK';
  const place = grandPlacement(state);
  const bonus = state.toggles.grandFinale?.bonus ?? DEFAULT_GRAND_BONUS;
  const members = (al: string) => state.players.filter((p) => p.active && allianceOf(p, state.meta.phaseCount) === al);
  if (!enabled && !state.grandBattle)
    return (
      <Panel title={t('Finale „Großschlacht“')} icon={<GameIcon name="op_BATTLE" size={18} />}>
        <Empty>{t('Aus – einschalten unter Einstellungen · Regeln · Punktestand und Endwertung.')}</Empty>
      </Panel>
    );
  const toggle = (al: string, id: string, on: boolean) => {
    const cur = g.participants[al] ?? [];
    run({ type: 'GRAND_UPDATE', update: { participants: { ...g.participants, [al]: on ? [...cur, id] : cur.filter((x) => x !== id) } } }, { silent: true });
  };
  return (
    <Panel title={t('Finale „Großschlacht“')} icon={<GameIcon name="op_BATTLE" size={18} />}>
      <div className="space-y-3 text-[15px]">
        <div className="grid gap-2 @md:grid-cols-2">
          <Field label={t('Name')}>
            <input className="input" value={name} disabled={ended} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('Mission bzw. Format')}>
            <input className="input" value={mission} disabled={ended} onChange={(e) => setMission(e.target.value)} placeholder={t('z. B. Mega-Battle, mindestens zwei Ziele halten')} />
          </Field>
          <Field label={t('Termin')}>
            <input className="input" type="datetime-local" value={when} disabled={ended} onChange={(e) => setWhen(e.target.value)} />
          </Field>
        </div>
        <Field label={t('Bericht')}>
          <textarea className="textarea" rows={2} value={report} disabled={ended} onChange={(e) => setReport(e.target.value)} />
        </Field>
        <button className="btn btn-sm" disabled={busy || ended || !name.trim()} onClick={() => run({ type: 'GRAND_UPDATE', update: { name, mission, report, scheduledAt: when ? fromLocalInput(when) : null } })}>
          {t('Speichern')}
        </button>
        <div>
          <p className="section-title">{t('Teilnehmer')}</p>
          <div className="grid gap-2 @md:grid-cols-3">
            {state.alliances.map((a) => (
              <div key={a.id}>
                <AllianceTag alliance={a} />
                <ul>
                  {members(a.id).map((p) => (
                    <li key={p.id}>
                      <label className="flex min-h-11 items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[#dda94d]"
                          disabled={busy || ended || g.done}
                          checked={(g.participants[a.id] ?? []).includes(p.id)}
                          onChange={(e) => toggle(a.id, p.id, e.target.checked)}
                        />
                        {p.nickname}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="section-title">{t('Ergebnis je Tisch bzw. Ziel')}</p>
          {!last && !ended && <p className="text-[14px] text-dim">{t('Ergebnisse erst in der letzten Phase.')}</p>}
          <ul className="space-y-2">
            {tables.map((tb, i) => (
              <li key={tb.id} className="flex flex-wrap gap-2">
                <input
                  className="input min-w-32 flex-1"
                  value={tb.label}
                  disabled={ended || g.done}
                  aria-label={t('Tisch')}
                  onChange={(e) => setTables((l) => l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                />
                <select
                  className="select w-auto"
                  value={tb.winnerAllianceId ?? ''}
                  disabled={!last || g.done}
                  aria-label={t('Sieger {name}', { name: tb.label })}
                  onChange={(e) => setTables((l) => l.map((x, j) => (j === i ? { ...x, winnerAllianceId: e.target.value || null } : x)))}
                >
                  <option value="">{t('– offen / unentschieden –')}</option>
                  {state.alliances.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-sm btn-ghost text-danger" disabled={ended || g.done} aria-label={t('Tisch entfernen')} onClick={() => setTables((l) => l.filter((_, j) => j !== i))}>
                  <CloseIcon />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm"
              disabled={ended || g.done}
              onClick={() => setTables((l) => [...l, { id: `t${Date.now().toString(36)}${l.length}`, label: t('Tisch {n}', { n: l.length + 1 }), winnerAllianceId: null }])}
            >
              {t('Tisch hinzufügen')}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={busy || ended || g.done || JSON.stringify(tables) === JSON.stringify(g.tables)}
              onClick={() => run({ type: 'GRAND_UPDATE', update: { tables } })}
            >
              {t('Tische speichern')}
            </button>
          </div>
        </div>
        {place && (
          <p>
            {t('Platzierung:')}{' '}
            {[...state.alliances]
              .sort((a, b) => place[a.id] - place[b.id])
              .map((a) => `${place[a.id]}. ${a.name} (+${bonus[place[a.id] - 1] ?? 0})`)
              .join(' · ')}
          </p>
        )}
        {last && (
          <div className="flex flex-wrap gap-2">
            {g.done ? (
              <button className="btn btn-sm" disabled={busy} onClick={() => run({ type: 'GRAND_UPDATE', update: { done: false } })}>
                {t('Ergebnis wieder öffnen')}
              </button>
            ) : (
              <button className="btn btn-sm btn-primary" disabled={busy || !place} onClick={() => run({ type: 'GRAND_UPDATE', update: { done: true } })}>
                {t('Ergebnis festschreiben')}
              </button>
            )}
          </div>
        )}
        {g.done && <p className="text-ok">{t('Das Ergebnis geht in die Endwertung ein.')}</p>}
      </div>
    </Panel>
  );
}
