import { describe, expect, it } from 'vitest';
import { ids, run, startedCampaign, tryRun } from './helpers';
import { authorizePlayer } from '@/engine/playerActions';
import { battleAwards, openAllocations, planetTraits, rankOf, rosterExport, unitXp } from '@/engine/crusade';
import { toPublicView } from '@/engine/publicView';
import type { Battle, CampaignState } from '@/engine/types';

function withBattle(s: CampaignState, victor: Battle['victor'], status: Battle['status'] = 'PROCESSED'): CampaignState {
  const { a, b, pa, pb } = ids(s);
  s.battles.push({
    id: 'bx',
    phaseNumber: 1,
    kind: 'CAMPAIGN',
    operationIds: [],
    attackType: 'SEIZE_POWER_BASE',
    planetId: 'masnet',
    attackerAllianceId: a,
    defenderAllianceId: b,
    attackers: [{ playerId: pa, faction: '' }],
    defenders: [{ playerId: pb, faction: '' }],
    status,
    playedAt: null,
    createdSeq: 1,
    size: null,
    mission: { source: 'VESPATOR', externalName: '' },
    theatre: null,
    theatreChosenBy: null,
    twist: null,
    vp: { attacker: 60, defender: 40 },
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
  return s;
}

function setup() {
  let s = startedCampaign();
  const { pa } = ids(s);
  s = run(s, { type: 'CRUSADE_RULES_SET', rules: { enabled: true, xpParticipation: 1, xpWin: 1, xpMarked: 3 } });
  s = run(s, { type: 'CRUSADE_ROSTER_SET', playerId: pa, roster: { name: 'Waaagh Grukk', faction: 'Orks', supplyLimit: 1000, requisition: 5, notes: '' } });
  s = run(s, { type: 'CRUSADE_UNIT_UPSERT', playerId: pa, unit: { name: 'Boyz', kind: 'Troops', points: 170, xpStart: 4, honours: [], scars: [], notes: '' } });
  s = run(s, { type: 'CRUSADE_UNIT_UPSERT', playerId: pa, unit: { name: 'Warboss', kind: 'Character', points: 75, xpStart: 0, honours: ['Brutal'], scars: [], notes: '' } });
  return s;
}

describe('Crusade-Anbindung (NTH2 3.2)', () => {
  it('Ränge nach XP-Schwellen', () => {
    expect(rankOf(0)).toBe('Battle-ready');
    expect(rankOf(6)).toBe('Blooded');
    expect(rankOf(16)).toBe('Battle-hardened');
    expect(rankOf(31)).toBe('Heroic');
    expect(rankOf(51)).toBe('Legendary');
  });

  it('vergibt XP je Schlacht: Teilnahme, Sieg, Marked for Greatness', () => {
    let s = withBattle(setup(), 'ATTACKER');
    const { pa } = ids(s);
    const me = () => s.players.find((p) => p.id === pa)!;
    expect(openAllocations(s, me())).toHaveLength(1);
    const [boyz, boss] = me().crusade!.units;
    s = run(s, { type: 'CRUSADE_BATTLE_UNITS', playerId: pa, battleId: 'bx', units: [boyz.id, boss.id], marked: boss.id });
    expect(openAllocations(s, me())).toHaveLength(0);
    expect(unitXp(s, me(), me().crusade!.units[0]).total).toBe(4 + 2);
    expect(unitXp(s, me(), me().crusade!.units[1]).total).toBe(2 + 3);
    expect(unitXp(s, me(), me().crusade!.units[0]).rank).toBe('Blooded');
  });

  it('Niederlage: nur Teilnahme; ungespielt gewertete Schlachten zählen nicht', () => {
    const s = withBattle(setup(), 'DEFENDER');
    const { pa } = ids(s);
    const me = s.players.find((p) => p.id === pa)!;
    expect(battleAwards(s, me)[0]).toMatchObject({ result: 'LOSS', perUnit: 1 });
    const s2 = withBattle(setup(), 'ATTACKER', 'UNPLAYED_RESOLVED');
    expect(
      battleAwards(
        s2,
        s2.players.find((p) => p.id === pa)!,
      ),
    ).toHaveLength(0);
  });

  it('Warmaster korrigiert XP mit Begründung', () => {
    let s = setup();
    const { pa } = ids(s);
    const u = s.players.find((p) => p.id === pa)!.crusade!.units[0];
    expect(tryRun(s, { type: 'CRUSADE_XP_ADJUST', playerId: pa, unitId: u.id, delta: 2, reason: ' ' }).ok).toBe(false);
    s = run(s, { type: 'CRUSADE_XP_ADJUST', playerId: pa, unitId: u.id, delta: -3, reason: 'Doppelt gezählt' });
    const me = s.players.find((p) => p.id === pa)!;
    expect(unitXp(s, me, me.crusade!.units[0]).total).toBe(1);
    expect(me.crusade!.adjustments).toHaveLength(1);
  });

  it('Rechte über den Spielerlink: nur eigene Order of Battle, nur wenn eingeschaltet, keine XP-Korrektur', () => {
    const s = setup();
    const { pa, pb } = ids(s);
    const A = s.players.find((p) => p.id === pa)!;
    const unit = { name: 'X', kind: '', points: 10, xpStart: 0, honours: [], scars: [], notes: '' };
    expect(authorizePlayer(s, A, { type: 'CRUSADE_UNIT_UPSERT', playerId: pa, unit })).toBeNull();
    expect(authorizePlayer(s, A, { type: 'CRUSADE_UNIT_UPSERT', playerId: pb, unit })).not.toBeNull();
    expect(authorizePlayer(s, A, { type: 'CRUSADE_XP_ADJUST', playerId: pa, unitId: 'x', delta: 5, reason: 'x' })).not.toBeNull();
    const off = run(s, { type: 'CRUSADE_RULES_SET', rules: { enabled: false } });
    expect(authorizePlayer(off, A, { type: 'CRUSADE_UNIT_UPSERT', playerId: pa, unit })).not.toBeNull();
  });

  it('Eingesetzte Einheiten müssen zur Order of Battle gehören, Marked muss eingesetzt sein', () => {
    const s = withBattle(setup(), 'ATTACKER');
    const { pa, pc } = ids(s);
    const [u] = s.players.find((p) => p.id === pa)!.crusade!.units;
    expect(tryRun(s, { type: 'CRUSADE_BATTLE_UNITS', playerId: pa, battleId: 'bx', units: ['fremd'], marked: null }).ok).toBe(false);
    expect(tryRun(s, { type: 'CRUSADE_BATTLE_UNITS', playerId: pa, battleId: 'bx', units: [], marked: u.id }).ok).toBe(false);
    const s2 = run(s, { type: 'CRUSADE_ROSTER_SET', playerId: pc, roster: { name: 'T', faction: '', supplyLimit: 500, requisition: 5, notes: '' } });
    expect(tryRun(s2, { type: 'CRUSADE_BATTLE_UNITS', playerId: pc, battleId: 'bx', units: [], marked: null }).ok).toBe(false);
  });

  it('Export der Order of Battle mit berechneten XP', () => {
    let s = withBattle(setup(), 'ATTACKER');
    const { pa } = ids(s);
    const [boyz] = s.players.find((p) => p.id === pa)!.crusade!.units;
    s = run(s, { type: 'CRUSADE_BATTLE_UNITS', playerId: pa, battleId: 'bx', units: [boyz.id], marked: null });
    const ex = rosterExport(
      s,
      s.players.find((p) => p.id === pa)!,
    )!;
    expect(ex.orderOfBattle.supplyUsed).toBe(245);
    expect(ex.orderOfBattle.units[0]).toMatchObject({ name: 'Boyz', xp: 6, rank: 'Blooded' });
    expect(ex.battles[0]).toMatchObject({ result: 'WIN', units: ['Boyz'] });
  });
});

describe('Planeten-Merkmale (A9)', () => {
  it('setzt, begrenzt und entfernt Merkmale; öffentlich sichtbar', () => {
    let s = startedCampaign();
    s = run(s, {
      type: 'PLANET_TRAITS_SET',
      planetId: 'masnet',
      traits: [
        { keyword: 'Industriewelt', effect: '+1 Requisition bei Sieg' },
        { keyword: ' ', effect: 'leer' },
      ],
    });
    expect(planetTraits(s, 'masnet')).toMatchObject([{ keyword: 'Industriewelt', effect: '+1 Requisition bei Sieg' }]);
    expect(planetTraits(toPublicView(s), 'masnet')).toHaveLength(1);
    expect(tryRun(s, { type: 'PLANET_TRAITS_SET', planetId: 'gibtsnicht', traits: [] }).ok).toBe(false);
    const nine = Array.from({ length: 9 }, (_, i) => ({ keyword: `K${i}`, effect: '' }));
    expect(tryRun(s, { type: 'PLANET_TRAITS_SET', planetId: 'masnet', traits: nine }).ok).toBe(false);
    s = run(s, { type: 'PLANET_TRAITS_SET', planetId: 'masnet', traits: [] });
    expect(planetTraits(s, 'masnet')).toEqual([]);
  });
});
