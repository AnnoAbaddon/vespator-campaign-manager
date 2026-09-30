'use client';

import { ATTACK_TYPES } from '@/engine/data/vespator';
import { effectiveVictor } from '@/engine/outcomes';
import type { Battle, BattleStatus, CampaignState } from '@/engine/types';
import { AllianceTag, planetName } from '@/components/ui';
import { useT } from '@/i18n/client';
import type { T } from '@/i18n/core';
import { guestsOf } from '@/engine/guests';

// Standard ohne Übersetzung (deutsche Texte mit eingesetzten Platzhaltern)
const deT: T = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : text);

export const STATUS_LABEL: Record<BattleStatus, string> = {
  SCHEDULED: 'angesetzt',
  PLAYED: 'gespielt',
  UNPLAYED_RESOLVED: 'ungespielt gewertet',
  VOID: 'verfallen',
  PROCESSED: 'verarbeitet',
};

export const STATUS_CLASS: Record<BattleStatus, string> = {
  SCHEDULED: 'border-warn text-warn',
  PLAYED: 'border-accent text-accent',
  UNPLAYED_RESOLVED: 'border-warn text-warn',
  VOID: 'text-faint',
  PROCESSED: 'border-ok text-ok',
};

export function StatusChip({ status }: { status: BattleStatus }) {
  const t = useT();
  return <span className={`chip ${STATUS_CLASS[status]}`}>{t(STATUS_LABEL[status])}</span>;
}

export function battleTitle(b: Battle, t: T = deT) {
  if (b.kind === 'FINAL_TIEBREAK') return t('Entscheidungsschlacht');
  if (b.kind === 'KILL_TEAM') return t('Kill-Team-Gefecht · {planet}', { planet: planetName(b.planetId) });
  if (b.kind === 'INTERCEPT') return t('Abfanggefecht · {planet}', { planet: planetName(b.planetId) });
  return `${b.attackType ? ATTACK_TYPES[b.attackType].name : t('Schlacht')} · ${planetName(b.planetId)}`;
}

export function victorLabel(state: CampaignState, b: Battle, t: T = deT) {
  const v = effectiveVictor(b);
  if (!v) return '–';
  if (v === 'DRAW') return t('Unentschieden');
  const id = v === 'ATTACKER' ? b.attackerAllianceId : b.defenderAllianceId;
  const name = state.alliances.find((a) => a.id === id)?.name ?? '?';
  // B1: per W6-Duell entschieden
  if (b.unplayedRoll) return t('{name} siegt (ausgewürfelt {a}:{d})', { name, a: b.unplayedRoll.attacker, d: b.unplayedRoll.defender });
  return b.unplayedResolution ? t('{name} siegt (ungespielt)', { name }) : t('{name} siegt', { name });
}

export function playerNames(state: CampaignState, list: { playerId: string }[]) {
  return list.map((p) => state.players.find((x) => x.id === p.playerId)?.nickname ?? '?').join(', ') || '–';
}

export function BattleSides({ state, b }: { state: CampaignState; b: Battle }) {
  const t = useT();
  const al = (id: string) => state.alliances.find((a) => a.id === id);
  // B3: Gastspieler hinter den Spielern
  const names = (side: 'ATTACKER' | 'DEFENDER') =>
    [playerNames(state, side === 'ATTACKER' ? b.attackers : b.defenders), ...guestsOf(b, side).map((g) => `${g.name} (${t('Gast')})`)].filter((x) => x !== '–').join(', ') || '–';
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <AllianceTag alliance={al(b.attackerAllianceId)} />
      <span className="text-faint">({names('ATTACKER')})</span>
      <span className="text-faint">vs.</span>
      <AllianceTag alliance={al(b.defenderAllianceId)} />
      <span className="text-faint">({names('DEFENDER')})</span>
    </span>
  );
}

export function vpText(b: Battle) {
  if (!b.vp) return '';
  const a = b.vp.attacker + (b.battleReady.attacker ? 10 : 0);
  const d = b.vp.defender + (b.battleReady.defender ? 10 : 0);
  return `${a} : ${d} VP`;
}
