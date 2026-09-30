import { describe, expect, it } from 'vitest';
import { toPlayerView, toPublicView } from '@/engine/publicView';
import type { Battle, CampaignState, Operation } from '@/engine/types';
import { ids, run, startedCampaign } from './helpers';
import { oldPublicView } from './publicViewOracle';

/**
 * Architektur-Review S3: öffentliche Projektion und Spielersicht als Allowlist.
 * 1. Markierungswerte in jedem privaten Feld dürfen weder in der Leseansicht noch in der Sicht einer anderen Allianz
 *    auftauchen (Regressionstest gegen neue Felder, die bisher automatisch öffentlich wurden).
 * 2. Für Vespator-Kampagnen liefert die neue Projektion dasselbe wie die frühere (Orakel) – inklusive Nebel.
 */

const AT = '2026-01-02T10:00:00.000Z';
const M = (tag: string) => `CANARY_${tag}`;

function battle(id: string, att: string, def: string, extra: Partial<Battle>): Battle {
  return {
    id,
    phaseNumber: 1,
    kind: 'CAMPAIGN',
    operationIds: [],
    attackType: null,
    planetId: 'masnet',
    attackerAllianceId: att,
    defenderAllianceId: def,
    attackers: [],
    defenders: [],
    status: 'SCHEDULED',
    playedAt: null,
    createdSeq: 1,
    size: null,
    mission: { source: 'EXTERNAL', externalName: '' },
    theatre: null,
    theatreChosenBy: null,
    twist: null,
    vp: null,
    battleReady: { attacker: false, defender: false },
    victor: null,
    victorOverride: false,
    decisions: {},
    applied: [],
    report: '',
    photos: [],
    notes: '',
    processedOrder: null,
    unplayedResolution: null,
    postponedFrom: null,
    ...extra,
  };
}

const op = (id: string, fleetId: string, allianceId: string, note: string): Operation => ({
  id,
  fleetId,
  allianceId,
  slot: 1,
  type: 'BATTLE',
  targetPlanetId: 'masnet',
  originPlanetId: 'kryndaer',
  isDefault: false,
  revealed: false,
  status: 'PLANNED',
  note,
});

/**
 * Stand mit Markierungen: GM_ (nur Warmaster), X_ (andere Spieler), A_ (Allianz A), B_ (Allianz B, sichtbar für den
 * Spieler aus B), SELF_ (der Spieler aus B selbst).
 */
function planted() {
  const s = startedCampaign();
  const { a, b, c, fa, fb, pa, pb } = ids(s);
  for (const p of s.players) {
    const t = p.id === pb ? 'SELF' : 'X';
    p.email = `${M(`${t}_MAIL`)}@example.org`;
    p.discord = M(`${t}_DISCORD`);
    p.realName = M(`${t}_REAL`);
    p.notes = M(`${t}_NOTES`);
    p.notify = { PHASE: false };
    p.absences = [2];
    p.goals = [{ id: `g-${p.id}`, goalId: null, title: M(`${t}_GOAL`), text: M(`${t}_GOALTEXT`), status: 'OPEN', note: M(`${t}_GOALNOTE`), by: 'GM', at: AT }];
    p.honors = [{ id: `h-${p.id}`, title: 'Ehrung', reason: M(`${t}_GOALHONOR`), phase: 1, battleId: null, goal: true }];
    p.crusade = {
      name: 'Kreuzzug',
      faction: 'Orks',
      supplyLimit: 1000,
      requisition: 5,
      notes: M(`${t}_OOB`),
      units: [{ id: `u-${p.id}`, name: 'Boyz', kind: '', points: 90, xpStart: 0, xpAdjust: 0, honours: [], scars: [], notes: M(`${t}_UNIT`) }],
      battles: {},
    };
    (p as unknown as Record<string, unknown>).futureSecret = M(`${t}_EXTRA`);
  }
  s.planets[0].notes = M('GM_PLANET');
  const ph = s.phases[0];
  ph.notes = M('GM_PHASE');
  ph.pulse = [
    { playerId: pa, fun: 3, time: 'MUCH', comment: M('X_PULSE'), anonymous: false, at: AT },
    { playerId: pb, fun: 4, time: 'LITTLE', comment: M('SELF_PULSE'), anonymous: true, at: AT },
  ];
  ph.operations.push(op('opA', fa, a, M('A_ORDER')), op('opB', fb, b, M('B_ORDER')));
  ph.flags.movesApplied = false;
  ph.moves = { [fa]: [M('A_MOVE')], [fb]: [M('B_MOVE')] };
  ph.photoVotes = [{ playerId: M('X_VOTER'), uploadId: 'upload0001' }];
  s.allianceNotes = [
    { id: 'n1', allianceId: a, playerId: pa, text: M('A_NOTE'), at: AT },
    { id: 'n2', allianceId: b, playerId: pb, text: M('B_NOTE'), at: AT },
    { id: 'n3', allianceId: c, playerId: null, text: M('X_NOTE_C'), at: AT },
  ];
  s.dice.push({ id: 'd1', at: AT, context: M('GM_DICE'), kind: 'D6', modifier: 0, results: [3], final: 3, mode: 'DIGITAL', public: false });
  s.dispatches.push({ id: 'dp1', at: AT, title: M('GM_DISPATCH'), body: M('GM_DISPATCHBODY'), pinned: false, public: false });
  const draft = (by: string, tag: string) => ({ byPlayerId: by, at: AT, update: { report: M(tag) }, decisions: {}, status: 'PENDING' as const });
  s.battles.push(battle('bAC', a, c, { notes: M('GM_BATTLENOTE'), draft: draft(pa, 'A_DRAFT') }), battle('bAB', a, b, { notes: M('GM_BATTLENOTE2'), draft: draft(pa, 'B_DRAFT') }));
  s.skirmishes = [
    {
      id: 'sk1',
      phaseNumber: 1,
      playedAt: null,
      a: { allianceId: a, players: [] },
      b: { allianceId: c, players: [] },
      vp: null,
      winner: 'A',
      mission: '',
      note: M('A_SKIRMISH'),
      byPlayerId: pa,
      status: 'PENDING',
      at: AT,
    },
    {
      id: 'sk2',
      phaseNumber: 1,
      playedAt: null,
      a: { allianceId: a, players: [] },
      b: { allianceId: b, players: [] },
      vp: null,
      winner: 'A',
      mission: '',
      note: M('B_SKIRMISH'),
      byPlayerId: pa,
      status: 'PENDING',
      at: AT,
    },
  ];
  s.events.push({
    id: 'ev1',
    phaseNumber: 1,
    category: 'FORTUNES',
    code: 'FW_11',
    allianceId: a,
    status: 'PENDING',
    data: { secret: M('GM_EVENTDATA') },
    applied: [],
    inputs: [
      { playerId: pa, allianceId: a, at: AT, data: { note: M('A_INPUT') } as never },
      { playerId: pb, allianceId: b, at: AT, data: { note: M('B_INPUT') } as never },
    ],
  });
  s.customEvents = [{ id: 'ce1', name: M('GM_CUSTOM'), description: M('GM_CUSTOMDESC'), effects: [], phase: 2, replaces: null, target: null }];
  s.goalList = [{ id: 'gl1', title: M('GM_GOALLIST'), text: M('GM_GOALLISTTEXT') }];
  s.objectives = [
    {
      id: 'ob1',
      phaseNumber: 1,
      title: M('A_OBJECTIVE'),
      text: '',
      allianceId: a,
      check: 'MANUAL',
      planetId: null,
      reward: { kind: 'NONE', value: 0, planetId: null, text: '' },
      secret: true,
      status: 'OPEN',
      achievedBy: [],
      reason: '',
    },
  ];
  s.decreeBlocks = [{ id: 'db1', slot: 'TITLE', tone: 'ANY', lang: 'de', text: M('GM_DECREE') }];
  s.meta.sandbox = { of: M('GM_SANDBOX'), baseRev: 1, originalName: M('GM_SANDBOXNAME') };
  s.moduleState = { vespator: { secret: M('GM_MODULE') } };
  s.inheritedMedals.push({ medal: 'LAUREL', fromCampaignId: M('GM_CAMPAIGNID'), holderPlayerIds: [], assignedAllianceId: undefined });
  s.setup.messages.push(M('GM_SETUPMSG'));
  s.setup.infra.push({ id: 'inf-x', allianceId: a, type: 'FORTIFICATION_LINE', planetId: M('GM_INFRA'), built: false, bounced: false });
  (s as unknown as Record<string, unknown>).futureField = M('GM_FUTURE');
  return { s, a, b, c, pa, pb };
}

const markers = (v: unknown) => [...new Set(JSON.stringify(v).match(/CANARY_[A-Z0-9_]+/g) ?? [])];

describe('S3: Allowlist-Projektion – Markierungen in privaten Feldern', () => {
  it('die Leseansicht enthält keine einzige Markierung', () => {
    const { s } = planted();
    expect(markers(toPublicView(s))).toEqual([]);
    // auch mit aufgedecktem Nebel: persönliche Ziele gelten dann als beendet, alles andere bleibt privat
    expect(markers(toPublicView(s, { reveal: true })).filter((m) => !/_GOAL/.test(m))).toEqual([]);
  });

  it('die Sicht eines Spielers aus Allianz B zeigt nur eigene und B-Daten – nichts von A, anderen Spielern oder dem Warmaster', () => {
    const { s, b, pb } = planted();
    const seen = markers(toPlayerView(s, pb, b));
    expect(seen.filter((m) => !m.startsWith('CANARY_SELF_') && !m.startsWith('CANARY_B_'))).toEqual([]);
    // nicht leer: die eigenen bzw. Allianz-Daten kommen an
    for (const m of ['CANARY_SELF_MAIL', 'CANARY_SELF_GOAL', 'CANARY_SELF_OOB', 'CANARY_SELF_PULSE', 'CANARY_B_NOTE', 'CANARY_B_ORDER', 'CANARY_B_MOVE', 'CANARY_B_DRAFT', 'CANARY_B_INPUT', 'CANARY_B_SKIRMISH'])
      expect(seen).toContain(m);
  });

  it('inaktiver Spieler (keine Allianz-Geheimnisse): nur die eigenen Daten', () => {
    const { s, pb } = planted();
    expect(markers(toPlayerView(s, pb, null)).filter((m) => !m.startsWith('CANARY_SELF_'))).toEqual([]);
  });

  it('unbekannte Felder (neue Engine-Felder, Altdaten) fallen weg', () => {
    const { s, pb, b } = planted();
    const pub = toPublicView(s) as unknown as Record<string, unknown>;
    expect(pub.futureField).toBeUndefined();
    expect((pub.players as Record<string, unknown>[])[0].futureSecret).toBeUndefined();
    expect(pub.moduleState).toBeUndefined();
    expect((pub.meta as Record<string, unknown>).sandbox).toBeUndefined();
    expect((toPlayerView(s, pb, b) as unknown as Record<string, unknown>).futureField).toBeUndefined();
  });
});

describe('S3: gleiche Ausgabe wie die frühere Projektion (Orakel)', () => {
  /** Felder, die die neue Projektion bewusst zusätzlich verbirgt, aus dem Stand entfernen */
  const comparable = (st: CampaignState): CampaignState => {
    const s = structuredClone(st) as CampaignState & Record<string, unknown>;
    delete s.futureField;
    delete s.moduleState;
    delete s.meta.sandbox;
    for (const p of s.players) {
      delete (p as unknown as Record<string, unknown>).futureSecret;
      delete p.crusade;
    }
    return s;
  };
  const states = (): [string, CampaignState][] => {
    const started = startedCampaign();
    const fog = structuredClone(started);
    fog.toggles.fog = true;
    const ended = structuredClone(planted().s);
    ended.stage = { kind: 'ENDED' };
    // Setup mitten in der Wahl: Strongholds gewählt, noch nicht aufgedeckt
    let setup = structuredClone(started);
    setup.stage = { kind: 'SETUP', step: 'W1' };
    setup.setup.strongholdsRevealed = false;
    setup.setup.fleetsRevealed = false;
    setup = comparable(setup);
    const advanced = run(started, { type: 'ADVANCE' });
    return [
      ['gestartet', started],
      ['Nebel', fog],
      ['markiert', comparable(planted().s)],
      ['markiert mit Nebel', comparable({ ...planted().s, toggles: { ...planted().s.toggles, fog: true } })],
      ['beendet', comparable(ended)],
      ['Setup verdeckt', setup],
      ['nächster Schritt', advanced],
    ];
  };

  it.each(states())('%s: toPublicView = frühere Projektion (auch mit reveal)', (_name, st) => {
    expect(toPublicView(st)).toEqual(oldPublicView(st));
    expect(toPublicView(st, { reveal: true })).toEqual(oldPublicView(st, { reveal: true }));
  });

  it('Nebel bleibt: Rang und Tendenz statt Punkten, Endwertung ohne Zahlen', () => {
    const st = startedCampaign();
    st.toggles.fog = true;
    const v = toPublicView(st);
    expect(v.fog).toBeDefined();
    expect(v.pointsHistory).toEqual([]);
    expect(toPublicView(st, { reveal: true }).fog).toBeUndefined();
  });
});
