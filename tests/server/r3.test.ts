import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ids, startedCampaign } from '../engine/helpers';
import type { Command } from '@/engine/commands';
import type { CampaignState } from '@/engine/types';

// Erwartet deutsche Texte ohne Kampagnen- und Standardsprache: deutscher Build (NEXT_PUBLIC_DEFAULT_LOCALE=de), vor allen Importen gesetzt
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_DEFAULT_LOCALE = 'de';
});

/** Serverschicht Welle 1, R3: Szenario-Sandbox (NTH2 2.1), Kampagnen-Vorlagen (NTH2 2.6), Erinnern (NTH2 2.7) */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-r3-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.BACKUP_DIR = path.join(tmp, 'backups');
process.env.APP_URL = 'https://kampagne.example';

type Mods = {
  campaigns: typeof import('@/server/campaigns');
  backup: typeof import('@/server/backup');
  sandbox: typeof import('@/server/sandbox');
  templates: typeof import('@/server/campaignTemplates');
  notify: typeof import('@/server/notify');
  db: typeof import('@/server/db');
};
let m: Mods;

beforeAll(async () => {
  m = {
    campaigns: await import('@/server/campaigns'),
    backup: await import('@/server/backup'),
    sandbox: await import('@/server/sandbox'),
    templates: await import('@/server/campaignTemplates'),
    notify: await import('@/server/notify'),
    db: await import('@/server/db'),
  };
});
afterAll(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
});

function newCampaign(prep?: (s: CampaignState) => void): { id: string; s: CampaignState } {
  const s = startedCampaign();
  s.players.forEach((p, i) => (p.email = `p${i + 1}@example.org`));
  prep?.(s);
  const id = m.backup.importBackup(new TextEncoder().encode(JSON.stringify({ state: s })), 'R3-Kampagne');
  return { id, s: m.campaigns.currentState(id).state };
}

const cmd = (id: string, c: Command) => {
  const r = m.campaigns.runCommand(id, -1, c, { force: true, reason: 'test', author: 'SL: test' });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r;
};

/** Spielt die laufende Phase bis in die nächste (Events aus); liefert die Zahl der Schritte */
function playPhase(id: string): number {
  let n = 0;
  const start = m.campaigns.currentState(id).state.stage;
  const from = start.kind === 'PHASE' ? start.phase : 0;
  for (let i = 0; i < 30; i++) {
    const st = m.campaigns.currentState(id).state;
    if (st.stage.kind !== 'PHASE' || st.stage.phase > from) break;
    const ph = st.phases.find((p) => p.number === from)!;
    cmd(id, st.stage.step === 'RESULTS' && !ph.flags.scored ? { type: 'SCORE' } : st.stage.step === 'RESULTS' && !ph.flags.eventsGenerated ? { type: 'EVENTS_GENERATE' } : { type: 'ADVANCE' });
    n++;
  }
  return n;
}

const noEvents = (s: CampaignState) => {
  s.toggles.events = { ...s.toggles.events, fortunesOfWar: false, perilsOfPower: false, desperateMeasures: false };
};

const outbox = (id: string) =>
  m.db.db().prepare('SELECT channel, recipient, subject, body, dedupe_key FROM outbox WHERE campaign_id = ? ORDER BY id').all(id) as {
    channel: string;
    recipient: string;
    subject: string;
    body: string;
    dedupe_key: string;
  }[];

describe('Szenario-Sandbox (NTH2 2.1)', () => {
  it('Kopie mit eigenen Revisionen: nicht in der Liste, keine Leseansicht, keine Benachrichtigungen', () => {
    const { id } = newCampaign(noEvents);
    m.notify.setSmtpConfig({ host: 'smtp.invalid', port: 25, secure: false, user: '', pass: '', from: 'sl@example.org' });
    const sb = m.sandbox.createSandbox(id, 'SL: test');
    const row = m.campaigns.getCampaign(sb)!;
    expect(row.sandbox_of).toBe(id);
    expect(row.public_enabled).toBe(0);
    expect(m.campaigns.listCampaigns().some((c) => c.id === sb)).toBe(false);
    const st = m.campaigns.currentState(sb).state;
    expect(st.meta.sandbox).toMatchObject({ of: id, originalName: 'R3-Kampagne' });
    expect(st.meta.name).toBe('R3-Kampagne (Sandbox)');
    // Phase in der Sandbox bis zum Ende spielen: keine Mails
    const before = outbox(sb).length;
    const steps = playPhase(sb);
    expect(outbox(sb).length).toBe(before);
    expect(m.sandbox.listSandboxes(id)[0]).toMatchObject({ id: sb, steps });
    // Original unverändert
    expect(m.campaigns.currentState(id).state.stage).toEqual({ kind: 'PHASE', phase: 1, step: 'OPS' });
    m.notify.setSmtpConfig(null);
  });

  it('übernehmen: Schritte als Revisionen, Snapshot, Undo in einem Schritt; Sandbox danach weg', () => {
    const { id } = newCampaign(noEvents);
    const rev0 = m.campaigns.getCampaign(id)!.current_rev;
    const sb = m.sandbox.createSandbox(id, 'SL: test');
    const steps = playPhase(sb);
    const target = m.campaigns.currentState(sb).state.stage;
    expect(target).toMatchObject({ kind: 'PHASE', phase: 2 });
    expect(m.sandbox.applySandbox(sb, { reason: ' ', author: 'SL: test' })).toMatchObject({ ok: false });
    const r = m.sandbox.applySandbox(sb, { reason: 'Probelauf passt', author: 'SL: test' });
    expect(r).toMatchObject({ ok: true, steps });
    const cur = m.campaigns.currentState(id);
    expect(cur.state.stage).toEqual(target);
    expect(cur.state.meta.sandbox).toBeUndefined();
    expect(cur.state.meta.name).toBe('R3-Kampagne');
    const revs = m.campaigns.listRevisions(id).filter((x) => x.active);
    expect(revs[0]).toMatchObject({ is_override: 1, reason: 'Probelauf passt' });
    expect(JSON.parse(revs[0].command).type).toBe('SANDBOX_APPLY');
    expect(m.campaigns.phaseSnapshots(id).map((x) => x.phase)).toEqual([1]);
    expect(m.campaigns.getCampaign(sb)).toBeNull();
    // Undo nimmt die ganze Übernahme zurück
    const u1 = m.campaigns.undo(id, cur.row.current_rev);
    expect(u1.confirm).toMatch(/Sandbox/);
    const u2 = m.campaigns.undo(id, cur.row.current_rev, true);
    expect(u2).toMatchObject({ ok: true, revision: rev0 });
    expect(m.campaigns.currentState(id).state.stage).toEqual({ kind: 'PHASE', phase: 1, step: 'OPS' });
    expect(m.campaigns.phaseSnapshots(id)).toEqual([]);
  });

  it('Original inzwischen geändert → Rückfrage; leere Sandbox → Fehler; verwerfen', () => {
    const { id, s } = newCampaign();
    const sb = m.sandbox.createSandbox(id, null);
    expect(m.sandbox.applySandbox(sb, { reason: 'x', author: null })).toMatchObject({ ok: false, error: 'Die Sandbox enthält keine Änderungen' });
    cmd(sb, { type: 'ADVANCE' });
    cmd(id, { type: 'NOTE_ADD', allianceId: ids(s).a, playerId: null, text: 'im Original' });
    const r = m.sandbox.applySandbox(sb, { reason: 'x', author: null });
    expect(r.ok).toBe(false);
    expect(!r.ok && 'confirm' in r && r.confirm).toMatch(/seit dem Anlegen/);
    const sb2 = m.sandbox.createSandbox(id, null);
    m.sandbox.discardSandbox(sb2);
    expect(m.campaigns.getCampaign(sb2)).toBeNull();
    expect(() => m.sandbox.createSandbox(sb, null)).toThrow(/weitere Sandbox/);
    // Löschen des Originals nimmt Sandboxes mit
    m.campaigns.deleteCampaign(id);
    expect(m.campaigns.getCampaign(sb)).toBeNull();
  });
});

describe('Kampagnen-Vorlagen (NTH2 2.6)', () => {
  it('speichern, auflisten, daraus anlegen, löschen', () => {
    const { id } = newCampaign();
    cmd(id, { type: 'TOGGLES_UPDATE', toggles: { ...m.campaigns.currentState(id).state.toggles, medals: false } });
    cmd(id, { type: 'PLANET_TEXT', planetId: 'masnet', lore: 'Wüstenwelt' });
    const tid = m.templates.saveCampaignTemplate(id, 'Herbst-Regeln', 'test', true);
    expect(() => m.templates.saveCampaignTemplate(id, 'Herbst-Regeln', 'co', false)).toThrow(/Admins/);
    expect(m.templates.listCampaignTemplates()).toEqual([expect.objectContaining({ id: tid, name: 'Herbst-Regeln', phaseCount: 6, allianceCount: 3, mapName: 'Vespator Front' })]);
    const tpl = m.templates.getCampaignTemplate(tid)!;
    const nid = m.campaigns.createCampaign({ name: 'Frühjahr', intro: '', phaseCount: 6, allianceCount: 3, template: tpl, author: 'SL: test' });
    const n = m.campaigns.currentState(nid).state;
    expect(n.meta.name).toBe('Frühjahr');
    expect(n.toggles.medals).toBe(false);
    expect(n.alliances).toHaveLength(3);
    expect(n.planets.find((p) => p.id === 'masnet')!.lore).toBe('Wüstenwelt');
    expect(n.players).toEqual([]);
    expect(m.templates.deleteCampaignTemplate(tid)).toBe('Herbst-Regeln');
    expect(m.templates.listCampaignTemplates()).toEqual([]);
  });
});

describe('Erinnern (NTH2 2.7)', () => {
  it('schickt eine gezielte Mail, sperrt Wiederholungen kurz, ohne Versandweg ein Fehler', () => {
    const { id, s } = newCampaign();
    const { fa, c, pa, pc } = ids(s);
    cmd(id, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'SUPPLY_BASE_RAID', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
    for (let i = 0; i < 3; i++) cmd(id, { type: 'ADVANCE' });
    const st = m.campaigns.currentState(id).state;
    const b = st.battles[0];
    expect(b).toBeTruthy();
    // ohne SMTP und Discord: kein Versandweg
    m.notify.setSmtpConfig(null);
    expect(m.notify.remindBattle(id, b.id)).toMatchObject({ ok: false });
    m.notify.setSmtpConfig({ host: 'smtp.invalid', port: 25, secure: false, user: '', pass: '', from: 'sl@example.org' });
    const r = m.notify.remindBattle(id, b.id);
    expect(r).toMatchObject({ ok: true, mails: 2 });
    const mails = outbox(id).filter((x) => x.dedupe_key.includes(':remind:'));
    expect(mails.map((x) => x.recipient).sort()).toEqual([st.players.find((p) => p.id === pa)!.email, st.players.find((p) => p.id === pc)!.email].sort());
    expect(mails[0].subject).toMatch(/Erinnerung vom Warmaster/);
    expect(mails[0].body).toMatch(/kein Termin/);
    expect(m.notify.remindBattle(id, b.id)).toMatchObject({ ok: false, error: expect.stringMatching(/gerade erst/) });
    m.notify.setSmtpConfig(null);
  });
});
