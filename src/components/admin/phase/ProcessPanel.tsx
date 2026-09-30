'use client';

import { useState } from 'react';
import { connectedPlanets, modifierActive } from '@/engine/graph';
import { archeotechWinners, processQueue } from '@/engine/phase';
import type { Phase } from '@/engine/types';
import { AllianceTag, AttackIcon, Empty, fmtDate, Panel, planetName, PlanetSelect } from '@/components/ui';
import { useMsg, useT, useLocale } from '@/i18n/client';
import { ArrowDownIcon, ArrowUpIcon } from '@/components/icons';
import { GameIcon } from '@/components/icons/GameIcon';
import { useCmd } from '../CommandProvider';
import { OutcomeEditor } from '../battles/OutcomeEditor';
import { RuleHint } from './StepPanels';
import { BattleSides, battleTitle, StatusChip, victorLabel, vpText } from '../battles/common';

function Archeotech({ phase }: { phase: Phase }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const winners = archeotechWinners({ state }, phase.number);
  const [inc, setInc] = useState<Record<string, string[]>>({});
  return (
    <Panel title="Archeotech Riches" icon={<GameIcon name="ui_TROPHY" size={18} />}>
      <div className="space-y-3">
        {Object.entries(winners).map(([pid, al]) => {
          const alliance = state.alliances.find((a) => a.id === al);
          const opts = al ? [pid, ...connectedPlanets(state, al, pid, phase.number)] : [];
          const list = inc[pid] ?? [];
          return (
            <div key={pid} className="slab p-2.5 text-[15px]">
              <p className="mb-1">
                <b>{planetName(pid)}</b>: {alliance ? <AllianceTag alliance={alliance} /> : <span className="text-faint">{t('niemand gesichert (keine Siege oder Gleichstand)')}</span>}
              </p>
              {alliance && (
                <div className="grid gap-2 @lg:grid-cols-3">
                  {[0, 1, 2].map((k) => (
                    <PlanetSelect
                      key={k}
                      value={list[k]}
                      options={opts}
                      placeholder={t('+1 PL #{n} (optional)', { n: k + 1 })}
                      onChange={(p) => {
                        const next = [...list];
                        if (p) next[k] = p;
                        else next.splice(k, 1);
                        setInc({ ...inc, [pid]: next.filter(Boolean) });
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <button className="btn btn-primary" disabled={busy} onClick={() => run({ type: 'ARCHEOTECH_RESOLVE', increments: inc })}>
          {t('Archeotech auswerten')}
        </button>
      </div>
    </Panel>
  );
}

export function ProcessPanel({ phase }: { phase: Phase }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const lc = useLocale();
  const msg = useMsg();
  const [open, setOpen] = useState<string | null>(null);
  const queue = processQueue({ state }, phase.number);
  const pending = queue.filter((b) => b.status !== 'PROCESSED');
  const arche = modifierActive(state, 'ARCHEOTECH', phase.number) && !phase.archeotechResolved;

  const move = (id: string, dir: -1 | 1) => {
    const ids = pending.map((b) => b.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run({ type: 'PROCESS_ORDER', battleIds: ids }, { silent: true });
  };

  // Ein Befehl für alle: ungültige Schlachten überspringt die Engine mit Hinweis (Meldung), der Rest wird verarbeitet
  const processAll = () => run({ type: 'BATTLE_PROCESS_ALL' });

  return (
    <div className="space-y-3">
      <Panel
        title={`2.4 · ${t('Ergebnisse verarbeiten')} (${queue.length - pending.length}/${queue.length})`}
        icon={<GameIcon name="ui_DICE" size={18} />}
        actions={
          pending.length > 0 && (
            <button className="btn btn-primary" disabled={busy} onClick={processAll}>
              {t('Alle verarbeiten')}
            </button>
          )
        }
      >
        <RuleHint>{t('Chronologisch nach Spieldatum, ungespielte zuletzt. Ist eine Entscheidung nicht mehr gültig, meldet die Engine das – dann die Wahl des Siegers anpassen.')}</RuleHint>
        {!queue.length && <Empty>{t('Keine Schlachten zu verarbeiten.')}</Empty>}
        <ol className="space-y-2">
          {queue.map((b, idx) => {
            const done = b.status === 'PROCESSED';
            const pi = pending.findIndex((x) => x.id === b.id);
            return (
              <li key={b.id} className={`slab ${done ? 'opacity-80' : ''}`} data-done={done ? 'true' : undefined} data-active={open === b.id && !done ? 'true' : undefined}>
                <div className="flex flex-wrap items-center gap-2 p-2">
                  <span className="font-mono text-[13px] text-dim">{idx + 1}.</span>
                  <button className="flex min-h-10 flex-1 flex-col items-start text-left" onClick={() => setOpen(open === b.id ? null : b.id)}>
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      <AttackIcon type={b.attackType} /> {battleTitle(b, t)} <StatusChip status={b.status} />
                    </span>
                    <span className="text-[13px] text-dim">
                      <BattleSides state={state} b={b} />
                    </span>
                    <span className="text-[13px] text-dim">
                      {b.playedAt ? fmtDate(b.playedAt, true, lc) : t('ungespielt')} {vpText(b) && `· ${vpText(b)}`} · {victorLabel(state, b)}
                    </span>
                  </button>
                  {!done && (
                    <>
                      <button className="btn btn-sm w-9" disabled={busy || pi === 0} onClick={() => move(b.id, -1)} aria-label={t('Nach oben')}>
                        <ArrowUpIcon />
                      </button>
                      <button className="btn btn-sm w-9" disabled={busy || pi === pending.length - 1} onClick={() => move(b.id, 1)} aria-label={t('Nach unten')}>
                        <ArrowDownIcon />
                      </button>
                      <button className="btn btn-sm" disabled={busy} onClick={() => run({ type: 'BATTLE_PROCESS', battleId: b.id })}>
                        {t('Verarbeiten')}
                      </button>
                    </>
                  )}
                </div>
                {done && b.applied.length > 0 && (
                  <ul className="border-t border-[#665333]/40 px-3 py-2 text-[14px] text-dim">
                    {b.applied.map((l, i) => (
                      <li key={i}>{msg(l)}</li>
                    ))}
                  </ul>
                )}
                {open === b.id && !done && (
                  <div className="space-y-2 border-t border-[#665333]/50 p-3">
                    {b.operationIds.map((opId) => (
                      <OutcomeEditor key={opId} battle={b} opId={opId} />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </Panel>
      {arche && <Archeotech phase={phase} />}
    </div>
  );
}
