import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from '@/engine/commands';
import { CommandSchema, parseCommand } from '@/engine/commandSchema';
import { createCampaignState } from '@/engine/init';
import { adjacent, distance, planetName, registerMap, withMap, type MapDef } from '@/engine/map';
import { eventWindow, isIsoDate } from '@/engine/logTime';
import { authorizePlayer, DRAFT_CHANGED } from '@/engine/playerActions';
import type { CampaignState } from '@/engine/types';
import { ids, idGen, run, startedCampaign } from './helpers';

/**
 * Architektur-Review: S2 (Command-Schema), F1 (strikte Zeitpunkte), S4/F2 (Versionsbindung der Ergebnis-Meldung)
 * und S6 (Planeten-Registry je Kampagne).
 */

const exec = (s: CampaignState, cmd: unknown, force = true) => executeCommand(s, cmd as Command, { force, reason: 'test', idGen, dice: { mode: 'DIGITAL', manual: [], random: () => 4 } });
const errorOf = (r: ReturnType<typeof executeCommand>) => (!r.ok && r.kind === 'error' ? r.error : null);

describe('S2 · Command-Schema', () => {
  it('unbekannte Felder werden entfernt – auch in verschachtelten Daten (kein Mass Assignment)', () => {
    const s = startedCampaign();
    const { pa } = ids(s);
    const raw = { type: 'PLAYER_UPSERT', id: pa, data: { notes: 'ok', id: 'gekapert', memberships: [], isAdmin: true, goals: [{ id: 'x' }] }, evil: 1 };
    const p = parseCommand(raw);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.cmd).toEqual({ type: 'PLAYER_UPSERT', id: pa, data: { notes: 'ok' } });
    const st = run(s, raw as unknown as Command);
    const me = st.players.find((x) => x.id === pa)!;
    expect(me.notes).toBe('ok');
    expect(me.memberships.length).toBeGreaterThan(0);
    expect(me).not.toHaveProperty('isAdmin');
    expect(me.goals).toBeUndefined();
    expect(st.players.some((x) => x.id === 'gekapert')).toBe(false);
  });

  it('ungültige Zeitpunkte werden abgewiesen: Maximaldatum, Zahlen, außerhalb 2000–2100, kein ISO', () => {
    const s = startedCampaign();
    for (const t of ['+275760-09-13T00:00:00.000Z', '1999-12-31T23:00:00Z', '2101-01-01T00:00:00Z', 'morgen', 'Tue Jan 06 2026', '2026-13-01T00:00:00Z', 1767225600000, {}]) {
      expect(isIsoDate(t), String(t)).toBe(false);
      expect(errorOf(exec(s, { type: 'PHASE_UPDATE', phase: 1, opsDeadline: t }))).toBe('Ungültige Eingabe (opsDeadline)');
    }
    for (const t of ['2026-01-05', '2026-01-05T19:00', '2026-01-05T19:00:00Z', '2026-01-05T19:00:00.123+02:00']) expect(isIsoDate(t), t).toBe(true);
    const ok = run(s, { type: 'PHASE_UPDATE', phase: 1, opsDeadline: '2026-01-05T19:00:00.000Z' });
    expect(ok.phases[0].opsDeadline).toBe('2026-01-05T19:00:00.000Z');
    // „Gespielt am“ und Hobby-Datum ebenso
    const b = { type: 'BATTLE_UPDATE', battleId: 'x', update: { playedAt: '+275760-09-13T00:00:00.000Z' } };
    expect(errorOf(exec(s, b))).toBe('Ungültige Eingabe (update.playedAt)');
    expect(errorOf(exec(s, { type: 'HOBBY_ADD', playerId: ids(s).pa, entry: { date: '9999-01-01', unit: 'x', status: 'DONE', photo: null, points: 10 } }))).toBe('Ungültige Eingabe (entry.date)');
    expect(errorOf(exec(s, { type: 'GRAND_UPDATE', update: { scheduledAt: '3000-01-01T00:00:00Z' } }))).toBe('Ungültige Eingabe (update.scheduledAt)');
  });

  it('NaN, Unendlich und riesige Zahlen werden abgewiesen, Text statt Zahl ebenso', () => {
    const s = startedCampaign();
    const { a } = ids(s);
    for (const count of [NaN, Infinity, -Infinity, 1e9, 1.5, '1']) expect(errorOf(exec(s, { type: 'FLEET_SET_COUNT', allianceId: a, count })), String(count)).toBe('Ungültige Eingabe (count)');
    expect(errorOf(exec(s, { type: 'OVERRIDE_POINTS', phaseNumber: 1, allianceId: a, points: Number.MAX_SAFE_INTEGER }))).toBe('Ungültige Eingabe (points)');
    expect(errorOf(exec(s, { type: 'BATTLE_UPDATE', battleId: 'x', update: { vp: { attacker: 1e12, defender: 0 } } }))).toBe('Ungültige Eingabe (update.vp.attacker)');
    expect(errorOf(exec(s, { type: 'BATTLE_UPDATE', battleId: 'x', update: { vp: { attacker: NaN, defender: 0 } } }))).toBe('Ungültige Eingabe (update.vp.attacker)');
  });

  it('__proto__, constructor und prototype als Schlüssel sind harmlos', () => {
    const s = startedCampaign();
    const { fa, pa } = ids(s);
    // als Schlüssel einer Zuordnung: __proto__ fällt weg, constructor/prototype werden abgelehnt
    const starts = JSON.parse(`{"__proto__": {"polluted": "ja"}, "${fa}": "kryndaer"}`);
    const ps = parseCommand({ type: 'SETUP_FLEET_STARTS', starts });
    expect(ps.ok).toBe(true);
    if (ps.ok) {
      const out = (ps.cmd as Extract<Command, { type: 'SETUP_FLEET_STARTS' }>).starts;
      expect(Object.keys(out)).toEqual([fa]);
      expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    }
    expect(errorOf(exec(s, { type: 'SETUP_FLEET_STARTS', starts: JSON.parse(`{"constructor": "kryndaer"}`) }))).toMatch(/^Ungültige Eingabe \(starts/);
    expect(errorOf(exec(s, { type: 'MODULE_ACTION', action: 'X', data: JSON.parse('{"constructor": {"prototype": {"polluted": "ja"}}}') }))).toMatch(/^Ungültige Eingabe \(data/);
    // als Feld eines Objekts: entfernt
    const raw = JSON.parse(`{"type": "PLAYER_UPSERT", "id": "${pa}", "data": {"__proto__": {"polluted": "ja"}, "notes": "n"}, "__proto__": {"polluted": "ja"}}`);
    const p = parseCommand(raw);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(Object.getPrototypeOf(p.cmd)).toBe(Object.prototype);
      expect(Object.keys((p.cmd as Extract<Command, { type: 'PLAYER_UPSERT' }>).data)).toEqual(['notes']);
    }
    const st = run(s, raw);
    expect((st.players.find((x) => x.id === pa) as unknown as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('Modul-Commands: begrenztes allgemeines Schema, das Modul entscheidet', () => {
    const s = startedCampaign();
    expect(errorOf(exec(s, { type: 'MODULE_ACTION', action: 'X', data: { n: Infinity } }))).toMatch(/^Ungültige Eingabe \(data\.n/);
    expect(errorOf(exec(s, { type: 'MODULE_ACTION', action: 'X', data: { t: 'x'.repeat(6000) } }))).toMatch(/^Ungültige Eingabe \(data\.t/);
    // unbekannter, wohlgeformter Typ geht an das Modul (und wird dort abgelehnt)
    expect(errorOf(exec(s, { type: 'EIGENE_AKTION', wert: 1 }))).toMatch(/Regelmodul/);
    expect(errorOf(exec(s, { type: 'eigene aktion' }))).toBe('Ungültige Eingabe (type)');
    expect(errorOf(exec(s, { type: 'EIGENE_AKTION', wert: NaN }))).toMatch(/^Ungültige Eingabe/);
  });

  it('Steuerzeichen werden weiterhin entfernt, Größenprüfung gilt weiterhin', () => {
    const p = parseCommand({ type: 'NOTE_ADD', allianceId: 'al1', playerId: null, text: 'a\u0000b‮c' });
    expect(p.ok && (p.cmd as Extract<Command, { type: 'NOTE_ADD' }>).text).toBe('ab‮c');
    expect(parseCommand({ type: 'NOTE_ADD', allianceId: 'al1', playerId: null, text: 'x'.repeat(70_000) }, true)).toEqual({ ok: false, error: 'Die Eingabe ist zu groß' });
    expect(parseCommand(null)).toEqual({ ok: false, error: 'Ungültige Aktion' });
  });

  it('jeder bekannte Command-Typ hat ein Schema', () => {
    const types = CommandSchema.options.map((o) => o.shape.type.value);
    expect(new Set(types).size).toBe(types.length);
    expect(types).toContain('RESULT_DRAFT_CONFIRM');
    expect(types).toContain('PLANET_TRAITS_SET');
  });
});

describe('F1 · Terminvorschläge nur mit gültigen Zeitpunkten', () => {
  const toBattle = () => {
    let s = startedCampaign();
    const { fa, c } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
    s = run(s, { type: 'ADVANCE' });
    s = run(s, { type: 'REVEAL_OPS' });
    return { s, b: s.battles.find((x) => x.kind === 'CAMPAIGN')! };
  };

  it('Maximaldatum und Zahlen als Terminvorschlag werden abgewiesen (Nachweis exploit-maxdate)', () => {
    const { s, b } = toBattle();
    const { pa } = ids(s);
    const MAX = '+275760-09-13T00:00:00.000Z';
    expect(errorOf(exec(s, { type: 'TIME_PROPOSE', battleId: b.id, playerId: pa, times: [MAX] }))).toBe('Ungültige Eingabe (times.0)');
    expect(errorOf(exec(s, { type: 'TIME_PROPOSE', battleId: b.id, playerId: pa, times: [1767225600000] }))).toBe('Ungültige Eingabe (times.0)');
    expect(errorOf(exec(s, { type: 'TIME_ACCEPT', battleId: b.id, playerId: pa, time: MAX }))).toBe('Ungültige Eingabe (time)');
    // gültige Vorschläge funktionieren weiter
    const st = run(s, { type: 'TIME_PROPOSE', battleId: b.id, playerId: pa, times: ['2026-01-05T19:00:00.000Z'] });
    const done = run(st, { type: 'TIME_ACCEPT', battleId: b.id, playerId: ids(s).pc, time: '2026-01-05T19:00:00.000Z' });
    expect(done.battles.find((x) => x.id === b.id)!.scheduledAt).toBe('2026-01-05T19:00:00.000Z');
  });

  it('Kalender überspringen ungültige Altwerte statt abzustürzen', () => {
    expect(eventWindow('+275760-09-13T00:00:00.000Z')).toBeNull();
    expect(eventWindow(1767225600000)).toBeNull();
    expect(eventWindow('kaputt')).toBeNull();
    expect(eventWindow('1970-01-01T00:00:00Z')).toBeNull();
    expect(eventWindow('2026-01-05T19:00:00Z')).toEqual({ start: '2026-01-05T19:00:00.000Z', end: '2026-01-05T22:00:00.000Z' });
  });
});

describe('S4/F2 · Bestätigen und Widersprechen sind an den Stand der Meldung gebunden', () => {
  const setup = () => {
    let s = startedCampaign();
    const { fa, c } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
    s = run(s, { type: 'ADVANCE' });
    s = run(s, { type: 'REVEAL_OPS' });
    return { s, b: s.battles.find((x) => x.kind === 'CAMPAIGN')! };
  };
  const submit = (s: CampaignState, bid: string, pid: string, attacker: number, defender: number, now: string) =>
    executeCommand(s, { type: 'RESULT_DRAFT_SUBMIT', battleId: bid, playerId: pid, update: { vp: { attacker, defender } } }, { force: true, now, idGen });

  it('Köder und Tausch: die Bestätigung des alten Stands wird abgewiesen (Nachweis swap)', () => {
    const { s, b } = setup();
    const { pa, pc } = ids(s);
    // 1. Angreifer meldet ein knappes Ergebnis, die Gegenseite lädt die Seite
    let r = submit(s, b.id, pa, 61, 60, '2026-01-05T20:00:00.000Z');
    expect(r.ok).toBe(true);
    let st = r.ok ? r.state : s;
    const seen = st.battles.find((x) => x.id === b.id)!.draft!.at;
    // 2. er ersetzt die Meldung still durch 100:0
    r = submit(st, b.id, pa, 100, 0, '2026-01-05T20:05:00.000Z');
    expect(r.ok).toBe(true);
    st = r.ok ? r.state : st;
    // 3. die Gegenseite bestätigt den gesehenen Stand → abgewiesen, Schlacht unverändert
    expect(errorOf(exec(st, { type: 'RESULT_DRAFT_CONFIRM', battleId: b.id, playerId: pc, draftAt: seen }))).toBe(DRAFT_CHANGED);
    expect(errorOf(exec(st, { type: 'RESULT_DRAFT_DISPUTE', battleId: b.id, playerId: pc, reason: 'falsch', draftAt: seen }))).toBe(DRAFT_CHANGED);
    expect(st.battles.find((x) => x.id === b.id)!.vp).toBeNull();
    // mit dem aktuellen Stand gilt die Bestätigung
    const cur = st.battles.find((x) => x.id === b.id)!.draft!.at;
    const ok = run(st, { type: 'RESULT_DRAFT_CONFIRM', battleId: b.id, playerId: pc, draftAt: cur });
    expect(ok.battles.find((x) => x.id === b.id)!.vp).toEqual({ attacker: 100, defender: 0 });
  });

  it('Spieler müssen den Stand mitschicken, der Spielleiter nicht', () => {
    const { s, b } = setup();
    const { pa, pc } = ids(s);
    const st = run(s, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: pa, update: { vp: { attacker: 10, defender: 5 } } });
    const me = st.players.find((x) => x.id === pc)!;
    expect(authorizePlayer(st, me, { type: 'RESULT_DRAFT_CONFIRM', battleId: b.id, playerId: pc })).toBe(DRAFT_CHANGED);
    expect(authorizePlayer(st, me, { type: 'RESULT_DRAFT_DISPUTE', battleId: b.id, playerId: pc, reason: 'x' })).toBe(DRAFT_CHANGED);
    expect(authorizePlayer(st, me, { type: 'RESULT_DRAFT_CONFIRM', battleId: b.id, playerId: pc, draftAt: st.battles.find((x) => x.id === b.id)!.draft!.at })).toBeNull();
    expect(run(st, { type: 'RESULT_DRAFT_CONFIRM', battleId: b.id, playerId: null }).battles.find((x) => x.id === b.id)!.vp).toEqual({ attacker: 10, defender: 5 });
  });
});

describe('S6 · Planeten-Registry je Kampagne', () => {
  const makeMap = (prefix: string, chain: boolean): MapDef => ({
    name: `${prefix}-Karte`,
    template: null,
    background: null,
    planets: [1, 2, 3, 4, 5, 6].map((n) => ({ id: `p-s6-${n}`, name: `${prefix}-${n}`, system: '', slots: 2, theatres: ['SPACEPORT'], x: n * 10, y: 50 })),
    // A: Kette 1-2-3-4-5-6; B: Stern um Planet 6
    connections: chain
      ? [
          ['p-s6-1', 'p-s6-2'],
          ['p-s6-2', 'p-s6-3'],
          ['p-s6-3', 'p-s6-4'],
          ['p-s6-4', 'p-s6-5'],
          ['p-s6-5', 'p-s6-6'],
        ]
      : [1, 2, 3, 4, 5].map((n) => [`p-s6-${n}`, 'p-s6-6'] as [string, string]),
  });
  const campaign = (map: MapDef) => {
    const s = createCampaignState({ name: map.name, phaseCount: 3, allianceCount: 2, now: '2026-01-01T00:00:00Z' });
    s.map = map;
    s.planets = map.planets.map((p) => ({ id: p.id, power: {}, destroyed: false, slots: [], lore: '', notes: '' }));
    return s;
  };

  it('zwei Kampagnen mit gleichen Planeten-IDs beeinflussen sich nicht', () => {
    const A = campaign(makeMap('Alpha', true));
    const B = campaign(makeMap('Beta', false));
    // B wird zuletzt global bekannt gemacht (früher: letzter Schreiber gewinnt für alle Kampagnen)
    registerMap(A.map!);
    registerMap(B.map!);
    const r = exec(A, { type: 'PLANET_TEXT', planetId: 'p-s6-1', lore: 'x' });
    expect(r.ok && r.log).toEqual(['Texte zu Alpha-1 aktualisiert']);
    const rb = exec(B, { type: 'PLANET_TEXT', planetId: 'p-s6-1', lore: 'x' });
    expect(rb.ok && rb.log).toEqual(['Texte zu Beta-1 aktualisiert']);
    // Nachbarschaft und Entfernung je Karte
    withMap(A, () => {
      expect(planetName('p-s6-1')).toBe('Alpha-1');
      expect(adjacent('p-s6-1', 'p-s6-6')).toBe(false);
      expect(distance('p-s6-1', 'p-s6-6')).toBe(5);
    });
    withMap(B, () => {
      expect(planetName('p-s6-1')).toBe('Beta-1');
      expect(adjacent('p-s6-1', 'p-s6-6')).toBe(true);
      expect(distance('p-s6-1', 'p-s6-6')).toBe(1);
    });
    // verschachtelt und nach Fehlern wird der vorige Kontext wiederhergestellt
    withMap(A, () => {
      expect(() =>
        withMap(B, () => {
          throw new Error('x');
        }),
      ).toThrow('x');
      expect(planetName('p-s6-2')).toBe('Alpha-2');
    });
    // Planeten einer fremden Karte sind innerhalb eines Commands unbekannt
    const v = campaign(makeMap('Gamma', true));
    v.map = { ...v.map!, planets: v.map!.planets.map((p) => ({ ...p, id: p.id.replace('s6', 's6g') })), connections: [] };
    withMap(v, () => expect(planetName('p-s6-1')).toBe('p-s6-1'));
    // außerhalb eines Commands gilt weiter der globale Rückfall (Oberfläche)
    expect(planetName('p-s6-1')).toBe('Beta-1');
  });
});
