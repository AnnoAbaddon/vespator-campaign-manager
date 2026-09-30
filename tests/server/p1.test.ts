import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ids, startedCampaign } from '../engine/helpers';
import type { CampaignState } from '@/engine/types';
import { decryptPayload } from '@/server/webpush';

// Erwartet deutsche Texte ohne Kampagnen- und Standardsprache: deutscher Build (NEXT_PUBLIC_DEFAULT_LOCALE=de), vor allen Importen gesetzt
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_DEFAULT_LOCALE = 'de';
});

/** Block P1: Web-Push über die Outbox, Einmal-Link zum Bestätigen, Discord-Bot, Club-Kalender */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-p1-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.BACKUP_DIR = path.join(tmp, 'backups');
process.env.APP_URL = 'https://kampagne.example';

type Mods = {
  campaigns: typeof import('@/server/campaigns');
  backup: typeof import('@/server/backup');
  notify: typeof import('@/server/notify');
  db: typeof import('@/server/db');
  players: typeof import('@/server/players');
  push: typeof import('@/server/push');
  confirm: typeof import('@/server/confirmLink');
  discord: typeof import('@/server/discordBot');
  club: typeof import('@/server/club');
};
let m: Mods;

beforeAll(async () => {
  m = {
    campaigns: await import('@/server/campaigns'),
    backup: await import('@/server/backup'),
    notify: await import('@/server/notify'),
    db: await import('@/server/db'),
    players: await import('@/server/players'),
    push: await import('@/server/push'),
    confirm: await import('@/server/confirmLink'),
    discord: await import('@/server/discordBot'),
    club: await import('@/server/club'),
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  m.push.pushFetch.impl = undefined;
});
afterAll(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
});

function newCampaign(withMail = false): { id: string; s: CampaignState } {
  const s = startedCampaign();
  if (withMail) s.players.forEach((p, i) => (p.email = `p${i + 1}@example.org`));
  const id = m.backup.importBackup(new TextEncoder().encode(JSON.stringify({ state: s })), 'Testkampagne');
  return { id, s: m.campaigns.currentState(id).state };
}
const run = (id: string, cmd: Parameters<typeof m.campaigns.runCommand>[2]) => {
  const r = m.campaigns.runCommand(id, -1, cmd, { force: true, reason: 'test' });
  if (!r.ok) throw new Error('error' in r ? r.error : r.kind);
  return r;
};
/** P1 (Allianz a) greift Caltus Novem (Allianz c, P3) an */
const attack = (id: string, s: CampaignState) => {
  const { fa, c } = ids(s);
  run(id, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
  run(id, { type: 'ADVANCE' });
  run(id, { type: 'REVEAL_OPS' });
  return m.campaigns.currentState(id).state.battles.find((b) => b.kind === 'CAMPAIGN')!;
};
const outbox = (id: string) =>
  m.db.db().prepare('SELECT id, channel, recipient, subject, body, status, attempts, last_error FROM outbox WHERE campaign_id = ? ORDER BY id').all(id) as {
    id: number;
    channel: string;
    recipient: string;
    subject: string;
    body: string;
    status: string;
    attempts: number;
    last_error: string | null;
  }[];

/** Abonnement wie aus dem Browser (mit privatem Schlüssel zum Entschlüsseln im Mock) */
function browserSub(endpoint = `https://fcm.googleapis.com/fcm/send/${crypto.randomBytes(6).toString('hex')}`) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return { priv: ecdh.getPrivateKey(), auth, sub: { endpoint, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } } };
}
function subscribePlayer(id: string, playerId: string) {
  const token = m.players.regeneratePlayerToken(id, playerId);
  const b = browserSub();
  m.push.savePushSub({ kind: 'PLAYER', campaignId: id, playerId, tokenHash: m.players.playerTokenHash(token) }, m.push.parseSubscription(b.sub)!);
  return { ...b, token };
}
const mockPush = (status: number) => {
  const calls: { url: string; body: Buffer }[] = [];
  m.push.pushFetch.impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: Buffer.from(init.body as Uint8Array) });
    return new Response(null, { status });
  }) as unknown as typeof fetch;
  return calls;
};

describe('NTH2 1.1 Web-Push', () => {
  it('VAPID-Schlüssel werden einmal erzeugt und bleiben stabil', () => {
    const k = m.push.vapidKeys();
    expect(Buffer.from(k.publicKey, 'base64url')).toHaveLength(65);
    expect(m.push.vapidKeys()).toEqual(k);
  });

  it('Spieler ohne E-Mail erhält Push über die Outbox; der Mock-Endpunkt kann die Nachricht entschlüsseln', async () => {
    const { id, s } = newCampaign();
    const { pc } = ids(s);
    const sub = subscribePlayer(id, pc);
    attack(id, s);
    const rows = outbox(id).filter((x) => x.channel === 'PUSH');
    expect(rows.map((x) => x.subject)).toContain('Testkampagne: Du wirst angegriffen');
    const calls = mockPush(201);
    await m.notify.flushOutbox();
    expect(
      outbox(id)
        .filter((x) => x.channel === 'PUSH')
        .every((x) => x.status === 'SENT'),
    ).toBe(true);
    const payload = JSON.parse(decryptPayload(calls[0].body, sub.priv, sub.auth).toString());
    expect(calls[0].url).toBe(sub.sub.endpoint);
    expect(payload.url).toBe(`/p/${sub.token}`);
  });

  it('abgemeldete Kategorie → kein Push', () => {
    const { id, s } = newCampaign();
    const { pc } = ids(s);
    subscribePlayer(id, pc);
    run(id, { type: 'PROFILE_UPDATE', playerId: pc, update: { notify: { PERSONAL: false, PHASE: false } } });
    attack(id, s);
    expect(outbox(id).filter((x) => x.channel === 'PUSH')).toHaveLength(0);
  });

  it('410 → SKIPPED und Abo gelöscht; 500 → Wiederholung mit Abstand', async () => {
    const { id, s } = newCampaign();
    const { pc, pb } = ids(s);
    subscribePlayer(id, pc);
    attack(id, s);
    mockPush(410);
    await m.notify.flushOutbox();
    const rows = outbox(id).filter((x) => x.channel === 'PUSH');
    expect(rows.every((x) => x.status === 'SKIPPED')).toBe(true);
    expect(rows[0].last_error).toMatch(/abgelaufen/);
    expect(m.push.playerPushSubIds(id, pc)).toHaveLength(0);

    subscribePlayer(id, pb);
    m.notify.enqueue({ campaignId: id, channel: 'PUSH', recipient: m.push.playerPushSubIds(id, pb)[0], subject: 'T', body: '{"title":"T","body":"B","url":"/"}', key: 'probe' });
    mockPush(500);
    await m.notify.flushOutbox();
    const row = outbox(id).find((x) => x.channel === 'PUSH' && x.subject === 'T')!;
    expect(row.status).toBe('PENDING');
    expect(row.attempts).toBe(1);
    expect(row.last_error).toBe('Push-Dienst 500');
  });

  it('gesperrter Spielerlink beendet das Abo', async () => {
    const { id, s } = newCampaign();
    const { pc } = ids(s);
    subscribePlayer(id, pc);
    m.players.revokePlayerToken(id, pc);
    attack(id, s);
    expect(outbox(id).filter((x) => x.channel === 'PUSH')).toHaveLength(0);
  });

  it('Spielleiter-Konto erhält „Handlungsbedarf“ (Widerspruch) per Push', () => {
    const { id, s } = newCampaign();
    const { pa, pc } = ids(s);
    m.db.db().prepare("INSERT INTO admin(username, password_hash, created_at, role, locale) VALUES('sl', 'x', '2026-01-01', 'ADMIN', 'de')").run();
    const adminId = (m.db.db().prepare("SELECT id FROM admin WHERE username = 'sl'").get() as { id: number }).id;
    m.push.savePushSub({ kind: 'ADMIN', adminId }, m.push.parseSubscription(browserSub().sub)!);
    const b = attack(id, s);
    run(id, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: pa, update: { vp: { attacker: 50, defender: 20 } } });
    run(id, { type: 'RESULT_DRAFT_DISPUTE', battleId: b.id, playerId: pc, reason: 'falsch' });
    const gm = outbox(id).filter((x) => x.channel === 'PUSH' && x.subject.includes('Einspruch'));
    expect(gm).toHaveLength(1);
    expect(JSON.parse(gm[0].body).url).toBe(`/admin/c/${id}`);
  });
});

describe('NTH2 1.5 Bestätigen per Einmal-Link', () => {
  const setup = () => {
    m.notify.setSmtpConfig({ host: 'smtp.invalid', port: 25, secure: false, user: '', pass: '', from: 'sl@example.org' });
    const { id, s } = newCampaign(true);
    const { pa, pc } = ids(s);
    // F13: Einmal-Links gibt es nur für Spieler mit gültigem Spielerlink (die Signatur ist daran gebunden)
    m.players.playerTokenFor(id, pa, true);
    m.players.playerTokenFor(id, pc, true);
    const b = attack(id, s);
    run(id, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: pa, update: { vp: { attacker: 50, defender: 20 } } });
    m.notify.setSmtpConfig(null);
    const mail = outbox(id).find((x) => x.subject.includes('Ergebnis bestätigen'))!;
    const link = mail.body.match(/https:\/\/kampagne\.example(\/bestaetigen\/\S+)/)![1];
    return { id, b, pa, pc, link, parts: m.confirm.parseConfirmLink(link.split('/').slice(2))! };
  };

  it('Nachricht enthält den signierten Link; Bestätigen übernimmt das Ergebnis, danach ist der Link verbraucht', () => {
    const { id, b, pc, parts } = setup();
    expect(parts.pid).toBe(pc);
    const c = m.confirm.checkConfirmLink(parts);
    expect(c.ok).toBe(true);
    const r = m.confirm.redeemConfirmLink(parts, 'CONFIRM', '');
    expect(r.ok).toBe(true);
    const after = m.campaigns.currentState(id).state.battles.find((x) => x.id === b.id)!;
    expect(after.draft).toBeNull();
    expect(after.vp).toEqual({ attacker: 50, defender: 20 });
    expect(m.confirm.checkConfirmLink(parts)).toMatchObject({ ok: false, error: 'USED' });
    expect(m.confirm.redeemConfirmLink(parts, 'CONFIRM', '')).toMatchObject({ ok: false, error: expect.stringMatching(/bereits benutzt/) });
  });

  it('Widersprechen braucht einen Grund; geänderter Entwurf macht den Link ungültig', () => {
    const { id, b, pa, parts } = setup();
    expect(m.confirm.redeemConfirmLink(parts, 'DISPUTE', '  ')).toMatchObject({ ok: false });
    run(id, { type: 'RESULT_DRAFT_DISCARD', battleId: b.id });
    run(id, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: pa, update: { vp: { attacker: 60, defender: 20 } } });
    expect(m.confirm.checkConfirmLink(parts)).toMatchObject({ ok: false, error: 'CHANGED' });
  });

  it('abgelaufen, manipuliert oder für die meldende Seite → abgelehnt', () => {
    const { b, pa, parts, id } = setup();
    expect(m.confirm.checkConfirmLink(parts, Date.now() + m.confirm.CONFIRM_LINK_TTL_MS + 60_000)).toMatchObject({ ok: false, error: 'EXPIRED' });
    expect(m.confirm.checkConfirmLink({ ...parts, sig: parts.sig.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) })).toMatchObject({ ok: false });
    const draftAt = m.campaigns.currentState(id).state.battles.find((x) => x.id === b.id)!.draft!.at;
    const own = m.confirm.parseConfirmLink(m.confirm.confirmLinkPath(id, b.id, pa, draftAt).split('/').slice(2))!;
    expect(m.confirm.checkConfirmLink(own)).toMatchObject({ ok: false, error: 'INVALID' });
    expect(m.confirm.parseConfirmLink(['a', 'b'])).toBeNull();
  });

  it('F7: ohne gültige Signatur einheitlich „ungültig“ – auch wenn es eine Meldung gibt; Signatur vor dem Laden', () => {
    const { parts } = setup();
    const forged = { ...parts, sig: parts.sig.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) };
    expect(m.confirm.checkConfirmLink(forged)).toEqual({ ok: false, error: 'INVALID' });
    expect(m.confirm.verifyConfirmLink([forged.cid, forged.bid, forged.pid, forged.stamp, forged.exp, forged.sig])).toBeNull();
    // unbekannte Kampagne: dieselbe Antwort, ohne Zustand
    expect(m.confirm.checkConfirmLink({ ...parts, cid: 'gibtsnicht' })).toEqual({ ok: false, error: 'INVALID' });
  });

  it('F13: Sperren oder Erneuern des Spielerlinks macht den Einmal-Link ungültig', () => {
    const { id, pc, parts } = setup();
    expect(m.confirm.checkConfirmLink(parts).ok).toBe(true);
    m.players.regeneratePlayerToken(id, pc);
    expect(m.confirm.checkConfirmLink(parts)).toEqual({ ok: false, error: 'INVALID' });
    expect(m.confirm.redeemConfirmLink(parts, 'CONFIRM', '')).toMatchObject({ ok: false });
  });
});

describe('NTH2 1.2 Discord-Bot', () => {
  const keys = crypto.generateKeyPairSync('ed25519');
  const pubHex = (keys.publicKey.export({ format: 'der', type: 'spki' }) as Buffer).subarray(12).toString('hex');
  const send = (body: object, opts: { ts?: number; badSig?: boolean } = {}) => {
    const raw = JSON.stringify(body);
    const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
    let sig = crypto.sign(null, Buffer.from(ts + raw), keys.privateKey).toString('hex');
    if (opts.badSig) sig = sig.replace(/^./, (c) => (c === '0' ? '1' : '0'));
    return m.discord.handleInteraction(raw, sig, ts);
  };
  const user = (id: string) => ({ member: { user: { id, username: `u${id}` } }, locale: 'de' });
  const cmd = (uid: string, name: string, options?: object[]) => send({ type: 2, ...user(uid), data: { name, options } });
  const content = (r: { body: unknown }) => (r.body as { data: { content: string } }).data.content;
  const buttons = (r: { body: unknown }) => ((r.body as { data: { components?: { components: { custom_id?: string; url?: string }[] }[] } }).data.components ?? []).flatMap((x) => x.components);

  beforeAll(() => {
    expect(m.discord.setDiscordBotConfig({ appId: '123456789012345678', publicKey: pubHex, token: 'A'.repeat(24) + '.' + 'B'.repeat(6) + '.' + 'C'.repeat(27) })).toBeNull();
  });

  it('Ed25519-Prüfung, PING/PONG, alte oder falsch signierte Anfragen', () => {
    expect(send({ type: 1 })).toEqual({ status: 200, body: { type: 1 } });
    expect(send({ type: 1 }, { badSig: true }).status).toBe(401);
    expect(send({ type: 1 }, { ts: Math.floor(Date.now() / 1000) - 3600 }).status).toBe(401);
    expect(m.discord.verifyDiscordSignature(pubHex, null, '1', '{}')).toBe(false);
  });

  it('ungültige Konfiguration wird abgelehnt', () => {
    expect(m.discord.setDiscordBotConfig({ appId: 'abc', publicKey: pubHex, token: '' })).toMatch(/Application ID/);
    expect(m.discord.setDiscordBotConfig({ appId: '123456789012345678', publicKey: 'xyz', token: '' })).toMatch(/Public Key/);
    // Token bleibt beim Speichern ohne Token erhalten
    expect(m.discord.setDiscordBotConfig({ appId: '123456789012345678', publicKey: pubHex, token: '' })).toBeNull();
    expect(m.discord.discordBotStatus()?.hasToken).toBe(true);
  });

  it('Verknüpfen per Einmal-Code, /lage, /aufgaben, /termin annehmen, /bestätigen, /trennen', () => {
    const { id, s } = newCampaign();
    const { pa, pc } = ids(s);
    m.players.regeneratePlayerToken(id, pa);
    m.players.regeneratePlayerToken(id, pc);
    expect(content(cmd('900', 'lage'))).toMatch(/noch mit keinem Spieler verknüpft/);
    const code = m.discord.createDiscordCode(id, pc)!;
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(content(cmd('900', 'verknüpfen', [{ name: 'code', type: 3, value: code.toLowerCase() }]))).toMatch(/Verknüpft mit P3/);
    // Code ist verbraucht
    expect(content(cmd('901', 'verknüpfen', [{ name: 'code', type: 3, value: code }]))).toMatch(/ungültig oder abgelaufen/);
    expect(m.discord.discordLinksOf(id, pc)).toEqual([{ user: '900', username: 'u900' }]);

    expect(content(cmd('900', 'lage'))).toMatch(/Testkampagne/);
    const b = attack(id, s);
    run(id, { type: 'TIME_PROPOSE', battleId: b.id, playerId: pa, times: ['2026-10-10T17:00:00.000Z', '2026-10-11T17:00:00.000Z'] });
    expect(content(cmd('900', 'aufgaben'))).toMatch(/Terminvorschlag annehmen/);
    const t = cmd('900', 'termin', [{ name: 'annehmen', type: 1 }]);
    const tb = buttons(t);
    // der Knopf trägt den Termin selbst (Epoche Basis 36), nicht die Position in der Liste
    expect(tb.map((x) => x.custom_id)).toEqual([`ta:${b.id}:${m.discord.timeKey('2026-10-10T17:00:00.000Z')}`, `ta:${b.id}:${m.discord.timeKey('2026-10-11T17:00:00.000Z')}`]);
    const clicked = send({ type: 3, ...user('900'), data: { custom_id: tb[1].custom_id } });
    expect((clicked.body as { type: number }).type).toBe(7);
    expect(m.campaigns.currentState(id).state.battles.find((x) => x.id === b.id)!.scheduledAt).toBe('2026-10-11T17:00:00.000Z');

    run(id, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: pa, update: { vp: { attacker: 40, defender: 45 } } });
    const c = cmd('900', 'bestätigen');
    expect(content(c)).toMatch(/40:45 VP/);
    const cb = buttons(c);
    expect(cb[1].url).toMatch(/^https:\/\/kampagne\.example\/bestaetigen\//);
    // ein anderer Discord-Nutzer (nicht verknüpft) kann den Knopf nicht benutzen
    expect(content(send({ type: 3, ...user('999'), data: { custom_id: cb[0].custom_id } }))).toMatch(/noch mit keinem Spieler/);
    send({ type: 3, ...user('900'), data: { custom_id: cb[0].custom_id } });
    expect(m.campaigns.currentState(id).state.battles.find((x) => x.id === b.id)!.vp).toEqual({ attacker: 40, defender: 45 });
    // ein veralteter Knopf wirkt nicht mehr
    expect(content(send({ type: 3, ...user('900'), data: { custom_id: cb[0].custom_id } }))).toMatch(/geändert oder schon entschieden/);

    expect(content(cmd('900', 'trennen'))).toMatch(/gelöst/);
    expect(content(cmd('900', 'aufgaben'))).toMatch(/noch mit keinem Spieler/);
  });

  it('Sperren des Spielerlinks löst die Verknüpfung; Rechte wie beim Spielerlink', () => {
    const { id, s } = newCampaign();
    const { pa } = ids(s);
    m.players.regeneratePlayerToken(id, pa);
    cmd('950', 'verknüpfen', [{ name: 'code', type: 3, value: m.discord.createDiscordCode(id, pa)! }]);
    expect(content(cmd('950', 'aufgaben'))).toMatch(/Befehl für/);
    m.players.regeneratePlayerToken(id, pa);
    expect(content(cmd('950', 'aufgaben'))).toMatch(/noch mit keinem Spieler/);
  });

  it('Befehle mit einem Knopf anmelden (PUT an die Discord-API mit Bot-Token)', async () => {
    const f = vi.fn(async () => new Response('[]', { status: 200 }));
    expect(await m.discord.registerDiscordCommands(f as unknown as typeof fetch)).toBeNull();
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://discord.com/api/v10/applications/123456789012345678/commands');
    expect(init.method).toBe('PUT');
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bot /);
    const names = (JSON.parse(String(init.body)) as { name: string }[]).map((c) => c.name);
    expect(names).toEqual(['lage', 'aufgaben', 'termin', 'bestätigen', 'verknüpfen', 'trennen']);
    expect(await m.discord.registerDiscordCommands((async () => new Response('', { status: 401 })) as unknown as typeof fetch)).toBe('Discord 401');
  });
});

describe('NTH2 2.5 Club-Kalender', () => {
  it('Tische, Kollisionsprüfung je Tisch über Kampagnen hinweg, Kalender und Abo-Schlüssel', () => {
    const tables = m.club.setClubTables([{ name: 'Tisch 1' }, { name: 'Tisch 2' }, { name: ' tisch 1 ' }, { name: '' }]);
    expect(tables.map((x) => x.name)).toEqual(['Tisch 1', 'Tisch 2']);
    const [t1, t2] = tables;
    const A = newCampaign();
    const B = newCampaign();
    const ba = attack(A.id, A.s);
    const bb = attack(B.id, B.s);
    const { pa } = ids(A.s);
    run(A.id, { type: 'TIME_PROPOSE', battleId: ba.id, playerId: null, times: ['2026-11-01T17:00:00.000Z'] });
    run(A.id, { type: 'TIME_ACCEPT', battleId: ba.id, playerId: null, time: '2026-11-01T17:00:00.000Z' });
    run(B.id, { type: 'TIME_PROPOSE', battleId: bb.id, playerId: null, times: ['2026-11-01T18:30:00.000Z'] });
    run(B.id, { type: 'TIME_ACCEPT', battleId: bb.id, playerId: null, time: '2026-11-01T18:30:00.000Z' });

    // Spieler wählt über seinen Link; Name kommt aus der Club-Einstellung
    const token = m.players.regeneratePlayerToken(A.id, pa);
    const r = m.players.runPlayerCommand(token, { type: 'BATTLE_TABLE_SET', battleId: ba.id, playerId: pa, table: { id: t1.id, name: 'egal' } });
    expect(r.ok).toBe(true);
    expect(m.campaigns.currentState(A.id).state.battles.find((x) => x.id === ba.id)!.table).toEqual(t1);

    // gleicher Tisch 1,5 h später in einer anderen Kampagne → belegt
    const clash = m.campaigns.runCommand(B.id, -1, { type: 'BATTLE_TABLE_SET', battleId: bb.id, playerId: null, table: t1 }, {});
    // fremde Kampagnen bleiben verborgen: nur „belegt“ mit Uhrzeit
    expect(clash).toMatchObject({ ok: false, error: expect.stringMatching(/^Tisch 1 ist zu dieser Zeit belegt: [^·]*\d{2}:\d{2}$/) });
    expect((clash as { error: string }).error).not.toMatch(/Testkampagne|Purge/);
    expect(m.campaigns.runCommand(B.id, -1, { type: 'BATTLE_TABLE_SET', battleId: bb.id, playerId: null, table: { id: 'gibts-nicht', name: 'X' } }, {})).toMatchObject({
      ok: false,
      error: 'Unbekannter Spieltisch',
    });
    run(B.id, { type: 'BATTLE_TABLE_SET', battleId: bb.id, playerId: null, table: t2 });

    const t = (x: string) => x;
    const opts = m.club.tableOptions(B.id, m.campaigns.currentState(B.id).state, bb.id, t);
    expect(opts.find((o) => o.id === t1.id)!.busy).toHaveLength(1);
    expect(opts.find((o) => o.id === t2.id)!.busy).toHaveLength(0);

    const entries = m.club.calendarEntries(t).filter((e) => [A.id, B.id].includes(e.campaignId));
    expect(entries.map((e) => e.tableName)).toEqual(['Tisch 1', 'Tisch 2']);
    expect(entries.every((e) => e.clashes.length === 0)).toBe(true);
    // nur freigegebene Kampagnen
    expect(m.club.calendarEntries(t, [B.id]).every((e) => e.campaignId === B.id)).toBe(true);

    // Terminänderung erzeugt nachträglich eine Überschneidung → im Kalender markiert
    run(B.id, { type: 'BATTLE_TABLE_SET', battleId: bb.id, playerId: null, table: null });
    m.club.setClubTables([t1, t2]);
    m.db
      .db()
      .prepare('UPDATE revision SET state = json_set(state, ?, json(?)) WHERE campaign_id = ? AND number = (SELECT current_rev FROM campaign WHERE id = ?)')
      .run(`$.battles[${m.campaigns.currentState(B.id).state.battles.findIndex((x) => x.id === bb.id)}].table`, JSON.stringify(t1), B.id, B.id);
    const marked = m.club.calendarEntries(t).filter((e) => [A.id, B.id].includes(e.campaignId));
    expect(marked.every((e) => e.clashes.length === 1)).toBe(true);

    const key = m.club.clubCalendarKey();
    expect(m.club.checkClubCalendarKey(key)).toBe(true);
    m.club.regenerateClubCalendarKey();
    expect(m.club.checkClubCalendarKey(key)).toBe(false);
  });
});
