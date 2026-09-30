import { describe, expect, it } from 'vitest';
import { ids, run, startedCampaign, tryRun } from './helpers';
import { gmAlerts, overdueAlerts, tableClashes } from '@/engine/p1';
import { playerTasks } from '@/engine/playerTasks';
import { authorizePlayer } from '@/engine/playerActions';
import type { CampaignState } from '@/engine/types';

/** Block P1 in der Engine: Spieltisch je Schlacht, Tischkollisionen, Handlungsbedarf, Aufgabenliste */
function withBattle(): { s: CampaignState; bid: string } {
  let s = startedCampaign();
  const { fa, c } = ids(s);
  s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
  s = run(s, { type: 'ADVANCE' });
  s = run(s, { type: 'REVEAL_OPS' });
  return { s, bid: s.battles.find((b) => b.kind === 'CAMPAIGN')!.id };
}

describe('Spieltisch (NTH2 2.5)', () => {
  it('Teilnehmer und Spielleitung setzen und lösen den Tisch; Unbeteiligte nicht', () => {
    const { s: s0, bid } = withBattle();
    const { pa, pb } = ids(s0);
    let s = run(s0, { type: 'BATTLE_TABLE_SET', battleId: bid, playerId: pa, table: { id: 't1', name: 'Tisch 1' } });
    expect(s.battles.find((b) => b.id === bid)!.table).toEqual({ id: 't1', name: 'Tisch 1' });
    const other = tryRun(s, { type: 'BATTLE_TABLE_SET', battleId: bid, playerId: pb, table: { id: 't2', name: 'Tisch 2' } });
    expect(other).toMatchObject({ ok: false, error: 'Nur Teilnehmer der Schlacht können den Spieltisch wählen' });
    s = run(s, { type: 'BATTLE_TABLE_SET', battleId: bid, playerId: null, table: null });
    expect(s.battles.find((b) => b.id === bid)!.table).toBeNull();
    expect(tryRun(s, { type: 'BATTLE_TABLE_SET', battleId: bid, playerId: null, table: null })).toMatchObject({ ok: false, error: 'Kein Spieltisch eingetragen' });
    expect(tryRun(s, { type: 'BATTLE_TABLE_SET', battleId: bid, playerId: null, table: { id: '', name: 'x' } })).toMatchObject({ ok: false, error: 'Ungültiger Spieltisch' });
  });

  it('Spieler dürfen nur im eigenen Namen', () => {
    const { s, bid } = withBattle();
    const { pa, pc } = ids(s);
    const me = s.players.find((p) => p.id === pa)!;
    expect(authorizePlayer(s, me, { type: 'BATTLE_TABLE_SET', battleId: bid, playerId: pa, table: null })).toBeNull();
    expect(authorizePlayer(s, me, { type: 'BATTLE_TABLE_SET', battleId: bid, playerId: pc, table: null })).toBe('Nur im eigenen Namen');
  });

  it('Kollision je Tisch: unter 3 h Abstand, eigene Schlacht zählt nicht', () => {
    const bookings = [
      { campaignId: 'A', battleId: 'b1', tableId: 't1', at: '2026-11-01T17:00:00Z' },
      { campaignId: 'B', battleId: 'b2', tableId: 't1', at: '2026-11-01T20:00:00Z' },
      { campaignId: 'B', battleId: 'b3', tableId: 't2', at: '2026-11-01T17:30:00Z' },
    ];
    expect(tableClashes(bookings, 't1', '2026-11-01T18:00:00Z', null).map((x) => x.battleId)).toEqual(['b1', 'b2']);
    expect(tableClashes(bookings, 't1', '2026-11-01T17:00:00Z', { campaignId: 'A', battleId: 'b1' })).toEqual([]);
    expect(tableClashes(bookings, 't2', '2026-11-01T21:00:00Z', null)).toEqual([]);
    expect(tableClashes(bookings, 't1', 'kein Datum', null)).toEqual([]);
  });
});

describe('Handlungsbedarf für die Spielleitung (NTH2 1.1)', () => {
  it('Widerspruch, alle Befehle, alle Schlachten gemeldet – nur beim Übergang', () => {
    let s = startedCampaign();
    const { fa, fb, fc, c, pa, pc } = ids(s);
    const b0 = s;
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
    s = run(s, { type: 'OP_SET', fleetId: fb, slot: 1, op: { type: 'LOGISTICAL_AUXILIA' } });
    expect(gmAlerts(b0, s)).toEqual([]);
    const before = s;
    s = run(s, { type: 'OP_SET', fleetId: fc, slot: 1, op: { type: 'LOGISTICAL_AUXILIA' } });
    expect(gmAlerts(before, s).map((a) => a.kind)).toEqual(['ORDERS_COMPLETE']);
    expect(gmAlerts(s, s)).toEqual([]);
    s = run(s, { type: 'ADVANCE' });
    s = run(s, { type: 'REVEAL_OPS' });
    const bid = s.battles.find((b) => b.kind === 'CAMPAIGN')!.id;
    while (s.stage.kind === 'PHASE' && s.stage.step !== 'BATTLES') s = run(s, { type: 'ADVANCE' });
    s = run(s, { type: 'RESULT_DRAFT_SUBMIT', battleId: bid, playerId: pa, update: { vp: { attacker: 50, defender: 20 } } });
    const d0 = s;
    s = run(s, { type: 'RESULT_DRAFT_DISPUTE', battleId: bid, playerId: pc, reason: 'nein' });
    expect(gmAlerts(d0, s).map((a) => a.kind)).toEqual(['DISPUTED']);
    const r0 = s;
    s = run(s, { type: 'RESULT_DRAFT_CONFIRM', battleId: bid, playerId: null });
    expect(gmAlerts(r0, s).map((a) => a.kind)).toContain('BATTLES_COMPLETE');
  });

  it('Meldung länger als 48 h offen', () => {
    const w = withBattle();
    const bid = w.bid;
    let s = w.s;
    const { pa } = ids(s);
    s = run(s, { type: 'RESULT_DRAFT_SUBMIT', battleId: bid, playerId: pa, update: { vp: { attacker: 50, defender: 20 } } });
    const at = new Date(s.battles.find((b) => b.id === bid)!.draft!.at).getTime();
    expect(overdueAlerts(s, at + 47 * 3600_000)).toEqual([]);
    expect(overdueAlerts(s, at + 49 * 3600_000).map((a) => a.battleId)).toEqual([bid]);
  });
});

describe('Aufgabenliste (Discord /aufgaben)', () => {
  it('Befehle, Terminvorschlag, Bestätigung', () => {
    let s = startedCampaign();
    const { pa, pc } = ids(s);
    const me = (id: string) => s.players.find((p) => p.id === id)!;
    expect(playerTasks(s, me(pa), Date.now()).map((x) => x.kind)).toEqual(['ORDERS']);
    const w = withBattle();
    s = w.s;
    s = run(s, { type: 'TIME_PROPOSE', battleId: w.bid, playerId: pa, times: ['2026-10-10T17:00:00.000Z'] });
    expect(playerTasks(s, me(pc), Date.now()).map((x) => x.kind)).toEqual(['PROPOSAL']);
    expect(playerTasks(s, me(pa), Date.now()).map((x) => x.kind)).toEqual([]);
    s = run(s, { type: 'RESULT_DRAFT_SUBMIT', battleId: w.bid, playerId: pa, update: { vp: { attacker: 50, defender: 20 } } });
    expect(playerTasks(s, me(pc), Date.now()).map((x) => x.kind)).toEqual(['CONFIRM']);
  });
});
