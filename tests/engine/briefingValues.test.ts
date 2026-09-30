import { describe, expect, it } from 'vitest';
import { shiftRange, shiftedValue } from '@/components/public/briefingValues';
import type { CampaignState } from '@/engine/types';

const st = (stack: boolean) => ({ toggles: { houseRules: stack ? { F15_TREAT_STACKS: true } : {} } }) as unknown as Pick<CampaignState, 'toggles'>;

describe('Briefing: Mission-Werte mit Hausregel F-15', () => {
  it('Standard: höchstens ±1, egal wie viele Quellen', () => {
    expect(shiftRange(st(false), 0)).toBe(0);
    expect(shiftRange(st(false), 2)).toBe(1);
    expect(shiftedValue((x) => x, 3, 1)).toBe('3 (−1: 2 / +1: 4)');
  });
  it('F-15 „Quellen stapeln“: ±1 je Quelle', () => {
    expect(shiftRange(st(true), 2)).toBe(2);
    expect(shiftedValue((x) => Math.max(0, x), 1, 2)).toBe('1 (−2: 0 / −1: 0 / +1: 2 / +2: 3)');
  });
  it('ohne Quelle nur der echte Wert', () => {
    expect(shiftedValue((x) => x, 3, 0)).toBe('3');
  });
});
