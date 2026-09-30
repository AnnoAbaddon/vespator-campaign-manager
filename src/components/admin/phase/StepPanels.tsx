'use client';

import { useState } from 'react';
import { ATTACK_TYPES } from '@/engine/data/vespator';
import { describeOp } from '@/engine/phase';
import type { Operation, Phase } from '@/engine/types';
import { AllianceTag, Empty, OpIcon, Panel, planetName } from '@/components/ui';
import { useMsg, useT } from '@/i18n/client';
import { useCmd } from '../CommandProvider';
import { BattleList } from '../battles/BattleList';
import { BattleOverview } from '../battles/BattleOverview';
import { useMapFocus } from '../mapFocus';
import { GameIcon } from '@/components/icons/GameIcon';

/** Regel- und Ablauftext: eingeklappt, damit Stand und Aktion zuerst sichtbar sind */
export function RuleHint({ children }: { children: React.ReactNode }) {
  const t = useT();
  return (
    <details className="fold mb-2 [&>summary]:min-h-9 [&>summary]:text-[15px]">
      <summary>{t('Ablauf und Regel')}</summary>
      <div className="pb-1 text-[15px] text-dim">{children}</div>
    </details>
  );
}

const OP_STATUS: Record<Operation['status'], [string, string]> = {
  PLANNED: ['geplant', ''],
  RESOLVED: ['ausgeführt', 'border-ok text-ok'],
  CANCELLED: ['annulliert', 'border-danger text-danger'],
  VOID: ['verfallen', 'text-faint'],
};

/** Operationen als kompakte Liste (Flotte und Allianz, darunter die Operation) – passt in die schmale rechte Spalte */
function OpTable({ ops, empty }: { ops: Operation[]; empty: string }) {
  const { state } = useCmd();
  const t = useT();
  const msg = useMsg();
  if (!ops.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y divide-line/50 border-y border-line/50">
      {ops.map((o) => {
        const [st, cls] = OP_STATUS[o.status];
        return (
          <li key={o.id} className="py-1.5 text-[15px]">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <b className="font-semibold text-ink">{state.fleets.find((f) => f.id === o.fleetId)?.name}</b>
              <AllianceTag alliance={state.alliances.find((a) => a.id === o.allianceId)} />
              <span className={`chip ml-auto ${cls}`}>{t(st)}</span>
            </p>
            <p className="mt-0.5 flex items-start gap-1.5 text-dim">
              <span className="mt-0.5 shrink-0">
                <OpIcon op={o} />
              </span>
              <span>{msg(describeOp({ state }, o))}</span>
            </p>
            {o.note && <p className="text-[14px] text-warn">{msg(o.note)}</p>}
          </li>
        );
      })}
    </ul>
  );
}

export function RevealPanel({ phase }: { phase: Phase }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const battles = phase.operations.filter((o) => o.type === 'BATTLE');
  return (
    <Panel
      title="2.1 · Reveal"
      icon={<GameIcon name="ui_SCROLL" size={18} />}
      actions={
        !phase.flags.revealed && (
          <button className="btn btn-primary" disabled={busy} onClick={() => run({ type: 'REVEAL_OPS' })}>
            {t('Operationen aufdecken')}
          </button>
        )
      }
    >
      {!phase.flags.revealed ? (
        <p className="text-[15px] text-dim">
          {t('{n} Operationen verdeckt, davon {b} Battle Operations.', { n: phase.operations.length, b: battles.length })}{' '}
          {t('Aufdecken macht alle Operationen öffentlich und legt für jede Battle Operation eine Schlacht an.')}
        </p>
      ) : (
        <div className="space-y-4">
          {/* Stand zuerst: wer wird wo angegriffen; die Einzelliste darunter */}
          <div>
            <p className="section-title">{t('Angriffe je Allianz')}</p>
            {state.alliances.map((a) => {
              const against = battles.filter((o) => o.targetAllianceId === a.id);
              return (
                <div key={a.id} className="mb-1.5 text-[15px]">
                  <AllianceTag alliance={a} /> {t('wird angegriffen:')}{' '}
                  {against.length ? (
                    against.map((o) => t('{attack} auf {planet}', { attack: ATTACK_TYPES[o.attackType!].name, planet: planetName(o.targetPlanetId) })).join(' · ')
                  ) : (
                    <span className="text-faint">{t('keine Angriffe')}</span>
                  )}
                </div>
              );
            })}
          </div>
          <details className="fold">
            <summary>{t('Alle Operationen ({n})', { n: phase.operations.length })}</summary>
            <OpTable ops={phase.operations} empty={t('Keine Operationen')} />
          </details>
        </div>
      )}
    </Panel>
  );
}

export function EdificesPanel({ phase }: { phase: Phase }) {
  const { run, busy } = useCmd();
  const t = useT();
  const ops = phase.operations.filter((o) => o.type === 'RAISE_EDIFICES');
  return (
    <Panel
      title="2.2 · Edifice Raising Complete"
      icon={<GameIcon name="op_RAISE_EDIFICES" size={18} />}
      actions={
        !phase.flags.edifices && (
          <button className="btn btn-primary" disabled={busy} onClick={() => run({ type: 'RESOLVE_EDIFICES' })}>
            {t('Bauen ausführen')}
          </button>
        )
      }
    >
      <RuleHint>{t('Reihenfolge je Planet nach höchstem PL (Roll-off bei Gleichstand). Ist der Planet voll oder das Limit erreicht, wird annulliert.')}</RuleHint>
      <OpTable ops={ops} empty={t('Keine Raise-Edifices-Operationen')} />
      {phase.flags.edifices && <p className="notice notice-ok mt-2">{t('Ausgeführt.')}</p>}
    </Panel>
  );
}

export function BattlesPanel({ phase }: { phase: Phase }) {
  const { state } = useCmd();
  const t = useT();
  const focus = useMapFocus();
  const [openId, setOpenId] = useState<string | null>(null);
  // Kampagnenschlachten und Nebengefechte (Kill-Team-Spiel, Abfanggefecht) der Phase
  const list = state.battles.filter((b) => b.phaseNumber === phase.number && (b.kind === 'CAMPAIGN' || b.kind === 'KILL_TEAM' || b.kind === 'INTERCEPT')).sort((a, b) => a.createdSeq - b.createdSeq);
  const open = list.filter((b) => b.status === 'SCHEDULED').length;
  const jump = (id: string) => {
    setOpenId(id);
    // nach dem Aufklappen zur Schlacht rollen
    requestAnimationFrame(() => document.getElementById(`battle-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };
  return (
    <Panel
      title={`2.3 · ${t('Schlachten ({n}/{total} mit Ergebnis)', { n: list.length - open, total: list.length })}`}
      icon={<GameIcon name="op_BATTLE" size={18} />}
      actions={
        focus.openChapter && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => focus.openChapter?.('battles')}>
            {t('Alle im Reiter Schlachten')}
          </button>
        )
      }
    >
      <RuleHint>
        {t(
          'Ergebnisse werden gesammelt und erscheinen sofort im Feed; die Karte ändert sich erst in 2.4. Ungespielte Schlachten werden beim Weiterschalten regelgemäß als Sieg des Angreifers gewertet – oder vorher hier abweichend gewertet.',
        )}
      </RuleHint>
      <BattleOverview battles={list} onJump={jump} />
      <BattleList battles={list} bundling unplayed openId={openId} onOpenChange={setOpenId} />
    </Panel>
  );
}

export function ArrivalPanel({ phase }: { phase: Phase }) {
  const { run, busy } = useCmd();
  const t = useT();
  const ops = phase.operations.filter((o) => o.type === 'VOID_LEAP');
  return (
    <Panel
      title="2.5 · Fleet Arrival"
      icon={<GameIcon name="op_VOID_LEAP" size={18} />}
      actions={
        !phase.flags.arrival && (
          <button className="btn btn-primary" disabled={busy} onClick={() => run({ type: 'RESOLVE_ARRIVAL' })}>
            {t('Void Leaps ausführen')}
          </button>
        )
      }
    >
      <OpTable ops={ops} empty={t('Keine Void Leaps')} />
      {!phase.flags.arrival && <InterceptOptions phase={phase} />}
      {phase.flags.arrival && <p className="notice notice-ok mt-2">{t('Ausgeführt.')}</p>}
    </Panel>
  );
}

export function ResistancePanel({ phase }: { phase: Phase }) {
  const { run, busy } = useCmd();
  const t = useT();
  const ops = phase.operations.filter((o) => o.type === 'KILL_TEAMS');
  return (
    <Panel
      title="2.6 · Low-level Resistance"
      icon={<GameIcon name="op_KILL_TEAMS" size={18} />}
      actions={
        !phase.flags.resistance && (
          <button className="btn btn-primary" disabled={busy} onClick={() => run({ type: 'RESOLVE_KILL_TEAMS' })}>
            {t('Kill Teams auswerten')}
          </button>
        )
      }
    >
      <RuleHint>
        {t(
          'Je gegnerischer Allianz ein W6 – bei 5+ sinkt deren PL auf dem Zielplaneten um 1. Bei „Kill-Team-Spiel“ zählt stattdessen ein Sieg im jeweiligen Gefecht (ungespielt: keine Wirkung). Danach wird der Stand öffentlich.',
        )}
      </RuleHint>
      <OpTable ops={ops} empty={t('Keine Kill-Teams-Operationen')} />
      {phase.flags.resistance && <p className="notice notice-ok mt-2">{t('Ausgewertet – Karte veröffentlicht.')}</p>}
    </Panel>
  );
}

/** Hausregel Void-Leap-Abfangen (N4.2): gegnerische Flotte am Zielplaneten kann ein Abfanggefecht erzwingen */
function InterceptOptions({ phase }: { phase: Phase }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  if (!state.toggles.voidLeapIntercept) return null;
  const rows = phase.operations
    .filter((o) => o.type === 'VOID_LEAP' && o.status === 'PLANNED' && o.destinationPlanetId)
    .flatMap((o) =>
      state.alliances
        .filter((a) => a.id !== o.allianceId && state.fleets.some((f) => f.allianceId === a.id && !f.reserve && f.planetId === o.destinationPlanetId))
        .map((a) => ({ o, a, battle: state.battles.find((b) => b.kind === 'INTERCEPT' && b.operationIds.includes(o.id)) })),
    );
  if (!rows.length) return null;
  return (
    <div className="mt-3 space-y-1.5 text-[15px]">
      <p className="section-title">{t('Abfangen möglich (Hausregel)')}</p>
      {rows.map(({ o, a, battle }) => (
        <p key={`${o.id}-${a.id}`} className="flex flex-wrap items-center gap-2">
          {t('{alliance} bei {planet} gegen {fleet}', { alliance: a.name, planet: planetName(o.destinationPlanetId!), fleet: state.fleets.find((f) => f.id === o.fleetId)?.name })}
          {battle ? (
            <span className="chip">{battle.victor ? (battle.victor === 'ATTACKER' ? t('abgefangen') : t('durchgebrochen')) : t('Gefecht angesetzt – Ergebnis unter Schlachten')}</span>
          ) : (
            <button className="btn btn-sm" disabled={busy} onClick={() => run({ type: 'INTERCEPT_ADD', opId: o.id, allianceId: a.id })}>
              {t('Abfanggefecht ansetzen')}
            </button>
          )}
        </p>
      ))}
    </div>
  );
}
