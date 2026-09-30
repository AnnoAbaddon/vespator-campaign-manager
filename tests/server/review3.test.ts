import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startedCampaign } from '../engine/helpers';
import { referencedUploadIds } from '@/engine/uploads';

/** Funde der dritten Review-Runde: Anmelde-Sperre, Backup-Bilder, Kalender-Abo, Einladungen */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-r3-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.BACKUP_DIR = path.join(tmp, 'backups');

let auth: typeof import('@/server/auth');
let backup: typeof import('@/server/backup');
let db: typeof import('@/server/db');
let players: typeof import('@/server/players');

beforeAll(async () => {
  auth = await import('@/server/auth');
  backup = await import('@/server/backup');
  db = await import('@/server/db');
  players = await import('@/server/players');
});
afterAll(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
});

describe('Review-Runde 3', () => {
  it('Datenbankzeilen sind gewöhnliche Objekte (sonst bricht die Übergabe an Client-Komponenten)', () => {
    const row = db.db().prepare('SELECT 1 AS one').get() as object;
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
    const rows = db.db().prepare('SELECT 1 AS one UNION SELECT 2').all() as object[];
    expect(rows.every((r) => Object.getPrototypeOf(r) === Object.prototype)).toBe(true);
    const it = [...db.db().prepare('SELECT 3 AS one').iterate()] as object[];
    expect(Object.getPrototypeOf(it[0])).toBe(Object.prototype);
  });

  it('Anmeldung: je Benutzername nur ein hoher Schwellwert – Fremde sperren das Konto nicht nach 5 Versuchen aus', () => {
    for (let i = 0; i < 5; i++) auth.recordFailure('user:admin');
    expect(auth.rateLimited('user:admin')).toBe(true);
    expect(auth.rateLimited('user:admin', 20)).toBe(false);
    auth.clearFailures('user:admin');
    expect(auth.rateLimited('user:admin')).toBe(false);
  });

  it('Fotos einzelner Spiele gehören zu den referenzierten Uploads (Backup)', () => {
    const s = startedCampaign();
    s.battles.push({ ...(s.battles[0] ?? {}), id: 'bt-x', photos: [], games: [{ id: 'g1', attackers: [], defenders: [], vp: null, photos: ['GAMEPHOTO123'] }] } as never);
    expect(referencedUploadIds(s)).toContain('GAMEPHOTO123');
  });

  it('Kalender-Abo endet mit dem Sperren oder Erneuern des Spielerlinks', () => {
    const s = startedCampaign();
    const id = backup.importBackup(new TextEncoder().encode(JSON.stringify({ state: s })), 'Kalender');
    const pid = s.players[0].id;
    expect(players.calendarKey(id, pid)).toBeNull();
    players.playerTokenFor(id, pid, true);
    const k1 = players.calendarKey(id, pid)!;
    expect(players.checkCalendarKey(id, pid, k1)).toBe(true);
    players.regeneratePlayerToken(id, pid);
    expect(players.checkCalendarKey(id, pid, k1)).toBe(false);
    const k2 = players.calendarKey(id, pid)!;
    expect(players.checkCalendarKey(id, pid, k2)).toBe(true);
    players.revokePlayerToken(id, pid);
    expect(players.checkCalendarKey(id, pid, k2)).toBe(false);
  });

  it('Einladung: vergebener Benutzername verbrennt die Einladung nicht', async () => {
    const r = db.db().prepare('INSERT INTO admin(username, password_hash, created_at, role) VALUES(?,?,?,?)').run('chef', 'x', new Date().toISOString(), 'ADMIN');
    const t = auth.createInvite(Number(r.lastInsertRowid), 'COWARMASTER', []);
    await expect(auth.acceptInvite(t, 'chef', 'ein-langes-passwort')).rejects.toThrow(/vergeben/);
    expect(auth.checkInvite(t)).not.toBeNull();
  });
});
