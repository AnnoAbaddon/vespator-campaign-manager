import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ids, startedCampaign } from '../engine/helpers';
import type { CampaignState, PhaseStep } from '@/engine/types';
import type { Command } from '@/engine/commands';

// Erwartet deutsche Texte ohne Kampagnen- und Standardsprache: deutscher Build (NEXT_PUBLIC_DEFAULT_LOCALE=de), vor allen Importen gesetzt
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_DEFAULT_LOCALE = 'de';
});

/** Serverseitige Restpunkte aus Playtest C: JSON-Backup mit Historie (B3), Begründung aus Warn-Dialogen (B4) */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-playtest-c-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.BACKUP_DIR = path.join(tmp, 'backups');
process.env.APP_URL = 'https://kampagne.example';

type Mods = {
  campaigns: typeof import('@/server/campaigns');
  backup: typeof import('@/server/backup');
  pub: typeof import('@/server/public');
  audit: typeof import('@/server/audit');
  players: typeof import('@/server/players');
};
let m: Mods;

beforeAll(async () => {
  m = {
    campaigns: await import('@/server/campaigns'),
    backup: await import('@/server/backup'),
    pub: await import('@/server/public'),
    audit: await import('@/server/audit'),
    players: await import('@/server/players'),
  };
});
afterAll(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
});

const enc = (x: unknown) => new TextEncoder().encode(JSON.stringify(x));
function newCampaign(s: CampaignState = startedCampaign({ phases: 2 })): string {
  s.toggles.events = { ...s.toggles.events, fortunesOfWar: false, perilsOfPower: false, desperateMeasures: false };
  return m.backup.importBackup(enc({ state: s }), 'Testkampagne C');
}
const exec = (id: string, cmd: Command, opts: { force?: boolean; reason?: string } = { force: true, reason: 'test' }) => m.campaigns.runCommand(id, -1, cmd, opts);
function toStepSrv(id: string, step: PhaseStep) {
  for (let i = 0; i < 20; i++) {
    const st = m.campaigns.currentState(id).state.stage;
    if (st.kind === 'PHASE' && st.step === step) return;
    const r = exec(id, { type: 'ADVANCE' });
    if (!r.ok) throw new Error(JSON.stringify(r));
  }
}
/** Kampagne mit Historie über eine Phasengrenze (Snapshot) */
function playedCampaign(): string {
  const id = newCampaign();
  toStepSrv(id, 'RESULTS');
  expect(exec(id, { type: 'SCORE' }).ok).toBe(true);
  toStepSrv(id, 'BUILD');
  expect(exec(id, { type: 'ADVANCE' }).ok).toBe(true);
  return id;
}

describe('B3: JSON-Backup behält die Historie', () => {
  it('Export mit Zuständen je Revision → Import mit Log, Zeitreise und Zeitraffer', () => {
    const id = playedCampaign();
    const before = m.campaigns.listRevisions(id);
    const cur = m.campaigns.getCampaign(id)!.current_rev;
    const { json, filename } = m.backup.buildBackupJson(id);
    expect(filename).toMatch(/\.json$/);
    const parsed = JSON.parse(json);
    expect(parsed.revisions).toHaveLength(before.length);
    expect(parsed.revisions.every((r: { state?: unknown }) => r.state && typeof r.state === 'object')).toBe(true);

    const nid = m.backup.importBackup(new TextEncoder().encode(json), undefined, { author: 'chef' });
    const after = m.campaigns.listRevisions(nid);
    expect(after).toHaveLength(before.length + 1);
    expect(JSON.parse(after[0].command).type).toBe('IMPORT');
    expect(after[0].parent_number).toBe(cur);
    const byNum = new Map(after.map((x) => [x.number, x]));
    for (const b of before) expect(byNum.get(b.number)).toMatchObject({ summary: b.summary, parent_number: b.parent_number, created_at: b.created_at });
    expect(m.campaigns.phaseSnapshots(nid)).toEqual(m.campaigns.phaseSnapshots(id));
    expect(m.pub.loadTimeline(nid).map((f) => f.label)).toEqual(m.pub.loadTimeline(id).map((f) => f.label));
    expect(m.campaigns.currentState(nid).state.fleets).toEqual(m.campaigns.currentState(id).state.fleets);
    // Standardname der Kopie
    expect(m.campaigns.getCampaign(nid)!.name).toBe(m.backup.copyName('Testkampagne C'));
    expect(m.campaigns.getCampaign(nid)!.name).toMatch(/^Testkampagne C \(Kopie \d{2}\.\d{2}\.\d{4}\)$/);
  });

  it('„JSON (nur Stand)“ und alte JSON-Backups ohne Zustände importieren nur den Stand (mit Hinweis bei fehlenden Zuständen)', () => {
    const id = playedCampaign();
    const only = JSON.parse(m.backup.buildBackupJson(id, false).json);
    expect(only.revisions).toBeUndefined();
    const n1 = m.backup.importBackup(enc(only), 'Nur Stand');
    expect(m.campaigns.listRevisions(n1)).toHaveLength(1);
    expect(m.campaigns.getCampaign(n1)!.name).toBe('Nur Stand');

    const old = JSON.parse(m.backup.buildBackupJson(id).json);
    for (const r of old.revisions) delete r.state;
    const n2 = m.backup.importBackup(enc(old), 'Alt');
    const list = m.campaigns.listRevisions(n2);
    expect(list).toHaveLength(1);
    expect(JSON.parse(list[0].log).join(' ')).toMatch(/Historie nicht übernommen/);
  });

  it('Kopie-Name: Datum TT.MM.JJJJ, ein vorhandener Kopie-Zusatz wird ersetzt', () => {
    const d = new Date(2026, 8, 29);
    expect(m.backup.copyName('Kampagne', d)).toBe('Kampagne (Kopie 29.09.2026)');
    expect(m.backup.copyName('Kampagne (Kopie 01.01.2026)', d)).toBe('Kampagne (Kopie 29.09.2026)');
  });

  it('ZIP-Import ohne Namen bekommt ebenfalls den Kopie-Namen', () => {
    const id = newCampaign();
    const { zip } = m.backup.buildBackupZip(id);
    const nid = m.backup.importBackup(zip);
    expect(m.campaigns.getCampaign(nid)!.name).toMatch(/^Testkampagne C \(Kopie /);
  });
});

describe('B4: Begründung aus dem Warn-Dialog wird geloggt', () => {
  it('Revision trägt den eingegebenen Text, die Warnung bleibt als Kontext im Protokoll', () => {
    const s = startedCampaign({ phases: 2 });
    const id = newCampaign(s);
    const { fa, c } = ids(s);
    expect(exec(id, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } }).ok).toBe(true);
    toStepSrv(id, 'REVEAL');
    expect(exec(id, { type: 'REVEAL_OPS' }).ok).toBe(true);
    toStepSrv(id, 'BATTLES');
    const b = m.campaigns.currentState(id).state.battles.find((x) => x.kind === 'CAMPAIGN')!;
    const cmd: Command = { type: 'BATTLE_UPDATE', battleId: b.id, update: { vp: { attacker: 10, defender: 50 }, victorOverride: 'ATTACKER' } };
    const q = exec(id, cmd, {});
    expect(!q.ok && q.kind === 'confirm').toBe(true);
    const r = exec(id, cmd, { force: true, reason: 'TEST-BEGRUENDUNG-P4' });
    expect(r.ok).toBe(true);
    const rev = m.campaigns.listRevisions(id)[0];
    expect(rev.reason).toBe('TEST-BEGRUENDUNG-P4');
    expect(rev.is_override).toBeTruthy();
    expect(JSON.parse(rev.log).join(' | ')).toMatch(/Übergangene Warnung: Sieger weicht vom VP-Ergebnis ab/);
  });

  it('ohne eingegebenen Text bleibt die Warnung die Begründung (bestätigter Regelfall)', () => {
    const id = newCampaign();
    const s = m.campaigns.currentState(id).state;
    const { fa, c } = ids(s);
    expect(exec(id, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } }).ok).toBe(true);
    toStepSrv(id, 'REVEAL');
    expect(exec(id, { type: 'REVEAL_OPS' }).ok).toBe(true);
    toStepSrv(id, 'BATTLES');
    // ungespielte Schlacht → Regelfall bestätigen (ohne Begründung)
    expect(exec(id, { type: 'ADVANCE' }, { force: true }).ok).toBe(true);
    const rev = m.campaigns.listRevisions(id)[0];
    expect(rev.reason).toMatch(/ungespielt/);
    expect(JSON.parse(rev.log).join(' ')).not.toMatch(/Übergangene Warnung/);
  });
});

describe('B7 / Spielerlink: echte Warnungen bleiben verständliche Fehler', () => {
  it('frei gewähltes Theatre unter Sinister Omens wird abgelehnt, der W6-Wurf angenommen', () => {
    const s = startedCampaign({ phases: 2 });
    s.modifiers.push({ id: 'om', source: 'x', kind: 'RANDOM_THEATRE', phaseNumber: 1, allianceId: null });
    const id = newCampaign(s);
    const { fa, c, pa } = ids(s);
    expect(exec(id, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } }).ok).toBe(true);
    toStepSrv(id, 'REVEAL');
    expect(exec(id, { type: 'REVEAL_OPS' }).ok).toBe(true);
    toStepSrv(id, 'BATTLES');
    const st = m.campaigns.currentState(id).state;
    const b = st.battles.find((x) => x.kind === 'CAMPAIGN')!;
    expect(b.theatreChosenBy).toBe('RANDOM');
    const token = m.players.playerTokenFor(id, pa, true)!;
    const bad = m.players.runPlayerCommand(token, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: pa, update: { vp: { attacker: 60, defender: 40 }, theatre: 'DEAD_LANDS' } });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && 'error' in bad && bad.error).toMatch(/Nicht möglich: .*Sinister Omens/);
    const ok = m.players.runPlayerCommand(token, { type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: pa, update: { vp: { attacker: 60, defender: 40 }, theatreRoll: 2 } });
    expect(ok.ok).toBe(true);
  });
});
