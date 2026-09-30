'use client';

import { useMemo, useState } from 'react';
import type { BattleStatus } from '@/engine/types';
import { useT } from '@/i18n/client';
import { useCmd } from '../CommandProvider';
import { BattleList } from './BattleList';
import { BattleOverview } from './BattleOverview';
import { STATUS_LABEL } from './common';
import { mapOf } from '@/engine/map';
import { LoadStrip } from '@/components/LoadStrip';
import { GameIcon } from '@/components/icons/GameIcon';
import { STEP_NAMES } from '@/components/stageLabel';
import { MixStats } from '@/components/stats/MixStats';
import { SkirmishPanel } from './SkirmishPanel';

const NO_FILTER = { phase: '', status: '', alliance: '', player: '', planet: '' };

/**
 * Kapitel „Schlachten“: flach im Gehäuse (keine inneren Kästen). Ohne Schlachten erklärt ein zentraler
 * Leerzustand, wann Schlachten entstehen und was als Nächstes zu tun ist; die Filter erscheinen erst,
 * wenn es etwas zu filtern gibt. Mobil sind die Filter hinter einer Taste eingeklappt.
 */
export function BattlesTab() {
  const { state } = useCmd();
  const t = useT();
  const [f, setF] = useState(NO_FILTER);
  const [showFilter, setShowFilter] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const set = (k: keyof typeof NO_FILTER) => (e: React.ChangeEvent<HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const list = useMemo(
    () =>
      [...state.battles]
        .filter((b) => !f.phase || String(b.phaseNumber) === f.phase)
        .filter((b) => !f.status || b.status === f.status)
        .filter((b) => !f.alliance || b.attackerAllianceId === f.alliance || b.defenderAllianceId === f.alliance)
        .filter((b) => !f.player || [...b.attackers, ...b.defenders].some((p) => p.playerId === f.player))
        .filter((b) => !f.planet || b.planetId === f.planet)
        .sort((a, b) => b.phaseNumber - a.phaseNumber || b.createdSeq - a.createdSeq),
    [state.battles, f],
  );

  const total = state.battles.length;
  const active = Object.values(f).filter(Boolean).length;
  const phaseNo = state.stage.kind === 'PHASE' ? state.stage.phase : null;

  if (!total)
    return (
      <div className="space-y-4">
        <NoBattles />
        <SkirmishPanel />
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-[15px] text-dim" role="status">
          {active ? t('{n} von {total} Schlachten', { n: list.length, total }) : t('{n} Schlachten', { n: total })}
        </p>
        <button type="button" className="btn btn-sm lg:hidden" aria-expanded={showFilter} aria-controls="battle-filter" onClick={() => setShowFilter((s) => !s)}>
          {active ? t('Filter ({n} aktiv)', { n: active }) : t('Filter')}
        </button>
        {active > 0 && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setF(NO_FILTER)}>
            {t('Filter zurücksetzen')}
          </button>
        )}
      </div>

      <div id="battle-filter" className={`${showFilter ? 'grid' : 'hidden'} gap-2 sm:grid-cols-2 lg:grid lg:grid-cols-5`} role="group" aria-label={t('Filter')}>
        <select className="select" value={f.phase} onChange={set('phase')} aria-label={t('Phase')}>
          <option value="">{t('Alle Phasen')}</option>
          {state.phases.map((p) => (
            <option key={p.number} value={p.number}>
              {t('Phase {n}', { n: p.number })}
            </option>
          ))}
        </select>
        <select className="select" value={f.status} onChange={set('status')} aria-label={t('Status')}>
          <option value="">{t('Alle Status')}</option>
          {(Object.keys(STATUS_LABEL) as BattleStatus[]).map((s) => (
            <option key={s} value={s}>
              {t(STATUS_LABEL[s])}
            </option>
          ))}
        </select>
        <select className="select" value={f.alliance} onChange={set('alliance')} aria-label={t('Allianz')}>
          <option value="">{t('Alle Allianzen')}</option>
          {state.alliances.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select className="select" value={f.player} onChange={set('player')} aria-label={t('Spieler')}>
          <option value="">{t('Alle Spieler')}</option>
          {state.players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nickname}
            </option>
          ))}
        </select>
        <select className="select" value={f.planet} onChange={set('planet')} aria-label={t('Planet')}>
          <option value="">{t('Alle Planeten')}</option>
          {mapOf(state).planets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {phaseNo && state.battles.some((b) => b.phaseNumber === phaseNo) && (
        <div className="border-t border-line/60 pt-3">
          <p className="section-title">{t('Spiellast Phase {n}', { n: phaseNo })}</p>
          <LoadStrip state={state} phase={phaseNo} />
        </div>
      )}

      {phaseNo && (
        <BattleOverview
          battles={state.battles.filter((b) => b.phaseNumber === phaseNo && b.kind !== 'FINAL_TIEBREAK').sort((a, b) => a.createdSeq - b.createdSeq)}
          onJump={(id) => {
            setF(NO_FILTER);
            setOpenId(id);
            requestAnimationFrame(() => document.getElementById(`battle-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
          }}
        />
      )}

      {/* A2: Mix der Angriffsarten und Missionen als Frühwarnung vor Monokultur */}
      <details className="fold border-t border-line/60 pt-2">
        <summary>{t('Missions-Mix je Phase und Allianz')}</summary>
        <div className="mt-2">
          <MixStats state={state} />
        </div>
      </details>
      <SkirmishPanel />

      {list.length ? (
        <BattleList battles={list} openId={openId} onOpenChange={setOpenId} />
      ) : (
        <div className="flex flex-col items-center gap-3 border-t border-line/60 py-8 text-center">
          <p className="text-[16px] text-dim">{t('Keine Schlacht passt zu diesen Filtern.')}</p>
          <button type="button" className="btn" onClick={() => setF(NO_FILTER)}>
            {t('Filter zurücksetzen')}
          </button>
        </div>
      )}
    </div>
  );
}

/** Zentraler Leerzustand: warum es (noch) keine Schlachten gibt und was der nächste Schritt ist */
function NoBattles() {
  const { state } = useCmd();
  const t = useT();
  let why: string;
  let next: string;
  if (state.stage.kind === 'SETUP') {
    why = t('Schlachten entstehen erst, wenn der Feldzug läuft: Im Schritt „Reveal“ jeder Phase werden die befohlenen Battle Operations zu Schlachten.');
    next = t('Nächster Schritt: den Kampagnenaufbau im Cockpit abschließen und die Kampagne starten.');
  } else if (state.stage.kind === 'PHASE') {
    const n = state.stage.phase;
    const ph = state.phases.find((p) => p.number === n);
    if (!ph?.flags.revealed) {
      why = t('In Phase {n} sind die Befehle noch verdeckt. Schlachten entstehen im Schritt „Reveal“ aus den befohlenen Battle Operations.', { n });
      next =
        state.stage.step === 'OPS'
          ? t('Nächster Schritt: im Cockpit für jede Flotte einen Befehl erteilen und zu „{step}“ weiterschalten.', { step: t(STEP_NAMES.REVEAL) })
          : t('Nächster Schritt: im Cockpit die Operationen aufdecken.');
    } else {
      why = t('In Phase {n} wurde keine Battle Operation befohlen – es gibt keine Kämpfe auszutragen.', { n });
      next = t('Nächster Schritt: im Cockpit mit „{step}“ fortfahren.', { step: t(STEP_NAMES[state.stage.step]) });
    }
  } else {
    why = t('Diese Kampagne ist ohne erfasste Schlachten beendet.');
    next = '';
  }
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-2 py-8 text-center lg:min-h-full">
      <GameIcon name="op_BATTLE" size={44} color="#b3975f" />
      <h2 className="hud-title text-[17px]">{t('Noch keine Schlachten')}</h2>
      <p className="max-w-[52ch] text-[15px] text-dim">{why}</p>
      {next && <p className="max-w-[52ch] text-[15px] font-semibold text-ink">{next}</p>}
    </div>
  );
}
