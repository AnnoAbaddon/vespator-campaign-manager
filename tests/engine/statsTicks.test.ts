import { describe, expect, it } from 'vitest';
import { niceTicks, seriesMax } from '@/components/stats/compute';

describe('Statistik: gleichmäßige Achsenwerte', () => {
  it('liefert gleiche Abstände ab 0 mit runder Schrittweite', () => {
    expect(niceTicks(29)).toEqual([0, 8, 16, 24, 32]);
    expect(niceTicks(40)).toEqual([0, 10, 20, 30, 40]);
    expect(niceTicks(3)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(55)).toEqual([0, 20, 40, 60]);
  });
  it('der letzte Wert deckt das Maximum ab, alle Abstände sind gleich', () => {
    for (const max of [1, 7, 12, 29, 33, 48, 61, 99, 150]) {
      const ticks = niceTicks(max);
      expect(ticks[0]).toBe(0);
      expect(ticks.at(-1)!).toBeGreaterThanOrEqual(max);
      const steps = new Set(ticks.slice(1).map((v, i) => v - ticks[i]));
      expect(steps.size, `max ${max}`).toBe(1);
      expect(ticks.length).toBeLessThanOrEqual(7);
    }
  });
  it('größter Wert über alle Allianzen und Stände (gleiche Werte werden nicht verschoben)', () => {
    const series = [
      { phase: 'Start', a: 29, b: 29, c: 29 },
      { phase: 'P1', a: 31, b: 29, c: 27 },
    ];
    expect(seriesMax(series, ['a', 'b', 'c'])).toBe(31);
    expect(seriesMax([], ['a'])).toBe(0);
  });
});
