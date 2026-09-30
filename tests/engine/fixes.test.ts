import { describe, expect, it } from 'vitest';
import { executeCommand } from '@/engine/commands';
import { makeCtx } from '@/engine/ctx';
import { awardAutoHonors } from '@/engine/commanders';
import { createCampaignState } from '@/engine/init';
import { planetName, type MapDef } from '@/engine/map';
import { allMissions } from '@/engine/missions';
import { theatreIndex } from '@/engine/phase';
import { mayBuild, suggestDefender } from '@/engine/playerActions';
import { carryCommanders } from '@/engine/players';
import { strongholdQuota } from '@/engine/setup';
import { translateMessage } from '@/i18n/core';
import type { Battle, CampaignState, EventRecord, PhaseStep } from '@/engine/types';
import { ids, idGen, run, slotsOf, startedCampaign, tryRun } from './helpers';

function toStep(s: CampaignState, step: PhaseStep): CampaignState {
  for (let i = 0; i < 20 && !(s.stage.kind === 'PHASE' && s.stage.step === step); i++) s = run(s, { type: 'ADVANCE' });
  return s;
}

/** Battle Operation A → C auf Caltus Novem, Schritt BATTLES */
function battleOf(s0: CampaignState, attackType: 'PURGE_AND_BURN' | 'SEIZE_POWER_BASE' = 'PURGE_AND_BURN') {
  let s = s0;
  const i = ids(s);
  s = run(s, { type: 'OP_SET', fleetId: i.fa, slot: 1, op: { type: 'BATTLE', attackType, targetPlanetId: 'caltus-novem', targetAllianceId: i.c } });
  s = toStep(s, 'REVEAL');
  s = run(s, { type: 'REVEAL_OPS' });
  s = toStep(s, 'BATTLES');
  return { ...i, s, b: s.battles[0] };
}

/** Zweite Flotte für A mit eigenem Kommandanten (P4), damit zwei Operationen gebündelt werden können */
function twoAttackers() {
  let s = startedCampaign();
  const i = ids(s);
  s = run(s, { type: 'PLAYER_UPSERT', data: { nickname: 'P4', faction: 'Orks' }, allianceId: i.a });
  const p4 = s.players.find((p) => p.nickname === 'P4')!.id;
  s = run(s, { type: 'FLEET_SET_COUNT', allianceId: i.a, count: 2 });
  const f2 = s.fleets.filter((f) => f.allianceId === i.a).at(-1)!.id;
  s = run(s, { type: 'FLEET_PLACE', fleetId: f2, planetId: 'kryndaer' });
  s = run(s, { type: 'FLEET_COMMANDER', fleetId: f2, phase: 1, playerId: p4 });
  s = run(s, { type: 'FLEET_COMMANDER', fleetId: i.fa, phase: 1, playerId: i.pa });
  for (const f of [i.fa, f2]) s = run(s, { type: 'OP_SET', fleetId: f, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: i.c } });
  s = toStep(s, 'REVEAL');
  s = run(s, { type: 'REVEAL_OPS' });
  s = toStep(s, 'BATTLES');
  return { s, p4, f2, ...i };
}

describe('Theatre würfeln (1)', () => {
  it('verteilt gleichmäßig auf 1, 2 oder 3 Theatres', () => {
    const map = (n: number) => [1, 2, 3, 4, 5, 6].map((r) => theatreIndex(r, n));
    expect(map(1)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(map(2)).toEqual([0, 0, 0, 1, 1, 1]);
    expect(map(3)).toEqual([0, 0, 1, 1, 2, 2]);
  });
});

describe('Schlacht bearbeiten (2, 3, 15, 16)', () => {
  it('Bericht ändern lässt den Sieger ungespielter Schlachten stehen; Ergebnis ist gesperrt', () => {
    const { s: s1, b } = battleOf(startedCampaign());
    let s = s1;
    s = run(s, { type: 'BATTLE_UNPLAYED', battleId: b.id, resolution: 'DEFENDER_WINS' });
    s = run(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { report: 'Niemand kam', vp: null, battleReady: { attacker: false, defender: false }, victorOverride: null } });
    const nb = s.battles.find((x) => x.id === b.id)!;
    expect(nb.victor).toBe('DEFENDER');
    expect(nb.status).toBe('UNPLAYED_RESOLVED');
    expect(nb.report).toBe('Niemand kam');
    expect(tryRun(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { vp: { attacker: 10, defender: 5 } } }).ok).toBe(false);
  });

  it('Einzelspiele sind nach der Verarbeitung gesperrt', () => {
    const { s: s1, b } = battleOf(startedCampaign());
    let s = s1;
    s = run(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { playedAt: '2026-01-05T18:00:00Z', vp: { attacker: 20, defender: 60 } } });
    s = toStep(s, 'PROCESS');
    s = run(s, { type: 'BATTLE_PROCESS', battleId: b.id });
    const games = [{ id: 'g1', attackers: [], defenders: [], playedAt: null, size: null, missionName: '', vp: { attacker: 90, defender: 0 }, battleReady: { attacker: false, defender: false }, report: '' }];
    const r = tryRun(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { games } });
    expect(r.ok).toBe(false);
    // Bericht bleibt änderbar
    expect(tryRun(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { report: 'Nachtrag' } }).ok).toBe(true);
  });

  it('Teilnehmer der Einzelspiele werden geprüft (unbekannt → Fehler, fremde Allianz → Warnung)', () => {
    const { s, b, pa, pb, pc } = battleOf(startedCampaign());
    const g = (att: string, def: string) => [
      {
        id: 'g1',
        attackers: [{ playerId: att, faction: '' }],
        defenders: [{ playerId: def, faction: '' }],
        playedAt: null,
        size: null,
        missionName: '',
        vp: null,
        battleReady: { attacker: false, defender: false },
        report: '',
      },
    ];
    expect(tryRun(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { games: g('nobody', pc) } }).ok).toBe(false);
    const r = tryRun(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { games: g(pa, pb) } });
    expect(r.ok && r.warnings.join(' ')).toMatch(/P2 gehört nicht zur Allianz/);
  });

  it('Missionsliste enthält die sechs Vespator-Missionen; unpassende Angriffsart wird gewarnt', () => {
    const vsp = allMissions(startedCampaign()).filter((m) => m.source === 'Vespator');
    expect(vsp).toHaveLength(6);
    const { s, b } = battleOf(startedCampaign());
    const orbital = vsp.find((m) => m.attackTypes[0] === 'ORBITAL_INVASION')!;
    const purge = vsp.find((m) => m.attackTypes[0] === 'PURGE_AND_BURN')!;
    const r = tryRun(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { mission: { source: 'LIST', externalName: '', missionId: orbital.id } } });
    expect(r.ok && r.warnings.join(' ')).toMatch(/nicht für Purge and Burn vorgesehen/);
    const r2 = tryRun(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { mission: { source: 'LIST', externalName: '', missionId: purge.id } } });
    expect(r2.ok && r2.warnings).toEqual([]);
  });
});

describe('Ergebnis-Entwürfe (4, 8, 18)', () => {
  it('Entwurf der Gegenseite wird nicht überschrieben; eigener schon', () => {
    const { s: s0, b, pa, pc } = battleOf(startedCampaign());
    let s = run(s0, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: pa, update: { vp: { attacker: 10, defender: 50 } } });
    expect(tryRun(s, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: pc, update: { vp: { attacker: 50, defender: 10 } } }).ok).toBe(false);
    s = run(s, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: pa, update: { vp: { attacker: 12, defender: 50 } } });
    expect(s.battles[0].draft?.update.vp).toEqual({ attacker: 12, defender: 50 });
  });

  it('Bestätigen scheitert bei abgeschlossener Schlacht; ADVANCE nennt offene Entwürfe', () => {
    const { s: s0, b, pa, pc } = battleOf(startedCampaign());
    const s = run(s0, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: pa, update: { vp: { attacker: 10, defender: 50 } } });
    const adv = tryRun(s, { type: 'ADVANCE' });
    expect(adv.ok && adv.warnings.join(' ')).toMatch(/Offener Ergebnis-Entwurf für Caltus Novem/);
    const closed = run(s, { type: 'BATTLE_UNPLAYED', battleId: b.id, resolution: 'ATTACKER_WINS' });
    expect(tryRun(closed, { type: 'RESULT_DRAFT_CONFIRM', battleId: b.id, playerId: pc }).ok).toBe(false);
    expect(tryRun(closed, { type: 'TIME_PROPOSE', battleId: b.id, playerId: pc, times: ['2026-02-01T18:00:00Z'] }).ok).toBe(false);
  });

  it('Spieler melden Einzelspiele; Entscheidungen nur von der Siegerseite', () => {
    const { s, b, pa, pc } = battleOf(startedCampaign());
    const games = [
      {
        id: 'g1',
        attackers: [{ playerId: pa, faction: 'Orks' }],
        defenders: [{ playerId: pc, faction: 'Tau' }],
        playedAt: '2026-01-05T18:00:00Z',
        size: null,
        missionName: '',
        vp: { attacker: 10, defender: 50 },
        battleReady: { attacker: false, defender: false },
        report: '',
      },
    ];
    const ok = run(s, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: pa, update: { games } });
    expect(ok.battles[0].draft?.update.games).toHaveLength(1);
    const op = b.operationIds[0];
    // Verteidiger siegt → Angreifer darf keine Entscheidungen mitschicken
    const bad = tryRun(s, {
      type: 'RESULT_DRAFT_SUBMIT',
      battleId: b.id,
      playerId: pa,
      update: { vp: { attacker: 10, defender: 50 } },
      decisions: { [op]: { type: 'PURGE_D', redistributions: [], bonusPlanetId: null, shift: 0 } },
    });
    expect(bad.ok).toBe(false);
    const good = tryRun(s, {
      type: 'RESULT_DRAFT_SUBMIT',
      battleId: b.id,
      playerId: pc,
      update: { vp: { attacker: 10, defender: 50 } },
      decisions: { [op]: { type: 'PURGE_D', redistributions: [], bonusPlanetId: null, shift: 0 } },
    });
    expect(good.ok).toBe(true);
  });
});

describe('Armeewechsel im Profil (5)', () => {
  it('nach den Schlachten ab nächster Phase; nach Kampagnenende bleibt die Historie', () => {
    let s = startedCampaign({ phases: 2 });
    const { pa } = ids(s);
    s = toStep(s, 'RESULTS');
    s = run(s, { type: 'PROFILE_UPDATE', playerId: pa, update: { faction: 'Necrons' } });
    const hist = () => s.players.find((p) => p.id === pa)!.factionHistory!.map((h) => `${h.faction}@${h.fromPhase}`);
    expect(hist()).toEqual(['Orks@0', 'Necrons@2']);
    // Kampagne beendet: ein Wechsel berührt keine gespielte Phase mehr und erzeugt kein „ab Phase 3“ (B12)
    s.stage = { kind: 'ENDED' };
    s = run(s, { type: 'PROFILE_UPDATE', playerId: pa, update: { faction: 'Tau' } });
    expect(hist()).toEqual(['Orks@0', 'Necrons@2']);
    expect(s.players.find((p) => p.id === pa)!.faction).toBe('Tau');
    expect(Math.max(...s.players.find((p) => p.id === pa)!.factionHistory!.map((h) => h.fromPhase))).toBeLessThanOrEqual(s.meta.phaseCount);
  });
});

describe('Kleine Karten: Start-Power-Level (6)', () => {
  const st = (n: number, laurel: string | null) => ({
    map: { name: 'x', template: null, background: null, planets: Array.from({ length: n }, (_, i) => ({ id: `q${i}` })), connections: [] } as unknown as MapDef,
    setup: { laurel: laurel ? { allianceId: laurel, planetId: null } : null } as CampaignState['setup'],
  });
  it('entspricht ab 9 Planeten dem Regelwerk, darunter gekürzt', () => {
    expect(strongholdQuota(st(9, 'x'), 'y')).toEqual({ pl3: 3, pl2: 4 });
    expect(strongholdQuota(st(13, null), 'y')).toEqual({ pl3: 3, pl2: 4 });
    expect(strongholdQuota(st(7, null), 'y')).toEqual({ pl3: 3, pl2: 3 });
    expect(strongholdQuota(st(7, 'x'), 'y')).toEqual({ pl3: 3, pl2: 2 });
    expect(strongholdQuota(st(7, 'x'), 'x')).toEqual({ pl3: 3, pl2: 3 });
    expect(strongholdQuota(st(6, 'x'), 'y')).toEqual({ pl3: 3, pl2: 1 });
  });
});

describe('Hausregel F-13 bei Smuggled Assets (7)', () => {
  it('Stronghold darf mit Hausregel nicht verlegt werden', () => {
    const go = (rule: boolean) => {
      let s = startedCampaign();
      const { a } = ids(s);
      if (rule) s = run(s, { type: 'TOGGLES_UPDATE', toggles: { ...s.toggles, houseRules: { ...s.toggles.houseRules, F13_STRONGHOLD_FIXED: true } } });
      s = toStep(s, 'RESULTS');
      const e: EventRecord = { id: 'ev1', phaseNumber: 1, category: 'DESPERATE_MEASURES' as EventRecord['category'], code: 'DM_3', allianceId: a, status: 'PENDING', data: {}, applied: [] };
      s.events.push(e);
      const slot = slotsOf(s, 'norallus').findIndex((x) => x.infra?.type === 'STRONGHOLD');
      return tryRun(s, { type: 'EVENT_APPLY', eventId: 'ev1', data: { relocations: [{ fromPlanetId: 'norallus', slot, toPlanetId: 'karabas' }] } }).ok;
    };
    expect(go(false)).toBe(true);
    expect(go(true)).toBe(false);
  });
});

describe('Bündeln und Lösen (9, 12)', () => {
  it('Lösen prüft die Operation und nimmt den Angreifer der Operation mit', () => {
    const { s: s0, p4, pa } = twoAttackers();
    let s = run(s0, { type: 'BATTLE_BUNDLE', battleIds: s0.battles.map((b) => b.id) });
    const b = s.battles[0];
    expect(b.attackers.map((p) => p.playerId).sort()).toEqual([pa, p4].sort());
    expect(tryRun(s, { type: 'BATTLE_UNBUNDLE', battleId: b.id, opId: 'fremd' }).ok).toBe(false);
    s = run(s, { type: 'BATTLE_UNBUNDLE', battleId: b.id, opId: b.operationIds[1] });
    expect(s.battles[0].attackers.map((p) => p.playerId)).toEqual([pa]);
    expect(s.battles[1].attackers.map((p) => p.playerId)).toEqual([p4]);
  });

  it('Bündeln führt Einzelspiele, Bericht und Termin zusammen und lehnt fremde Ergebnisse ab', () => {
    const { s: s0, pa, p4, pc } = twoAttackers();
    const [b1, b2] = s0.battles;
    const game = (id: string, att: string, vp: [number, number]) => ({
      id,
      attackers: [{ playerId: att, faction: '' }],
      defenders: [{ playerId: pc, faction: '' }],
      playedAt: '2026-01-05T18:00:00Z',
      size: null,
      missionName: '',
      vp: { attacker: vp[0], defender: vp[1] },
      battleReady: { attacker: false, defender: false },
      report: '',
    });
    let s = run(s0, { type: 'BATTLE_UPDATE', battleId: b1.id, update: { games: [game('g1', pa, [60, 10])], report: 'Teil 1' } });
    const withResult = run(s, { type: 'BATTLE_UPDATE', battleId: b2.id, update: { vp: { attacker: 1, defender: 2 } } });
    expect(tryRun(withResult, { type: 'BATTLE_BUNDLE', battleIds: [b1.id, b2.id] }).ok).toBe(false);
    s = run(s, { type: 'BATTLE_UPDATE', battleId: b2.id, update: { report: 'Teil 2' } });
    s.battles.find((x) => x.id === b2.id)!.scheduledAt = '2026-01-04T18:00:00Z';
    s = run(s, { type: 'BATTLE_BUNDLE', battleIds: [b1.id, b2.id] });
    const b = s.battles[0];
    expect(b.games).toHaveLength(1);
    expect(b.report).toBe('Teil 1\n\nTeil 2');
    expect(b.scheduledAt).toBe('2026-01-04T18:00:00Z');
    expect(b.vp).toEqual({ attacker: 60, defender: 10 });
    expect(b.victor).toBe('ATTACKER');
    expect(b.attackers.map((p) => p.playerId).sort()).toEqual([pa, p4].sort());
  });
});

describe('Fortunes of War (10)', () => {
  it('ohne zulässiges Event wird kein W33 gewürfelt', () => {
    let s = startedCampaign();
    s = toStep(s, 'RESULTS');
    s = run(s, { type: 'SCORE' });
    s.stellarStormsUsed = true;
    s.toggles.events.disabled = ['FW_11', 'FW_12', 'FW_13', 'FW_21', 'FW_22', 'FW_23', 'FW_31', 'FW_32'];
    const r = tryRun(s, { type: 'EVENTS_GENERATE' }, [4]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.log).toContain('Kein zulässiges Fortunes-of-War-Event');
      expect(r.state.events).toHaveLength(0);
    }
  });

  it('würfelt bis ein zulässiges Event fällt (auch nach mehr als 30 Würfen)', () => {
    let s = startedCampaign();
    s = toStep(s, 'RESULTS');
    s = run(s, { type: 'SCORE' });
    s.toggles.events.disabled = ['FW_11', 'FW_12', 'FW_13', 'FW_21', 'FW_22', 'FW_23', 'FW_31', 'FW_32'];
    const dice = [4, ...Array.from({ length: 40 }, () => [1, 1]).flat(), 3, 3];
    s = run(s, { type: 'EVENTS_GENERATE' }, dice);
    expect(s.events[0].code).toBe('FW_33');
  });
});

describe('Automatische Ehrungen (11)', () => {
  const fake = (s: CampaignState, i: number, pa: string, patch: Partial<Battle>): Battle => ({
    ...structuredClone(s.battles[0] ?? ({} as Battle)),
    id: `fb${i}`,
    phaseNumber: 1,
    kind: 'CAMPAIGN',
    operationIds: [],
    attackType: 'PURGE_AND_BURN',
    planetId: 'masnet',
    attackerAllianceId: ids(s).a,
    defenderAllianceId: ids(s).c,
    attackers: [{ playerId: pa, faction: '' }],
    defenders: [],
    status: 'PROCESSED',
    playedAt: `2026-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
    createdSeq: 100 + i,
    victor: 'ATTACKER',
    unplayedResolution: null,
    ...patch,
  });
  const honours = (s: CampaignState, pa: string) => {
    const ctx = makeCtx(s, { mode: 'DIGITAL', manual: [], random: () => 4 }, '2026-02-01T00:00:00Z', idGen);
    awardAutoHonors(ctx);
    return (s.players.find((p) => p.id === pa)!.honors ?? []).map((h) => h.auto);
  };
  it('ungespielt gewertete Schlachten zählen nicht (Veteran, Serie)', () => {
    const s = startedCampaign();
    const { pa } = ids(s);
    for (let i = 0; i < 10; i++) s.battles.push(fake(s, i, pa, { unplayedResolution: 'ATTACKER_WINS' }));
    expect(honours(s, pa)).toEqual([]);
  });
  it('Entscheidungsschlacht zählt als gespielte Schlacht', () => {
    const s = startedCampaign();
    const { pa } = ids(s);
    for (let i = 0; i < 9; i++) s.battles.push(fake(s, i, pa, { victor: 'DEFENDER' }));
    s.battles.push(fake(s, 9, pa, { kind: 'FINAL_TIEBREAK', status: 'PLAYED', phaseNumber: 6, victor: 'DEFENDER' }));
    expect(honours(s, pa)).toEqual(['VETERAN']);
  });
  it('Reihenfolge nach Phase vor Datum (Serie)', () => {
    const s = startedCampaign();
    const { pa } = ids(s);
    // Phase 1: Sieg, Phase 2: Sieg, Phase 3: Niederlage, Phase 2 (spät datiert): Sieg → nach Phase sortiert 3 Siege in Folge
    s.battles.push(fake(s, 0, pa, { phaseNumber: 1, playedAt: '2026-01-01T00:00:00Z' }));
    s.battles.push(fake(s, 1, pa, { phaseNumber: 2, playedAt: '2026-01-02T00:00:00Z' }));
    s.battles.push(fake(s, 2, pa, { phaseNumber: 3, playedAt: '2026-01-03T00:00:00Z', victor: 'DEFENDER' }));
    s.battles.push(fake(s, 3, pa, { phaseNumber: 2, playedAt: '2026-01-09T00:00:00Z' }));
    expect(honours(s, pa)).toContain('STREAK');
  });
});

describe('Kartenregistry (13)', () => {
  const tinyMap = (name0: string): MapDef => {
    const planets = Array.from({ length: 9 }, (_, i) => ({ id: `reg-${i}`, name: i === 0 ? name0 : `Reg ${i}`, system: '', slots: 2, theatres: ['DEAD_LANDS' as const], x: 10 * i, y: 10 }));
    return { name: 'Reg', template: null, background: null, planets, connections: planets.slice(1).map((p, i) => [planets[i].id, p.id] as [string, string]) };
  };
  const w0 = () => createCampaignState({ name: 'T', phaseCount: 3, allianceCount: 2, now: '2026-01-01T00:00:00Z' });

  it('gleiche IDs mit anderem Inhalt bekommen eigene IDs; die erste Karte bleibt nachschlagbar', () => {
    const a = run(w0(), { type: 'MAP_SET', map: tinyMap('Alpha') });
    expect(a.map.planets[0].id).toBe('reg-0');
    const b = run(w0(), { type: 'MAP_SET', map: tinyMap('Beta') });
    expect(b.map.planets[0].id).not.toBe('reg-0');
    expect(planetName('reg-0')).toBe('Alpha');
    expect(planetName(b.map.planets[0].id)).toBe('Beta');
    // unveränderte Karte behält ihre IDs
    expect(run(w0(), { type: 'MAP_SET', map: tinyMap('Alpha') }).map.planets[0].id).toBe('reg-0');
  });

  it('abgebrochene Rückfrage registriert die Karte nicht', () => {
    run(w0(), { type: 'MAP_SET', map: tinyMap('Gamma') });
    const small = tinyMap('Gamma');
    small.planets = small.planets.slice(0, 7).map((p, i) => ({ ...p, id: `cf-${i}`, name: i === 0 ? 'Delta' : p.name }));
    small.connections = small.planets.slice(1).map((p, i) => [small.planets[i].id, p.id]);
    const r = executeCommand(w0(), { type: 'MAP_SET', map: small }, { idGen });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.kind).toBe('confirm');
    expect(planetName('cf-0')).toBe('cf-0');
  });
});

describe('Reserveflotten (14)', () => {
  it('wartende Reserve ohne Kommandant, Aktivierung vergibt einen; Flottenzahl löscht sie nicht', () => {
    let s = startedCampaign();
    const { a } = ids(s);
    s = run(s, { type: 'FLEET_RESERVE_SET', allianceId: a, count: 1 });
    const r = s.fleets.find((f) => f.reserve)!;
    carryCommanders(s, 1);
    expect(s.fleets.find((f) => f.id === r.id)!.commanders['1']).toBeUndefined();
    s = run(s, { type: 'FLEET_ACTIVATE', fleetId: r.id, planetId: 'norallus' });
    expect(s.fleets.find((f) => f.id === r.id)!.commanders['1']).toBe(ids(s).pa);
    s = run(s, { type: 'FLEET_SET_COUNT', allianceId: a, count: 1 });
    expect(s.fleets.some((f) => f.id === r.id)).toBe(true);
  });
});

describe('Bau-Berechtigung (17)', () => {
  it('Anführer aktiv → nur er; kein Anführer oder inaktiv → jedes Mitglied', () => {
    let s = startedCampaign();
    const { a, pa } = ids(s);
    s = run(s, { type: 'PLAYER_UPSERT', data: { nickname: 'P4' }, allianceId: a });
    const p4 = s.players.find((p) => p.nickname === 'P4')!.id;
    // ohne Anführer
    expect(mayBuild(s, a, pa)).toBe(true);
    expect(mayBuild(s, a, p4)).toBe(true);
    // Anführer aktiv
    s = run(s, { type: 'ALLIANCE_UPSERT', id: a, name: 'Rot', color: '#ff0000', leaderPlayerId: pa });
    expect(mayBuild(s, a, pa)).toBe(true);
    expect(mayBuild(s, a, p4)).toBe(false);
    // Anführer nicht mehr aktiv
    s.players.find((p) => p.id === pa)!.active = false;
    expect(mayBuild(s, a, p4)).toBe(true);
    // fremde Allianz nie
    expect(mayBuild(s, ids(s).b, p4)).toBe(false);
  });
});

describe('Verteidiger-Vorschlag (19)', () => {
  it('verfallene Schlachten zählen nicht', () => {
    let s = startedCampaign();
    const { c, pc } = ids(s);
    s = run(s, { type: 'PLAYER_UPSERT', data: { nickname: 'P5' }, allianceId: c });
    const p5 = s.players.find((p) => p.nickname === 'P5')!.id;
    s.battles.push({ ...({} as Battle), id: 'v1', phaseNumber: 0, status: 'VOID', attackers: [], defenders: [{ playerId: pc, faction: '' }] } as Battle);
    expect(suggestDefender(s, c, 1)).toBe(pc);
    s.battles.push({ ...({} as Battle), id: 'p1', phaseNumber: 0, status: 'PROCESSED', attackers: [], defenders: [{ playerId: pc, faction: '' }] } as Battle);
    expect(suggestDefender(s, c, 1)).toBe(p5);
  });
});

describe('F-6 und Kampagnen-Schalter (20)', () => {
  it('deaktiviertes Logistical Auxilia gewinnt gegen die Hausregel', () => {
    let s = startedCampaign();
    s = run(s, { type: 'TOGGLES_UPDATE', toggles: { ...s.toggles, operations: { ...s.toggles.operations, logisticalAuxilia: false }, houseRules: { ...s.toggles.houseRules, F6_AUXILIA_ANYWAY: true } } });
    s = run(s, { type: 'ADVANCE' });
    expect(s.phases[0].operations.every((o) => o.type === 'NONE')).toBe(true);
  });
});

describe('Log-Texte (21)', () => {
  it('ohne Emojis und übersetzt', () => {
    let s = startedCampaign({ phases: 1 });
    s = toStep(s, 'RESULTS');
    s = run(s, { type: 'SCORE' });
    const r = tryRun(s, { type: 'CAMPAIGN_END' }, [6, 5, 4, 3, 2, 1, 6, 5, 4, 3, 2, 1]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.log.join(' ')).not.toMatch(/[\u{1F300}-\u{1FAFF}☠]/u);
    expect(translateMessage('en', 'Rot gewinnt die Kampagne')).toBe('Rot wins the campaign');
    expect(translateMessage('en', 'Kein zulässiges Fortunes-of-War-Event')).toBe('No eligible Fortunes of War event');
    expect(translateMessage('en', 'Höchstens 2 Planeten mit Power Level 2')).toBe('At most 2 planets with Power Level 2');
  });
});
