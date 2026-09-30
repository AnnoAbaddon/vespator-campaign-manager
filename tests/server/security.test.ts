import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ids, startedCampaign } from '../engine/helpers';
import type { CampaignState } from '@/engine/types';
import type { Command } from '@/engine/commands';

/**
 * Sicherheits- und Robustheitsprüfungen der Serverschicht (Review): Eingabeprüfung der Spieler-Commands, Login-Rate-Limit,
 * Push-Endpunkte, .ics-Escaping, Datenschutz mit Sandboxes, Tischbelegung beim Verschieben, Isolation der
 * Hintergrundaufgaben, Aufräumen gelöschter Kampagnen.
 */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-sec-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.BACKUP_DIR = path.join(tmp, 'backups');
process.env.APP_URL = 'https://kampagne.example';

type Mods = {
  campaigns: typeof import('@/server/campaigns');
  backup: typeof import('@/server/backup');
  players: typeof import('@/server/players');
  db: typeof import('@/server/db');
  auth: typeof import('@/server/auth');
  push: typeof import('@/server/push');
  webpush: typeof import('@/server/webpush');
  ics: typeof import('@/server/ics');
  privacy: typeof import('@/server/privacy');
  sandbox: typeof import('@/server/sandbox');
  club: typeof import('@/server/club');
  scheduler: typeof import('@/server/scheduler');
  notify: typeof import('@/server/notify');
  auto: typeof import('@/server/autoBackup');
  health: typeof import('@/server/health');
  maintenance: typeof import('@/server/maintenance');
  origin: typeof import('@/server/origin');
  discord: typeof import('@/server/discordBot');
  pngCache: typeof import('@/server/pngCache');
};
let m: Mods;

beforeAll(async () => {
  m = {
    campaigns: await import('@/server/campaigns'),
    backup: await import('@/server/backup'),
    players: await import('@/server/players'),
    db: await import('@/server/db'),
    auth: await import('@/server/auth'),
    push: await import('@/server/push'),
    webpush: await import('@/server/webpush'),
    ics: await import('@/server/ics'),
    privacy: await import('@/server/privacy'),
    sandbox: await import('@/server/sandbox'),
    club: await import('@/server/club'),
    scheduler: await import('@/server/scheduler'),
    notify: await import('@/server/notify'),
    auto: await import('@/server/autoBackup'),
    health: await import('@/server/health'),
    maintenance: await import('@/server/maintenance'),
    origin: await import('@/server/origin'),
    discord: await import('@/server/discordBot'),
    pngCache: await import('@/server/pngCache'),
  };
});
afterAll(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
});

function newCampaign(prep?: (s: CampaignState) => void): { id: string; s: CampaignState } {
  const s = startedCampaign();
  prep?.(s);
  const id = m.backup.importBackup(new TextEncoder().encode(JSON.stringify({ state: s })), 'Testkampagne');
  return { id, s: m.campaigns.currentState(id).state };
}
const run = (id: string, cmd: Command) => {
  const r = m.campaigns.runCommand(id, -1, cmd, { force: true, reason: 'test' });
  if (!r.ok) throw new Error('error' in r ? r.error : r.kind);
  return r;
};
const attack = (id: string, s: CampaignState) => {
  const { fa, c } = ids(s);
  run(id, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
  run(id, { type: 'ADVANCE' });
  run(id, { type: 'REVEAL_OPS' });
  return m.campaigns.currentState(id).state.battles.find((b) => b.kind === 'CAMPAIGN')!;
};
const player = (id: string, pid: string) => m.campaigns.currentState(id).state.players.find((p) => p.id === pid)!;
const errorOf = (r: { ok: boolean }) => (r as { error?: string }).error;

describe('SEC 1: Spieler-Commands – Größe, Längen, Bild-IDs, Steuerzeichen', () => {
  it('zu große oder ungültige Commands werden abgelehnt und nicht gespeichert', () => {
    const { id, s } = newCampaign();
    const { pa } = ids(s);
    const token = m.players.regeneratePlayerToken(id, pa);
    const revBefore = m.campaigns.getCampaign(id)!.current_rev;
    const huge = m.players.runPlayerCommand(token, { type: 'NOTE_ADD', allianceId: s.alliances[0].id, playerId: pa, text: 'x'.repeat(70_000) });
    expect(huge.ok).toBe(false);
    expect(errorOf(huge)).toBe('Die Eingabe ist zu groß');
    const long = m.players.runPlayerCommand(token, { type: 'PROFILE_UPDATE', playerId: pa, update: { faction: 'y'.repeat(6000) } });
    expect(errorOf(long)).toMatch(/^Text ist zu lang \(höchstens 5000 Zeichen\)$/);
    const many = m.players.runPlayerCommand(token, { type: 'TIME_PROPOSE', battleId: 'x', playerId: pa, times: Array.from({ length: 300 }, () => '2026-01-01T00:00:00Z') });
    expect(errorOf(many)).toBe('Zu viele Einträge');
    expect(errorOf(m.players.runPlayerCommand(token, null as unknown as Command))).toBe('Ungültige Aktion');
    expect(errorOf(m.players.runPlayerCommand(token, [] as unknown as Command))).toBe('Ungültige Aktion');
    // nichts davon landet als Revision in der Datenbank
    expect(m.campaigns.getCampaign(id)!.current_rev).toBe(revBefore);
  });

  it('auch der Spielleiter-Weg hat eine Obergrenze', () => {
    const { id } = newCampaign();
    const r = m.campaigns.runCommand(id, -1, { type: 'META_UPDATE', intro: 'z'.repeat(5 * 1024 * 1024) }, { force: true });
    expect(errorOf(r)).toBe('Die Eingabe ist zu groß');
  });

  it('Profil: Fraktion gekürzt, nur bekannte Benachrichtigungen, Avatar nur als Upload-ID', () => {
    const { id, s } = newCampaign();
    const { pa } = ids(s);
    const token = m.players.regeneratePlayerToken(id, pa);
    const ok = m.players.runPlayerCommand(token, {
      type: 'PROFILE_UPDATE',
      playerId: pa,
      update: { faction: 'F'.repeat(300), subfaction: 'S'.repeat(200), notify: { PHASE: false, BOGUS: true, RESULTS: 'ja' } as unknown as Record<string, boolean> },
    });
    expect(ok.ok).toBe(true);
    const p = player(id, pa);
    expect(p.faction).toHaveLength(80);
    expect(p.subfaction).toHaveLength(80);
    expect(p.notify).toMatchObject({ PHASE: false });
    expect(p.notify).not.toHaveProperty('BOGUS');
    expect((p.notify as Record<string, unknown>).RESULTS).not.toBe('ja');
    const bad = m.players.runPlayerCommand(token, { type: 'PROFILE_UPDATE', playerId: pa, update: { avatar: '../../etc/passwd' } });
    expect(errorOf(bad)).toBe('Ungültiges Bild');
    expect(m.players.runPlayerCommand(token, { type: 'PROFILE_UPDATE', playerId: pa, update: { avatar: 'AbCdEfGh12345678' } }).ok).toBe(true);
    expect(player(id, pa).avatar).toBe('AbCdEfGh12345678');
    const portrait = m.players.runPlayerCommand(token, { type: 'COMMANDER_UPDATE', playerId: pa, name: 'Kommandant', title: 'Lord', portrait: 'javascript:alert(1)' });
    expect(errorOf(portrait)).toBe('Ungültiges Bild');
  });

  it('Steuerzeichen werden entfernt, einzeilige Felder ohne Umbrüche', () => {
    const { id, s } = newCampaign();
    const { pa } = ids(s);
    const token = m.players.regeneratePlayerToken(id, pa);
    expect(m.players.runPlayerCommand(token, { type: 'PROFILE_UPDATE', playerId: pa, update: { nickname: 'Neu\r\nBEGIN:VEVENT\u0007' } }).ok).toBe(true);
    expect(player(id, pa).nickname).toBe('Neu BEGIN:VEVENT');
    const al = m.campaigns.currentState(id).state.players.find((p) => p.id === pa)!;
    const allianceId = al.memberships.at(-1)!.allianceId;
    expect(m.players.runPlayerCommand(token, { type: 'NOTE_ADD', allianceId, playerId: pa, text: 'Zeile 1\r\nZeile 2\u0000' }).ok).toBe(true);
    const note = m.campaigns.currentState(id).state.allianceNotes!.at(-1)!;
    expect(note.text).toBe('Zeile 1\nZeile 2');
    // gespeicherter Command ist ebenfalls bereinigt
    const cmd = (m.db.db().prepare('SELECT command FROM revision WHERE campaign_id = ? ORDER BY number DESC LIMIT 1').get(id) as { command: string }).command;
    expect(cmd).not.toMatch(/\\r|\\u0000/);
  });
});

describe('SEC 2: Login-Rate-Limit', () => {
  it('Prüfen und Zählen in einem Schritt: der 6. Versuch derselben IP ist gesperrt, auch ohne Abschluss der vorigen', () => {
    const now = Date.now();
    const gates = Array.from({ length: 6 }, () => m.auth.beginLoginAttempt('10.0.0.1', 'user:alice', now));
    expect(gates.slice(0, 5).every((g) => !g.blocked)).toBe(true);
    expect(gates[5]).toEqual({ blocked: true });
  });

  it('erfolgreiche Anmeldung nimmt nur den eigenen Versuch zurück, frühere Fehlversuche der IP bleiben', () => {
    const now = Date.now();
    for (let i = 0; i < 4; i++) m.auth.beginLoginAttempt('10.0.0.2', 'user:bob', now);
    const ok = m.auth.beginLoginAttempt('10.0.0.2', 'user:bob', now);
    expect(ok.blocked).toBe(false);
    m.auth.finishLoginAttempt((ok as { attempt: number }).attempt, 'user:bob');
    // 4 Fehlversuche stehen noch: ein weiterer ist erlaubt, danach ist Schluss
    expect(m.auth.beginLoginAttempt('10.0.0.2', 'user:bob', now).blocked).toBe(false);
    expect(m.auth.beginLoginAttempt('10.0.0.2', 'user:bob', now).blocked).toBe(true);
    // der Zähler des Benutzernamens wurde beim Erfolg geleert
    expect(m.auth.rateLimited('user:bob', 3)).toBe(false);
  });

  it('Benutzername wird ab 20 Fehlversuchen nur gebremst, nicht gesperrt', () => {
    const now = Date.now();
    for (let i = 0; i < 20; i++) m.auth.beginLoginAttempt(`10.1.0.${i}`, 'user:carol', now);
    const g = m.auth.beginLoginAttempt('10.2.0.1', 'user:carol', now);
    expect(g).toMatchObject({ blocked: false, slow: true });
  });

  it('X-Forwarded-For gilt nur mit TRUST_PROXY=1', () => {
    const h = new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8', 'x-real-ip': '9.9.9.9' });
    expect(m.auth.clientIpFrom(h, false)).toBe(m.auth.DIRECT_CLIENT);
    expect(m.auth.clientIpFrom(h, true)).toBe('5.6.7.8');
    expect(m.auth.clientIpFrom(new Headers({ 'x-real-ip': '9.9.9.9' }), true)).toBe('9.9.9.9');
  });
});

describe('QUALITY 21: Passwort-Hash und Sitzungen', () => {
  it('argon2id: richtiges Passwort passt, falsches nicht, jedes Mal neues Salz', async () => {
    const h1 = await m.auth.hashPassword('geheim-geheim');
    const h2 = await m.auth.hashPassword('geheim-geheim');
    expect(h1).toMatch(/^argon2id\$19456\$2\$1\$/);
    expect(h1).not.toBe(h2);
    expect(await m.auth.verifyPassword('geheim-geheim', h1)).toBe(true);
    expect(await m.auth.verifyPassword('geheim-geheiM', h1)).toBe(false);
    expect(await m.auth.verifyPassword('geheim-geheim', 'bcrypt$x')).toBe(false);
  });

  it('Sitzung: abgelaufen zählt nicht, kurz vor Ablauf wird verlängert', () => {
    m.db.db().prepare("INSERT INTO admin(username, password_hash, created_at, role) VALUES('sess', 'x', '2026-01-01', 'SUPERUSER')").run();
    const aid = (m.db.db().prepare("SELECT id FROM admin WHERE username = 'sess'").get() as { id: number }).id;
    const now = Date.parse('2026-06-01T00:00:00Z');
    const day = 86_400_000;
    // Sitzungs-IDs stehen gehasht in der Tabelle; angelegt vor 10 Tagen
    const k = m.auth.sessionKey;
    const born = new Date(now - 10 * day).toISOString();
    m.db
      .db()
      .prepare('INSERT INTO session(id, admin_id, expires_at, created_at) VALUES(?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)')
      .run(k('s-old'), aid, new Date(now - day).toISOString(), born, k('s-short'), aid, new Date(now + 2 * day).toISOString(), born, k('s-long'), aid, new Date(now + 25 * day).toISOString(), born);
    expect(m.auth.sessionAccount('s-old', now)).toBeNull();
    expect(m.auth.sessionAccount('gibts-nicht', now)).toBeNull();
    // unbekannte Rolle → geringste Rechte
    expect(m.auth.sessionAccount('s-short', now)).toMatchObject({ id: aid, role: 'COWARMASTER' });
    const exp = (id: string) => (m.db.db().prepare('SELECT expires_at FROM session WHERE id = ?').get(k(id)) as { expires_at: string }).expires_at;
    expect(exp('s-short')).toBe(new Date(now + 30 * day).toISOString());
    m.auth.sessionAccount('s-long', now);
    expect(exp('s-long')).toBe(new Date(now + 25 * day).toISOString());
  });
});

describe('SEC 3: öffentliche Adresse', () => {
  it('nur ausdrücklich gespeicherte Adressen ohne Pfad; APP_URL geht vor', () => {
    expect(m.origin.normalizePublicUrl('https://club.example/')).toBe('https://club.example');
    expect(m.origin.normalizePublicUrl('https://club.example/pfad')).toBeNull();
    expect(m.origin.normalizePublicUrl('javascript:alert(1)')).toBeNull();
    expect(m.origin.normalizePublicUrl('https://u:p@club.example')).toBeNull();
    expect(m.origin.setPublicUrl('https://club.example')).toBeNull();
    expect(m.origin.appUrl()).toBe('https://kampagne.example');
    const env = process.env.APP_URL;
    delete process.env.APP_URL;
    try {
      expect(m.origin.appUrl()).toBe('https://club.example');
      // Kopfzeilen werden nur angezeigt, nie gespeichert
      expect(m.origin.publicOrigin(new Headers({ host: 'evil.example' }))).toBe('https://club.example');
      m.origin.setPublicUrl('');
      expect(m.origin.publicOrigin(new Headers({ host: 'evil.example' }))).toBe('https://evil.example');
      expect(m.origin.appUrl()).toBe('http://localhost:3000');
    } finally {
      process.env.APP_URL = env;
    }
  });
});

describe('SEC 6/7: Web-Push', () => {
  const sub = (endpoint: string) => {
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    return { endpoint, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } };
  };

  it('nur bekannte Push-Dienste', () => {
    const ok = [
      'https://fcm.googleapis.com/fcm/send/x',
      'https://updates.push.services.mozilla.com/wpush/v2/x',
      'https://db5p.notify.windows.com/w/?token=x',
      'https://web.push.apple.com/x',
      'https://api.push.apple.com/x',
    ];
    for (const e of ok) expect(m.webpush.validEndpoint(e), e).toBe(true);
    const bad = [
      'https://push.example.org/send/x',
      'https://fcm.googleapis.com.evil.example/x',
      'https://evilpush.apple.com/x',
      'https://push.apple.com/x',
      'https://fcm.googleapis.com:8443/x',
      'http://fcm.googleapis.com/x',
      'https://169.254.169.254/latest',
    ];
    for (const e of bad) expect(m.webpush.validEndpoint(e), e).toBe(false);
    expect(m.push.parseSubscription(sub('https://intranet.local/x'))).toBeNull();
    expect(m.push.parseSubscription(sub('https://fcm.googleapis.com/fcm/send/abc'))).not.toBeNull();
  });

  it('höchstens 5 Geräte je Besitzer – das älteste wird ersetzt', () => {
    const owner = { kind: 'ADMIN' as const, adminId: 4242 };
    const endpoints = Array.from({ length: 7 }, (_, i) => `https://fcm.googleapis.com/fcm/send/dev${i}`);
    for (const e of endpoints) m.push.savePushSub(owner, m.push.parseSubscription(sub(e))!);
    const rows = m.db.db().prepare("SELECT endpoint FROM push_sub WHERE owner = 'a:4242'").all() as { endpoint: string }[];
    expect(rows.map((r) => r.endpoint).sort()).toEqual(endpoints.slice(2).sort());
    // erneutes Speichern eines vorhandenen Geräts verdrängt nichts
    m.push.savePushSub(owner, m.push.parseSubscription(sub(endpoints[6]))!);
    expect(m.db.db().prepare("SELECT COUNT(*) AS n FROM push_sub WHERE owner = 'a:4242'").get()).toEqual({ n: 5 });
  });

  it('Löschen eines Kontos entfernt dessen Push-Abos', () => {
    m.db.db().prepare("INSERT INTO admin(username, password_hash, created_at, role, locale) VALUES('owner1', 'x', '2026-01-01', 'ADMIN', 'de'), ('co1', 'x', '2026-01-01', 'COWARMASTER', 'de')").run();
    const co = (m.db.db().prepare("SELECT id FROM admin WHERE username = 'co1'").get() as { id: number }).id;
    m.push.savePushSub({ kind: 'ADMIN', adminId: co }, m.push.parseSubscription(sub('https://fcm.googleapis.com/fcm/send/co1'))!);
    m.auth.deleteAccount(co);
    expect(m.db.db().prepare('SELECT COUNT(*) AS n FROM push_sub WHERE admin_id = ?').get(co)).toEqual({ n: 0 });
  });
});

describe('SEC 8: .ics', () => {
  it('Zeilenumbrüche werden escaped, \\r und Steuerzeichen entfernt', () => {
    const v = m.ics.icsEscape('Böse\r\nBEGIN:VEVENT\rX;Y,Z\\\u0000');
    expect(v).not.toMatch(/[\r\n\u0000]/);
    expect(v).toBe('Böse\\nBEGIN:VEVENT\\nX\\;Y\\,Z\\\\');
    expect(m.ics.icsStamp('2026-11-01T17:00:00.000Z')).toBe('20261101T170000Z');
  });
});

describe('SEC 5: Datenschutz mit Sandboxes', () => {
  it('Kontaktdaten verschwinden auch aus Sandboxes – das Übernehmen bringt sie nicht zurück', () => {
    const { id, s } = newCampaign((st) => st.players.forEach((p, i) => ((p.email = `p${i}@example.org`), (p.realName = `Echter Name ${i}`), (p.avatar = `Avatar${i}xyz123`))));
    const { pa, pb } = ids(s);
    const sb = m.sandbox.createSandbox(id, 'SL');
    run(sb, { type: 'PLAYER_UPSERT', id: pb, data: { notes: 'Sandbox-Schritt' } });
    m.privacy.deletePlayerContact(id, pa, 'SL');
    const sbRevs = m.db.db().prepare('SELECT state FROM revision WHERE campaign_id = ?').all(sb) as { state: string }[];
    expect(sbRevs.every((r) => !r.state.includes('p0@example.org') && !r.state.includes('Echter Name 0'))).toBe(true);
    const applied = m.sandbox.applySandbox(sb, { reason: 'test', confirmed: true, author: 'SL' });
    expect(applied.ok).toBe(true);
    const p = player(id, pa);
    expect(p.email).toBe('');
    expect(p.realName).toBe('');
    // Avatar gehört zu den persönlichen Daten
    expect(p.avatar).toBeNull();
    expect(player(id, pb).avatar).toBe('Avatar1xyz123');
    // der andere Spieler behält seine Daten
    expect(player(id, pb).email).toBe('p1@example.org');
  });
});

describe('QUALITY 4: Tischbelegung beim Verschieben', () => {
  it('Terminänderung einer Schlacht mit Tisch wird gegen die Belegung aller Kampagnen geprüft', () => {
    const [t1] = m.club.setClubTables([{ name: 'Tisch A' }, { name: 'Tisch B' }]);
    const A = newCampaign();
    const B = newCampaign();
    const ba = attack(A.id, A.s);
    const bb = attack(B.id, B.s);
    run(A.id, { type: 'TIME_PROPOSE', battleId: ba.id, playerId: null, times: ['2027-03-01T17:00:00.000Z'] });
    run(A.id, { type: 'TIME_ACCEPT', battleId: ba.id, playerId: null, time: '2027-03-01T17:00:00.000Z' });
    run(A.id, { type: 'BATTLE_TABLE_SET', battleId: ba.id, playerId: null, table: t1 });
    // B: gleicher Tisch, aber weit entfernter Termin – erlaubt
    run(B.id, { type: 'TIME_PROPOSE', battleId: bb.id, playerId: null, times: ['2027-03-01T23:00:00.000Z'] });
    run(B.id, { type: 'TIME_ACCEPT', battleId: bb.id, playerId: null, time: '2027-03-01T23:00:00.000Z' });
    run(B.id, { type: 'BATTLE_TABLE_SET', battleId: bb.id, playerId: null, table: t1 });
    // Verschieben auf 18:00 kollidiert mit A (17:00, ±3 h)
    run(B.id, { type: 'TIME_PROPOSE', battleId: bb.id, playerId: null, times: ['2027-03-01T18:00:00.000Z'] });
    const r = m.campaigns.runCommand(B.id, -1, { type: 'TIME_ACCEPT', battleId: bb.id, playerId: null, time: '2027-03-01T18:00:00.000Z' }, { force: true, reason: 'test' });
    expect(r.ok).toBe(false);
    expect(errorOf(r)).toMatch(/^Tisch A ist zu dieser Zeit belegt: /);
    // fremde Kampagne und Schlacht bleiben verborgen
    expect(errorOf(r)).not.toMatch(/Testkampagne|Purge/);
    expect(m.campaigns.currentState(B.id).state.battles.find((x) => x.id === bb.id)!.scheduledAt).toBe('2027-03-01T23:00:00.000Z');
    // Tischauswahl zeigt fremde Buchungen nur als Uhrzeit
    const opts = m.club.tableOptions(B.id, m.campaigns.currentState(B.id).state, bb.id, (x) => x);
    expect(opts.find((o) => o.id === t1.id)!.busy).toEqual([]);
  });
});

describe('QUALITY 1: Hintergrundaufgaben isoliert', () => {
  it('eine fehlerhafte Kampagne hält weder andere Kampagnen noch Backups und Wartung auf', async () => {
    const good = newCampaign();
    const bad = newCampaign();
    // Deadline-Prüfung wirft für eine Kampagne
    m.notify.deadlineHooks.before = (cid) => {
      if (cid === bad.id) throw new Error('kaputt');
    };
    const seen: string[] = [];
    const orig = m.notify.deadlineHooks.before;
    m.notify.deadlineHooks.before = (cid) => {
      seen.push(cid);
      orig(cid);
    };
    // Backup einer dritten Kampagne schlägt fehl (Revision fehlt)
    m.db.db().prepare("INSERT INTO campaign(id, name, public_token, current_rev, created_at, updated_at) VALUES('defekt01', 'Defekt', ?, 99, '2026-01-01', '2026-01-01')").run(crypto.randomBytes(16).toString('hex'));
    m.health.clearErrors();
    // heute 04:00 Ortszeit (Backups tragen die echte Dateizeit)
    const at = new Date();
    at.setHours(4, 0, 0, 0);
    const day = m.auto.localDay(at);
    try {
      await m.scheduler.periodicTasks(at);
    } finally {
      m.notify.deadlineHooks.before = undefined;
    }
    expect(seen).toEqual(expect.arrayContaining([good.id, bad.id]));
    // Backups der übrigen Kampagnen entstanden trotzdem; der Tag gilt noch nicht als erledigt (Wiederholung)
    expect(m.auto.listBackups(good.id).length).toBeGreaterThan(0);
    expect(m.auto.listBackups(bad.id).length).toBeGreaterThan(0);
    expect(m.db.getSetting('backupLastDay')).not.toBe(day);
    // Datenbank-Sicherung und Fehlerprotokoll
    expect(m.maintenance.listDbBackups()).toContain(`app-${day}.db`);
    const errs = m.health.recentErrors().map((e) => e.source);
    expect(errs.some((s) => s.includes('deadlines'))).toBe(true);
    expect(errs.some((s) => s.includes('backups'))).toBe(true);
    m.db.db().prepare("DELETE FROM campaign WHERE id = 'defekt01'").run();
    // nächster Durchgang: bereits gesicherte Kampagnen werden übersprungen, dann ist der Tag erledigt
    const before = m.auto.listBackups(good.id).length;
    await m.scheduler.periodicTasks(new Date(at.getTime() + 5 * 60_000));
    expect(m.auto.listBackups(good.id).length).toBe(before);
    expect(m.db.getSetting('backupLastDay')).toBe(day);
  });

  it('runSafe fängt Fehler und meldet sie', async () => {
    m.health.clearErrors();
    expect(await m.scheduler.runSafe('probe', () => Promise.reject(new Error('weg')))).toBe(false);
    expect(m.health.recentErrors()[0].source).toMatch(/probe/);
  });
});

describe('QUALITY 6/16: Aufräumen', () => {
  it('Löschen einer Kampagne entfernt Outbox, Push, Discord, Einstellungen und Backups', () => {
    const { id, s } = newCampaign();
    const { pa } = ids(s);
    const token = m.players.regeneratePlayerToken(id, pa);
    m.notify.enqueue({ campaignId: id, channel: 'EMAIL', recipient: 'a@b.c', subject: 'x', body: 'y', key: 'k' });
    m.push.savePushSub(
      { kind: 'PLAYER', campaignId: id, playerId: pa, tokenHash: m.players.playerTokenHash(token) },
      m.push.parseSubscription({
        endpoint: 'https://fcm.googleapis.com/fcm/send/del',
        keys: { p256dh: crypto.createECDH('prime256v1').generateKeys().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') },
      })!,
    );
    m.db.setSetting(`discord:${id}`, 'https://discord.com/api/webhooks/1/x');
    m.auto.backupCampaign(id);
    m.campaigns.deleteCampaign(id);
    const count = (sql: string) => (m.db.db().prepare(sql).get(id) as { n: number }).n;
    expect(count('SELECT COUNT(*) AS n FROM outbox WHERE campaign_id = ?')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM push_sub WHERE campaign_id = ?')).toBe(0);
    expect(m.db.getSetting(`discord:${id}`)).toBeNull();
    expect(fs.existsSync(path.join(process.env.BACKUP_DIR!, id))).toBe(false);
  });

  it('abgelaufene Sitzungen, alte Nachrichten und Codes werden entfernt', () => {
    m.db.db().prepare("INSERT INTO admin(username, password_hash, created_at) VALUES('purge', 'x', '2026-01-01')").run();
    const aid = (m.db.db().prepare("SELECT id FROM admin WHERE username = 'purge'").get() as { id: number }).id;
    const born = new Date().toISOString();
    m.db
      .db()
      .prepare("INSERT INTO session(id, admin_id, expires_at, created_at) VALUES('alt', ?, '2000-01-01T00:00:00.000Z', ?), ('neu', ?, '2999-01-01T00:00:00.000Z', ?)")
      .run(aid, born, aid, born);
    const r = m.maintenance.purgeExpired();
    expect(r.sessions).toBeGreaterThanOrEqual(1);
    expect(m.db.db().prepare("SELECT id FROM session WHERE id IN ('alt', 'neu')").all()).toEqual([{ id: 'neu' }]);
  });
});

describe('Weitere Härtungen', () => {
  it('Discord: nicht numerischer Zeitstempel wird abgewiesen', () => {
    const keys = crypto.generateKeyPairSync('ed25519');
    const pubHex = (keys.publicKey.export({ format: 'der', type: 'spki' }) as Buffer).subarray(12).toString('hex');
    expect(m.discord.setDiscordBotConfig({ appId: '123456789012345678', publicKey: pubHex, token: '' })).toBeNull();
    const raw = JSON.stringify({ type: 1 });
    const ts = 'abc';
    const sig = crypto.sign(null, Buffer.from(ts + raw), keys.privateKey).toString('hex');
    expect(m.discord.handleInteraction(raw, sig, ts).status).toBe(401);
  });

  it('Karten-PNG-Zwischenspeicher: je Schlüssel einmal rendern, höchstens N Einträge', async () => {
    const c = new m.pngCache.LruCache<number>(2);
    let calls = 0;
    const make = async () => ++calls;
    expect(await c.get('a', make)).toBe(1);
    expect(await c.get('a', make)).toBe(1);
    await c.get('b', make);
    await c.get('c', make);
    expect(c.size).toBe(2);
    expect(await c.get('a', make)).toBe(4);
  });
});
