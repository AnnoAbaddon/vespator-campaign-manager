import { describe, expect, it } from 'vitest';
import { groupBattles } from '@/components/public/presentGroups';
import type { Battle, CampaignState } from '@/engine/types';

const battle = (id: string, over: Partial<Battle> = {}): Battle => ({ id, kind: 'CAMPAIGN', status: 'SCHEDULED', vp: null, createdSeq: Number(id.slice(1)), scheduledAt: null, ...over }) as Battle;

const state = (battles: Battle[]) => ({ battles, meta: { timezone: 'Europe/Berlin' } }) as unknown as Pick<CampaignState, 'battles' | 'meta'>;

describe('Präsentationsmodus: Schlachten gruppieren (N3.3)', () => {
  const now = Date.parse('2026-09-28T10:00:00Z'); // 12:00 in Berlin
  it('läuft / heute / als Nächstes, inklusive Entscheidungsschlacht und ohne Obergrenze', () => {
    const list = [
      battle('b1', { scheduledAt: '2026-09-28T09:00:00Z' }), // läuft seit 1 h
      battle('b2', { scheduledAt: '2026-09-28T18:00:00Z' }), // heute Abend
      battle('b3', { scheduledAt: '2026-09-28T22:30:00Z' }), // 00:30 Berlin → morgen
      battle('b4', { kind: 'FINAL_TIEBREAK', scheduledAt: '2026-10-01T17:00:00Z' }),
      battle('b5'),
      battle('b6', { vp: { attacker: 1, defender: 0 } }), // hat Ergebnis
      battle('b7', { status: 'PROCESSED' }),
      ...Array.from({ length: 8 }, (_, i) => battle(`b${10 + i}`)),
    ];
    const g = groupBattles(state(list), now);
    expect(g.running.map((b) => b.id)).toEqual(['b1']);
    expect(g.today.map((b) => b.id)).toEqual(['b2']);
    expect(g.next.map((b) => b.id).slice(0, 3)).toEqual(['b3', 'b4', 'b5']);
    expect(g.next).toHaveLength(3 + 8);
  });
  it('ohne Uhrzeit (Server-Render) steht alles unter „als Nächstes“', () => {
    const g = groupBattles(state([battle('b1', { scheduledAt: '2026-09-28T09:00:00Z' }), battle('b2')]), null);
    expect(g.running).toHaveLength(0);
    expect(g.next.map((b) => b.id)).toEqual(['b1', 'b2']);
  });
});
