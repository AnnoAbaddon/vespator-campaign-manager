import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ids, run, startedCampaign } from '../engine/helpers';
import type { CampaignState, PhaseStep } from '@/engine/types';
import type { Command } from '@/engine/commands';

// Erwartet deutsche Texte ohne Kampagnen- und Standardsprache: deutscher Build (NEXT_PUBLIC_DEFAULT_LOCALE=de), vor allen Importen gesetzt
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_DEFAULT_LOCALE = 'de';
});

/** Serverseitige Korrekturen aus den Playtests: Backups, Kampagnenliste, Override-Markierung, Phasenbericht */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-playtest-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.BACKUP_DIR = path.join(tmp, 'backups');
process.env.APP_URL = 'https://kampagne.example';

type Mods = {
  campaigns: typeof import('@/server/campaigns');
  backup: typeof import('@/server/backup');
  auto: typeof import('@/server/autoBackup');
  report: typeof import('@/server/report');
};
let m: Mods;

beforeAll(async () => {
  m = {
    campaigns: await import('@/server/campaigns'),
    backup: await import('@/server/backup'),
    auto: await import('@/server/autoBackup'),
    report: await import('@/server/report'),
  };
});
afterAll(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
});

function newCampaign(s: CampaignState = startedCampaign({ phases: 2 })): string {
  s.toggles.events = { ...s.toggles.events, fortunesOfWar: false, perilsOfPower: false, desperateMeasures: false };
  return m.backup.importBackup(new TextEncoder().encode(JSON.stringify({ state: s })), 'Testkampagne');
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

describe('B13: Backup nach jedem Phasenabschluss', () => {
  it('der Übergang in eine neue Phase legt ein Backup an (nach dem Command, außerhalb der Anfrage)', async () => {
    const id = newCampaign();
    expect(m.auto.listBackups(id)).toHaveLength(0);
    toStepSrv(id, 'RESULTS');
    expect(exec(id, { type: 'SCORE' }).ok).toBe(true);
    toStepSrv(id, 'BUILD');
    expect(m.auto.listBackups(id)).toHaveLength(0);
    expect(exec(id, { type: 'ADVANCE' }).ok).toBe(true);
    expect(m.campaigns.currentState(id).state.stage).toMatchObject({ kind: 'PHASE', phase: 2 });
    await new Promise((r) => setImmediate(r));
    expect(m.auto.listBackups(id)).toHaveLength(1);
  });
});

describe('B10: Frist in der Kampagnenliste', () => {
  it('während „Operationen wählen“ die Befehlsfrist', () => {
    const id = newCampaign();
    exec(id, { type: 'PHASE_UPDATE', phase: 1, opsDeadline: '2026-01-04T00:00:00Z', battlesDeadline: '2026-01-15T00:00:00Z' });
    const e = m.campaigns.listCampaigns().find((c) => c.id === id)!;
    expect(e.deadline).toEqual({ kind: 'OPS', at: '2026-01-04T00:00:00Z' });
  });
});

describe('Override-Markierung im Log', () => {
  it('Regelfall (ungespielt → Angreifer) ohne ⚠, Abweichung mit Begründung und ⚠', () => {
    let s = startedCampaign();
    const { fa, fb, c } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
    s = run(s, { type: 'OP_SET', fleetId: fb, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'novamagnor', targetAllianceId: c } });
    const id = newCampaign(s);
    toStepSrv(id, 'BATTLES');
    const [b1] = m.campaigns.currentState(id).state.battles;
    expect(exec(id, { type: 'BATTLE_UNPLAYED', battleId: b1.id, resolution: 'VOID' }, { reason: '' }).ok).toBe(false);
    expect(exec(id, { type: 'BATTLE_UNPLAYED', battleId: b1.id, resolution: 'VOID' }, { reason: 'Spieler krank' }).ok).toBe(true);
    // Weiterschalten wertet die zweite Schlacht regelgemäß – bestätigt, aber ohne Begründung und ohne ⚠
    expect(exec(id, { type: 'ADVANCE' }, { force: true }).ok).toBe(true);
    const revs = m.campaigns.listRevisions(id);
    expect(revs.find((r) => JSON.parse(r.command).type === 'BATTLE_UNPLAYED')!.is_override).toBe(1);
    const last = revs.find((r) => r.number === Math.max(...revs.map((x) => x.number)))!;
    expect(JSON.parse(last.command).type).toBe('ADVANCE');
    expect(last.is_override).toBe(0);
  });
});

describe('B14: Phasenbericht', () => {
  it('ungespielt, Bauverzicht, Archeotech, Endstand, Entscheidungsschlacht und Sieger', () => {
    let s = startedCampaign({ phases: 1 });
    const { fa, a, b, c, pa, pb } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
    let i = 0;
    while (!(s.stage.kind === 'PHASE' && s.stage.step === 'RESULTS') && i++ < 20) {
      if (s.stage.kind === 'PHASE' && s.stage.step === 'PROCESS' && s.battles.some((x) => x.status !== 'PROCESSED')) s = run(s, { type: 'BATTLE_PROCESS_ALL' });
      s = run(s, { type: 'ADVANCE' });
    }
    s = run(s, { type: 'SCORE' });
    // Bauverzicht und Archeotech (direkt gesetzt – der Bericht liest nur den Zustand)
    s.phases[0].buildOrder = [a, b];
    s.phases[0].builds = { [a]: 'SKIP', [b]: { allianceId: b, type: 'FORTIFICATION_LINE', planetId: 'novamagnor' } };
    s.modifiers.push({ id: 'm1', source: 'x', kind: 'ARCHEOTECH', phaseNumber: 1, allianceId: null, planetIds: ['masnet'] });
    s.phases[0].archeotechResolved = true;
    s.phases[0].archeotechResults = [{ planetId: 'masnet', allianceId: a, increments: ['masnet'] }];
    s = { ...s, stage: { kind: 'TIEBREAK' }, result: { winnerAllianceId: null, tiebreak: 'FINAL_BATTLE', tied: [a, b] } };
    s = run(s, { type: 'TIEBREAK_ADD', attackerAllianceId: a, defenderAllianceId: b });
    const t = s.battles.find((x) => x.kind === 'FINAL_TIEBREAK')!;
    s = run(s, { type: 'BATTLE_UPDATE', battleId: t.id, update: { attackers: [{ playerId: pa, faction: 'Orks' }], defenders: [{ playerId: pb, faction: 'Necrons' }], vp: { attacker: 104, defender: 98 } } });
    s = run(s, { type: 'TIEBREAK_DECIDE', winnerAllianceId: a });
    const md = m.report.phaseReport(s, 1);
    expect(md).toContain('nicht gespielt, gewertet');
    expect(md).toContain('Rot: verzichtet auf den Bau');
    expect(md).toContain('Archeotech Riches');
    expect(md).toContain('gesichert durch Rot');
    expect(md).toContain('Kampagnenende');
    expect(md).toContain('Endstand');
    expect(md).toMatch(/Entscheidungsschlacht\*\* – P1 vs\. P2: Rot siegt \(104:98 VP\)/);
    expect(md).toContain('Sieger: Rot');
    const en = m.report.phaseReport(s, 1, { locale: 'en' });
    expect(en).toContain('Winner: Rot');
    expect(en).toContain('waives the build');
  });
});
