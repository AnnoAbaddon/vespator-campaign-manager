import { describe, expect, it } from 'vitest';
import { recordingPlan } from '@/components/public/Timelapse';

describe('Zeitraffer-Video (N3.2)', () => {
  it('feste Schrittweite je Bild, Länge richtet sich nach dem Tempo', () => {
    const normal = recordingPlan(4, 1, 30);
    expect(normal.frames).toBe(4 * 2.5 * 30);
    expect(normal.posAt(0)).toBe(0);
    expect(normal.posAt(normal.frames)).toBe(4);
    expect(normal.posAt(normal.frames + 30)).toBe(4);
    expect(normal.posAt(1) - normal.posAt(0)).toBeCloseTo(normal.posAt(2) - normal.posAt(1));
    expect(recordingPlan(4, 2, 30).frames).toBe(normal.frames / 2);
    expect(recordingPlan(4, 0.5, 30).frames).toBe(normal.frames * 2);
    expect(normal.frameMs).toBeCloseTo(1000 / 30);
  });
});
