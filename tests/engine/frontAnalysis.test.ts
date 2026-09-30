import { describe, expect, it } from 'vitest';
import { startedCampaign, ids } from './helpers';
import { allianceMomentum, frontHighlights, heatmap, planetVolatility, playerActivity } from '@/components/stats/frontStats';
import { toPublicView } from '@/engine/publicView';
import type { Battle, CampaignState } from '@/engine/types';

function battle(_s: CampaignState, n: number, phase: number, planetId: string, att: string, def: string, pa: string, pd: string, victor: Battle['victor']): Battle {
  return {
    id: `b${n}`,
    phaseNumber: phase,
    kind: 'CAMPAIGN',
    operationIds: [],
    attackType: 'SEIZE_POWER_BASE',
    planetId,
    attackerAllianceId: att,
    defenderAllianceId: def,
    attackers: [{ playerId: pa, faction: '' }],
    defenders: [{ playerId: pd, faction: '' }],
    status: 'PROCESSED',
    playedAt: `2026-01-0${n}T10:00:00Z`,
    createdSeq: n,
    size: null,
    mission: { source: 'VESPATOR', externalName: '' },
    theatre: null,
    theatreChosenBy: null,
    twist: null,
    vp: { attacker: 50, defender: 40 },
    battleReady: { attacker: false, defender: false },
    victor,
    victorOverride: false,
    decisions: {},
    applied: [],
    report: '',
    photos: [],
    notes: '',
    processedOrder: null,
    unplayedResolution: null,
    postponedFrom: null,
  } as Battle;
}

function scenario() {
  const s = startedCampaign();
  const { a, b, pa, pb } = ids(s);
  s.battles = [
    battle(s, 1, 1, 'masnet', a, b, pa, pb, 'ATTACKER'),
    battle(s, 2, 1, 'masnet', a, b, pa, pb, 'ATTACKER'),
    battle(s, 3, 2, 'karabas', b, a, pb, pa, 'DEFENDER'),
    battle(s, 4, 2, 'masnet', b, a, pb, pa, 'ATTACKER'),
  ];
  const base = s.pointsHistory[0];
  const planets0 = structuredClone(base.planets!);
  const planets1 = structuredClone(planets0);
  planets1.masnet = { ...planets1.masnet, [a]: (planets1.masnet[a] ?? 0) + 2, [b]: 0 };
  const planets2 = structuredClone(planets1);
  planets2.masnet = { ...planets2.masnet, [a]: 0, [b]: 3 };
  s.pointsHistory = [base, { ...base, phaseNumber: 1, planets: planets1 }, { ...base, phaseNumber: 2, planets: planets2 }];
  s.stage = { kind: 'PHASE', phase: 2, step: 'BUILD' };
  return { s, a, b, pa, pb };
}

describe('Front-Analyse (D4)', () => {
  it('findet den volatilsten Planeten über die PL-Änderungen', () => {
    const { s } = scenario();
    const v = planetVolatility(s);
    expect(v[0].planetId).toBe('masnet');
    expect(v[0].changes).toBeGreaterThanOrEqual(3);
    expect(v[0].battles).toBe(3);
    expect(v[0].flips).toBeGreaterThanOrEqual(1);
  });

  it('aktivster Spieler und Siegesserien', () => {
    const { s, pa, pb } = scenario();
    const act = playerActivity(s);
    const A = act.find((x) => x.playerId === pa)!;
    const B = act.find((x) => x.playerId === pb)!;
    // P1: W W W (Verteidigung in b3 gewonnen) L
    expect(A.battles).toBe(4);
    expect(A.bestStreak).toBe(3);
    expect(A.current).toBe(-1);
    expect(B.current).toBe(1);
    expect(frontHighlights(s).streak?.playerId).toBe(pa);
  });

  it('Heatmap Planet × Phase und Momentum', () => {
    const { s, a, b } = scenario();
    const h = heatmap(s);
    expect(h.phases).toEqual([1, 2]);
    const masnet = h.rows.find((r) => r.planetId === 'masnet')!;
    expect(masnet.cells.map((c) => c.battles)).toEqual([2, 1]);
    expect(masnet.cells[0].swing).toBeGreaterThan(0);
    const m = allianceMomentum(s);
    expect(m[0].net[a]).toBe(2);
    expect(m[0].net[b]).toBe(-2);
    expect(m[1].net[a]).toBe(0);
    expect(m[1].momentum[a]).toBe(2);
  });

  it('respektiert den Nebel: ohne Punkteverlauf nur Schlachten', () => {
    const { s } = scenario();
    s.toggles.fog = true;
    const pub = toPublicView(s);
    expect(pub.pointsHistory).toEqual([]);
    const hl = frontHighlights(pub);
    expect(hl.hasHistory).toBe(false);
    expect(hl.volatile?.planetId).toBe('masnet');
    expect(heatmap(pub).rows[0].cells.every((c) => c.swing === null)).toBe(true);
  });
});
