'use client';

import { useState } from 'react';
import { recommendedFleets } from '@/engine/data/vespator';
import type { CampaignState } from '@/engine/types';
import { playersOfAlliance } from '@/engine/players';
import { useCmd } from '../CommandProvider';
import { useT } from '@/i18n/client';

export function suggestedFleets(state: CampaignState, allianceId: string): number {
  const total = state.players.filter((p) => p.active).length;
  const r = recommendedFleets(total, state.meta.allianceCount);
  return r > 0 ? r : Math.max(1, playersOfAlliance(state, allianceId).length);
}

/** Flottenzahl einer Allianz setzen, mit Vorschlag nach Regel */
export function FleetCountControl({ allianceId }: { allianceId: string }) {
  const { state, run, busy } = useCmd();
  const current = state.fleets.filter((f) => f.allianceId === allianceId && !f.reserve).length;
  const [n, setN] = useState(current || suggestedFleets(state, allianceId));
  const t = useT();
  const sug = suggestedFleets(state, allianceId);
  const players = playersOfAlliance(state, allianceId).length;
  const inSetup = state.stage.kind === 'SETUP' && ['W0', 'W1', 'W2', 'W3'].includes(state.stage.step);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-20" type="number" min={1} max={20} value={n} onChange={(e) => setN(Number(e.target.value))} aria-label={t('Flottenzahl')} />
        <button type="button" className="btn btn-sm" disabled={busy || n === current} onClick={() => run({ type: 'FLEET_SET_COUNT', allianceId, count: n })}>
          {t('Flotten setzen')}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setN(sug)} title={t('Empfehlung nach Regel (Recommended Force Allocation)')}>
          {t('Vorschlag: {n}', { n: sug })}
        </button>
        <span className="chip">{t('aktuell {n}', { n: current })}</span>
      </div>
      {players > Math.max(current, 0) && current > 0 && <p className="notice">{t('Mehr Spieler ({players}) als Flotten ({current}) – jeder Spieler braucht mindestens eine Flotte.', { players, current })}</p>}
      {!inSetup && <p className="notice">{t('Achtung: Die Flottenzahl wird außerhalb des Setups geändert. Neue Flotten danach in der Tabelle unten „platzieren“.')}</p>}
    </div>
  );
}

/** Reserveflotten (N2.5): inaktiv, ohne Position; Aktivierung in der Flottentabelle */
export function ReserveControl({ allianceId }: { allianceId: string }) {
  const { state, run, busy } = useCmd();
  const waiting = state.fleets.filter((f) => f.allianceId === allianceId && f.reserve).length;
  const [n, setN] = useState(waiting);
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2 text-[15px]">
      <span className="text-dim">{t('Reserveflotten')}</span>
      <input className="input w-20" type="number" min={0} max={10} value={n} onChange={(e) => setN(Number(e.target.value))} aria-label={t('Zahl der Reserveflotten')} />
      <button type="button" className="btn btn-sm" disabled={busy || n === waiting} onClick={() => run({ type: 'FLEET_RESERVE_SET', allianceId, count: n })}>
        {t('Setzen')}
      </button>
      <span className="chip">{t('wartend {n}', { n: waiting })}</span>
    </div>
  );
}

/** Planeten, auf denen eine Reserveflotte erscheinen darf: eigene Flotte oder eigener Stronghold */
export function reserveTargets(state: CampaignState, allianceId: string): string[] {
  return state.planets
    .filter((p) => !p.destroyed)
    .filter((p) => state.fleets.some((f) => f.allianceId === allianceId && !f.reserve && f.planetId === p.id) || p.slots.some((s) => !s.destroyed && s.infra?.type === 'STRONGHOLD' && s.infra.allianceId === allianceId))
    .map((p) => p.id);
}
