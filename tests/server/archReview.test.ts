import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ids, startedCampaign } from '../engine/helpers';
import type { CampaignState } from '@/engine/types';
import type { Command } from '@/engine/commands';
import { DRAFT_CHANGED } from '@/engine/playerActions';

/**
 * Architektur-Review, Nachweise F1 (exploit-maxdate) und F2 (swap) als dauerhafte Tests über den echten
 * Spielerweg (runPlayerCommand → Berechtigung → runCommand → Schema → Engine).
 */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-arch-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.BACKUP_DIR = path.join(tmp, 'backups');

type Mods = {
  campaigns: typeof import('@/server/campaigns');
  backup: typeof import('@/server/backup');
  players: typeof import('@/server/players');
};
let m: Mods;

beforeAll(async () => {
  m = {
    campaigns: await import('@/server/campaigns'),
    backup: await import('@/server/backup'),
    players: await import('@/server/players'),
  };
});
afterAll(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
});

function newCampaign(): { id: string; s: CampaignState } {
  const s = startedCampaign();
  const id = m.backup.importBackup(new TextEncoder().encode(JSON.stringify({ state: s })), 'Architektur-Review');
  return { id, s: m.campaigns.currentState(id).state };
}
const run = (id: string, cmd: Command) => {
  const r = m.campaigns.runCommand(id, -1, cmd, { force: true, reason: 'test' });
  if (!r.ok) throw new Error('error' in r ? r.error : r.kind);
  return r;
};
const battleOf = (id: string, s: CampaignState) => {
  const { fa, c } = ids(s);
  run(id, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
  run(id, { type: 'ADVANCE' });
  run(id, { type: 'REVEAL_OPS' });
  return m.campaigns.currentState(id).state.battles.find((b) => b.kind === 'CAMPAIGN')!;
};
const battle = (id: string, bid: string) => m.campaigns.currentState(id).state.battles.find((b) => b.id === bid)!;
const errorOf = (r: { ok: boolean }) => (r as { error?: string }).error;

describe('F1 · Maximaldatum als Termin (exploit-maxdate)', () => {
  it('Vorschlag und Annahme mit ungültigen Zeitpunkten werden abgewiesen und nicht gespeichert', () => {
    const { id, s } = newCampaign();
    const { pa, pc } = ids(s);
    const b = battleOf(id, s);
    const ta = m.players.regeneratePlayerToken(id, pa);
    const tc = m.players.regeneratePlayerToken(id, pc);
    const rev = m.campaigns.getCampaign(id)!.current_rev;
    const MAX = '+275760-09-13T00:00:00.000Z';
    expect(errorOf(m.players.runPlayerCommand(ta, { type: 'TIME_PROPOSE', battleId: b.id, playerId: pa, times: [MAX] }))).toBe('Ungültige Eingabe (times.0)');
    expect(errorOf(m.players.runPlayerCommand(ta, { type: 'TIME_PROPOSE', battleId: b.id, playerId: pa, times: [1767225600000 as unknown as string] }))).toBe('Ungültige Eingabe (times.0)');
    expect(errorOf(m.players.runPlayerCommand(tc, { type: 'TIME_ACCEPT', battleId: b.id, playerId: pc, time: MAX }))).toBe('Ungültige Eingabe (time)');
    expect(m.campaigns.getCampaign(id)!.current_rev).toBe(rev);
    expect(battle(id, b.id).scheduledAt ?? null).toBeNull();
    // gültiger Weg bleibt offen
    expect(m.players.runPlayerCommand(ta, { type: 'TIME_PROPOSE', battleId: b.id, playerId: pa, times: ['2026-01-05T19:00:00.000Z'] }).ok).toBe(true);
    expect(m.players.runPlayerCommand(tc, { type: 'TIME_ACCEPT', battleId: b.id, playerId: pc, time: '2026-01-05T19:00:00.000Z' }).ok).toBe(true);
    expect(battle(id, b.id).scheduledAt).toBe('2026-01-05T19:00:00.000Z');
  });

  it('unbekannte Felder landen nicht in der gespeicherten Revision', () => {
    const { id, s } = newCampaign();
    const { pa } = ids(s);
    run(id, { type: 'PLAYER_UPSERT', id: pa, data: { notes: 'n', memberships: [] } as never, evil: 'x' } as unknown as Command);
    const p = m.campaigns.currentState(id).state.players.find((x) => x.id === pa)!;
    expect(p.notes).toBe('n');
    expect(p.memberships.length).toBeGreaterThan(0);
  });
});

describe('F2 · Köder und Tausch bei der Ergebnis-Meldung (swap)', () => {
  it('die Bestätigung eines inzwischen ersetzten Entwurfs wird abgewiesen', () => {
    const { id, s } = newCampaign();
    const { pa, pc } = ids(s);
    const b = battleOf(id, s);
    const ta = m.players.regeneratePlayerToken(id, pa);
    const tc = m.players.regeneratePlayerToken(id, pc);
    // 1. Köder: knappes Ergebnis
    expect(m.players.runPlayerCommand(ta, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: pa, update: { vp: { attacker: 61, defender: 60 } } }).ok).toBe(true);
    const seen = battle(id, b.id).draft!;
    expect(seen.update.vp).toEqual({ attacker: 61, defender: 60 });
    // 2. Tausch: derselbe Spieler ersetzt die offene Meldung (anderer Zeitstempel)
    const later = new Date(Date.parse(seen.at) + 5);
    while (Date.now() <= later.getTime()) {
      /* warten, bis der neue Entwurf einen anderen Zeitstempel bekommt */
    }
    expect(m.players.runPlayerCommand(ta, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: pa, update: { vp: { attacker: 100, defender: 0 } } }).ok).toBe(true);
    expect(battle(id, b.id).draft!.at).not.toBe(seen.at);
    // 3. die Gegenseite bestätigt den Stand, den sie gesehen hat → abgewiesen
    expect(errorOf(m.players.runPlayerCommand(tc, { type: 'RESULT_DRAFT_CONFIRM', battleId: b.id, playerId: pc, draftAt: seen.at }))).toBe(DRAFT_CHANGED);
    expect(errorOf(m.players.runPlayerCommand(tc, { type: 'RESULT_DRAFT_DISPUTE', battleId: b.id, playerId: pc, reason: 'falsch', draftAt: seen.at }))).toBe(DRAFT_CHANGED);
    // ohne Stand (alte Oberfläche) ebenso
    expect(errorOf(m.players.runPlayerCommand(tc, { type: 'RESULT_DRAFT_CONFIRM', battleId: b.id, playerId: pc }))).toBe(DRAFT_CHANGED);
    const now = battle(id, b.id);
    expect(now.vp).toBeNull();
    expect(now.victor).toBeNull();
    // nach dem Neuladen: Bestätigung des aktuellen Stands gilt
    expect(m.players.runPlayerCommand(tc, { type: 'RESULT_DRAFT_CONFIRM', battleId: b.id, playerId: pc, draftAt: now.draft!.at }).ok).toBe(true);
    expect(battle(id, b.id).vp).toEqual({ attacker: 100, defender: 0 });
  });
});
