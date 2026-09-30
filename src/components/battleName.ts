import { ATTACK_TYPES } from '@/engine/data/vespator';
import type { Battle } from '@/engine/types';
import type { T } from '@/i18n/core';

/** Name einer Schlacht ohne Planet: Angriffsart, Kill-Team-Gefecht, Abfanggefecht oder Entscheidungsschlacht */
export function battleKindName(b: Pick<Battle, 'attackType' | 'kind'>, t: T): string {
  if (b.attackType) return ATTACK_TYPES[b.attackType].name;
  if (b.kind === 'KILL_TEAM') return t('Kill-Team-Gefecht');
  if (b.kind === 'INTERCEPT') return t('Abfanggefecht');
  return t('Entscheidungsschlacht');
}
