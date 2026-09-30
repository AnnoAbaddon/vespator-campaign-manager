'use client';

import { useState } from 'react';
import { eventName } from '@/engine/customEvents';
import { PHASE_STEPS, type Modifier, type ModifierKind, type Phase } from '@/engine/types';
import { fmtDate, fromLocalInput, planetName, toLocalInput } from '@/components/ui';
import { ArrowRightIcon, NoteIcon } from '@/components/icons';
import { GameIcon } from '@/components/icons/GameIcon';
import { modifierActive } from '@/engine/graph';
import { processQueue } from '@/engine/phase';
import { STEP_NAMES } from '@/components/stageLabel';
import { useLocale, useT } from '@/i18n/client';
import { useNow } from '@/components/public/useNow';
import { intlLocale } from '@/i18n/core';
import type { T } from '@/i18n/core';
import { useCmd } from '../CommandProvider';
import { OpsPanel } from './OpsPanel';
import { ArrivalPanel, BattlesPanel, EdificesPanel, ResistancePanel, RevealPanel } from './StepPanels';
import { ProcessPanel } from './ProcessPanel';
import { BuildPanel, MovePanel, ResultsPanel } from './LaterPanels';
import { EndedPanel, TiebreakPanel } from './EndPanels';
import { advancePreview } from './advancePreview';
import { proposePhaseDates } from '@/engine/deadlines';

export const MODIFIER_LABEL: Record<ModifierKind, string> = {
  NO_VOID_LEAP: 'Kein Void Leap (Void Piracy)',
  SUPPORT_FACILITIES_INACTIVE: 'Support Facilities wirkungslos (Void Piracy)',
  NO_LOGISTICAL_AUXILIA: 'Kein Logistical Auxilia (Sinister Omens)',
  RANDOM_THEATRE: 'Theatres zufällig (Sinister Omens)',
  ARCHEOTECH: 'Archeotech Riches',
  COORDINATED_OPPOSITION: 'Coordinated Opposition gegen',
  OPEN_TOME: 'An Open Tome:',
  DEFIANT_ZEAL: 'Defiant Zeal:',
  STAR_OF_VOIDFARER: 'Star of the Voidfarer:',
};

function modText(m: Modifier, name: (id: string | null) => string, t: T) {
  let s = t(MODIFIER_LABEL[m.kind]);
  if (m.allianceId) s += ` ${name(m.allianceId)}`;
  if (m.planetIds?.length) s += ` – ${m.planetIds.map(planetName).join(', ')}`;
  return s;
}

function ModifierBanners({ phase }: { phase: number }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const name = (id: string | null) => state.alliances.find((a) => a.id === id)?.name ?? '';
  const now = state.modifiers.filter((m) => m.phaseNumber === phase);
  const next = state.modifiers.filter((m) => m.phaseNumber === phase + 1);
  if (!now.length && !next.length) return null;
  const src = (m: Modifier) => {
    const e = state.events.find((x) => x.id === m.source);
    return e ? eventName(e) : m.source.startsWith('medal') ? t('Medaille') : 'Override';
  };
  return (
    <div className="space-y-1.5">
      {now.map((m) => (
        <div key={m.id} className="notice flex-wrap items-center">
          <span className="lamp lamp-on" aria-hidden />
          <span className="font-mono text-[13px] text-warn">{t('aktiv')}</span> <span className="min-w-0 flex-1">{modText(m, name, t)}</span> <span className="text-[13px] opacity-75">({src(m)})</span>
          <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => run({ type: 'OVERRIDE_MODIFIER_REMOVE', id: m.id })}>
            {t('entfernen')}
          </button>
        </div>
      ))}
      {next.map((m) => (
        <div key={m.id} className="notice notice-muted flex-wrap items-center">
          <span className="lamp" aria-hidden />
          <span className="font-mono text-[13px]">{t('ab Phase {n}', { n: phase + 1 })}</span> <span className="min-w-0 flex-1">{modText(m, name, t)}</span> <span className="text-[13px] opacity-75">({src(m)})</span>
        </div>
      ))}
    </div>
  );
}

function PhaseDates({ phase }: { phase: Phase }) {
  const { state, run, busy } = useCmd();
  const tz = state.meta.timezone;
  const t = useT();
  const init = () => ({
    startDate: toLocalInput(phase.startDate),
    opsDeadline: toLocalInput(phase.opsDeadline),
    battlesDeadline: toLocalInput(phase.battlesDeadline),
    endDate: toLocalInput(phase.endDate),
    notes: phase.notes,
  });
  const [f, setF] = useState(init);
  const [open, setOpen] = useState(false);
  // Neue Phase ohne Termine: Vorschlag im Rhythmus der Vorphase (Spieler sehen sonst keine Fristen)
  const missing = !phase.startDate && !phase.opsDeadline && !phase.battlesDeadline && !phase.endDate;
  const proposal = () => proposePhaseDates(state, phase.number);
  const applyProposal = () => {
    const p = proposal();
    return run({ type: 'PHASE_UPDATE', phase: phase.number, startDate: p.startDate, opsDeadline: p.opsDeadline, battlesDeadline: p.battlesDeadline, endDate: p.endDate });
  };
  const editProposal = () => {
    const p = proposal();
    setF({ ...f, startDate: toLocalInput(p.startDate), opsDeadline: toLocalInput(p.opsDeadline), battlesDeadline: toLocalInput(p.battlesDeadline), endDate: toLocalInput(p.endDate) });
    setOpen(true);
  };
  const rows = (
    [
      ['opsDeadline', t('Befehle')],
      ['battlesDeadline', t('Schlachten')],
      ['endDate', t('Phasenende')],
    ] as const
  ).filter(([k]) => phase[k]);
  return (
    <div className="@container text-[15px]">
      <div className="flex items-start gap-2">
        {rows.length ? (
          <dl className="inset grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 px-2.5 py-1.5 text-[14px]">
            {rows.map(([k, label]) => (
              <Deadline key={k} to={phase[k]!} label={label} timeZone={tz} />
            ))}
          </dl>
        ) : missing ? (
          <div className="notice min-w-0 flex-1 flex-wrap items-center">
            <span className="lamp lamp-on" aria-hidden />
            <span className="min-w-0 flex-1 basis-[12rem]">{t('Diese Phase hat noch keine Termine – Spieler sehen bis dahin keine Fristen.')}</span>
            <button className="btn btn-sm btn-primary" disabled={busy} onClick={applyProposal} title={t('Gleiche Abstände wie in der Vorphase')}>
              {t('Termine vorschlagen und setzen')}
            </button>
            <button className="btn btn-sm" disabled={busy} onClick={editProposal}>
              {t('Vorschlag anpassen')}
            </button>
          </div>
        ) : (
          <p className="hint min-w-0 flex-1 self-center">{t('Keine Termine gesetzt.')}</p>
        )}
        <button className="btn btn-sm btn-ghost shrink-0" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={open ? t('Termine schließen') : t('Termine & Notizen')}>
          <NoteIcon /> {open ? t('Schließen') : t('Termine')}
        </button>
      </div>
      {open && (
        <div className="inset mt-3 grid gap-3 p-3 @md:grid-cols-2">
          {(
            [
              ['startDate', 'Start'],
              ['opsDeadline', 'Frist Befehle'],
              ['battlesDeadline', 'Frist Schlachten'],
              ['endDate', 'Phasenende'],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="block">
              <span className="label">{t(l)}</span>
              <input className="input" type="datetime-local" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </label>
          ))}
          <label className="block @md:col-span-2">
            <span className="label">{t('SL-Notizen zur Phase (privat)')}</span>
            <textarea className="textarea" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </label>
          <div className="@md:col-span-2">
            <button
              className="btn btn-sm"
              disabled={busy}
              onClick={() =>
                run({
                  type: 'PHASE_UPDATE',
                  phase: phase.number,
                  startDate: fromLocalInput(f.startDate),
                  opsDeadline: fromLocalInput(f.opsDeadline),
                  battlesDeadline: fromLocalInput(f.battlesDeadline),
                  endDate: fromLocalInput(f.endDate),
                  notes: f.notes,
                })
              }
            >
              {t('Speichern')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Kompakte Frist: Name, Datum und Restzeit als zusammenhängende Einheit */
function Deadline({ to, label, timeZone }: { to: string; label: string; timeZone?: string }) {
  const t = useT();
  const locale = useLocale();
  const when = new Date(to).toLocaleString(intlLocale(locale), { timeZone: timeZone || 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  // Restzeit erst im Browser (Server und erster Client-Render ohne Uhrzeit – keine Hydrationsfehler)
  const now = useNow();
  const ms = now === null ? null : new Date(to).getTime() - now;
  const days = ms === null ? 0 : Math.floor(Math.abs(ms) / 86400000);
  const hours = ms === null ? 0 : Math.floor((Math.abs(ms) % 86400000) / 3600000);
  const rest = days ? t('{d} T {h} Std', { d: days, h: hours }) : t('{h} Std', { h: hours });
  return (
    <>
      <dt className="font-semibold text-dim">{label}</dt>
      <dd suppressHydrationWarning className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2" title={fmtDate(to, true, locale, timeZone)}>
        <span className="whitespace-nowrap font-mono text-[14px] text-ink">{when}</span>
        {ms !== null && <span className={`whitespace-nowrap ${ms < 0 ? 'text-danger' : ms < 3 * 86400000 ? 'text-warn' : 'text-faint'}`}>{ms < 0 ? t('vor {r}', { r: rest }) : t('noch {r}', { r: rest })}</span>}
      </dd>
    </>
  );
}

export function PhaseCockpit() {
  const { state, run, busy } = useCmd();
  const t = useT();
  const locale = useLocale();
  const st = state.stage;
  if (st.kind === 'TIEBREAK') return <TiebreakPanel />;
  if (st.kind === 'ENDED') return <EndedPanel />;
  if (st.kind !== 'PHASE') return null;
  const phase = state.phases.find((p) => p.number === st.phase)!;
  const last = phase.number >= state.meta.phaseCount;
  const hideAdvance = st.step === 'RESULTS' && last;
  const f = phase.flags;
  const ev = state.toggles.events;
  // Offene Aktion im Schritt? Dann ist sie die Hauptaktion (rot), „Weiter“ bleibt eine normale Taste.
  const stepOpen: Record<typeof st.step, boolean> = {
    OPS: false,
    REVEAL: !f.revealed,
    EDIFICES: !f.edifices,
    BATTLES: false,
    PROCESS: processQueue({ state }, phase.number).some((b) => b.status !== 'PROCESSED') || (modifierActive(state, 'ARCHEOTECH', phase.number) && !phase.archeotechResolved),
    ARRIVAL: !f.arrival,
    RESISTANCE: !f.resistance,
    RESULTS: !f.scored || ((ev.fortunesOfWar || ev.perilsOfPower || ev.desperateMeasures) && !f.eventsGenerated),
    MOVE: !f.movesApplied,
    BUILD: !f.buildStarted || phase.buildOrder.some((aid) => !phase.builds[aid]),
  };

  // Weiter-Taste nach ihrer Wirkung benennen: nächster Arbeitsschritt bzw. nächste Phase
  const stepIdx = PHASE_STEPS.indexOf(st.step);
  const pre = advancePreview(state)!;
  const advanceLabel = pre.next === 'NEXT_PHASE' ? t('Weiter zu Phase {n}', { n: phase.number + 1 }) : pre.next ? t('Weiter zu {step}', { step: t(STEP_NAMES[pre.next]) }) : t('Weiter');
  // Was das Weiterschalten automatisch erledigt (keine Sperre – nur der Hinweis direkt an der Taste)
  const n = pre.openOrders;
  const advanceNote =
    n === 0
      ? null
      : n === 1
        ? pre.auxilia
          ? t('1 offener Befehl erhält Logistical Auxilia')
          : t('1 offener Befehl erhält keine Operation')
        : pre.auxilia
          ? t('{n} offene Befehle erhalten Logistical Auxilia', { n })
          : t('{n} offene Befehle erhalten keine Operation', { n });

  let panel: React.ReactNode;
  switch (st.step) {
    case 'OPS':
      panel = <OpsPanel phase={phase} />;
      break;
    case 'REVEAL':
      panel = <RevealPanel phase={phase} />;
      break;
    case 'EDIFICES':
      panel = <EdificesPanel phase={phase} />;
      break;
    case 'BATTLES':
      panel = <BattlesPanel phase={phase} />;
      break;
    case 'PROCESS':
      panel = <ProcessPanel phase={phase} />;
      break;
    case 'ARRIVAL':
      panel = <ArrivalPanel phase={phase} />;
      break;
    case 'RESISTANCE':
      panel = <ResistancePanel phase={phase} />;
      break;
    case 'RESULTS':
      panel = <ResultsPanel phase={phase} />;
      break;
    case 'MOVE':
      panel = <MovePanel phase={phase} />;
      break;
    case 'BUILD':
      panel = <BuildPanel phase={phase} />;
      break;
  }

  return (
    <div className="space-y-3">
      <section className="hud min-w-0 p-3" aria-labelledby="phase-head">
        {/* Arbeitsschritt als Überschrift; Kampagnenphase als eigene Angabe daneben (nicht zu einem Satz verschmolzen) */}
        <div className="relative z-[1] mb-2 flex items-start gap-3">
          <GameIcon name="ui_SCROLL" size={22} color="#b3975f" className="mt-1" />
          <div className="min-w-0 flex-1">
            {/* Bezeichnung und Zähler mit festem Abstand; zwischen den beiden Angaben eine senkrechte Trennfuge */}
            <p className="flex flex-wrap items-baseline gap-y-0.5 text-[14px] leading-tight text-dim">
              <span className="inline-flex items-baseline gap-1.5">
                <span>{t('Arbeitsschritt')}</span>
                <b className="font-mono text-[13px] font-semibold tracking-normal text-ink">{t('{k} von {n}', { k: stepIdx + 1, n: PHASE_STEPS.length })}</b>
              </span>
              {/* mobil steht die Kampagnenphase bereits in der Kontextzeile über dem Gehäuse */}
              <span className="inline-flex items-baseline gap-1.5 max-lg:hidden">
                <span aria-hidden className="mx-3 inline-block h-3 w-px self-center bg-brass-dark" />
                <span>{t('Kampagnenphase')}</span>
                <b className="font-mono text-[13px] font-semibold tracking-normal text-ink">{t('{k} von {n}', { k: phase.number, n: state.meta.phaseCount })}</b>
              </span>
            </p>
            <h2 id="phase-head" className="hud-title mt-0.5 leading-tight [overflow-wrap:anywhere]">
              {t(STEP_NAMES[st.step])}
            </h2>
          </div>
        </div>
        {!hideAdvance && (
          <div className="relative z-[1] mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <button
              className={`btn shrink-0 ${stepOpen[st.step] ? '' : 'btn-primary'}`}
              disabled={busy}
              onClick={() => {
                // Frist des Schritts noch nicht abgelaufen? Vor dem Weiterschalten nachfragen.
                const due = st.step === 'OPS' ? phase.opsDeadline : st.step === 'BATTLES' ? phase.battlesDeadline : null;
                const early = due && new Date(due).getTime() > Date.now();
                const when = due ? new Date(due).toLocaleString(intlLocale(locale), { timeZone: state.meta.timezone || 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' }) : '';
                run(
                  { type: 'ADVANCE' },
                  early
                    ? {
                        confirm:
                          st.step === 'OPS'
                            ? t('Die Befehlsfrist endet erst am {date}. Trotzdem jetzt weiterschalten?', { date: when })
                            : t('Die Schlachtenfrist endet erst am {date}. Trotzdem jetzt weiterschalten?', { date: when }),
                      }
                    : {},
                );
              }}
              aria-describedby={advanceNote ? 'advance-note' : undefined}
            >
              {advanceLabel} <ArrowRightIcon />
            </button>
            {advanceNote && (
              <p id="advance-note" className="min-w-0 flex-1 basis-[10rem] text-[14px] leading-snug text-warn">
                {advanceNote}
              </p>
            )}
          </div>
        )}
        <div className="relative z-[1]">
          <PhaseDates key={JSON.stringify([phase.number, phase.startDate, phase.opsDeadline, phase.battlesDeadline, phase.endDate, phase.notes])} phase={phase} />
        </div>
      </section>
      <ModifierBanners phase={phase.number} />
      {panel}
    </div>
  );
}
