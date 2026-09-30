import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { ids, startedCampaign } from '../engine/helpers';
import type { CampaignState } from '@/engine/types';

/**
 * Architektur-Review (ARCH-SECURITY.md), Befunde 3–6 und die kleineren Befunde als dauerhafte Tests – aus den
 * Beweis-Skripten des Reviews (deleted.mjs, restore.mjs, avatar.mjs, Liga-Abruf) übernommen, direkt gegen Server
 * Actions und Servermodule statt über HTTP.
 */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-authz-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.BACKUP_DIR = path.join(tmp, 'backups');
process.env.APP_URL = 'https://kampagne.example';

// Sitzungs-Cookie (next/headers gibt es außerhalb einer Anfrage nicht); revalidatePath ist hier bedeutungslos
const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => jar.set(n, v),
    delete: (n: string) => jar.delete(n),
  }),
  headers: async () => new Headers(),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

type Mods = {
  db: typeof import('@/server/db');
  auth: typeof import('@/server/auth');
  authz: typeof import('@/server/authz');
  campaigns: typeof import('@/server/campaigns');
  backup: typeof import('@/server/backup');
  players: typeof import('@/server/players');
  league: typeof import('@/server/league');
  publicList: typeof import('@/server/publicList');
  privacy: typeof import('@/server/privacy');
  uploads: typeof import('@/server/uploads');
  auto: typeof import('@/server/autoBackup');
  confirm: typeof import('@/server/confirmLink');
  ops: typeof import('@/app/actions/ops');
  campaignActions: typeof import('@/app/actions/campaign');
  playerActions: typeof import('@/app/actions/player');
  club: typeof import('@/app/actions/club');
};
let m: Mods;

beforeAll(async () => {
  m = {
    db: await import('@/server/db'),
    auth: await import('@/server/auth'),
    authz: await import('@/server/authz'),
    campaigns: await import('@/server/campaigns'),
    backup: await import('@/server/backup'),
    players: await import('@/server/players'),
    league: await import('@/server/league'),
    publicList: await import('@/server/publicList'),
    privacy: await import('@/server/privacy'),
    uploads: await import('@/server/uploads'),
    auto: await import('@/server/autoBackup'),
    confirm: await import('@/server/confirmLink'),
    ops: await import('@/app/actions/ops'),
    campaignActions: await import('@/app/actions/campaign'),
    playerActions: await import('@/app/actions/player'),
    club: await import('@/app/actions/club'),
  };
});
afterAll(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
});
beforeEach(() => jar.clear());

let n = 0;
function account(role: 'ADMIN' | 'COWARMASTER') {
  const name = `konto${++n}`;
  const r = m.db.db().prepare('INSERT INTO admin(username, password_hash, created_at, role) VALUES(?,?,?,?)').run(name, 'x', new Date().toISOString(), role);
  return { id: Number(r.lastInsertRowid), username: name };
}
/** Als Konto anmelden: Sitzung in der Datenbank, Cookie im Speicher */
function login(adminId: number) {
  const sid = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  m.db
    .db()
    .prepare('INSERT INTO session(id, admin_id, expires_at, created_at) VALUES(?,?,?,?)')
    .run(m.auth.sessionKey(sid), adminId, new Date(now + 86400_000).toISOString(), new Date(now).toISOString());
  jar.clear();
  jar.set(m.auth.sessionCookieName(), sid);
}

function newCampaign(prep?: (s: CampaignState) => void): { id: string; s: CampaignState } {
  const s = startedCampaign();
  prep?.(s);
  const id = m.backup.importBackup(new TextEncoder().encode(JSON.stringify({ state: s })), 'Testkampagne');
  return { id, s: m.campaigns.currentState(id).state };
}
const gm = (id: string, cmd: Parameters<typeof m.campaigns.runCommand>[2]) => m.campaigns.runCommand(id, -1, cmd, { force: true, reason: 'test' });

async function png(color = '#c33'): Promise<File> {
  const buf = await sharp({ create: { width: 64, height: 64, channels: 3, background: color } })
    .png()
    .toBuffer();
  return new File([new Uint8Array(buf)], 'bild.png', { type: 'image/png' });
}
const form = (file: File, kind: string, campaignId?: string) => {
  const f = new FormData();
  f.set('file', file);
  f.set('kind', kind);
  if (campaignId) f.set('campaignId', campaignId);
  return f;
};

describe('F3: gelöschte/deaktivierte Spieler', () => {
  it('Deaktivieren sperrt Spielerlink, Push, Discord, Kalender und Einmal-Links (deleted.mjs)', () => {
    // pa führt eine Flotte → PLAYER_DELETE deaktiviert nur
    const { id, s } = newCampaign((st) => (st.fleets[0].commanders['1'] = st.players[0].id));
    const { pa } = ids(s);
    const token = m.players.playerTokenFor(id, pa, true)!;
    const th = m.players.playerTokenHash(token);
    const cal = m.players.calendarKey(id, pa)!;
    const db = m.db.db();
    db.prepare('INSERT INTO push_sub(id, owner, endpoint, p256dh, auth, campaign_id, player_id, token_hash, created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(
      'ps1',
      `p:${id}:${pa}`,
      'https://fcm.googleapis.com/x',
      'k',
      'a',
      id,
      pa,
      th,
      new Date().toISOString(),
    );
    db.prepare('INSERT INTO discord_link(discord_user, username, campaign_id, player_id, token_hash, created_at) VALUES(?,?,?,?,?,?)').run('du1', 'u', id, pa, th, new Date().toISOString());
    db.prepare('INSERT INTO discord_code(code_hash, campaign_id, player_id, token_hash, expires_at) VALUES(?,?,?,?,?)').run('dc1', id, pa, th, new Date(Date.now() + 60_000).toISOString());
    expect(m.authz.loadPlayer(token)).not.toBeNull();

    const r = gm(id, { type: 'PLAYER_DELETE', id: pa });
    expect(r.ok).toBe(true);
    expect(m.campaigns.currentState(id).state.players.find((p) => p.id === pa)?.active).toBe(false);
    expect(m.players.playerTokenRow(token)).toBeNull();
    expect(m.authz.playerGate(token, 'player.view')).toEqual({ ok: false, error: 'Link ungültig oder gesperrt' });
    expect(db.prepare('SELECT COUNT(*) AS n FROM push_sub WHERE player_id = ?').get(pa)).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM discord_link WHERE player_id = ?').get(pa)).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM discord_code WHERE player_id = ?').get(pa)).toEqual({ n: 0 });
    expect(m.players.checkCalendarKey(id, pa, cal)).toBe(false);
    expect(m.authz.calendarAccess(id, pa, cal)).toBeNull();
  });

  it('inaktiver Spieler mit (neu erzeugtem) Link sieht nur die Leseansicht und darf nichts schreiben', () => {
    const { id, s } = newCampaign((st) => (st.fleets[0].commanders['1'] = st.players[0].id));
    const { pa, a } = ids(s);
    expect(gm(id, { type: 'PLAYER_DELETE', id: pa }).ok).toBe(true);
    const token = m.players.regeneratePlayerToken(id, pa);
    const ctx = m.authz.loadPlayer(token)!;
    expect(ctx.principal.active).toBe(false);
    expect(m.authz.secretAlliance(ctx, a)).toBeNull();
    expect(m.authz.playerGate(token, 'player.command')).toEqual({ ok: false, error: 'Dein Spielerkonto ist inaktiv' });
    expect(m.authz.playerGate(token, 'player.view').ok).toBe(true);
  });

  it('gelöschter Spieler (ohne Einsätze) verliert den Link ebenfalls', () => {
    const { id, s } = newCampaign();
    const { pb } = ids(s);
    const token = m.players.playerTokenFor(id, pb, true)!;
    expect(gm(id, { type: 'PLAYER_DELETE', id: pb }).ok).toBe(true);
    expect(m.authz.loadPlayer(token)).toBeNull();
  });
});

describe('F4: Wiederherstellen aus einem Backup', () => {
  it('Co-Warmaster dürfen nicht wiederherstellen; die Kopie des Admins ist nicht öffentlich (restore.mjs)', async () => {
    const owner = account('ADMIN');
    const co = account('COWARMASTER');
    const { id } = newCampaign();
    m.auth.grantAccess(co.id, id);
    const b = m.auto.backupCampaign(id, true);
    const before = (m.db.db().prepare('SELECT COUNT(*) AS n FROM campaign').get() as { n: number }).n;

    login(co.id);
    expect(await m.ops.restoreBackupAction(id, b.file)).toEqual({ ok: false, error: 'Nur für Admins' });
    expect((m.db.db().prepare('SELECT COUNT(*) AS n FROM campaign').get() as { n: number }).n).toBe(before);

    login(owner.id);
    const r = await m.ops.restoreBackupAction(id, b.file);
    expect(r.ok).toBe(true);
    const copy = r.ok ? r.id! : '';
    const row = m.campaigns.getCampaign(copy)!;
    expect(row.public_enabled).toBe(0);
    expect(m.publicList.listedCampaigns().some((c) => c.id === copy)).toBe(false);
    // im Verwaltungsprotokoll
    expect(m.db.db().prepare("SELECT 1 FROM audit WHERE campaign_id = ? AND action = 'Backup wiederhergestellt'").get(copy)).toBeTruthy();
  });
});

describe('F5: Liga zeigt nur öffentliche Kampagnen (wie die Hall of Fame)', () => {
  it('Kampagne mit ausgeschalteter Leseansicht fehlt in der Ruhmeshalle der Saison', () => {
    const { id: pub } = newCampaign();
    const { id: hidden } = newCampaign();
    m.campaigns.setPublicEnabled(hidden, false);
    const sid = m.league.createSeason('Saison');
    m.league.updateSeason(sid, { data: { campaignIds: [pub, hidden] } });
    const season = m.league.getSeason(sid)!;
    expect(m.league.seasonCampaigns(season, true).map((c) => c.id)).toEqual([pub]);
    // die Verwaltung sieht weiter beide
    expect(
      m.league
        .seasonCampaigns(season, false)
        .map((c) => c.id)
        .sort(),
    ).toEqual([pub, hidden].sort());
    // gemeinsame Regel mit der Hall of Fame
    expect(m.publicList.isPubliclyListed({ public_enabled: 1, sandbox_of: null })).toBe(true);
    expect(m.publicList.isPubliclyListed({ public_enabled: 0, sandbox_of: null })).toBe(false);
    expect(m.publicList.isPubliclyListed({ public_enabled: 1, sandbox_of: pub })).toBe(false);
    expect(m.publicList.listedCampaigns().some((c) => c.id === hidden)).toBe(false);
    // Zwischenspeicher folgt dem Schalter
    m.campaigns.setPublicEnabled(hidden, true);
    expect(m.publicList.listedCampaigns().some((c) => c.id === hidden)).toBe(true);
  });
});

describe('F6: Bilder gehören zu Kampagne und Spieler', () => {
  it('fremde Upload-IDs werden abgelehnt, eigene angenommen; Löschen entfernt die eigenen Bilder zuverlässig (avatar.mjs)', async () => {
    const { id, s } = newCampaign();
    const { pa, pb } = ids(s);
    const ta = m.players.playerTokenFor(id, pa, true)!;
    const tb = m.players.playerTokenFor(id, pb, true)!;
    const up = await m.playerActions.playerUploadAction(ta, form(await png(), 'AVATAR'));
    expect(up.ok).toBe(true);
    const upId = up.ok ? up.id : '';
    expect(m.db.db().prepare('SELECT uploader FROM upload WHERE id = ?').get(upId)).toEqual({ uploader: `p:${pa}` });

    // Angreifer (anderer Spieler) übernimmt die ID aus der Leseansicht
    const steal = await m.playerActions.runPlayerCommandAction(tb, { type: 'PROFILE_UPDATE', playerId: pb, update: { avatar: upId } });
    expect(steal).toMatchObject({ ok: false, error: 'Dieses Bild kann hier nicht verwendet werden' });
    // Opfer darf das eigene Bild verwenden
    expect((await m.playerActions.runPlayerCommandAction(ta, { type: 'PROFILE_UPDATE', playerId: pa, update: { avatar: upId } })).ok).toBe(true);

    // andere Kampagne: auch die Spielleitung darf keine fremden Kampagnenbilder einsetzen
    const { id: other, s: s2 } = newCampaign();
    const r = m.campaigns.runCommand(other, -1, { type: 'PLAYER_UPSERT', id: ids(s2).pa, data: { avatar: upId } }, { force: true, reason: 'test' });
    expect(r).toMatchObject({ ok: false, error: 'Dieses Bild kann hier nicht verwendet werden' });

    // Altbestand: eine andere Kampagne verweist trotzdem (z. B. Import) – die Datenschutz-Löschung entfernt das Bild dennoch
    newCampaign((st) => (st.players[0].avatar = upId));
    m.privacy.deletePlayerContact(id, pa, 'test');
    expect(m.db.db().prepare('SELECT 1 FROM upload WHERE id = ?').get(upId)).toBeUndefined();
    expect(m.uploads.readUpload(upId, false)).toBeNull();
  });

  it('Speicherkontingent je Kampagne (UPLOAD_QUOTA_MB)', async () => {
    const { id, s } = newCampaign();
    const token = m.players.playerTokenFor(id, ids(s).pa, true)!;
    const prev = process.env.UPLOAD_QUOTA_MB;
    process.env.UPLOAD_QUOTA_MB = String(1 / 1024 / 1024); // 1 Byte
    try {
      expect(await m.playerActions.playerUploadAction(token, form(await png('#123'), 'BATTLE_PHOTO'))).toEqual({ ok: false, error: 'Der Speicherplatz für Bilder dieser Kampagne ist erschöpft' });
    } finally {
      if (prev === undefined) delete process.env.UPLOAD_QUOTA_MB;
      else process.env.UPLOAD_QUOTA_MB = prev;
    }
    expect((await m.playerActions.playerUploadAction(token, form(await png('#456'), 'BATTLE_PHOTO'))).ok).toBe(true);
    expect(m.uploads.campaignUploadBytes(id)).toBeGreaterThan(0);
  });
});

describe('Kleinere Befunde', () => {
  it('F10: Test-E-Mail nur für Admins, genau eine gültige Adresse; Spieler-E-Mail wird geprüft', async () => {
    const owner = account('ADMIN');
    const co = account('COWARMASTER');
    const { id, s } = newCampaign();
    m.auth.grantAccess(co.id, id);
    login(co.id);
    expect(await m.ops.sendTestAction(id, 'a@example.org')).toEqual({ ok: false, error: 'Nur für Admins' });
    login(owner.id);
    expect(await m.ops.sendTestAction(id, 'a@example.org, b@example.org')).toEqual({ ok: false, error: 'Ungültige E-Mail-Adresse' });
    expect(await m.ops.sendTestAction(id, 'Name <a@example.org>')).toEqual({ ok: false, error: 'Ungültige E-Mail-Adresse' });
    expect(gm(id, { type: 'PLAYER_UPSERT', id: ids(s).pa, data: { email: 'keine-adresse' } })).toMatchObject({ ok: false });
    expect(gm(id, { type: 'PLAYER_UPSERT', id: ids(s).pa, data: { email: 'spieler@example.org' } }).ok).toBe(true);
    expect(gm(id, { type: 'PLAYER_UPSERT', id: ids(s).pa, data: { email: '' } }).ok).toBe(true);
  });

  it('F10: Test-E-Mails je Konto begrenzt', async () => {
    const { testMailLimited } = await import('@/server/notify');
    const key = `a:limit-${Date.now()}`;
    for (let i = 0; i < 5; i++) expect(testMailLimited(key)).toBe(false);
    expect(testMailLimited(key)).toBe(true);
  });

  it('F9: Tischauswahl per Spielerlink ist je Link begrenzt', async () => {
    const { id, s } = newCampaign();
    const token = m.players.playerTokenFor(id, ids(s).pa, true)!;
    let last: Awaited<ReturnType<typeof m.club.tableOptionsAction>> | null = null;
    for (let i = 0; i < 21; i++) last = await m.club.tableOptionsAction({ token }, 'keine-schlacht');
    expect(last).toEqual({ ok: false, error: 'Zu viele Aktionen – bitte eine Minute warten' });
    expect(await m.club.tableOptionsAction({ token: 'x'.repeat(40) }, 'b')).toEqual({ ok: false, error: 'Link ungültig oder gesperrt' });
  });

  it('F8/S1: Aktionen ohne Anmeldung scheitern, bevor Kampagnen geladen werden', async () => {
    const { id } = newCampaign();
    await expect(m.campaignActions.runCommandAction(id, -1, { type: 'ADVANCE' })).rejects.toThrow('Nicht angemeldet');
    await expect(m.campaignActions.loadRevisionStateAction(id, 1)).rejects.toThrow('Nicht angemeldet');
    expect(await m.ops.restoreBackupAction(id, 'x.zip')).toEqual({ ok: false, error: 'Nicht angemeldet' });
  });

  it('Info: Laufzeit-Typprüfung – „1“ als Text umgeht den Schutz des eigenen Kontos nicht', async () => {
    const owner = account('ADMIN');
    login(owner.id);
    const { deleteAccountAction } = await import('@/app/actions/accounts');
    expect(await deleteAccountAction(String(owner.id) as unknown as number)).toEqual({ ok: false, error: 'Ungültige Eingabe' });
    expect(await deleteAccountAction(owner.id)).toEqual({ ok: false, error: 'Das eigene Konto kann nicht gelöscht werden' });
  });

  it('S5: Leseansicht-Link wird ohne Zustand geprüft; abgeschaltete Leseansicht und Sandboxes gelten nicht', () => {
    const { id } = newCampaign();
    const row = m.campaigns.getCampaign(id)!;
    expect(m.authz.requireViewerRow(row.public_token)?.id).toBe(id);
    m.campaigns.setPublicEnabled(id, false);
    expect(m.authz.requireViewerRow(row.public_token)).toBeNull();
    expect(m.authz.requireViewerRow('kurz')).toBeNull();
    expect(m.authz.requireViewerRow(123)).toBeNull();
  });
});
