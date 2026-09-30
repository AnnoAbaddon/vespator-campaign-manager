import { describe, expect, it } from 'vitest';
import { run, tryRun, startedCampaign, ids, PL, idGen } from './helpers';
import { executeCommand, type Command } from '@/engine/commands';
import { archeotechWinners } from '@/engine/phase';
import { adoptImportedMap, migrateState } from '@/engine/migrate';
import { validateState } from '@/engine/schema';
import { adjacent, planetName } from '@/engine/map';
import { toPublicView } from '@/engine/publicView';
import type { CampaignState } from '@/engine/types';

/**
 * Engine-Review (Welle 4): aus den Nachweis-Skripten des Reviews übernommene Regressionstests.
 * Jeder Block beschreibt den gefundenen Fehler und das korrigierte Verhalten.
 */

const adv = (s: CampaignState, n: number) => {
  for (let i = 0; i < n; i++) s = run(s, { type: 'ADVANCE' });
  return s;
};
const exec = (s: CampaignState, cmd: Command, opts: { force?: boolean; reason?: string; manual?: number[] } = {}) =>
  executeCommand(s, cmd, { force: opts.force ?? false, reason: opts.reason, idGen, dice: { mode: opts.manual ? 'MANUAL' : 'DIGITAL', manual: opts.manual ?? [], random: () => 4 } });
const errorOf = (r: ReturnType<typeof executeCommand>) => (!r.ok && r.kind === 'error' ? r.error : null);
const battleOp = (b: string, attackType: 'PURGE_AND_BURN' | 'SUPPLY_BASE_RAID' | 'ORBITAL_INVASION', planet = 'kryndaer') => ({ type: 'BATTLE' as const, attackType, targetPlanetId: planet, targetAllianceId: b });

describe('1 · OP_SET/OP_CLEAR: nur Slot 1 oder 2', () => {
  it('Slot 3, 4 oder "2" wird abgewiesen – keine dritte Battle Operation ohne Defiant Zeal', () => {
    let s = startedCampaign();
    const { fa, b } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: battleOp(b, 'PURGE_AND_BURN') });
    for (const slot of [3, 4, '2', 0]) {
      const r = exec(s, { type: 'OP_SET', fleetId: fa, slot: slot as unknown as 1, op: battleOp(b, 'SUPPLY_BASE_RAID') });
      // S2: Text statt Zahl scheitert schon am Command-Schema
      const msg = typeof slot === 'string' ? 'Ungültige Eingabe (slot)' : 'Ungültiger Operations-Slot (1 oder 2)';
      expect(errorOf(r)).toBe(msg);
      expect(errorOf(exec(s, { type: 'OP_CLEAR', fleetId: fa, slot: slot as unknown as 1 }))).toBe(msg);
    }
    s = adv(s, 2);
    expect(s.battles.filter((x) => x.attackerAllianceId === s.fleets.find((f) => f.id === fa)!.allianceId)).toHaveLength(1);
  });

  it('Slot 2 bleibt mit Defiant Zeal erlaubt', () => {
    let s = startedCampaign();
    const { fa, a, b } = ids(s);
    s.modifiers.push({ id: 'dz', source: 'x', kind: 'DEFIANT_ZEAL', phaseNumber: 1, allianceId: a });
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: battleOp(b, 'PURGE_AND_BURN') });
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 2, op: battleOp(b, 'SUPPLY_BASE_RAID') });
    expect(s.phases[0].operations.filter((o) => o.fleetId === fa)).toHaveLength(2);
  });
});

describe('2 · Outcome-Verschiebung (shift) nur als ganze Zahl im Rahmen der Quellen', () => {
  const setup = () => {
    let s = startedCampaign();
    const { fa, a, b } = ids(s);
    const k = s.planets.find((p) => p.id === 'kryndaer')!;
    k.power[a] = 1;
    k.power[b] = 4;
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: battleOp(b, 'PURGE_AND_BURN') });
    return adv(s, 4); // OPS → PROCESS, ungespielt → Angreifer siegt
  };

  it('Text "1" wird beim Eintragen abgewiesen', () => {
    const s = setup();
    const bt = s.battles[0];
    const r = exec(s, { type: 'BATTLE_DECISION', battleId: bt.id, opId: bt.operationIds[0], decision: { type: 'PURGE_A', shift: '1' } as never });
    // S2: Text statt Zahl scheitert schon am Command-Schema
    expect(errorOf(r)).toBe('Ungültige Eingabe (decision.shift)');
  });

  it('eine bereits gespeicherte Text-Verschiebung scheitert beim Verarbeiten statt PL „11“ zu erzeugen', () => {
    const s = setup();
    const { b } = ids(s);
    const bt = s.battles[0];
    bt.decisions[bt.operationIds[0]] = { type: 'PURGE_A', shift: '1' } as never;
    const r = exec(s, { type: 'BATTLE_PROCESS', battleId: bt.id }, { force: true });
    expect(errorOf(r)).toMatch(/ganze Zahl/);
    expect(PL(s, b, 'kryndaer')).toBe(4);
  });

  it('mehr als ±2 wird beim Eintragen abgewiesen, mehr als die Quellen beim Verarbeiten', () => {
    const s = setup();
    const { b } = ids(s);
    const bt = s.battles[0];
    const dec = (shift: number) => ({ type: 'BATTLE_DECISION', battleId: bt.id, opId: bt.operationIds[0], decision: { type: 'PURGE_A', shift } }) as Command;
    expect(errorOf(exec(s, dec(3)))).toBe('Entscheidung ungültig: Power Level höchstens um ±2 anders behandeln');
    expect(errorOf(exec(s, dec(1.5)))).toBe('Entscheidung ungültig: Power Level nur um eine ganze Zahl anders behandeln');
    // Die Quellen zählen zum Stand der Verarbeitung (2.4) – ohne F-15 höchstens ±1
    const s2 = run(s, dec(2));
    expect(errorOf(exec(s2, { type: 'BATTLE_PROCESS', battleId: bt.id }, { force: true }))).toMatch(/^Entscheidung ungültig: /);
    expect(PL(s2, b, 'kryndaer')).toBe(4);
  });

  it('fehlende Verschiebung (ältere Entscheidungen) gilt als 0', () => {
    const s = setup();
    const { a } = ids(s);
    const bt = s.battles[0];
    bt.decisions[bt.operationIds[0]] = { type: 'PURGE_A' } as never;
    const st = run(s, { type: 'BATTLE_PROCESS', battleId: bt.id });
    expect(PL(st, a, 'kryndaer')).toBe(2);
  });
});

describe('3 · Ergebnis-Entwürfe: VP als ganze Zahlen ≥ 0, Datum gültig', () => {
  const toBattles = () => {
    let s = startedCampaign();
    const { fa, b } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: battleOp(b, 'PURGE_AND_BURN') });
    return adv(s, 3);
  };

  it('Text-VP („10“ gegen „9“) werden abgewiesen – Entwurf und Spielleiter', () => {
    const s = toBattles();
    const { pb } = ids(s);
    const bt = s.battles[0];
    const sub = { type: 'RESULT_DRAFT_SUBMIT', battleId: bt.id, playerId: pb, update: { vp: { attacker: '10', defender: '9' } } } as never;
    // S2: Text-VP scheitern schon am Command-Schema
    expect(errorOf(exec(s, sub))).toBe('Ungültige Eingabe (update.vp.attacker)');
    expect(errorOf(exec(s, { type: 'BATTLE_UPDATE', battleId: bt.id, update: { vp: { attacker: '10', defender: '9' } as never } }))).toBe('Ungültige Eingabe (update.vp.attacker)');
    expect(errorOf(exec(s, { type: 'BATTLE_UPDATE', battleId: bt.id, update: { vp: { attacker: -5, defender: 9 } } }))).toBe('VP müssen ganze Zahlen ab 0 sein');
    expect(errorOf(exec(s, { type: 'BATTLE_UPDATE', battleId: bt.id, update: { vp: { attacker: 1.5, defender: 9 } } }))).toBe('VP müssen ganze Zahlen ab 0 sein');
  });

  it('ungültiges Datum wird abgewiesen, gültiges als ISO-Zeitstempel gespeichert', () => {
    const s = toBattles();
    const { pa, pb } = ids(s);
    const bt = s.battles[0];
    const sub = (playedAt: string) => ({ type: 'RESULT_DRAFT_SUBMIT', battleId: bt.id, playerId: pb, update: { vp: { attacker: 10, defender: 9 }, playedAt } }) as const;
    // S2: kein ISO-Zeitpunkt – scheitert schon am Command-Schema
    expect(errorOf(exec(s, sub('gestern')))).toBe('Ungültige Eingabe (update.playedAt)');
    let st = run(s, sub('2026-01-05T19:00:00+01:00'), [], { force: false });
    st = run(st, { type: 'RESULT_DRAFT_CONFIRM', battleId: bt.id, playerId: pa }, [], { force: false });
    const r = st.battles[0];
    expect(r.victor).toBe('ATTACKER');
    expect(r.playedAt).toBe('2026-01-05T18:00:00.000Z');
    // leeres Datum = kein Datum
    st = run(st, { type: 'BATTLE_UPDATE', battleId: bt.id, update: { playedAt: '' } });
    expect(st.battles[0].playedAt).toBeNull();
  });

  it('Verarbeitungsreihenfolge sortiert nach Zeitpunkt, nicht nach Text', async () => {
    const { processQueue } = await import('@/engine/phase');
    let s = startedCampaign();
    const { fa, fc, b } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: battleOp(b, 'PURGE_AND_BURN') });
    s = run(s, { type: 'OP_SET', fleetId: fc, slot: 1, op: battleOp(b, 'PURGE_AND_BURN', 'ikaron-prime') });
    s = adv(s, 3);
    const [b1, b2] = s.battles;
    s = run(s, { type: 'BATTLE_UPDATE', battleId: b1.id, update: { playedAt: '2026-01-05T20:00:00Z', vp: { attacker: 10, defender: 5 } } });
    s = run(s, { type: 'BATTLE_UPDATE', battleId: b2.id, update: { playedAt: '2026-01-05T21:00:00+02:00', vp: { attacker: 10, defender: 5 } } });
    // Altstand mit Text-Datum: +02:00 liegt zeitlich vor 20:00Z
    s.battles.find((x) => x.id === b2.id)!.playedAt = '2026-01-05T21:00:00+02:00';
    expect(processQueue({ state: s }, 1).map((x) => x.id)).toEqual([b2.id, b1.id]);
  });
});

describe('4 · An Open Tome: offengelegte Operation nicht zurückziehbar', () => {
  it('OP_CLEAR nach OPEN_TOME_REVEAL scheitert', () => {
    let s = startedCampaign();
    const { fa, a, b } = ids(s);
    s.modifiers.push({ id: 'm1', source: 'x', kind: 'OPEN_TOME', phaseNumber: 1, allianceId: a });
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: battleOp(b, 'PURGE_AND_BURN') });
    s = run(s, { type: 'OPEN_TOME_REVEAL' });
    expect(errorOf(exec(s, { type: 'OP_CLEAR', fleetId: fa, slot: 1 }))).toBe('Die Operationen dieser Allianz sind bereits offengelegt (An Open Tome)');
    // andere Allianzen bleiben frei
    const { fb } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fb, slot: 1, op: { type: 'KILL_TEAMS', killTeamPlanetId: 'novamagnor' } });
    expect(exec(s, { type: 'OP_CLEAR', fleetId: fb, slot: 1 }).ok).toBe(true);
  });
});

describe('5 · Harte Obergrenze (A4) auch für Ergebnis-Entwürfe', () => {
  const setup = () => {
    let s = startedCampaign();
    const { fa, fc, b } = ids(s);
    s = run(s, { type: 'PLAYER_UPSERT', data: { nickname: 'P4', faction: 'Eldar' }, allianceId: b });
    const p4 = s.players.find((p) => p.nickname === 'P4')!.id;
    s.toggles.loadCap = { maxDefences: null, maxGames: 1 };
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: battleOp(b, 'PURGE_AND_BURN') });
    s = run(s, { type: 'OP_SET', fleetId: fc, slot: 1, op: battleOp(b, 'PURGE_AND_BURN', 'ikaron-prime') });
    s = adv(s, 3);
    s = run(s, { type: 'BATTLE_CLAIM_SIDE', battleId: s.battles[0].id, playerId: p4 }, [], { force: false });
    return { s, p4 };
  };

  it('Entwurf mit ausgelastetem Mitspieler braucht Bestätigung (Spielerlinks scheitern daran)', () => {
    const { s, p4 } = setup();
    const { pb } = ids(s);
    const b2 = s.battles[1];
    const sub = {
      type: 'RESULT_DRAFT_SUBMIT',
      battleId: b2.id,
      playerId: pb,
      update: {
        defenders: [
          { playerId: pb, faction: '' },
          { playerId: p4, faction: '' },
        ],
        vp: { attacker: 10, defender: 50 },
      },
    } as Command;
    const r = exec(s, sub);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.kind === 'confirm' && r.warnings.join(' ')).toMatch(/Obergrenze: P4/);
  });

  it('Bestätigen eines (älteren) Entwurfs prüft die Obergrenze ebenfalls', () => {
    const { s, p4 } = setup();
    const { pb, pc } = ids(s);
    const b2 = s.battles[1];
    b2.draft = {
      byPlayerId: pb,
      at: '2026-01-02T00:00:00Z',
      update: {
        defenders: [
          { playerId: pb, faction: '' },
          { playerId: p4, faction: '' },
        ],
        vp: { attacker: 10, defender: 50 },
      },
      decisions: {},
      status: 'PENDING',
    };
    const r = exec(s, { type: 'RESULT_DRAFT_CONFIRM', battleId: b2.id, playerId: pc });
    expect(!r.ok && r.kind === 'confirm' && r.warnings.join(' ')).toMatch(/Obergrenze: P4/);
  });
});

describe('6 · Verfallene/verschobene Schlachten haben keinen Sieger', () => {
  it('VOID setzt den Sieger zurück, Archeotech zählt die Schlacht nicht', () => {
    let s = startedCampaign();
    const { fa, b } = ids(s);
    s.modifiers.push({ id: 'm2', source: 'x', kind: 'ARCHEOTECH', phaseNumber: 1, allianceId: null, planetIds: ['kryndaer'] });
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: battleOp(b, 'PURGE_AND_BURN') });
    s = adv(s, 4);
    s = run(s, { type: 'BATTLE_UNPLAYED', battleId: s.battles[0].id, resolution: 'VOID' }, [], { reason: 'verfällt' });
    expect(s.battles[0].victor).toBeNull();
    expect(s.battles[0].decisions).toEqual({});
    expect(archeotechWinners({ state: s }, 1).kryndaer).toBeNull();
  });

  it('ältere Stände: VOID mit gespeichertem Sieger zählt nicht', () => {
    let s = startedCampaign();
    const { fa, b } = ids(s);
    s.modifiers.push({ id: 'm2', source: 'x', kind: 'ARCHEOTECH', phaseNumber: 1, allianceId: null, planetIds: ['kryndaer'] });
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: battleOp(b, 'PURGE_AND_BURN') });
    s = adv(s, 4);
    Object.assign(s.battles[0], { status: 'VOID', unplayedResolution: 'VOID', victor: 'ATTACKER' });
    expect(archeotechWinners({ state: s }, 1).kryndaer).toBeNull();
  });
});

describe('7 · „Alle verarbeiten“ im manuellen Würfelmodus', () => {
  it('ein für Schlacht 1 eingetragener Wurf wird nicht von Schlacht 2 verbraucht', () => {
    let s = startedCampaign();
    const { fa, fc, b } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: battleOp(b, 'SUPPLY_BASE_RAID') });
    s = run(s, { type: 'OP_SET', fleetId: fc, slot: 1, op: battleOp(b, 'SUPPLY_BASE_RAID', 'ikaron-prime') });
    s = adv(s, 4);
    const [b1, b2] = s.battles;
    // Schlacht 1: zweiter Versuch auf einem nicht verbundenen Planeten → wird nach dem ersten Wurf übersprungen
    s = run(s, { type: 'BATTLE_DECISION', battleId: b1.id, opId: b1.operationIds[0], decision: { type: 'RAID_A', strikes: [{ planetId: 'kryndaer' }, { planetId: 'jawardet' }], shift: 0 } as never });
    s = run(s, { type: 'BATTLE_DECISION', battleId: b2.id, opId: b2.operationIds[0], decision: { type: 'RAID_A', strikes: [{ planetId: 'ikaron-prime' }], shift: 0 } as never });
    const first = exec(s, { type: 'BATTLE_PROCESS_ALL' }, { force: true, manual: [] });
    expect(!first.ok && first.kind === 'dice' && first.dice.index).toBe(0);
    const second = exec(s, { type: 'BATTLE_PROCESS_ALL' }, { force: true, manual: [6] });
    // Schlacht 2 fragt ihren eigenen Wurf an statt die 6 von Schlacht 1 zu übernehmen
    expect(!second.ok && second.kind === 'dice' && second.dice.index).toBe(1);
    const third = exec(s, { type: 'BATTLE_PROCESS_ALL' }, { force: true, manual: [6, 2] });
    expect(third.ok).toBe(true);
    const st = (third as { state: CampaignState }).state;
    expect(PL(st, b, 'ikaron-prime')).toBe(PL(s, b, 'ikaron-prime'));
    expect(st.dice.at(-1)!.final).toBe(2);
  });
});

describe('8 · Import: Karte erst nach der Prüfung registrieren, Konflikte forken', () => {
  it('ein abgelehnter Import verändert die Planeten-Registry nicht', () => {
    const s = startedCampaign();
    expect(adjacent('norallus', 'masnet')).toBe(true);
    const evil = structuredClone(s) as CampaignState;
    evil.map = { ...structuredClone(evil.map!), connections: [['norallus', 'ikaron-prime']] };
    (evil.meta as { name: string }).name = '';
    const m = migrateState(JSON.parse(JSON.stringify(evil)), { register: false });
    expect(validateState(m)).not.toBeNull();
    expect(adjacent('norallus', 'masnet')).toBe(true);
    expect(adjacent('norallus', 'ikaron-prime')).toBe(false);
  });

  it('gültiger Import mit abweichender Karte unter Vespator-IDs bekommt eigene IDs', () => {
    const s = startedCampaign();
    const { a, fa } = ids(s);
    const tampered = structuredClone(s) as CampaignState;
    tampered.map = { ...structuredClone(tampered.map!), connections: [...tampered.map!.connections, ['norallus', 'ikaron-prime']] };
    const raw = JSON.stringify(tampered);
    const m = migrateState(JSON.parse(raw), { register: false });
    expect(validateState(m)).toBeNull();
    adoptImportedMap(m);
    // Vespator-Graph bleibt unverändert
    expect(adjacent('norallus', 'ikaron-prime')).toBe(false);
    const nor = m.map!.planets.find((p) => p.id.startsWith('norallus.'))!.id;
    const ika = m.map!.planets.find((p) => p.id.startsWith('ikaron-prime.'))!.id;
    expect(adjacent(nor, ika)).toBe(true);
    expect(planetName(nor)).toBe('Norallus');
    expect(m.map!.template).toBeNull();
    // Verweise im Zustand folgen den neuen IDs
    expect(m.planets.map((p) => p.id)).toEqual(m.map!.planets.map((p) => p.id));
    expect(m.fleets.find((f) => f.id === fa)!.planetId).toMatch(/^kryndaer\./);
    expect(m.planets.find((p) => p.id === nor)!.power[a]).toBe(4);
    expect(validateState(m)).toBeNull();
    // deterministisch: dieselbe Karte ergibt dieselben IDs (Revisionen einer Historie)
    const m2 = adoptImportedMap(migrateState(JSON.parse(raw), { register: false }));
    expect(m2.map!.planets.map((p) => p.id)).toEqual(m.map!.planets.map((p) => p.id));
    // der importierte Stand ist spielbar
    const { b } = ids(m);
    const kry = m.map!.planets.find((p) => p.id.startsWith('kryndaer.'))!.id;
    expect(tryRun(m, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: kry, targetAllianceId: b } }).ok).toBe(true);
  });

  it('unveränderte Vespator-Karte behält beim Import ihre IDs', () => {
    const s = startedCampaign();
    const m = adoptImportedMap(migrateState(JSON.parse(JSON.stringify(s)), { register: false }));
    expect(m.map!.planets.map((p) => p.id)).toEqual(s.map!.planets.map((p) => p.id));
  });
});

describe('9 · In 2.4 wieder geöffnete Schlacht geht nicht verloren', () => {
  it('Weiter aus 2.4 scheitert, solange eine wieder geöffnete Schlacht offen ist', () => {
    let s = startedCampaign();
    const { fa, b } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: battleOp(b, 'PURGE_AND_BURN') });
    s = adv(s, 4);
    s = run(s, { type: 'BATTLE_REOPEN', battleId: s.battles[0].id });
    expect(errorOf(exec(s, { type: 'ADVANCE' }, { force: true }))).toBe('1 wieder geöffnete Schlacht(en) ohne Ergebnis – Ergebnis eintragen oder als ungespielt werten');
    s = run(s, { type: 'BATTLE_UNPLAYED', battleId: s.battles[0].id, resolution: 'ATTACKER_WINS' });
    s = run(s, { type: 'BATTLE_PROCESS', battleId: s.battles[0].id });
    s = run(s, { type: 'ADVANCE' });
    expect(s.stage).toMatchObject({ step: 'ARRIVAL' });
  });
});

describe('10 · Event-Eingaben', () => {
  const toResults = () => adv(startedCampaign(), 7);

  it('A Costly Bargain: unbekannte oder eigene Allianz als Gegner wird abgewiesen', () => {
    let s = toResults();
    const { a, b, pa } = ids(s);
    s.events.push({ id: 'ev1', phaseNumber: 1, category: 'DESPERATE', code: 'DM_1', allianceId: a, status: 'PENDING', data: {}, applied: [] } as never);
    expect(errorOf(exec(s, { type: 'EVENT_INPUT', eventId: 'ev1', playerId: pa, data: { planetId: 'kryndaer', opponentId: 'bogus' } }))).toBe('Gegnerische Allianz wählen');
    expect(errorOf(exec(s, { type: 'EVENT_APPLY', eventId: 'ev1', data: { planetId: 'kryndaer', opponentId: 'bogus' } }, { force: true }))).toBe('Gegnerische Allianz wählen');
    s = run(s, { type: 'EVENT_INPUT', eventId: 'ev1', playerId: pa, data: { planetId: 'kryndaer', opponentId: b } }, [], { force: false });
    const before = { a: PL(s, a, 'kryndaer'), b: PL(s, b, 'kryndaer') };
    s = run(s, { type: 'EVENT_APPLY', eventId: 'ev1', data: {} });
    expect({ a: PL(s, a, 'kryndaer'), b: PL(s, b, 'kryndaer') }).toEqual({ a: before.b, b: before.a });
    expect(Object.keys(s.planets.find((p) => p.id === 'kryndaer')!.power)).not.toContain('bogus');
  });

  it('Xenobeast Migration: unbekannter Zielplanet wird abgewiesen', () => {
    const s = toResults();
    s.events.push({ id: 'ev2', phaseNumber: 1, category: 'FORTUNES', code: 'FW_31', allianceId: null, status: 'PENDING', data: {}, applied: [] } as never);
    const positions = Object.fromEntries(s.fleets.map((f) => [f.id, 'nirgendwo']));
    expect(errorOf(exec(s, { type: 'EVENT_APPLY', eventId: 'ev2', data: { positions } }, { force: true }))).toBe('Unbekannter Planet nirgendwo');
  });
});

describe('11 · Import-Schema prüft die Schlachtfelder, die die Engine liest', () => {
  it('Schlacht ohne Teilnehmerlisten wird abgewiesen', () => {
    const s = startedCampaign();
    const bad = structuredClone(s) as CampaignState;
    bad.battles.push({ id: 'bx', phaseNumber: 1, status: 'PLAYED', operationIds: [] } as never);
    expect(validateState(migrateState(JSON.parse(JSON.stringify(bad)), { register: false }))).toMatch(/^battles\.0\./);
  });

  it('gültige Stände mit Schlachten bleiben ladbar', () => {
    let s = startedCampaign();
    const { fa, b } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: battleOp(b, 'PURGE_AND_BURN') });
    s = adv(s, 4);
    s = run(s, { type: 'BATTLE_PROCESS', battleId: s.battles[0].id });
    expect(Object.keys(s.battles[0].decisions)).toHaveLength(1);
    expect(validateState(migrateState(JSON.parse(JSON.stringify(s))))).toBeNull();
  });
});

describe('12 · Nebel verbirgt auch die Endwertung', () => {
  it('result.scores fehlt in der öffentlichen Ansicht, solange der Nebel aktiv ist', () => {
    const s = startedCampaign();
    s.toggles.fog = true;
    s.stage = { kind: 'TIEBREAK' };
    s.result = { winnerAllianceId: null, tiebreak: 'FINAL_BATTLE', tied: [], scores: { mode: 'BOOK', items: [] } as never };
    const v = toPublicView(s);
    expect(v.result).not.toBeNull();
    expect(v.result!.scores).toBeUndefined();
    expect(s.result.scores).toBeDefined();
  });
});

describe('13 · W6-Duell (Hausregel): Umdrehen des Ergebnisses ist ein Override', () => {
  it('„Angreifer siegt“ nach einem Duell-Sieg des Verteidigers braucht eine Begründung', () => {
    let s = startedCampaign();
    const { fa, b } = ids(s);
    s.toggles.unplayedRollOff = { enabled: true, plModifier: false };
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: battleOp(b, 'PURGE_AND_BURN') });
    s = adv(s, 3);
    s = run(s, { type: 'ADVANCE' }, [1, 6]);
    expect(s.battles[0].unplayedResolution).toBe('DEFENDER_WINS');
    const cmd = { type: 'BATTLE_UNPLAYED', battleId: s.battles[0].id, resolution: 'ATTACKER_WINS' } as const;
    const r = exec(s, cmd);
    expect(!r.ok && r.kind === 'confirm' && r.needsReason).toBe(true);
    expect(errorOf(exec(s, cmd, { force: true }))).toBe('Zum Übergehen der Warnungen ist eine Begründung Pflicht');
    expect(exec(s, cmd, { force: true, reason: 'Duell falsch eingetragen' }).ok).toBe(true);
  });

  it('ohne Duell bleibt „Angreifer siegt“ der Regelfall ohne Begründung', () => {
    let s = startedCampaign();
    const { fa, b } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: battleOp(b, 'PURGE_AND_BURN') });
    s = adv(s, 4);
    s = run(s, { type: 'BATTLE_UNPLAYED', battleId: s.battles[0].id, resolution: 'DEFENDER_WINS' }, [], { reason: 'x' });
    expect(exec(s, { type: 'BATTLE_UNPLAYED', battleId: s.battles[0].id, resolution: 'ATTACKER_WINS' }).ok).toBe(true);
  });
});

describe('14 · Laurel of Victory: Planet ist öffentlich', () => {
  it('der Laurel-Planet bleibt in der öffentlichen Ansicht sichtbar, die Strongholds nicht', () => {
    const s = startedCampaign();
    const { a } = ids(s);
    s.stage = { kind: 'SETUP', step: 'W2' };
    s.setup.strongholdsRevealed = false;
    s.setup.laurel = { allianceId: a, planetId: 'norallus' };
    const v = toPublicView(s);
    expect(v.setup.laurel?.planetId).toBe('norallus');
    expect(Object.values(v.setup.strongholds).every((x) => x.strongholdPlanetId === null)).toBe(true);
  });
});
