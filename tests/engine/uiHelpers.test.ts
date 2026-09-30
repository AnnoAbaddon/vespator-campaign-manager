import { describe, expect, it } from 'vitest';
import { buildOptions } from '@/components/buildOptions';
import { decisionLabel, describeDecision } from '@/components/admin/battles/outcomeText';
import { battleKindName } from '@/components/battleName';
import { buildablePlanets } from '@/engine/phase';
import { countInfra } from '@/engine/board';
import { makeT } from '@/i18n/core';
import type { Battle } from '@/engine/types';
import { ids, startedCampaign } from './helpers';

const de = makeT('de');
const en = makeT('en');

describe('Bauformular: nur gültige Optionen (B6 / SPEC 9.11)', () => {
  it('volle Planeten und Typen am Limit fallen weg und werden benannt', () => {
    const s = startedCampaign();
    const { a, b } = ids(s);
    const cand = buildablePlanets({ state: s }, a, 1);
    const full = cand[0];
    // Planet komplett belegen (fremde Infrastruktur)
    for (const slot of s.planets.find((p) => p.id === full)!.slots) slot.infra = { type: 'FORTIFICATION_LINE', allianceId: b };
    // Staging Grounds auf das Limit (3) bringen
    for (const p of s.planets) {
      if (countInfra(s, a, 'STAGING_GROUNDS') >= 3 || p.id === full) continue;
      const free = p.slots.find((x) => !x.infra && !x.destroyed);
      if (free) free.infra = { type: 'STAGING_GROUNDS', allianceId: a };
    }
    expect(countInfra(s, a, 'STAGING_GROUNDS')).toBe(3);
    const o = buildOptions(s, a, cand);
    expect(o.planets).not.toContain(full);
    expect(o.full.length).toBeGreaterThan(0);
    expect(o.types).not.toContain('STAGING_GROUNDS');
    expect(o.atLimit.join()).toContain('Staging Grounds 3/3');
    // Auswahl eines Typs schränkt die Planeten ein (und umgekehrt)
    expect(buildOptions(s, a, cand, { type: 'FORTIFICATION_LINE' }).planets.every((p) => p !== full)).toBe(true);
  });
});

describe('Outcome-Entscheidungen lesbar (B7)', () => {
  it('Codes werden zu Namen, auch auf Englisch', () => {
    expect(decisionLabel('PURGE_AND_BURN', 'PURGE_A', de)).toBe('Purge and Burn – Angreifer siegt');
    expect(decisionLabel('SEIZE_POWER_BASE', 'SEIZE_D', de)).toBe('Seize Power Base – Verteidiger siegt');
    expect(decisionLabel('ORBITAL_INVASION', 'DRAW', de)).toBe('Unentschieden');
    expect(decisionLabel('BOARDING_ACTION', 'BOARDING_A', en)).toBe('Boarding Action – Attacker wins');
  });

  it('Entscheidungen als Klartext für die Bestätigung durch die Gegenseite', () => {
    const s = startedCampaign();
    const b = { planetId: 'masnet', operationIds: ['op1'], attackType: 'PURGE_AND_BURN' } as unknown as Battle;
    expect(describeDecision(s, b, { type: 'PURGE_D', redistributions: ['karabas'], bonusPlanetId: 'kryndaer', shift: 1 }, de)).toEqual([
      'PL des Siegers als +1 behandelt',
      'Umverteilung von Masnet nach Karabas',
      '+1 PL auf Kryndaer',
    ]);
    expect(describeDecision(s, b, { type: 'PURGE_A', shift: 0 }, de)).toEqual(['keine weiteren Entscheidungen']);
    expect(describeDecision(s, b, { type: 'SEIZE_A', captureSlot: 0, fallbackType: null, bonusType: null, shift: 0 }, de)[0]).toMatch(/^übernimmt Location 1: Fortification Line/);
  });
});

describe('Schlachtnamen (B4)', () => {
  it('Kill-Team-Gefecht heißt nicht Entscheidungsschlacht', () => {
    expect(battleKindName({ kind: 'KILL_TEAM', attackType: null }, de)).toBe('Kill-Team-Gefecht');
    expect(battleKindName({ kind: 'INTERCEPT', attackType: null }, de)).toBe('Abfanggefecht');
    expect(battleKindName({ kind: 'FINAL_TIEBREAK', attackType: null }, de)).toBe('Entscheidungsschlacht');
    expect(battleKindName({ kind: 'CAMPAIGN', attackType: 'SUPPLY_BASE_RAID' }, de)).toBe('Supply Base Raid');
  });
});
