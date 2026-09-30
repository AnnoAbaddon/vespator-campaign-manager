import { describe, expect, it } from 'vitest';
import { connectedFor } from '@/engine/graph';
import { campaignPoints, minPL } from '@/engine/board';
import { HOUSE_RULES, type HouseRuleId } from '@/engine/houseRules';
import type { CampaignState, PhaseStep } from '@/engine/types';
import { PL, ids, run, slotsOf, startedCampaign, tryRun } from './helpers';

function toStep(s: CampaignState, step: PhaseStep): CampaignState {
  for (let i = 0; i < 20 && !(s.stage.kind === 'PHASE' && s.stage.step === step); i++) s = run(s, { type: 'ADVANCE' });
  return s;
}

/** Schaltet eine Hausregel (Alternative zur FAQ-Entscheidung) ein */
function withRule(s: CampaignState, id: HouseRuleId): CampaignState {
  return run(s, { type: 'TOGGLES_UPDATE', toggles: { ...s.toggles, houseRules: { ...s.toggles.houseRules, [id]: true } } });
}

/** Angriff Flotte A → C auf Planet, Ergebnis eingetragen, Schritt PROCESS */
function fight(s0: CampaignState, attackType: 'PURGE_AND_BURN' | 'ORBITAL_INVASION' | 'SEIZE_POWER_BASE', vp: [number, number], planet: string) {
  let s = s0;
  const i = ids(s);
  s = run(s, { type: 'OP_SET', fleetId: i.fa, slot: 1, op: { type: 'BATTLE', attackType, targetPlanetId: planet, targetAllianceId: i.c } });
  s = toStep(s, 'REVEAL');
  s = run(s, { type: 'REVEAL_OPS' });
  s = toStep(s, 'BATTLES');
  const b = s.battles[0];
  s = run(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { playedAt: '2026-01-05T18:00:00Z', vp: { attacker: vp[0], defender: vp[1] } } });
  return { s: toStep(s, 'PROCESS'), battleId: b.id, opId: b.operationIds[0], ...i };
}

describe('Hausregel-Schalter (N2.1)', () => {
  it('Tabelle deckt die 17 FAQ-Fragen ab', () => {
    expect(HOUSE_RULES.filter((r) => r.faq.startsWith('F-')).map((r) => r.faq)).toEqual(['F-1', 'F-3', 'F-5', 'F-6', 'F-7', 'F-8', 'F-10', 'F-11', 'F-12', 'F-13', 'F-15', 'F-16', 'F-17', 'F-18', 'F-20', 'F-22', 'F-23']);
  });

  it('F-1: Bau-Reihenfolge nach Kampagnenpunkten statt PL-Summe', () => {
    const prep = (s: CampaignState) => {
      const { a } = ids(s);
      s = run(s, { type: 'OVERRIDE_PL', allianceId: a, planetId: 'masnet', value: 4 }, [], { reason: 'x' });
      s.alliances[0].strongholdDestroyed = true; // A: höchste PL-Summe, aber keine +3
      return s;
    };
    const order = (s: CampaignState) => {
      s = toStep(s, 'RESULTS');
      s = run(s, { type: 'SCORE' });
      s = run(s, { type: 'EVENTS_GENERATE' }, [1]);
      s = toStep(s, 'BUILD');
      s = run(s, { type: 'BUILD_START' }, [6, 1, 3, 2]);
      return s.phases[0].buildOrder!;
    };
    const std = prep(startedCampaign());
    expect(order(std)[0]).toBe(std.alliances[0].id);
    const alt = withRule(prep(startedCampaign()), 'F1_BUILD_ORDER_POINTS');
    expect(order(alt).at(-1)).toBe(alt.alliances[0].id);
  });

  it('F-3: Boarding Action ohne gegnerische Flotte wird abgelehnt', () => {
    let s = startedCampaign();
    const { fa, b } = ids(s);
    const op = { type: 'BATTLE' as const, attackType: 'BOARDING_ACTION' as const, targetPlanetId: 'norallus', targetAllianceId: b };
    expect(tryRun(s, { type: 'OP_SET', fleetId: fa, slot: 1, op }).ok).toBe(true);
    s = withRule(s, 'F3_BOARDING_NEEDS_FLEET');
    const r = tryRun(s, { type: 'OP_SET', fleetId: fa, slot: 1, op });
    expect(r.ok).toBe(false);
  });

  it('F-5: Defiant Zeal – zweite Operation muss anders sein', () => {
    let s = startedCampaign();
    const { fa, a } = ids(s);
    s.modifiers.push({ id: 'dz', source: 'x', kind: 'DEFIANT_ZEAL', phaseNumber: 1, allianceId: a });
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'LOGISTICAL_AUXILIA' } });
    expect(tryRun(s, { type: 'OP_SET', fleetId: fa, slot: 2, op: { type: 'LOGISTICAL_AUXILIA' } }).ok).toBe(true);
    s = withRule(s, 'F5_ZEAL_DIFFERENT');
    expect(tryRun(s, { type: 'OP_SET', fleetId: fa, slot: 2, op: { type: 'LOGISTICAL_AUXILIA' } }).ok).toBe(false);
    expect(tryRun(s, { type: 'OP_SET', fleetId: fa, slot: 2, op: { type: 'RAISE_EDIFICES', infraType: 'FORTIFICATION_LINE' } }).ok).toBe(true);
  });

  it('F-6: ohne Befehl trotzdem Logistical Auxilia, wenn verboten', () => {
    const prep = (s: CampaignState) => {
      s.modifiers.push({ id: 'la', source: 'x', kind: 'NO_LOGISTICAL_AUXILIA', phaseNumber: 1, allianceId: null });
      return toStep(s, 'REVEAL');
    };
    expect(prep(startedCampaign()).phases[0].operations.every((o) => o.type === 'NONE')).toBe(true);
    expect(prep(withRule(startedCampaign(), 'F6_AUXILIA_ANYWAY')).phases[0].operations.every((o) => o.type === 'LOGISTICAL_AUXILIA')).toBe(true);
  });

  it('F-7: Raise Edifices am Limit wird bei der Eingabe abgelehnt', () => {
    let s = startedCampaign();
    const { fa } = ids(s);
    // A hat eine Support Facility (Karabas); zwei weitere → Limit 3 erreicht
    for (const slot of [1, 2]) s = run(s, { type: 'OVERRIDE_SLOT', planetId: 'norallus', slot, destroyed: false, infra: { type: 'SUPPORT_FACILITY', allianceId: s.alliances[0].id } }, [], { reason: 'x' });
    const op = { type: 'RAISE_EDIFICES' as const, infraType: 'SUPPORT_FACILITY' as const };
    const std = tryRun(s, { type: 'OP_SET', fleetId: fa, slot: 1, op });
    expect(std.ok).toBe(true);
    s = withRule(s, 'F7_EDIFICES_BLOCK');
    expect(tryRun(s, { type: 'OP_SET', fleetId: fa, slot: 1, op }).ok).toBe(false);
  });

  it('F-8: Bündeln abschaltbar', () => {
    let s = startedCampaign();
    const { a, c, fa } = ids(s);
    s = run(s, { type: 'FLEET_SET_COUNT', allianceId: a, count: 2 });
    const fa2 = s.fleets.find((f) => f.allianceId === a && f.id !== fa)!.id;
    s = run(s, { type: 'OVERRIDE_FLEET', fleetId: fa2, planetId: 'marvinius' }, [], { reason: 'x' });
    for (const f of [fa, fa2]) s = run(s, { type: 'OP_SET', fleetId: f, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
    s = toStep(s, 'REVEAL');
    s = run(s, { type: 'REVEAL_OPS' });
    s = toStep(s, 'BATTLES');
    s = withRule(s, 'F8_NO_BUNDLING');
    expect(tryRun(s, { type: 'BATTLE_BUNDLE', battleIds: s.battles.map((b) => b.id) }).ok).toBe(false);
  });

  it('F-10: Seize Power Base – Stück des Verteidigers bleibt, wenn der Angreifer am Limit ist', () => {
    const prep = (s: CampaignState) => {
      const { a } = ids(s);
      s = run(s, { type: 'OVERRIDE_FLEET', fleetId: s.fleets[0].id, planetId: 'tarkad-vindix' }, [], { reason: 'x' });
      // A hat Staging Grounds auf Kryndaer; zwei weitere → Limit 3 erreicht
      s = run(s, { type: 'OVERRIDE_SLOT', planetId: 'karabas', slot: 2, destroyed: false, infra: { type: 'STAGING_GROUNDS', allianceId: a } }, [], { reason: 'x' });
      s = run(s, { type: 'OVERRIDE_SLOT', planetId: 'norallus', slot: 2, destroyed: false, infra: { type: 'STAGING_GROUNDS', allianceId: a } }, [], { reason: 'x' });
      return s;
    };
    const go = (s0: CampaignState) => {
      const { s, battleId, opId, c } = fight(s0, 'SEIZE_POWER_BASE', [60, 20], 'novamagnor');
      const sg = slotsOf(s, 'novamagnor').findIndex((x) => x.infra?.type === 'STAGING_GROUNDS' && x.infra.allianceId === c);
      let s2 = run(s, { type: 'BATTLE_DECISION', battleId, opId, decision: { type: 'SEIZE_A', captureSlot: sg, fallbackType: null, bonusType: null, shift: 0 } });
      s2 = run(s2, { type: 'BATTLE_PROCESS', battleId });
      return slotsOf(s2, 'novamagnor')[sg].infra;
    };
    expect(go(prep(startedCampaign()))).toBeNull();
    expect(go(withRule(prep(startedCampaign()), 'F10_SEIZE_KEEP'))?.type).toBe('STAGING_GROUNDS');
  });

  it('F-11: Staging Grounds des Verteidigers nur auf dem umkämpften Planeten', () => {
    const go = (s0: CampaignState) => {
      const { s, battleId, opId } = fight(s0, 'SEIZE_POWER_BASE', [20, 60], 'caltus-novem');
      const s2 = run(s, { type: 'BATTLE_DECISION', battleId, opId, decision: { type: 'SEIZE_D', build: { type: 'STAGING_GROUNDS', planetId: 'marvinius' }, shift: 0 } });
      return tryRun(s2, { type: 'BATTLE_PROCESS', battleId }).ok;
    };
    expect(go(startedCampaign())).toBe(true);
    expect(go(withRule(startedCampaign(), 'F11_STAGING_SAME_PLANET'))).toBe(false);
  });

  it('F-12: Line zerstören zählt nicht als Senkung für die Umverteilung', () => {
    const prep = (s: CampaignState) => {
      const { c } = ids(s);
      // C: Fortification Line auf Caltus, PL 2 = Minimum → Senkung zerstört nur die Line
      s = run(s, { type: 'OVERRIDE_SLOT', planetId: 'caltus-novem', slot: 2, destroyed: false, infra: { type: 'FORTIFICATION_LINE', allianceId: c } }, [], { reason: 'x' });
      s = run(s, { type: 'OVERRIDE_PL', allianceId: c, planetId: 'caltus-novem', value: 2 }, [], { reason: 'x' });
      return s;
    };
    const go = (s0: CampaignState) => {
      const { s, battleId, opId } = fight(s0, 'PURGE_AND_BURN', [20, 60], 'caltus-novem');
      const s2 = run(s, { type: 'BATTLE_DECISION', battleId, opId, decision: { type: 'PURGE_D', redistributions: ['kryndaer'], bonusPlanetId: null, shift: 0 } });
      return tryRun(s2, { type: 'BATTLE_PROCESS', battleId }).ok;
    };
    expect(go(prep(startedCampaign()))).toBe(true);
    expect(go(withRule(prep(startedCampaign()), 'F12_LINE_NOT_SUBTRACT'))).toBe(false);
  });

  it('F-13: Stronghold darf bei Orbital Invasion nicht umziehen', () => {
    const go = (s0: CampaignState) => {
      const { s, battleId, opId } = fight(s0, 'ORBITAL_INVASION', [20, 60], 'caltus-novem');
      const sh = slotsOf(s, 'caltus-novem').findIndex((x) => x.infra?.type === 'STRONGHOLD');
      const s2 = run(s, { type: 'BATTLE_DECISION', battleId, opId, decision: { type: 'ORBITAL_D', otherPlanetId: 'marvinius', direction: 'OUT', slots: [sh], shift: 0 } });
      return tryRun(s2, { type: 'BATTLE_PROCESS', battleId }).ok;
    };
    expect(go(startedCampaign())).toBe(true);
    expect(go(withRule(startedCampaign(), 'F13_STRONGHOLD_FIXED'))).toBe(false);
  });

  it('F-15: ±1-Quellen stapeln', () => {
    const prep = (s: CampaignState) => {
      // Coordinated Opposition gegen A → Verteidiger C hat Stronghold + CO als Quellen
      s.modifiers.push({ id: 'co', source: 'x', kind: 'COORDINATED_OPPOSITION', phaseNumber: 1, allianceId: ids(s).a });
      return s;
    };
    const go = (s0: CampaignState) => {
      const { s, battleId, opId } = fight(s0, 'PURGE_AND_BURN', [20, 60], 'caltus-novem');
      const s2 = run(s, { type: 'BATTLE_DECISION', battleId, opId, decision: { type: 'PURGE_D', redistributions: [], bonusPlanetId: 'marvinius', shift: 2 } });
      return tryRun(s2, { type: 'BATTLE_PROCESS', battleId }).ok;
    };
    expect(go(prep(startedCampaign()))).toBe(false);
    expect(go(withRule(prep(startedCampaign()), 'F15_TREAT_STACKS'))).toBe(true);
  });

  it('F-16: mehrere Lines nicht kumulativ', () => {
    let s = startedCampaign();
    const { a } = ids(s);
    // A hat eine Line auf Masnet; zweite dazu
    s = run(s, { type: 'OVERRIDE_SLOT', planetId: 'masnet', slot: 1, destroyed: false, infra: { type: 'FORTIFICATION_LINE', allianceId: a } }, [], { reason: 'x' });
    expect(minPL(s, a, 'masnet')).toBe(3);
    s = withRule(s, 'F16_LINES_NOT_CUMULATIVE');
    expect(minPL(s, a, 'masnet')).toBe(2);
  });

  it('F-17: PL bis 5 nur mit Hausregel (Archeotech/Wreath)', () => {
    let s = startedCampaign();
    const { a } = ids(s);
    expect(tryRun(s, { type: 'OVERRIDE_PL', allianceId: a, planetId: 'norallus', value: 5 }).ok).toBe(false);
    s = withRule(s, 'F17_PL_FIVE');
    s = run(s, { type: 'OVERRIDE_PL', allianceId: a, planetId: 'norallus', value: 5 }, [], { reason: 'x' });
    expect(PL(s, a, 'norallus')).toBe(5);
  });

  it('F-18: Support Facility nur für Bewegung', () => {
    let s = startedCampaign();
    const { a } = ids(s);
    expect(connectedFor(s, a, 'karabas', 'masnet', 1)).toBe(true);
    s = withRule(s, 'F18_FACILITY_MOVE_ONLY');
    expect(connectedFor(s, a, 'karabas', 'masnet', 1)).toBe(false);
    expect(connectedFor(s, a, 'karabas', 'masnet', 1, 'move')).toBe(true);
  });

  it('F-20: Archeotech Riches bei Gleichstand per Roll-off', () => {
    const go = (s0: CampaignState) => {
      let s = s0;
      const { a, b, c, fa, fb } = ids(s);
      s.modifiers.push({ id: 'ar', source: 'x', kind: 'ARCHEOTECH', phaseNumber: 1, allianceId: null, planetIds: ['caltus-novem'] });
      s = run(s, { type: 'OVERRIDE_FLEET', fleetId: fb, planetId: 'ikaron-prime' }, [], { reason: 'x' });
      for (const [f, t] of [[fa, c], [fb, c]] as const) s = run(s, { type: 'OP_SET', fleetId: f, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: t } });
      s = toStep(s, 'REVEAL');
      s = run(s, { type: 'REVEAL_OPS' });
      s = toStep(s, 'BATTLES');
      const [b1, b2] = s.battles;
      s = run(s, { type: 'BATTLE_UPDATE', battleId: b1.id, update: { playedAt: '2026-01-05T18:00:00Z', vp: { attacker: 60, defender: 20 } } });
      s = run(s, { type: 'BATTLE_UPDATE', battleId: b2.id, update: { playedAt: '2026-01-06T18:00:00Z', vp: { attacker: 20, defender: 60 } } });
      s = toStep(s, 'PROCESS');
      // A und C je ein Sieg auf Caltus Novem → Gleichstand; Roll-off: A 6, C 1
      s = run(s, { type: 'ARCHEOTECH_RESOLVE', increments: {} }, [6, 1]);
      return { pl: PL(s, a, 'caltus-novem'), b };
    };
    expect(go(startedCampaign()).pl).toBe(2);
    expect(go(withRule(startedCampaign(), 'F20_ARCHEOTECH_ROLLOFF')).pl).toBe(4);
  });

  it('F-22: Medaille bei Gleichstand nicht vergeben', () => {
    const end = (s: CampaignState) => {
      s = toStep(s, 'RESULTS');
      s = run(s, { type: 'SCORE' });
      return run(s, { type: 'CAMPAIGN_END' }, [6, 5, 4, 3, 2, 1, 6, 5, 4]);
    };
    // Im Startzustand liegen alle Allianzen bei der Dagger-Wertung gleichauf
    const std = end(startedCampaign({ phases: 1 }));
    const alt = end(withRule(startedCampaign({ phases: 1 }), 'F22_MEDAL_TIE_NONE'));
    expect(alt.medals.filter((m) => m.medal !== 'LAUREL').length).toBeLessThanOrEqual(std.medals.filter((m) => m.medal !== 'LAUREL').length);
    expect(alt.medals.every((m) => !m.note.includes('Roll-off'))).toBe(true);
  });

  it('F-23: Punkte auf 55 begrenzt', () => {
    let s = startedCampaign();
    const { a } = ids(s);
    for (const p of s.planets) p.power[a] = 4;
    expect(campaignPoints(s, a)).toBe(55);
    s.planets.push({ ...structuredClone(s.planets[0]), id: 'extra' });
    s.planets.at(-1)!.power[a] = 4;
    expect(campaignPoints(s, a)).toBe(59);
    s = withRule(s, 'F23_POINTS_CAP');
    expect(campaignPoints(s, a)).toBe(55);
  });
});
