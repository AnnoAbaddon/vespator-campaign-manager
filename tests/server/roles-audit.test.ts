import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import type { Command } from '@/engine/commands';
import type { CampaignState } from '@/engine/types';

// Erwartet deutsche Texte ohne Kampagnen- und Standardsprache: deutscher Build (NEXT_PUBLIC_DEFAULT_LOCALE=de), vor allen Importen gesetzt
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_DEFAULT_LOCALE = 'de';
});

/**
 * Serverschicht: Spielerlinks (gesperrt bleibt gesperrt), Rollen (N5.2), Verwaltungsprotokoll,
 * Backups mit Historie (N5.1), Kartenvorlage beim Anlegen (N5.5), Sprache (N5.4), Abmeldelink.
 */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-roles-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.BACKUP_DIR = path.join(tmp, 'backups');

type Mods = {
  auth: typeof import('@/server/auth');
  authz: typeof import('@/server/authz');
  audit: typeof import('@/server/audit');
  auto: typeof import('@/server/autoBackup');
  backup: typeof import('@/server/backup');
  campaigns: typeof import('@/server/campaigns');
  db: typeof import('@/server/db');
  notify: typeof import('@/server/notify');
  players: typeof import('@/server/players');
  pub: typeof import('@/server/public');
  report: typeof import('@/server/report');
  locale: typeof import('@/server/requestLocale');
  map: typeof import('@/engine/map');
};
let m: Mods;

beforeAll(async () => {
  m = {
    auth: await import('@/server/auth'),
    authz: await import('@/server/authz'),
    audit: await import('@/server/audit'),
    auto: await import('@/server/autoBackup'),
    backup: await import('@/server/backup'),
    campaigns: await import('@/server/campaigns'),
    db: await import('@/server/db'),
    notify: await import('@/server/notify'),
    players: await import('@/server/players'),
    pub: await import('@/server/public'),
    report: await import('@/server/report'),
    locale: await import('@/server/requestLocale'),
    map: await import('@/engine/map'),
  };
});
afterAll(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
});

const account = (username: string, role: string) => {
  const r = m.db.db().prepare('INSERT INTO admin(username, password_hash, created_at, role) VALUES(?,?,?,?)').run(username, 'x', new Date().toISOString(), role);
  return { id: Number(r.lastInsertRowid), username, role: m.auth.normalizeRole(role), locale: 'de' as const };
};

/** Kampagne über die Serverschicht bis zum Start spielen – jede Aktion ist eine eigene Revision */
function playedCampaign(): string {
  const id = m.campaigns.createCampaign({ name: 'Historie', intro: '', phaseCount: 4, allianceCount: 3, author: 'SL: chef' });
  const run = (cmd: Command) => {
    const r = m.campaigns.runCommand(id, -1, cmd, { force: true, reason: 'test', author: 'SL: chef' });
    if (!r.ok) throw new Error(JSON.stringify(r));
  };
  const st = () => m.campaigns.currentState(id).state;
  for (const [name, color] of [
    ['Rot', '#ff0000'],
    ['Blau', '#0000ff'],
    ['Grün', '#00ff00'],
  ])
    run({ type: 'ALLIANCE_UPSERT', name, color });
  const [a, b, c] = st().alliances.map((x) => x.id);
  run({ type: 'PLAYER_UPSERT', data: { nickname: 'P1', faction: 'Orks' }, allianceId: a });
  run({ type: 'PLAYER_UPSERT', data: { nickname: 'P2', faction: 'Necrons' }, allianceId: b });
  run({ type: 'PLAYER_UPSERT', data: { nickname: 'P3', faction: 'Tau' }, allianceId: c });
  for (const x of [a, b, c]) run({ type: 'FLEET_SET_COUNT', allianceId: x, count: 1 });
  run({ type: 'SETUP_W0_DONE' });
  run({ type: 'SETUP_STRONGHOLDS', allianceId: a, strongholdPlanetId: 'norallus', pl3: ['masnet', 'karabas', 'kryndaer'], pl2: ['felgris-secundas', 'caltus-novem', 'marvinius', 'vikus-decima'] });
  run({ type: 'SETUP_STRONGHOLDS', allianceId: b, strongholdPlanetId: 'jawardet', pl3: ['tarkad-vindix', 'astarthem', 'ikaron-prime'], pl2: ['novamagnor', 'felgris-secundas', 'masnet', 'vikus-decima'] });
  run({ type: 'SETUP_STRONGHOLDS', allianceId: c, strongholdPlanetId: 'caltus-novem', pl3: ['vikus-decima', 'marvinius', 'novamagnor'], pl2: ['kryndaer', 'karabas', 'ikaron-prime', 'astarthem'] });
  run({ type: 'SETUP_REVEAL_STRONGHOLDS' });
  run({ type: 'SETUP_W2_DONE' });
  run({
    type: 'SETUP_INFRA',
    allianceId: a,
    items: [
      { type: 'FORTIFICATION_LINE', planetId: 'masnet' },
      { type: 'SUPPORT_FACILITY', planetId: 'karabas' },
      { type: 'STAGING_GROUNDS', planetId: 'kryndaer' },
    ],
  });
  run({
    type: 'SETUP_INFRA',
    allianceId: b,
    items: [
      { type: 'FORTIFICATION_LINE', planetId: 'tarkad-vindix' },
      { type: 'SUPPORT_FACILITY', planetId: 'astarthem' },
      { type: 'STAGING_GROUNDS', planetId: 'ikaron-prime' },
    ],
  });
  run({
    type: 'SETUP_INFRA',
    allianceId: c,
    items: [
      { type: 'FORTIFICATION_LINE', planetId: 'marvinius' },
      { type: 'SUPPORT_FACILITY', planetId: 'vikus-decima' },
      { type: 'STAGING_GROUNDS', planetId: 'novamagnor' },
    ],
  });
  run({ type: 'SETUP_REVEAL_INFRA' });
  run({ type: 'SETUP_W3_DONE' });
  const [fa, fb, fc] = st().fleets.map((f) => f.id);
  run({ type: 'SETUP_FLEET_STARTS', starts: { [fa]: 'kryndaer', [fb]: 'novamagnor', [fc]: 'caltus-novem' } });
  run({ type: 'SETUP_REVEAL_FLEETS' });
  run({ type: 'SETUP_W4_DONE' });
  run({ type: 'SETUP_START' });
  return id;
}

describe('Spielerlinks: gesperrte Links werden nicht still neu ausgegeben', () => {
  it('erzeugt nur für Spieler ohne jeden bisherigen Link', () => {
    const id = playedCampaign();
    const [p1, p2] = m.campaigns.currentState(id).state.players.map((p) => p.id);
    // ohne create: nichts erzeugen
    expect(m.players.playerTokenFor(id, p1)).toBeNull();
    const t1 = m.players.playerTokenFor(id, p1, true)!;
    expect(t1).toBeTruthy();
    // zweiter Aufruf (Sammelblatt erneut öffnen/drucken) liefert denselben Link
    expect(m.players.playerTokenFor(id, p1, true)).toBe(t1);
    // gesperrt: auch mit create kein neuer Link, der alte bleibt ungültig
    m.players.revokePlayerToken(id, p1);
    expect(m.players.playerTokenFor(id, p1, true)).toBeNull();
    expect(m.players.playerTokenFor(id, p1)).toBeNull();
    expect(m.players.resolvePlayerToken(t1)).toBeNull();
    expect(m.players.playerLinkStatus(id)[p1]).toBe('REVOKED');
    // erst das ausdrückliche Neu-Erzeugen hebt die Sperre auf
    const t2 = m.players.regeneratePlayerToken(id, p1);
    expect(m.players.playerTokenFor(id, p1, true)).toBe(t2);
    // anderer Spieler ohne Link: wird erzeugt
    expect(m.players.playerTokenFor(id, p2, true)).toBeTruthy();
  });

  it('Rate-Limit-Schlüssel werden aufgeräumt', () => {
    const now = Date.now();
    for (let i = 0; i < 50; i++) m.players.uploadLimited(`tok-${i}`);
    expect(m.players.rateLimitKeys()).toBeGreaterThanOrEqual(50);
    m.players.pruneRateLimits(now + 61_000);
    expect(m.players.rateLimitKeys()).toBe(0);
  });
});

describe('Rollen (N5.2)', () => {
  it('unbekannte Rollen erhalten die geringsten Rechte', () => {
    expect(m.auth.normalizeRole('ADMIN')).toBe('ADMIN');
    expect(m.auth.normalizeRole('COWARMASTER')).toBe('COWARMASTER');
    expect(m.auth.normalizeRole('OWNER')).toBe('COWARMASTER');
    expect(m.auth.normalizeRole(null)).toBe('COWARMASTER');
    expect(m.auth.normalizeRole('admin')).toBe('COWARMASTER');
    const odd = account('seltsam', 'SUPERUSER');
    const c = m.campaigns.createCampaign({ name: 'Rolle', intro: '', phaseCount: 2, allianceCount: 2 });
    expect(m.auth.canAccess(odd, c)).toBe(false);
    expect(m.authz.campaignScope(odd)).toEqual([]);
    // Einladung mit manipulierter Rolle
    const tok = m.auth.createInvite(odd.id, 'COWARMASTER', []);
    m.db.db().prepare("UPDATE invite SET role = 'ROOT'").run();
    expect(m.auth.checkInvite(tok)?.role).toBe('COWARMASTER');
  });

  it('Kampagnen anlegen nur Admins, globale Uploads nur Admins', () => {
    const admin = account('boss', 'ADMIN');
    const co = account('co', 'COWARMASTER');
    const c = m.campaigns.createCampaign({ name: 'Upload', intro: '', phaseCount: 2, allianceCount: 2 });
    const P = m.authz.accountPrincipal;
    expect(m.authz.can(P(admin), 'campaign.create')).toBeNull();
    expect(m.authz.can(P(co), 'campaign.create')).toBe('Nur für Admins');
    expect(m.authz.can(null, 'campaign.create')).toBe('Nicht angemeldet');
    expect(m.authz.can(P(admin), 'upload.global')).toBeNull();
    expect(m.authz.can(P(co), 'upload.global')).toBe('Nur für Admins');
    expect(m.authz.can(P(co), 'campaign.upload', { campaignId: c })).toBe('Kein Zugriff auf diese Kampagne');
    m.auth.grantAccess(co.id, c);
    expect(m.authz.can(P(co), 'campaign.upload', { campaignId: c })).toBeNull();
  });
});

describe('Verwaltungsprotokoll (N5.2)', () => {
  it('schreibt Einträge mit Kontonamen und filtert nach Kampagnen', () => {
    const c1 = m.campaigns.createCampaign({ name: 'A1', intro: '', phaseCount: 2, allianceCount: 2 });
    const c2 = m.campaigns.createCampaign({ name: 'A2', intro: '', phaseCount: 2, allianceCount: 2 });
    m.audit.audit('chef', 'Kampagne archiviert', 'A1', c1);
    m.audit.audit('chef', 'Leseansicht ausgeschaltet', 'A2', c2);
    m.audit.audit('chef', 'SMTP-Einstellungen gespeichert', 'smtp.example:587');
    const all = m.audit.listAudit('ALL', 50);
    expect(all[0]).toMatchObject({ author: 'chef', action: 'SMTP-Einstellungen gespeichert', campaign_id: null });
    const only = m.audit.listAudit([c1], 50);
    expect(only.map((e) => e.action)).toEqual(['Kampagne archiviert']);
    expect(m.audit.listAudit([], 50)).toEqual([]);
    expect(m.audit.listAudit('ALL', 2)).toHaveLength(2);
  });

  it('Kampagne anlegen trägt den Urheber in Revision 1 ein', () => {
    const id = m.campaigns.createCampaign({ name: 'Autor', intro: '', phaseCount: 2, allianceCount: 2, author: 'SL: chef' });
    expect(m.campaigns.listRevisions(id)[0].author).toBe('SL: chef');
  });
});

describe('Backups mit Historie (N5.1)', () => {
  it('Wiederherstellung übernimmt alle Revisionen, Snapshots und das Protokoll', () => {
    const id = playedCampaign();
    // eine Aktion rückgängig machen (verworfener Zweig) und einen Snapshot simulieren
    const cur = m.campaigns.getCampaign(id)!.current_rev;
    const r = m.campaigns.runCommand(id, -1, { type: 'META_UPDATE', name: 'Historie 2' }, { author: 'SL: chef' });
    expect(r.ok).toBe(true);
    expect(m.campaigns.undo(id, cur + 1, true).ok).toBe(true);
    m.db.db().prepare('INSERT INTO snapshot(campaign_id, phase, revision) VALUES(?,?,?)').run(id, 1, cur);
    m.audit.audit('chef', 'Leseansicht ausgeschaltet', 'Historie', id);

    const before = m.campaigns.listRevisions(id);
    const framesBefore = m.pub.loadTimeline(id);
    m.auto.backupCampaign(id, true);
    const file = m.auto.listBackups(id)[0].file;
    const restored = m.auto.restoreBackup(id, file, 'chef');

    const after = m.campaigns.listRevisions(restored);
    // alle alten Revisionen plus die Import-Revision
    expect(after).toHaveLength(before.length + 1);
    const imp = after[0];
    expect(JSON.parse(imp.command).type).toBe('IMPORT');
    expect(imp.parent_number).toBe(cur);
    expect(imp.author).toBe('SL: chef');
    const byNum = new Map(after.map((x) => [x.number, x]));
    for (const b of before) {
      const a = byNum.get(b.number)!;
      expect(a).toMatchObject({ parent_number: b.parent_number, summary: b.summary, undone: b.undone, author: b.author, created_at: b.created_at });
      expect(a.active).toBe(b.active);
    }
    // Zeitleiste (Codex/Zeitraffer): gleiche Bilder
    const framesAfter = m.pub.loadTimeline(restored);
    expect(framesAfter.map((f) => f.label)).toEqual(framesBefore.map((f) => f.label));
    expect(framesAfter[0].state.planets).toEqual(framesBefore[0].state.planets);
    expect(m.campaigns.phaseSnapshots(restored)).toEqual([{ phase: 1, revision: cur }]);
    // Zustand ist der alte, nur umbenannt
    expect(m.campaigns.currentState(restored).state.fleets).toEqual(m.campaigns.currentState(id).state.fleets);
    expect(m.campaigns.getCampaign(restored)!.name).toMatch(/Wiederherstellung/);
    // Protokoll übernommen und Wiederherstellung protokolliert
    const log = m.audit.auditForCampaign(restored);
    expect(log.map((e) => e.action)).toEqual(['Leseansicht ausgeschaltet', 'Backup wiederhergestellt']);
    expect(log[1].author).toBe('chef');
    // Undo auf der wiederhergestellten Kampagne führt zurück auf den alten aktiven Stand
    expect(m.campaigns.undo(restored, imp.number, true)).toMatchObject({ ok: true, revision: cur });
  });

  it('ohne Zustände im ZIP oder mit kaputter Kette: nur der aktuelle Stand, mit Hinweis', () => {
    const id = playedCampaign();
    const state = m.campaigns.currentState(id).state;
    const revs = [
      { number: 1, parent: null, command: { type: 'CREATE' }, summary: 'a', log: [], createdAt: '2026-01-01T00:00:00Z', active: true },
      { number: 2, parent: 5, command: { type: 'X' }, summary: 'b', log: [], createdAt: '2026-01-01T00:00:00Z', active: true },
    ];
    const mk = (withStates: boolean) =>
      zipSync({
        'backup.json': strToU8(JSON.stringify({ state, revisions: revs, currentRevision: 2 })),
        ...(withStates ? { 'revisions/1.json': strToU8(JSON.stringify(state)), 'revisions/2.json': strToU8(JSON.stringify(state)) } : {}),
      });
    for (const withStates of [false, true]) {
      const nid = m.backup.importBackup(mk(withStates), 'Teilimport');
      const list = m.campaigns.listRevisions(nid);
      expect(list).toHaveLength(1);
      expect(JSON.parse(list[0].log).join(' ')).toMatch(/Historie nicht übernommen/);
    }
  });

  it('prüft die Struktur einer Historie', () => {
    const s = {} as CampaignState;
    const rev = (number: number, parent: number | null) => ({ number, parent, command: null, state: s, summary: '', log: [], isOverride: false, reason: null, undone: false, createdAt: '', author: null });
    expect(m.campaigns.checkImportedHistory({ current: 2, revisions: [rev(1, null), rev(2, 1)], snapshots: [{ phase: 1, revision: 2 }] })).toBeNull();
    expect(m.campaigns.checkImportedHistory({ current: 2, revisions: [rev(1, null), rev(1, null)], snapshots: [] })).toMatch(/Revisionsnummern/);
    expect(m.campaigns.checkImportedHistory({ current: 2, revisions: [rev(1, null), rev(2, 3)], snapshots: [] })).toMatch(/Revisionskette/);
    expect(m.campaigns.checkImportedHistory({ current: 7, revisions: [rev(1, null)], snapshots: [] })).toMatch(/Aktuelle Revision/);
    expect(m.campaigns.checkImportedHistory({ current: 1, revisions: [rev(1, null)], snapshots: [{ phase: 1, revision: 9 }] })).toMatch(/Snapshots/);
  });

  it('Tageskennung in Ortszeit – passend zur 03:00-Prüfung', () => {
    const id = playedCampaign();
    m.db.setSetting('backupLastDay', '');
    const count = () => m.auto.listBackups(id).length;
    const n0 = count();
    expect(m.auto.localDay(new Date(2031, 0, 5, 0, 30))).toBe('2031-01-05');
    expect(m.auto.runDailyBackups(new Date(2031, 0, 5, 3, 10))).toBe(true);
    expect(m.auto.runDailyBackups(new Date(2031, 0, 5, 23, 50))).toBe(false);
    // kurz nach Mitternacht Ortszeit: neuer Tag, aber vor 03:00 → noch nicht
    expect(m.auto.runDailyBackups(new Date(2031, 0, 6, 0, 30))).toBe(false);
    expect(m.auto.runDailyBackups(new Date(2031, 0, 6, 3, 0))).toBe(true);
    expect(count()).toBe(n0 + 2);
  });
});

describe('Kartenvorlage beim Anlegen (N5.5)', () => {
  it('übernimmt eine eigenständige Kopie der Vorlage', () => {
    const { map: fork } = m.map.forkMap(m.map.VESPATOR_MAP);
    const tpl = { ...fork, name: 'Eigene Karte' };
    const copy = m.map.forkMap(tpl).map;
    const id = m.campaigns.createCampaign({ name: 'Mit Karte', intro: '', phaseCount: 3, allianceCount: 2, map: copy });
    const st = m.campaigns.currentState(id).state;
    expect(st.map?.name).toBe('Eigene Karte');
    expect(st.map?.template).toBeNull();
    expect(st.planets.map((p) => p.id)).toEqual(copy.planets.map((p) => p.id));
    // frische IDs – keine Überschneidung mit der Vorlage
    const tplIds = new Set(tpl.planets.map((p) => p.id));
    expect(st.planets.some((p) => tplIds.has(p.id))).toBe(false);
    // ohne Vorlage: Vespator
    const v = m.campaigns.createCampaign({ name: 'Vespator', intro: '', phaseCount: 3, allianceCount: 2 });
    expect(m.campaigns.currentState(v).state.map?.template).toBe('vespator');
  });
});

describe('Sprache (N5.4)', () => {
  it('Phasenbericht in der Sprache der Kampagne bzw. nach Wahl', () => {
    const id = playedCampaign();
    const st = m.campaigns.currentState(id).state;
    st.phases[0].startDate = '2026-03-01T12:00:00Z';
    st.phases[0].endDate = '2026-03-14T12:00:00Z';
    const de = m.report.phaseReport(st, 1);
    expect(de).toContain('Operationen');
    expect(de).toContain('1.3.2026');
    const en = m.report.phaseReport(st, 1, { locale: 'en', publicUrl: 'https://x.example/v/abc' });
    expect(en).toContain('Operations');
    expect(en).not.toContain('Operationen');
    expect(en).toContain('01/03/2026');
    expect(en).toContain('Map & details: https://x.example/v/abc');
    // Standard der Kampagne
    expect(m.report.phaseReport({ ...st, meta: { ...st.meta, locale: 'en' } }, 1)).toContain('Operations');
    expect(m.report.phaseReport(st, 99, { locale: 'en' })).toBe('Phase 99 does not exist.');
  });

  it('Sprache für Seiten ohne eigenen Kontext: Wahl → Kontext → Standardsprache → Browser → Deutsch', async () => {
    const id = playedCampaign();
    const pid = m.campaigns.currentState(id).state.players[0].id;
    const token = m.players.playerTokenFor(id, pid, true)!;
    const pub = m.campaigns.getCampaign(id)!.public_token;
    const en = async () => 'en' as const;
    const none = async () => null;
    const at = (cookie: string | null, extra: object = {}) => ({ cookie, ...extra });
    // Verwaltung: Konto vor Standard, Cookie (ausdrückliche Wahl) vor Konto
    expect(await m.locale.localeForPath('/admin/c/x', at(null), en)).toBe('en');
    expect(await m.locale.localeForPath('/admin', at('de'), en)).toBe('de');
    expect(await m.locale.localeForPath('/admin', at(null, { explicit: 'en', cookie: 'de' }), none)).toBe('en');
    // Spielerseite: Cookie vor Spielerprofil, Spielerprofil vor Kampagne
    expect(await m.locale.localeForPath(`/p/${token}`, at('en'), none)).toBe('en');
    expect(await m.locale.localeForPath(`/p/${token}`, at(null), none)).toBe('de');
    m.campaigns.runCommand(id, -1, { type: 'PROFILE_UPDATE', playerId: pid, update: { locale: 'en' } }, { force: true });
    expect(await m.locale.localeForPath(`/p/${token}/battles/x`, at(null, { defaultLocale: 'de' }), none)).toBe('en');
    expect(await m.locale.localeForPath(`/p/${token}/battles/x`, at('de'), none)).toBe('de');
    // Leseansicht: Kampagne (ohne eigene Sprache) → Standardsprache → Browser
    expect(await m.locale.localeForPath(`/v/${pub}`, at(null), en)).toBe('de');
    expect(await m.locale.localeForPath(`/v/${pub}`, at(null, { defaultLocale: 'en' }), none)).toBe('en');
    expect(await m.locale.localeForPath(`/v/${pub}`, at(null, { acceptLanguage: 'en-US,en;q=0.9,de;q=0.8' }), none)).toBe('en');
    m.campaigns.runCommand(id, -1, { type: 'META_UPDATE', locale: 'en' }, { force: true });
    expect(await m.locale.localeForPath(`/v/${pub}/rules`, at(null, { defaultLocale: 'de' }), none)).toBe('en');
    expect(await m.locale.localeForPath(`/v/${pub}/rules`, at('de'), none)).toBe('de');
    // Seiten ohne Kontext (Nachweise): Konto, sonst Standard, sonst Browser
    expect(await m.locale.localeForPath('/credits', at(null), en)).toBe('en');
    expect(await m.locale.localeForPath('/credits', at('de'), en)).toBe('de');
    expect(await m.locale.localeForPath('/credits', at(null), none)).toBe('de');
    expect(await m.locale.localeForPath('/credits', at(null, { defaultLocale: 'en', acceptLanguage: 'de' }), none)).toBe('en');
    expect(await m.locale.localeForPath('/credits', at(null, { acceptLanguage: 'it-IT,en;q=0.5' }), none)).toBe('en');
    // NTH2 7.1: Französisch ist jetzt eine eigene Sprache
    expect(await m.locale.localeForPath('/credits', at(null, { acceptLanguage: 'fr-FR,en;q=0.5' }), none)).toBe('fr');
  });

  it('globale Standardsprache: Einstellung, neue Kampagnen, Rückfall ohne Anfrage', () => {
    expect(m.db.defaultLocale()).toBeNull();
    expect(m.locale.contextLocale(undefined)).toBe('de');
    m.db.setDefaultLocale('en');
    try {
      expect(m.db.defaultLocale()).toBe('en');
      expect(m.locale.contextLocale(undefined, null)).toBe('en');
      expect(m.locale.contextLocale('de')).toBe('de');
      // neue Kampagnen übernehmen die Standardsprache als Kampagnensprache
      const id = m.campaigns.createCampaign({ name: 'Englisch', intro: '', phaseCount: 3, allianceCount: 2 });
      expect(m.campaigns.currentState(id).state.meta.locale).toBe('en');
      // Phasenbericht ohne Kampagnensprache folgt der Standardsprache
      const st = m.campaigns.currentState(playedCampaign()).state;
      expect(m.report.phaseReport({ ...st, meta: { ...st.meta, locale: undefined } }, 99)).toBe('Phase 99 does not exist.');
    } finally {
      m.db.db().prepare("DELETE FROM settings WHERE key = 'defaultLocale'").run();
    }
    const de = m.campaigns.createCampaign({ name: 'Ohne', intro: '', phaseCount: 3, allianceCount: 2 });
    expect(m.campaigns.currentState(de).state.meta.locale).toBeUndefined();
  });
});

describe('Abmeldelink', () => {
  it('nimmt nur bekannte Kategorien an', () => {
    expect(m.notify.unsubscribeCategories('ALL')).toEqual(['PHASE', 'RESULTS', 'DEADLINES', 'PERSONAL']);
    expect(m.notify.unsubscribeCategories('PHASE')).toEqual(['PHASE']);
    expect(m.notify.unsubscribeCategories('__proto__')).toBeNull();
    expect(m.notify.unsubscribeCategories('EVIL')).toBeNull();
    expect(m.notify.unsubscribeCategories(undefined)).toBeNull();
  });
});
