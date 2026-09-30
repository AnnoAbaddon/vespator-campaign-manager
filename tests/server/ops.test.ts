import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ids, startedCampaign } from '../engine/helpers';
import type { CampaignState } from '@/engine/types';

// Erwartet deutsche Texte ohne Kampagnen- und Standardsprache: deutscher Build (NEXT_PUBLIC_DEFAULT_LOCALE=de), vor allen Importen gesetzt
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_DEFAULT_LOCALE = 'de';
});

/**
 * Integrationstests der Serverschicht mit echter (temporärer) Datenbank:
 * Spielerlinks, Benachrichtigungen (Outbox, Trigger, Deadlines, Versand) und Backups.
 */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-ops-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.BACKUP_DIR = path.join(tmp, 'backups');
process.env.APP_URL = 'https://kampagne.example';

type Mods = {
  campaigns: typeof import('@/server/campaigns');
  backup: typeof import('@/server/backup');
  players: typeof import('@/server/players');
  notify: typeof import('@/server/notify');
  auto: typeof import('@/server/autoBackup');
  db: typeof import('@/server/db');
};
let m: Mods;

beforeAll(async () => {
  m = {
    campaigns: await import('@/server/campaigns'),
    backup: await import('@/server/backup'),
    players: await import('@/server/players'),
    notify: await import('@/server/notify'),
    auto: await import('@/server/autoBackup'),
    db: await import('@/server/db'),
  };
  smtp(true);
});
/** E-Mails werden nur mit eingerichtetem SMTP eingereiht; vor dem Versand wieder aus (kein echter Mailserver) */
const smtp = (on: boolean) => m.notify.setSmtpConfig(on ? { host: 'smtp.invalid', port: 25, secure: false, user: '', pass: '', from: 'sl@example.org' } : null);
afterAll(() => {
  // Die Datenbank ist noch geöffnet (Windows sperrt die Datei) – Aufräumen ist nur Kür
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
});

function newCampaign(prep?: (s: CampaignState) => void): { id: string; s: CampaignState } {
  const s = startedCampaign();
  s.players.forEach((p, i) => (p.email = `p${i + 1}@example.org`));
  prep?.(s);
  const id = m.backup.importBackup(new TextEncoder().encode(JSON.stringify({ state: s })), 'Testkampagne');
  return { id, s: m.campaigns.currentState(id).state };
}

const outbox = (id: string) =>
  m.db.db().prepare('SELECT channel, recipient, subject, body, dedupe_key, status FROM outbox WHERE campaign_id = ? ORDER BY id').all(id) as {
    channel: string;
    recipient: string;
    subject: string;
    body: string;
    dedupe_key: string;
    status: string;
  }[];

describe('Spielerlinks (N1.1)', () => {
  it('erzeugen, auflösen, erneuern und sperren', () => {
    const { id, s } = newCampaign();
    const { pa } = ids(s);
    const t1 = m.players.playerTokenFor(id, pa, true)!;
    expect(m.players.resolvePlayerToken(t1)?.player.id).toBe(pa);
    const t2 = m.players.regeneratePlayerToken(id, pa);
    expect(m.players.resolvePlayerToken(t1)).toBeNull();
    expect(m.players.resolvePlayerToken(t2)?.playerId).toBe(pa);
    m.players.revokePlayerToken(id, pa);
    expect(m.players.resolvePlayerToken(t2)).toBeNull();
    expect(m.players.resolvePlayerToken('zu-kurz')).toBeNull();
  });

  it('Spieler-Commands: Berechtigung, keine Warnungen übergehen, Autor im Log', () => {
    const { id, s } = newCampaign();
    const { pa, fa, fb } = ids(s);
    const t = m.players.playerTokenFor(id, pa, true)!;
    // Kommandant wird beim Start automatisch zugeteilt – zum Test entziehen
    m.campaigns.runCommand(id, -1, { type: 'FLEET_COMMANDER', fleetId: fa, phase: 1, playerId: null }, {});
    expect(m.players.runPlayerCommand(t, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'LOGISTICAL_AUXILIA' } }).ok).toBe(false);
    const cmd = m.campaigns.runCommand(id, -1, { type: 'FLEET_COMMANDER', fleetId: fa, phase: 1, playerId: pa }, { author: 'SL: test' });
    expect(cmd.ok).toBe(true);
    const r = m.players.runPlayerCommand(t, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'LOGISTICAL_AUXILIA' } });
    expect(r.ok).toBe(true);
    // Fremde Flotte
    expect(m.players.runPlayerCommand(t, { type: 'OP_SET', fleetId: fb, slot: 1, op: { type: 'LOGISTICAL_AUXILIA' } }).ok).toBe(false);
    // Warnung (Raise Edifices wird scheitern) → für Spieler ein Fehler
    for (const slot of [1, 2])
      m.campaigns.runCommand(
        id,
        -1,
        { type: 'OVERRIDE_SLOT', planetId: 'kryndaer', slot: slot - 1, destroyed: false, infra: { type: 'FORTIFICATION_LINE', allianceId: s.alliances[1].id } },
        { force: true, reason: 'test' },
      );
    // R3 / F-7: Raise Edifices auf vollem Planeten ist erlaubt – nur ein Hinweis, auch für Spieler
    const w = m.players.runPlayerCommand(t, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'RAISE_EDIFICES', infraType: 'FORTIFICATION_LINE' } });
    expect(w.ok).toBe(true);
    expect(w.ok && w.hints.join(' ')).toMatch(/annulliert/);
    // echte Warnung (An Open Tome: andere Allianz muss zuerst offenlegen) → für Spieler ein Fehler
    m.campaigns.runCommand(id, -1, { type: 'OVERRIDE_MODIFIER_ADD', kind: 'OPEN_TOME', phaseNumber: 1, allianceId: s.alliances[1].id }, { reason: 'test' });
    const w2 = m.players.runPlayerCommand(t, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'LOGISTICAL_AUXILIA' } });
    expect(w2.ok).toBe(false);
    expect(!w2.ok && w2.kind === 'error' && w2.error).toMatch(/Spielleiter/);
    const authors = m.campaigns.listRevisions(id).map((x) => x.author);
    expect(authors).toContain('Spieler: P1');
    expect(authors).toContain('SL: test');
  });

  it('Rate-Limit: höchstens 30 Aktionen pro Minute', () => {
    const { id, s } = newCampaign();
    const { pa, a } = ids(s);
    const t = m.players.playerTokenFor(id, pa, true)!;
    let last;
    for (let i = 0; i < 31; i++) last = m.players.runPlayerCommand(t, { type: 'NOTE_ADD', allianceId: a, playerId: pa, text: `Notiz ${i}` });
    expect(last!.ok).toBe(false);
  });
});

describe('Benachrichtigungen (N1.4)', () => {
  it('Reveal: Discord an alle, persönliche Mail an Angegriffene, keine Dubletten', () => {
    const { id, s } = newCampaign();
    const { fa, c } = ids(s);
    m.notify.setDiscordWebhook(id, 'https://discord.com/api/webhooks/123/abc-DEF');
    const run = (cmd: Parameters<typeof m.campaigns.runCommand>[2]) => {
      const r = m.campaigns.runCommand(id, -1, cmd, { force: true, reason: 'test' });
      expect(r.ok).toBe(true);
    };
    run({ type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
    run({ type: 'ADVANCE' });
    run({ type: 'REVEAL_OPS' });
    const o = outbox(id);
    expect(o.some((x) => x.channel === 'DISCORD' && x.body.includes('Operationen aufgedeckt') && x.body.includes('Purge and Burn'))).toBe(true);
    expect(o.some((x) => x.channel === 'DISCORD' && x.body.includes('/p/'))).toBe(false);
    const attacked = o.filter((x) => x.subject.includes('Du wirst angegriffen'));
    expect(attacked.map((x) => x.recipient)).toEqual(['p3@example.org']);
    expect(attacked[0].body).toContain('/abmelden/');
    // gleiche Änderung erneut auswerten → keine neuen Einträge
    const n = outbox(id).length;
    const st = m.campaigns.currentState(id).state;
    m.notify.notifyChange(id, 999, { ...st, battles: [] }, st);
    expect(outbox(id).length).toBe(n);
  });

  it('Opt-out: abbestellte Kategorie wird nicht verschickt', () => {
    const { id, s } = newCampaign((st) => {
      st.players[2].notify = { PERSONAL: false };
    });
    const { fa, c } = ids(s);
    for (const cmd of [
      { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } },
      { type: 'ADVANCE' },
      { type: 'REVEAL_OPS' },
    ] as const)
      m.campaigns.runCommand(id, -1, cmd as never, { force: true, reason: 'x' });
    expect(outbox(id).filter((x) => x.subject.includes('Du wirst angegriffen'))).toHaveLength(0);
    const sig = m.notify.unsubscribeSig(id, s.players[0].id);
    expect(m.notify.checkUnsubscribe(id, s.players[0].id, sig)).toBe(true);
    expect(m.notify.checkUnsubscribe(id, s.players[0].id, sig.replace(/.$/, sig.endsWith('A') ? 'B' : 'A'))).toBe(false);
  });

  it('Deadline-Erinnerung 12 h vorher nur an Kommandanten ohne Befehl, einmalig', () => {
    const { id, s } = newCampaign();
    const { fa, fb, pa, pb } = ids(s);
    m.campaigns.runCommand(id, -1, { type: 'FLEET_COMMANDER', fleetId: fa, phase: 1, playerId: pa }, {});
    m.campaigns.runCommand(id, -1, { type: 'FLEET_COMMANDER', fleetId: fb, phase: 1, playerId: pb }, {});
    m.campaigns.runCommand(id, -1, { type: 'OP_SET', fleetId: fb, slot: 1, op: { type: 'LOGISTICAL_AUXILIA' } }, {});
    const deadline = new Date(Date.now() + 10 * 3600_000).toISOString();
    m.campaigns.runCommand(id, -1, { type: 'PHASE_UPDATE', phase: 1, opsDeadline: deadline }, {});
    m.notify.scanDeadlines();
    m.notify.scanDeadlines();
    const reminders = outbox(id).filter((x) => x.subject.includes('Befehl fehlt'));
    // P2 hat befohlen; P1 und P3 (automatisch Kommandant von Flotte C) noch nicht
    expect(reminders.map((x) => x.recipient).sort()).toEqual(['p1@example.org', 'p3@example.org']);
    expect(reminders[0].dedupe_key).toContain(':12h');
  });

  it('Versand: Discord per Webhook, E-Mail ohne SMTP wird übersprungen (nicht endlos wiederholt)', async () => {
    const { id } = newCampaign();
    m.notify.setDiscordWebhook(id, 'https://discord.com/api/webhooks/1/x');
    m.notify.sendTest(id, null);
    m.notify.sendTest(id, 'sl@example.org');
    smtp(false);
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await m.notify.flushOutbox();
    vi.unstubAllGlobals();
    const st = m.notify.outboxStatus(id);
    expect(st.find((x) => x.channel === 'DISCORD')?.status).toBe('SENT');
    const mail = st.find((x) => x.channel === 'EMAIL')!;
    expect(mail.status).toBe('SKIPPED');
    expect(mail.last_error).toMatch(/SMTP/);
    smtp(true);
    expect(fetchMock).toHaveBeenCalled();
    expect(() => m.notify.setDiscordWebhook(id, 'https://evil.example/x')).toThrow();
  });
});

describe('Automatische Backups (N5.1)', () => {
  it('sichert, rotiert auf 14 und stellt als neue Kampagne wieder her', () => {
    const { id } = newCampaign();
    for (let i = 0; i < 16; i++) m.auto.backupCampaign(id);
    const list = m.auto.listBackups(id);
    expect(list).toHaveLength(14);
    const restored = m.auto.restoreBackup(id, list[0].file);
    expect(restored).not.toBe(id);
    const a = m.campaigns.currentState(id).state;
    const b = m.campaigns.currentState(restored).state;
    expect(b.planets).toEqual(a.planets);
    expect(m.campaigns.getCampaign(restored)?.name).toMatch(/Wiederherstellung/);
    expect(() => m.auto.restoreBackup(id, '../../etc/passwd')).toThrow();
  });

  it('täglicher Lauf nur einmal pro Tag und erst ab 03:00', () => {
    const { id } = newCampaign();
    const before = m.auto.listBackups(id).length;
    m.auto.runDailyBackups(new Date('2030-01-01T02:00:00'));
    expect(m.auto.listBackups(id).length).toBe(before);
    m.auto.runDailyBackups(new Date('2030-01-01T04:00:00'));
    m.auto.runDailyBackups(new Date('2030-01-01T05:00:00'));
    expect(m.auto.listBackups(id).length).toBe(before + 1);
  });
});
