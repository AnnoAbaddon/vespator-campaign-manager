import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Command } from '@/engine/commands';

/**
 * Block P3, Serverschicht: Datenschutz-Werkzeuge (NTH2 6.4), Health (NTH2 6.2), Liga-Speicher (NTH2 3.1) und
 * importierte Übersetzungen (NTH2 7.2).
 */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-p3-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.BACKUP_DIR = path.join(tmp, 'backups');

type Mods = {
  campaigns: typeof import('@/server/campaigns');
  db: typeof import('@/server/db');
  privacy: typeof import('@/server/privacy');
  health: typeof import('@/server/health');
  league: typeof import('@/server/league');
  store: typeof import('@/server/i18nStore');
  core: typeof import('@/i18n/core');
  audit: typeof import('@/server/audit');
};
let m: Mods;

beforeAll(async () => {
  m = {
    campaigns: await import('@/server/campaigns'),
    db: await import('@/server/db'),
    privacy: await import('@/server/privacy'),
    health: await import('@/server/health'),
    league: await import('@/server/league'),
    store: await import('@/server/i18nStore'),
    core: await import('@/i18n/core'),
    audit: await import('@/server/audit'),
  };
});
afterAll(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
});

function campaignWithPlayer() {
  const id = m.campaigns.createCampaign({ name: 'Datenschutz', intro: '', phaseCount: 2, allianceCount: 2 });
  const run = (cmd: Command) => {
    const r = m.campaigns.runCommand(id, -1, cmd, { force: true, reason: 'test', author: 'SL: chef' });
    if (!r.ok) throw new Error(JSON.stringify(r));
  };
  run({ type: 'PLAYER_UPSERT', data: { nickname: 'Grukk', email: 'grukk@example.org', discord: 'grukk#1', realName: 'Max Muster', notes: 'zahlt spät' } });
  const pid = m.campaigns.currentState(id).state.players[0].id;
  run({ type: 'PLAYER_UPSERT', id: pid, data: { nickname: 'Grukk der Große' } });
  m.db
    .db()
    .prepare("INSERT INTO outbox(campaign_id, channel, recipient, subject, body, dedupe_key, status, attempts, created_at) VALUES(?, 'EMAIL', 'grukk@example.org', 's', 'b', ?, 'PENDING', 0, ?)")
    .run(id, `${id}:x`, new Date().toISOString());
  return { id, pid };
}

describe('Datenschutz (NTH2 6.4)', () => {
  it('exportiert die Daten eines Spielers', () => {
    const { id, pid } = campaignWithPlayer();
    const ex = m.privacy.exportPlayer(id, pid)!;
    expect(ex.player.email).toBe('grukk@example.org');
    expect(ex.messages).toHaveLength(1);
  });

  it('löscht Kontaktdaten in allen Revisionen und in der Outbox, mit Protokolleintrag', () => {
    const { id, pid } = campaignWithPlayer();
    m.privacy.deletePlayerContact(id, pid, 'chef');
    const rows = m.db.db().prepare('SELECT state, command FROM revision WHERE campaign_id = ?').all(id) as { state: string; command: string }[];
    expect(rows.length).toBeGreaterThan(1);
    for (const r of rows) {
      expect(r.state).not.toContain('grukk@example.org');
      expect(r.state).not.toContain('Max Muster');
      expect(r.command).not.toContain('grukk@example.org');
    }
    // Notiz bleibt (nur Kontaktdaten gelöscht), Nickname bleibt
    const st = m.campaigns.currentState(id).state;
    expect(st.players[0].notes).toBe('zahlt spät');
    expect(st.players[0].nickname).toBe('Grukk der Große');
    expect((m.db.db().prepare('SELECT COUNT(*) AS n FROM outbox WHERE campaign_id = ?').get(id) as { n: number }).n).toBe(0);
    expect(m.audit.listAudit('ALL', 5).some((a) => a.action === 'Kontaktdaten gelöscht' && a.campaign_id === id)).toBe(true);
  });

  it('bereinigt beendete Kampagnen automatisch nach N Tagen (einmalig)', () => {
    const { id } = campaignWithPlayer();
    m.campaigns.runCommand(id, -1, { type: 'OVERRIDE_STAGE', stage: { kind: 'ENDED' } }, { force: true, reason: 'test', author: 'SL: chef' });
    m.privacy.setPrivacySettings({ days: 30, contact: true, notes: true, pulse: true });
    expect(m.privacy.runPrivacyCleanup(new Date())).not.toContain(id);
    const later = new Date(Date.now() + 31 * 86_400_000);
    expect(m.privacy.runPrivacyCleanup(later)).toContain(id);
    const st = m.campaigns.currentState(id).state;
    expect(st.players[0].email).toBe('');
    expect(st.players[0].notes).toBe('');
    expect(m.privacy.runPrivacyCleanup(later)).not.toContain(id);
    m.privacy.setPrivacySettings({ days: null, contact: true, notes: true, pulse: true });
  });
});

describe('Health (NTH2 6.2)', () => {
  it('protokolliert Fehler im Ringpuffer, kürzt Tokens, ignoriert notFound', () => {
    m.health.recordError('GET /p/abcdefghijklmnopqrstuvwxyz0123456789', new Error('kaputt'));
    m.health.recordError('GET /x', Object.assign(new Error('nf'), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }));
    const errs = m.health.recentErrors(5);
    expect(errs[0].message).toContain('kaputt');
    expect(errs[0].source).not.toContain('0123456789');
    expect(errs.some((e) => e.message.includes('nf'))).toBe(false);
    expect(m.health.errorsSince(new Date(Date.now() - 60_000).toISOString())).toBe(1);
  });

  it('Benachrichtigung höchstens alle 15 Minuten', () => {
    const now = new Date('2026-09-30T12:00:00Z');
    expect(m.health.shouldNotify(null, now)).toBe(true);
    expect(m.health.shouldNotify('2026-09-30T11:50:00Z', now)).toBe(false);
    expect(m.health.shouldNotify('2026-09-30T11:40:00Z', now)).toBe(true);
    expect(() => m.health.setErrorWebhook('https://example.org/hook')).toThrow();
  });

  it('Bericht mit Outbox, Backups, Speicher, Version', () => {
    const h = m.health.healthReport();
    expect(h.outbox.some((o) => o.channel === 'EMAIL')).toBe(true);
    expect(h.backups.length).toBeGreaterThan(0);
    expect(h.version).not.toBe('');
    expect(h.uptimeSec).toBeGreaterThanOrEqual(0);
    expect(h.errors24h).toBeGreaterThanOrEqual(1);
  });
});

describe('Liga-Speicher (NTH2 3.1)', () => {
  it('legt Saisons an, filtert unbekannte Kampagnen, findet per Token', () => {
    const { id } = campaignWithPlayer();
    const sid = m.league.createSeason('Saison 2026');
    m.league.updateSeason(sid, { data: { campaignIds: [id, 'gibtsnicht'], config: { win: 99, draw: 1, loss: 0, participation: 1, medal: 1, campaignWin: 1 } } });
    const s = m.league.getSeason(sid)!;
    expect(s.data.campaignIds).toEqual([id]);
    expect(s.data.config.win).toBe(50);
    expect(m.league.seasonByToken(s.token)?.id).toBe(sid);
    expect(m.league.seasonByToken('x'.repeat(32))).toBeNull();
    const st = m.league.seasonStandingsFor(s, true);
    expect(st[0].name).toBe('Grukk der Große');
    m.league.regenerateSeasonToken(sid);
    expect(m.league.seasonByToken(s.token)).toBeNull();
    m.league.deleteSeason(sid);
    expect(m.league.getSeason(sid)).toBeNull();
  });
});

describe('Importierte Übersetzungen (NTH2 7.2)', () => {
  it('werden gespeichert und auf dem Server angewendet', () => {
    m.store.saveI18nOverrides({ fr: { Speichern: 'Sauvegarder (club)' } });
    expect(m.core.translate('fr', 'Speichern')).toBe('Sauvegarder (club)');
    m.store.saveI18nOverrides({});
    expect(m.core.translate('fr', 'Speichern')).not.toBe('Sauvegarder (club)');
  });
});
