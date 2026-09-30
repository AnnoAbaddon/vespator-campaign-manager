import { describe, expect, it } from 'vitest';
import { startedCampaign, ids } from '../engine/helpers';
import { cleanConfig, emptySeason, identityKey, seasonStandings, type SeasonCampaign } from '@/server/leagueCompute';
import type { Battle, CampaignState } from '@/engine/types';

function addBattle(s: CampaignState, id: string, att: string, def: string, pa: string, pd: string, victor: Battle['victor']) {
  s.battles.push({
    id,
    phaseNumber: 1,
    kind: 'CAMPAIGN',
    operationIds: [],
    attackType: 'SEIZE_POWER_BASE',
    planetId: 'masnet',
    attackerAllianceId: att,
    defenderAllianceId: def,
    attackers: [{ playerId: pa, faction: '' }],
    defenders: [{ playerId: pd, faction: '' }],
    status: 'PROCESSED',
    playedAt: null,
    createdSeq: 1,
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
  });
}

function campaigns(): SeasonCampaign[] {
  const s1 = startedCampaign();
  const i1 = ids(s1);
  addBattle(s1, 'b1', i1.a, i1.b, i1.pa, i1.pb, 'ATTACKER');
  s1.medals = [{ medal: 'STAR', allianceId: i1.a, playerIds: [i1.pa], value: null, note: '' }];
  s1.stage = { kind: 'ENDED' };
  s1.result = { winnerAllianceId: i1.a, tiebreak: 'NONE', tied: [] };
  const s2 = startedCampaign();
  const i2 = ids(s2);
  // P1 heißt in Kampagne 2 anders geschrieben, P2 ist gleich
  s2.players.find((p) => p.id === i2.pa)!.nickname = '  p1 ';
  addBattle(s2, 'b2', i2.b, i2.a, i2.pb, i2.pa, 'DRAW');
  return [
    { id: 'c1', name: 'Kampagne 1', state: s1 },
    { id: 'c2', name: 'Kampagne 2', state: s2 },
  ];
}

describe('Liga (NTH2 3.1)', () => {
  it('Identität über den Nickname (Groß-/Kleinschreibung, Leerzeichen egal)', () => {
    expect(identityKey('  Grukk  der  Große ')).toBe('grukk der große');
  });

  it('Rangliste über Kampagnen mit konfigurierbaren Punkten', () => {
    const cs = campaigns();
    const season = { ...emptySeason(), campaignIds: ['c1', 'c2'] };
    const st = seasonStandings(season, cs);
    const p1 = st.find((x) => x.key === 'p1')!;
    expect(p1.campaigns).toBe(2);
    expect(p1.wins).toBe(1);
    expect(p1.draws).toBe(1);
    expect(p1.medals).toBe(1);
    expect(p1.campaignWins).toBe(1);
    // 3 (Sieg) + 1 (Unentschieden) + 2×2 (Teilnahme) + 2 (Medaille) + 5 (Kampagnensieg)
    expect(p1.points).toBe(15);
    expect(st[0].key).toBe('p1');
    expect(p1.cabinet.map((c) => c.kind).sort()).toEqual(['MEDAL', 'WIN']);
  });

  it('Admin-Zuordnung trennt oder führt zusammen, Anzeigename überschreibbar', () => {
    const cs = campaigns();
    const pa2 = ids(cs[1].state).pa;
    const split = seasonStandings({ ...emptySeason(), identity: { [`c2:${pa2}`]: 'p1-neu' } }, cs);
    expect(split.find((x) => x.key === 'p1')!.campaigns).toBe(1);
    expect(split.find((x) => x.key === 'p1-neu')!.campaigns).toBe(1);
    const pc2 = ids(cs[1].state).pc;
    const merged = seasonStandings({ ...emptySeason(), identity: { [`c2:${pc2}`]: 'p1' }, names: { p1: 'Grukk' } }, cs);
    const p1 = merged.find((x) => x.key === 'p1')!;
    expect(p1.name).toBe('Grukk');
    expect(p1.members).toHaveLength(3);
    expect(p1.campaigns).toBe(2);
  });

  it('Konfiguration wird begrenzt', () => {
    expect(cleanConfig({ win: 999, draw: -99, loss: Number.NaN })).toMatchObject({ win: 50, draw: -10, loss: 0 });
  });
});
