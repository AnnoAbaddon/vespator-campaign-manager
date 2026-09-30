import { describe, expect, it } from 'vitest';
import { executeCommand } from '@/engine/commands';
import { campaignPoints } from '@/engine/board';
import { eventInputRights, weakestAlliance } from '@/engine/events';
import { eventName, validateCustomEvent, type CustomEventDef } from '@/engine/customEvents';
import { reminderTarget } from '@/engine/reminders';
import { applyTemplate, extractTemplate, templateMap } from '@/engine/campaignTemplate';
import { proposePhaseDates } from '@/engine/deadlines';
import { toPublicView } from '@/engine/publicView';
import { createCampaignState } from '@/engine/init';
import { translateMessage } from '@/i18n/core';
import type { CampaignState, PhaseStep } from '@/engine/types';
import { PL, idGen, ids, run, slotsOf, startedCampaign, tryRun } from './helpers';

/** Welle 1, R3: Ereignisse und Werkzeuge der Spielleitung */

function toStep(s: CampaignState, step: PhaseStep): CampaignState {
  for (let i = 0; i < 20 && !(s.stage.kind === 'PHASE' && s.stage.step === step); i++) s = run(s, { type: 'ADVANCE' });
  return s;
}

/** Phase 1, Schritt 3 (RESULTS), nur Perils of Power aktiv; Allianz A dominiert deutlich */
function dominatingA(houseA6 = false): CampaignState {
  let s = startedCampaign();
  const { a } = ids(s);
  s = run(s, {
    type: 'TOGGLES_UPDATE',
    toggles: { ...s.toggles, events: { ...s.toggles.events, fortunesOfWar: false, desperateMeasures: false }, houseRules: houseA6 ? { A6_HANDICAP_NO_TEST: true } : {} },
  });
  s = toStep(s, 'RESULTS');
  for (const p of s.planets) p.power[a] = 4;
  return run(s, { type: 'SCORE' });
}

const def = (over: Partial<CustomEventDef> = {}): CustomEventDef => ({
  id: '',
  name: 'Warpsturm',
  description: 'Ein Sturm zieht auf.',
  effects: [
    { kind: 'PL', alliance: 'TARGET', planet: 'CHOSEN', delta: -1 },
    { kind: 'POINTS', alliance: 'TARGET', delta: 2 },
    { kind: 'MODIFIER', modifier: 'NO_VOID_LEAP', alliance: null },
  ],
  phase: null,
  replaces: null,
  target: null,
  ...over,
});

describe('A6: Handicap-Events ohne W6-Test (Hausregel)', () => {
  it('Standard: W6-Test entscheidet (3 → kein Event)', () => {
    const s = run(dominatingA(), { type: 'EVENTS_GENERATE' }, [3]);
    expect(s.events).toHaveLength(0);
    expect(s.dice.some((d) => d.context.startsWith('Perils of Power?'))).toBe(true);
  });
  it('Hausregel: ohne Test, das Event tritt ein (nur der W3 wird gewürfelt)', () => {
    const s = run(dominatingA(true), { type: 'EVENTS_GENERATE' }, [2]);
    expect(s.events.map((e) => e.code)).toEqual(['PP_2']);
    expect(s.dice.some((d) => d.context.startsWith('Perils of Power?'))).toBe(false);
  });
});

describe('D2: Eigene Ereignisse', () => {
  it('prüft Definitionen (Name, Bausteine, Phase)', () => {
    const s = startedCampaign();
    expect(validateCustomEvent(s, { ...def(), id: 'x' })).toBeNull();
    expect(validateCustomEvent(s, { ...def(), id: 'x', name: ' ' })).toMatch(/Namen/);
    expect(validateCustomEvent(s, { ...def(), id: 'x', effects: [] })).toMatch(/Baustein/);
    expect(validateCustomEvent(s, { ...def(), id: 'x', phase: 6 })).toMatch(/Phase 1–5/);
    expect(validateCustomEvent(s, { ...def(), id: 'x', effects: [{ kind: 'PL', alliance: 'ALL', planet: 'ALL', delta: 3 }] })).toMatch(/−2 bis \+2/);
    expect(validateCustomEvent(s, { ...def(), id: 'x', effects: [{ kind: 'MOVE', alliance: 'ALL', planet: 'ALL' }] })).toMatch(/Zielplaneten/);
  });

  it('eingeplant: tritt beim Generieren ein, Bausteine wirken beim Anwenden', () => {
    let s = run(startedCampaign(), { type: 'CUSTOM_EVENT_UPSERT', def: def({ phase: 1 }) });
    const { a } = ids(s);
    s = run(s, { type: 'TOGGLES_UPDATE', toggles: { ...s.toggles, events: { ...s.toggles.events, fortunesOfWar: false, perilsOfPower: false, desperateMeasures: false } } });
    s = toStep(s, 'RESULTS');
    s = run(s, { type: 'SCORE' });
    s = run(s, { type: 'EVENTS_GENERATE' });
    const e = s.events.find((x) => x.code === 'CUSTOM')!;
    expect(eventName(e)).toBe('Warpsturm');
    expect(e.status).toBe('PENDING');
    // ohne Ziel-Allianz und Planet: Fehler
    expect(tryRun(s, { type: 'EVENT_APPLY', eventId: e.id, data: {} }).ok).toBe(false);
    const before = PL(s, a, 'masnet');
    const pts = campaignPoints(s, a);
    s = run(s, { type: 'EVENT_APPLY', eventId: e.id, data: { targetAllianceId: a, planetId: 'masnet' } });
    expect(PL(s, a, 'masnet')).toBe(before - 1);
    expect(campaignPoints(s, a)).toBe(pts - 1 + 2);
    expect(s.modifiers.some((m) => m.kind === 'NO_VOID_LEAP' && m.phaseNumber === 2 && m.source === e.id)).toBe(true);
    expect(s.events.find((x) => x.id === e.id)!.status).toBe('APPLIED');
    // Undo-Mechanik: der Zustand vor dem Anwenden bleibt unverändert (reine Commands)
  });

  it('ersetzt einen Tabelleneintrag (Tabelle erweitern)', () => {
    let s = run(startedCampaign(), { type: 'CUSTOM_EVENT_UPSERT', def: def({ replaces: 'FW_23', effects: [{ kind: 'PL', alliance: 'ALL', planet: 'ALL', delta: 1 }] }) });
    s = run(s, { type: 'TOGGLES_UPDATE', toggles: { ...s.toggles, events: { ...s.toggles.events, perilsOfPower: false, desperateMeasures: false } } });
    s = toStep(s, 'RESULTS');
    s = run(s, { type: 'SCORE' });
    // Fortunes-Test 6, W33 = 2·3 → FW_23 → eigenes Ereignis
    s = run(s, { type: 'EVENTS_GENERATE' }, [6, 2, 3]);
    expect(s.events.map((e) => e.code)).toEqual(['CUSTOM']);
    expect(s.events[0].custom?.name).toBe('Warpsturm');
  });

  it('von Hand auslösen, löschen; Baukasten bleibt verdeckt', () => {
    let s = run(startedCampaign(), { type: 'CUSTOM_EVENT_UPSERT', def: def() });
    const d = s.customEvents![0];
    expect(tryRun(s, { type: 'CUSTOM_EVENT_TRIGGER', defId: d.id, allianceId: null }).ok).toBe(false);
    s = toStep(s, 'RESULTS');
    s = run(s, { type: 'CUSTOM_EVENT_TRIGGER', defId: d.id, allianceId: ids(s).b });
    expect(s.events[0].allianceId).toBe(ids(s).b);
    expect(toPublicView(s).customEvents).toBeUndefined();
    expect(toPublicView(s).events[0].custom?.name).toBe('Warpsturm');
    s = run(s, { type: 'CUSTOM_EVENT_DELETE', id: d.id });
    expect(s.customEvents).toEqual([]);
  });

  it('Bau und Infrastruktur-Zerstörung, Flotten versetzen', () => {
    let s = startedCampaign();
    const { a, fa } = ids(s);
    s = run(s, {
      type: 'CUSTOM_EVENT_UPSERT',
      def: def({
        effects: [
          { kind: 'INFRA_DESTROY', alliance: a, planet: 'masnet' },
          { kind: 'MOVE', alliance: a, planet: 'karabas' },
        ],
      }),
    });
    s = toStep(s, 'RESULTS');
    s = run(s, { type: 'CUSTOM_EVENT_TRIGGER', defId: s.customEvents![0].id, allianceId: null });
    s = run(s, { type: 'EVENT_APPLY', eventId: s.events[0].id, data: {} });
    expect(slotsOf(s, 'masnet').some((x) => x.infra?.allianceId === a)).toBe(false);
    expect(s.fleets.find((f) => f.id === fa)!.planetId).toBe('karabas');
  });
});

describe('NTH2 2.2: Ereignis erzwingen', () => {
  it('nur in einer Sandbox und nur mit Begründung', () => {
    let s = toStep(startedCampaign(), 'RESULTS');
    const r = tryRun(s, { type: 'EVENT_FORCE', code: 'PP_3', allianceId: ids(s).a });
    expect(!r.ok && r.kind === 'error' && r.error).toMatch(/Sandbox/);
    s.meta.sandbox = { of: 'orig', baseRev: 1, originalName: 'Test' };
    const noReason = executeCommand(s, { type: 'EVENT_FORCE', code: 'PP_3', allianceId: ids(s).a }, { idGen });
    expect(!noReason.ok && noReason.kind === 'error' && noReason.error).toMatch(/Begründung/);
    expect(tryRun(s, { type: 'EVENT_FORCE', code: 'PP_3', allianceId: null }).ok).toBe(false);
    s = run(s, { type: 'EVENT_FORCE', code: 'PP_3', allianceId: ids(s).a });
    expect(s.events[0]).toMatchObject({ code: 'PP_3', allianceId: ids(s).a, forced: true, status: 'PENDING' });
    s = run(s, { type: 'EVENT_APPLY', eventId: s.events[0].id, data: {} });
    expect(s.modifiers.some((m) => m.kind === 'OPEN_TOME')).toBe(true);
  });
});

describe('NTH2 2.3: Entscheidungen an Spieler', () => {
  /** Alle Planeten gleich stark (Archeotech-Gleichstand), A ohne Stronghold = schwächste Allianz */
  function sandboxResults(): CampaignState {
    const s = toStep(startedCampaign(), 'RESULTS');
    s.meta.sandbox = { of: 'orig', baseRev: 1, originalName: 'Test' };
    return s;
  }

  it('Archeotech-Gleichstand: Anführer der schwächsten Allianz wählt', () => {
    let s = sandboxResults();
    const { a, pa, pb } = ids(s);
    for (const p of s.planets) for (const al of s.alliances) p.power[al.id] = 1;
    s.alliances[0].strongholdDestroyed = true;
    expect(weakestAlliance(s)).toBe(a);
    s = run(s, { type: 'EVENT_FORCE', code: 'FW_22', allianceId: null });
    const e = s.events[0];
    expect(eventInputRights(s, e.id, pa).archeotech).toBe(true);
    expect(eventInputRights(s, e.id, pb).archeotech).toBe(false);
    expect(tryRun(s, { type: 'EVENT_INPUT', eventId: e.id, playerId: pb, data: { planetIds: ['masnet', 'karabas', 'kryndaer'] } }).ok).toBe(false);
    expect(tryRun(s, { type: 'EVENT_INPUT', eventId: e.id, playerId: pa, data: { planetIds: ['masnet'] } }).ok).toBe(false);
    s = run(s, { type: 'EVENT_INPUT', eventId: e.id, playerId: pa, data: { planetIds: ['masnet', 'karabas', 'kryndaer'] } });
    s = run(s, { type: 'EVENT_APPLY', eventId: e.id, data: {} });
    expect(s.modifiers.find((m) => m.kind === 'ARCHEOTECH')!.planetIds!.sort()).toEqual(['karabas', 'kryndaer', 'masnet']);
    expect(s.events[0].data.planetIds).toHaveLength(3);
  });

  it('Cult Uprisings: schwächste übrige Allianz wählt den Ort', () => {
    let s = sandboxResults();
    const { a, b, pa, pc } = ids(s);
    for (const p of s.planets) p.power[b] = 1;
    s.planets.find((p) => p.id === 'masnet')!.power[b] = 4;
    s.planets.find((p) => p.id === 'karabas')!.power[b] = 4;
    s.alliances[0].strongholdDestroyed = true;
    expect(weakestAlliance(s, b)).toBe(a);
    s = run(s, { type: 'EVENT_FORCE', code: 'PP_1', allianceId: b });
    const e = s.events[0];
    expect(eventInputRights(s, e.id, pa).cult).toBe(true);
    expect(eventInputRights(s, e.id, pc).cult).toBe(false);
    expect(tryRun(s, { type: 'EVENT_INPUT', eventId: e.id, playerId: pa, data: { planetId: 'kryndaer' } }).ok).toBe(false);
    s = run(s, { type: 'EVENT_INPUT', eventId: e.id, playerId: pa, data: { planetId: 'karabas' } });
    s = run(s, { type: 'EVENT_APPLY', eventId: e.id, data: {} });
    expect(s.events[0].data.planetId).toBe('karabas');
  });

  it('Smuggled Assets: Umzug und Zusatzbau über den Spielerlink', () => {
    let s = sandboxResults();
    const { a, pa, pb } = ids(s);
    s = run(s, { type: 'EVENT_FORCE', code: 'DM_3', allianceId: a });
    const e = s.events[0];
    expect(eventInputRights(s, e.id, pa).smuggled).toBe(true);
    expect(eventInputRights(s, e.id, pb).smuggled).toBe(false);
    const slot = slotsOf(s, 'masnet').findIndex((x) => x.infra?.allianceId === a && x.infra.type === 'FORTIFICATION_LINE');
    expect(tryRun(s, { type: 'EVENT_INPUT', eventId: e.id, playerId: pa, data: { relocations: [{ fromPlanetId: 'masnet', slot, toPlanetId: 'masnet' }] } }).ok).toBe(false);
    s = run(s, { type: 'EVENT_INPUT', eventId: e.id, playerId: pa, data: { relocations: [{ fromPlanetId: 'masnet', slot, toPlanetId: 'felgris-secundas' }], extra: null } });
    s = run(s, { type: 'EVENT_APPLY', eventId: e.id, data: {} });
    expect(slotsOf(s, 'felgris-secundas').some((x) => x.infra?.allianceId === a && x.infra.type === 'FORTIFICATION_LINE')).toBe(true);
    expect(slotsOf(s, 'masnet').some((x) => x.infra?.allianceId === a && x.infra.type === 'FORTIFICATION_LINE')).toBe(false);
  });
});

describe('NTH2 2.4: Würfelwerte im Verarbeitungsprotokoll', () => {
  it('Bombardement zeigt den W6 auch beim Treffer', () => {
    let s = startedCampaign();
    const { fa, c } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PLANETARY_BOMBARDMENT', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
    s = toStep(s, 'REVEAL');
    s = run(s, { type: 'REVEAL_OPS' });
    s = toStep(s, 'BATTLES');
    const b = s.battles[0];
    s = run(s, { type: 'BATTLE_UPDATE', battleId: b.id, update: { playedAt: '2026-01-05T18:00:00Z', vp: { attacker: 70, defender: 20 } } });
    s = toStep(s, 'PROCESS');
    const free = slotsOf(s, 'caltus-novem').findIndex((x) => !x.infra && !x.destroyed);
    s = run(s, { type: 'BATTLE_DECISION', battleId: b.id, opId: b.operationIds[0], decision: { type: 'BOMBARD_A', slot: free, roll: null, shift: 0 } });
    s = run(s, { type: 'BATTLE_PROCESS', battleId: b.id }, [5]);
    const applied = s.battles.find((x) => x.id === b.id)!.applied;
    expect(applied).toContain('Bombardement trifft (5)');
    expect(translateMessage('en', 'Bombardement trifft (5)')).toBe('Bombardment hits (5)');
    // öffentlich: der Wurf steht mit Anlass im Würfelprotokoll
    expect(toPublicView(s).dice.some((d) => d.context.startsWith('Planetary Bombardment') && d.final === 5)).toBe(true);
  });
  it('Setup-Würfe bleiben verdeckt', () => {
    const s = startedCampaign();
    s.dice.push({ id: 'x', at: '', context: 'Konflikt', kind: 'D6', modifier: 0, results: [3], final: 3, mode: 'DIGITAL', public: false, phaseNumber: null });
    expect(toPublicView(s).dice.some((d) => d.id === 'x')).toBe(false);
  });
});

describe('NTH2 2.7: Erinnern – wen betrifft die Aufgabe?', () => {
  it('Termin fehlt → beide Seiten; Vorschlag offen → die antwortende Seite; Meldung → Gegenseite', () => {
    let s = startedCampaign();
    const { fa, c, pa, pc } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'SUPPLY_BASE_RAID', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
    s = toStep(s, 'REVEAL');
    s = run(s, { type: 'REVEAL_OPS' });
    const b = s.battles[0];
    expect(reminderTarget(s, b)).toEqual({ reason: 'SCHEDULE', playerIds: [pa, pc] });
    s = run(s, { type: 'TIME_PROPOSE', battleId: b.id, playerId: pa, times: ['2026-02-01T18:00:00Z'] });
    expect(reminderTarget(s, s.battles[0])).toEqual({ reason: 'SCHEDULE', playerIds: [pc] });
    s = toStep(s, 'BATTLES');
    s = run(s, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: pa, update: { playedAt: '2026-01-05T18:00:00Z', vp: { attacker: 60, defender: 40 } } });
    expect(reminderTarget(s, s.battles[0])).toEqual({ reason: 'CONFIRM', playerIds: [pc] });
  });
});

describe('NTH2 2.6: Kampagnen-Vorlagen', () => {
  it('übernimmt Regeln, Karte, Texte, Rhythmus und eigene Ereignisse – nicht Spieler und Spielstand', () => {
    let s = startedCampaign();
    s = run(s, { type: 'TOGGLES_UPDATE', toggles: { ...s.toggles, theatreTwists: false, houseRules: { A6_HANDICAP_NO_TEST: true } } });
    s = run(s, { type: 'META_UPDATE', intro: 'Willkommen', battleSizes: [{ id: 'kt', name: 'Kill Team', points: 500, duration: '1 h', reserves: 0 }] });
    s = run(s, { type: 'PLANET_TEXT', planetId: 'masnet', lore: 'Wüstenwelt', notes: 'geheim' });
    s = run(s, { type: 'CUSTOM_EVENT_UPSERT', def: def({ phase: 2, effects: [{ kind: 'PL', alliance: ids(s).a, planet: 'masnet', delta: 1 }] }) });
    s.phases[0].startDate = '2026-01-01T00:00:00Z';
    s.phases[0].opsDeadline = '2026-01-04T00:00:00Z';
    s.phases[0].battlesDeadline = '2026-01-11T00:00:00Z';
    s.phases[0].endDate = '2026-01-13T00:00:00Z';
    const tpl = extractTemplate(s);
    expect(JSON.stringify(tpl)).not.toContain('geheim');
    expect(tpl.meta.rhythm).toEqual({ ops: 3 * 86400000, battles: 10 * 86400000, end: 12 * 86400000 });

    const fresh = createCampaignState({ name: 'Neu', phaseCount: 6, allianceCount: 3, now: '2026-03-01T00:00:00Z' });
    const m = templateMap(tpl);
    const n = applyTemplate(fresh, tpl, m.rename, '2026-03-01T00:00:00Z', idGen);
    expect(n.meta.name).toBe('Neu');
    expect(n.meta.intro).toBe('Willkommen');
    expect(n.meta.battleSizes?.[0].name).toBe('Kill Team');
    expect(n.toggles.theatreTwists).toBe(false);
    expect(n.toggles.houseRules?.A6_HANDICAP_NO_TEST).toBe(true);
    expect(n.alliances.map((a) => a.name)).toEqual(['Rot', 'Blau', 'Grün']);
    expect(n.players).toEqual([]);
    expect(n.stage).toEqual({ kind: 'SETUP', step: 'W0' });
    expect(n.planets.find((p) => p.id === 'masnet')!.lore).toBe('Wüstenwelt');
    expect(n.customEvents?.[0].phase).toBe(2);
    expect(n.customEvents?.[0].effects[0]).toMatchObject({ alliance: ids(s).a, planet: 'masnet' });
    // Rhythmus schlägt Termine für Phase 1 vor
    n.phases.push({ ...s.phases[0], number: 1, startDate: null, opsDeadline: null, battlesDeadline: null, endDate: null });
    const d = proposePhaseDates(n, 1, '2026-03-01T00:00:00Z');
    expect(d.opsDeadline).toBe('2026-03-04T00:00:00.000Z');
  });

  it('2 statt 3 Allianzen: Allianzen entfallen, Bezüge werden zur Ziel-Allianz', () => {
    let s = startedCampaign();
    s = run(s, { type: 'CUSTOM_EVENT_UPSERT', def: def({ target: ids(s).b, effects: [{ kind: 'POINTS', alliance: ids(s).a, delta: 1 }] }) });
    const tpl = extractTemplate(s);
    const n = applyTemplate(createCampaignState({ name: 'Neu', phaseCount: 3, allianceCount: 2 }), tpl, {}, '2026-03-01T00:00:00Z', idGen);
    expect(n.alliances).toEqual([]);
    expect(n.customEvents?.[0]).toMatchObject({ target: null, effects: [{ kind: 'POINTS', alliance: 'TARGET', delta: 1 }] });
  });
});
