import { describe, expect, it } from 'vitest';
import { dispatchPhase, dispatchesByPhase } from '@/components/public/codexUtil';
import type { CampaignState, Dispatch } from '@/engine/types';

const phases = [
  { number: 1, startDate: '2026-01-01T00:00:00Z' },
  { number: 2, startDate: '2026-02-01T00:00:00Z' },
  { number: 3, startDate: null },
];

describe('Codex: Dispatches je Phase (N3.1)', () => {
  it('ordnet nach Startdatum der Phasen zu', () => {
    expect(dispatchPhase(phases, '2025-12-24T12:00:00Z')).toBeNull();
    expect(dispatchPhase(phases, '2026-01-01T00:00:00Z')).toBe(1);
    expect(dispatchPhase(phases, '2026-01-31T23:00:00Z')).toBe(1);
    expect(dispatchPhase(phases, '2026-03-15T00:00:00Z')).toBe(2);
    expect(dispatchPhase(phases, 'kein Datum')).toBeNull();
  });
  it('gruppiert chronologisch, Unzuordenbares unter 0', () => {
    const d = (id: string, at: string) => ({ id, at, title: id, body: '', pinned: false, public: true }) as Dispatch;
    const m = dispatchesByPhase({ phases, dispatches: [d('c', '2026-02-03T00:00:00Z'), d('a', '2025-12-01T00:00:00Z'), d('b', '2026-02-02T00:00:00Z')] } as unknown as Pick<CampaignState, 'phases' | 'dispatches'>);
    expect(m.get(0)?.map((x) => x.id)).toEqual(['a']);
    expect(m.get(2)?.map((x) => x.id)).toEqual(['b', 'c']);
    expect(m.has(1)).toBe(false);
  });
});
