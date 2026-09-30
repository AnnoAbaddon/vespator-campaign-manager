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

/** Randfälle der Benachrichtigungen: Dedupe je Kampagne, Undo, Backoff, Reveal, Deadlines */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-notify-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.BACKUP_DIR = path.join(tmp, 'backups');
process.env.APP_URL = 'https://kampagne.example';

type Mods = {
  campaigns: typeof import('@/server/campaigns');
  backup: typeof import('@/server/backup');
  notify: typeof import('@/server/notify');
  db: typeof import('@/server/db');
};
let m: Mods;

beforeAll(async () => {
  m = {
    campaigns: await import('@/server/campaigns'),
    backup: await import('@/server/backup'),
    notify: await import('@/server/notify'),
    db: await import('@/server/db'),
  };
  smtp(true);
});
/** E-Mails werden nur mit eingerichtetem SMTP eingereiht; vor dem Versand wieder aus (kein echter Mailserver) */
const smtp = (on: boolean) => m.notify.setSmtpConfig(on ? { host: 'smtp.invalid', port: 25, secure: false, user: '', pass: '', from: 'sl@example.org' } : null);
afterAll(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
});

function newCampaign(): { id: string; s: CampaignState } {
  const s = startedCampaign();
  s.players.forEach((p, i) => (p.email = `p${i + 1}@example.org`));
  const id = m.backup.importBackup(new TextEncoder().encode(JSON.stringify({ state: s })), 'Testkampagne');
  return { id, s: m.campaigns.currentState(id).state };
}
const outbox = (id: string) =>
  m.db.db().prepare('SELECT id, channel, recipient, subject, body, dedupe_key, status, attempts, next_attempt_at FROM outbox WHERE campaign_id = ? ORDER BY id').all(id) as {
    id: number;
    channel: string;
    recipient: string;
    subject: string;
    body: string;
    dedupe_key: string;
    status: string;
    attempts: number;
    next_attempt_at: string | null;
  }[];
const run = (id: string, cmd: Parameters<typeof m.campaigns.runCommand>[2]) => {
  const r = m.campaigns.runCommand(id, -1, cmd, { force: true, reason: 'test' });
  expect(r.ok).toBe(true);
};
const attack = (id: string, s: CampaignState) => {
  const { fa, c } = ids(s);
  run(id, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
  run(id, { type: 'ADVANCE' });
  run(id, { type: 'REVEAL_OPS' });
};

describe('Benachrichtigungen – Randfälle', () => {
  it('gleiche Ereignisse in zwei Kampagnen blockieren sich nicht (Dedupe je Kampagne)', () => {
    const a = newCampaign();
    const b = newCampaign();
    attack(a.id, a.s);
    attack(b.id, b.s);
    const na = outbox(a.id).filter((x) => x.subject.includes('Du wirst angegriffen'));
    const nb = outbox(b.id).filter((x) => x.subject.includes('Du wirst angegriffen'));
    expect(na).toHaveLength(1);
    expect(nb).toHaveLength(1);
    expect(na[0].dedupe_key.startsWith(`${a.id}:`)).toBe(true);
  });

  it('Undo verwirft noch nicht versendete Nachrichten der zurückgenommenen Revision', () => {
    const { id, s } = newCampaign();
    attack(id, s);
    expect(outbox(id).some((x) => x.subject.includes('Du wirst angegriffen'))).toBe(true);
    const u = m.campaigns.undo(id, m.campaigns.getCampaign(id)!.current_rev, true);
    expect(u.ok).toBe(true);
    expect(outbox(id).some((x) => x.subject.includes('Du wirst angegriffen'))).toBe(false);
  });

  it('Reveal ohne Schlachten meldet sich auf Discord, Entbündeln o. Ä. löst keinen zweiten Reveal aus', () => {
    const { id } = newCampaign();
    m.notify.setDiscordWebhook(id, 'https://discord.com/api/webhooks/1/x');
    run(id, { type: 'ADVANCE' });
    run(id, { type: 'REVEAL_OPS' });
    expect(outbox(id).filter((x) => x.channel === 'DISCORD' && x.body.includes('keiner Schlacht'))).toHaveLength(1);
    // Neue Schlacht nach dem Aufdecken (z. B. durch Entbündeln) → keine erneute Reveal-Nachricht
    const st = m.campaigns.currentState(id).state;
    const other = newCampaign();
    attack(other.id, other.s);
    const fake = structuredClone(st);
    fake.battles.push({ ...structuredClone(m.campaigns.currentState(other.id).state.battles.find((x) => x.kind === 'CAMPAIGN')!), id: 'bt-neu' });
    const n = outbox(id).length;
    m.notify.notifyChange(id, 999, st, fake);
    expect(outbox(id).length).toBe(n);
  });

  it('Schlacht-Deadline: keine Erinnerung für Schlachten mit gemeldetem Ergebnis', () => {
    const { id, s } = newCampaign();
    attack(id, s);
    const st = m.campaigns.currentState(id).state;
    const b = st.battles.find((x) => x.kind === 'CAMPAIGN')!;
    const { pa } = ids(s);
    run(id, { type: 'PHASE_UPDATE', phase: 1, battlesDeadline: new Date(Date.now() + 10 * 3600_000).toISOString() });
    run(id, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: pa, update: { vp: { attacker: 50, defender: 20 } } });
    m.notify.scanDeadlines();
    expect(outbox(id).filter((x) => x.subject.includes('Schlacht noch offen'))).toHaveLength(0);
  });

  it('Versandfehler: exponentieller Abstand, Discord-429 zählt nicht als Fehlversuch', async () => {
    smtp(false);
    const { id } = newCampaign();
    m.notify.setDiscordWebhook(id, 'https://discord.com/api/webhooks/1/x');
    m.notify.sendTest(id, null);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ retry_after: 2 }), { status: 429 })),
    );
    await m.notify.flushOutbox();
    let row = outbox(id).find((x) => x.channel === 'DISCORD')!;
    expect(row.status).toBe('PENDING');
    expect(row.attempts).toBe(0);
    expect(row.next_attempt_at).not.toBeNull();
    // noch nicht fällig → kein erneuter Versuch
    const f = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', f);
    await m.notify.flushOutbox();
    expect(f).not.toHaveBeenCalled();
    m.db.db().prepare('UPDATE outbox SET next_attempt_at = NULL WHERE id = ?').run(row.id);
    await m.notify.flushOutbox();
    vi.unstubAllGlobals();
    row = outbox(id).find((x) => x.channel === 'DISCORD')!;
    expect(row.attempts).toBe(1);
    expect(new Date(row.next_attempt_at!).getTime()).toBeGreaterThan(Date.now() + 30_000);
  });

  it('hängengebliebene Sendungen werden nach einem Neustart freigegeben', () => {
    smtp(true);
    const { id } = newCampaign();
    m.notify.sendTest(id, 'sl@example.org');
    const row = outbox(id)[0];
    m.db.db().prepare("UPDATE outbox SET status = 'SENDING' WHERE id = ?").run(row.id);
    m.notify.releaseStaleSending();
    expect(outbox(id)[0].status).toBe('PENDING');
  });

  it('ohne SMTP landen keine E-Mails in der Warteschlange; alte werden beim Versand übersprungen (nicht wiederholt)', async () => {
    smtp(true);
    const { id, s } = newCampaign();
    m.notify.sendTest(id, 'sl@example.org');
    smtp(false);
    attack(id, s);
    expect(outbox(id).filter((x) => x.channel === 'EMAIL' && x.subject.includes('Du wirst angegriffen'))).toHaveLength(0);
    expect(() => m.notify.sendTest(id, 'sl@example.org')).toThrow(/SMTP/);
    await m.notify.flushOutbox();
    const old = outbox(id).find((x) => x.channel === 'EMAIL')!;
    expect(old.status).toBe('SKIPPED');
    // Discord ohne Webhook: nichts eingereiht
    expect(outbox(id).filter((x) => x.channel === 'DISCORD')).toHaveLength(0);
  });
});
