import { describe, expect, it } from 'vitest';
import { makeCtx } from '@/engine/ctx';
import { awardAutoHonors, playerRecord } from '@/engine/commanders';
import type { Battle, CampaignState, PhaseStep } from '@/engine/types';
import { ids, run, slotsOf, startedCampaign, tryRun } from './helpers';

function toStep(s: CampaignState, step: PhaseStep): CampaignState {
  for (let i = 0; i < 20 && !(s.stage.kind === 'PHASE' && s.stage.step === step); i++) s = run(s, { type: 'ADVANCE' });
  return s;
}

/** Fertig verarbeitete Schlacht (nur für die Ehrungs-Auswertung) */
function fake(s: CampaignState, n: number, att: string, def: string, vp: [number, number]): Battle {
  const i = ids(s);
  return {
    ...structuredClone(s.battles[0] ?? ({} as Battle)),
    id: `fake${n}`,
    phaseNumber: 1,
    kind: 'CAMPAIGN',
    operationIds: [],
    attackType: 'PURGE_AND_BURN',
    planetId: 'caltus-novem',
    attackerAllianceId: i.a,
    defenderAllianceId: i.c,
    attackers: [{ playerId: att, faction: '' }],
    defenders: [{ playerId: def, faction: '' }],
    status: 'PROCESSED',
    playedAt: `2026-01-${String(10 + n).padStart(2, '0')}T18:00:00Z`,
    createdSeq: 100 + n,
    size: null,
    mission: { source: 'VESPATOR', externalName: '' },
    theatre: null,
    theatreChosenBy: null,
    twist: null,
    vp: { attacker: vp[0], defender: vp[1] },
    battleReady: { attacker: false, defender: false },
    victor: vp[0] > vp[1] ? 'ATTACKER' : vp[0] < vp[1] ? 'DEFENDER' : 'DRAW',
    victorOverride: false,
    decisions: {},
    applied: [],
    report: '',
    photos: [],
    notes: '',
    processedOrder: n,
    unplayedResolution: null,
    postponedFrom: null,
  };
}

describe('Kommandanten (N3.4)', () => {
  it('Kommandant, Ehrungen und Narben pflegen', () => {
    let s = startedCampaign();
    const { pa, pb } = ids(s);
    s = run(s, { type: 'COMMANDER_UPDATE', playerId: pa, name: 'Kargan', title: 'Lord-Castellan', portrait: null });
    s = run(s, { type: 'MARK_ADD', kind: 'HONOR', playerId: pa, title: 'Held von Karabas', reason: 'hielt die Linie', phase: 1, battleId: null });
    s = run(s, { type: 'MARK_ADD', kind: 'SCAR', playerId: pa, title: 'Augenklappe', reason: '', phase: 1, battleId: null });
    const p = s.players.find((x) => x.id === pa)!;
    expect(p.commander).toEqual({ name: 'Kargan', title: 'Lord-Castellan', portrait: null });
    expect(p.honors?.map((h) => h.title)).toEqual(['Held von Karabas']);
    expect(p.scars?.map((h) => h.title)).toEqual(['Augenklappe']);
    expect(tryRun(s, { type: 'MARK_ADD', kind: 'HONOR', playerId: pb, title: '', reason: '', phase: null, battleId: null }).ok).toBe(false);
    s = run(s, { type: 'MARK_REMOVE', kind: 'SCAR', playerId: pa, id: p.scars![0].id });
    expect(s.players.find((x) => x.id === pa)!.scars).toEqual([]);
  });

  it('automatisch: Siegesserie, Bollwerk, Veteran – entfernte kommen nicht wieder', () => {
    const s = startedCampaign();
    const { pa, pc } = ids(s);
    // A (pa) gewinnt 3× als Angreifer gegen pc, dann 7 Niederlagen → 10 Schlachten
    const list: Battle[] = [];
    for (let n = 0; n < 3; n++) list.push(fake(s, n, pa, pc, [60, 40]));
    for (let n = 3; n < 10; n++) list.push(fake(s, n, pa, pc, [30, 50]));
    s.battles = list;
    const ctx = makeCtx(s, { mode: 'DIGITAL', manual: [], random: () => 4 });
    awardAutoHonors(ctx);
    const a = s.players.find((x) => x.id === pa)!;
    const c = s.players.find((x) => x.id === pc)!;
    expect(a.honors?.map((h) => h.auto).sort()).toEqual(['STREAK', 'VETERAN']);
    // pc hat 7× als Verteidiger gewonnen
    // pc hat 7× in Folge als Verteidiger gewonnen
    expect(c.honors?.map((h) => h.auto).sort()).toEqual(['BULWARK', 'STREAK', 'VETERAN']);
    expect(playerRecord(s, pa).map((r) => r.result).join('')).toBe('WWWLLLLLLL');
    // Entfernen unterdrückt die erneute Vergabe
    const s2 = run(s, { type: 'MARK_REMOVE', kind: 'HONOR', playerId: pa, id: a.honors!.find((h) => h.auto === 'STREAK')!.id });
    const ctx2 = makeCtx(s2, { mode: 'DIGITAL', manual: [], random: () => 4 });
    awardAutoHonors(ctx2);
    expect(s2.players.find((x) => x.id === pa)!.honors?.some((h) => h.auto === 'STREAK')).toBe(false);
  });

  it('Weltenbrecher bei zerstörter Location durch die Siegerseite', () => {
    let s = startedCampaign();
    const { fa, c, pa } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PLANETARY_BOMBARDMENT', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
    s = toStep(s, 'REVEAL');
    s = run(s, { type: 'REVEAL_OPS' });
    s = toStep(s, 'BATTLES');
    const b = s.battles[0];
    s = run(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { playedAt: '2026-01-05T18:00:00Z', vp: { attacker: 60, defender: 20 } } });
    s = toStep(s, 'PROCESS');
    const free = slotsOf(s, 'caltus-novem').findIndex((x) => !x.infra && !x.destroyed);
    s = run(s, { type: 'BATTLE_DECISION', battleId: b.id, opId: b.operationIds[0], decision: { type: 'BOMBARD_A', slot: free, roll: null, shift: 0 } });
    s = run(s, { type: 'BATTLE_PROCESS', battleId: b.id }, [5]);
    expect(slotsOf(s, 'caltus-novem')[free].destroyed).toBe(true);
    expect(s.players.find((x) => x.id === pa)!.honors?.some((h) => h.auto === 'WORLDBREAKER')).toBe(true);
  });
});
