import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { POLICY, can, type Action, type Principal, type PrincipalKind } from '@/server/authz';

/**
 * Architektur-Review S1: Jede Server Action (alle Exporte der "use server"-Dateien und die Inline-Actions der Seiten)
 * geht durch die zentrale Berechtigung, bevor sie irgendetwas anderes aus dem Server anfasst. Statische Prüfung:
 * In Ausführungsreihenfolge muss ein Aufruf aus `@/server/authz` (oder einer lokalen Hilfsfunktion, die selbst mit
 * authz beginnt) vor jedem Aufruf aus `@/server/*`, `@/app/actions/*` oder einer anderen lokalen Funktion stehen.
 */

const ROOT = path.resolve(import.meta.dirname, '../..');
const ALLOWED_BEFORE = new Set(['@/server/errors', '@/server/actionInput']);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const isUseServer = (s: ts.Statement | undefined) => !!s && ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression) && s.expression.text === 'use server';

interface Fn {
  name: string;
  body: ts.Block;
}

/** Aufrufe eines Knotens in Ausführungsreihenfolge (Argumente vor dem Aufruf selbst) */
function callsInOrder(node: ts.Node, out: string[] = []): string[] {
  ts.forEachChild(node, (c) => {
    callsInOrder(c, out);
  });
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) out.push(node.expression.text);
  return out;
}

/** Anweisungen eines Rumpfs; try-Blöcke werden aufgeklappt (ihr Inhalt läuft zuerst) */
function flat(stmts: readonly ts.Statement[]): ts.Statement[] {
  return stmts.flatMap((s) => (ts.isTryStatement(s) ? flat(s.tryBlock.statements) : [s]));
}

function analyse(file: string, text = fs.readFileSync(file, 'utf8')) {
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imports = new Map<string, string>();
  const locals = new Map<string, ts.Block>();
  const actions: Fn[] = [];
  const nonFunctionExports: string[] = [];
  const fileUseServer = isUseServer(src.statements[0]);

  const visit = (n: ts.Node) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const from = n.moduleSpecifier.text;
      const b = n.importClause?.namedBindings;
      if (b && ts.isNamedImports(b)) for (const el of b.elements) imports.set(el.name.text, from);
      if (n.importClause?.name) imports.set(n.importClause.name.text, from);
    }
    let name: string | null = null;
    let body: ts.Block | null = null;
    let exported = false;
    if (ts.isFunctionDeclaration(n) && n.name && n.body) {
      name = n.name.text;
      body = n.body;
      exported = !!n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    } else if (ts.isVariableStatement(n)) {
      exported = !!n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      for (const d of n.declarationList.declarations) {
        const init = d.initializer;
        if (ts.isIdentifier(d.name) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && ts.isBlock(init.body)) {
          locals.set(d.name.text, init.body);
          if (exported && fileUseServer) actions.push({ name: d.name.text, body: init.body });
        } else if (exported && fileUseServer && ts.isIdentifier(d.name)) nonFunctionExports.push(d.name.text);
      }
    }
    if (name && body) {
      locals.set(name, body);
      if ((exported && fileUseServer) || isUseServer(body.statements[0])) actions.push({ name, body });
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  return { src, imports, locals, actions, nonFunctionExports };
}

type Verdict = 'authz' | 'violation' | 'none';

function verdictOf(body: ts.Block, a: ReturnType<typeof analyse>, guards: Set<string>): { v: Verdict; first?: string } {
  for (const st of flat(body.statements)) {
    for (const call of callsInOrder(st)) {
      const from = a.imports.get(call);
      if (from === '@/server/authz' || guards.has(call)) return { v: 'authz', first: call };
      if (from && (from.startsWith('@/server/') || from.startsWith('@/app/actions/')) && !ALLOWED_BEFORE.has(from)) return { v: 'violation', first: call };
      if (!from && a.locals.has(call)) return { v: 'violation', first: call };
    }
  }
  return { v: 'none' };
}

function scan(sources?: Record<string, string>) {
  const files = sources ? Object.keys(sources) : [...walk(path.join(ROOT, 'src/app/actions')), ...walk(path.join(ROOT, 'src/app')).filter((f) => f.endsWith('.tsx'))];
  const results: { file: string; action: string; v: Verdict; first?: string }[] = [];
  const nonFunctions: string[] = [];
  for (const file of [...new Set(files)]) {
    const a = sources ? analyse(file, sources[file]) : analyse(file);
    if (!a.actions.length && !a.nonFunctionExports.length) continue;
    // lokale Hilfsfunktionen, die selbst mit authz beginnen, zählen als Prüfung (z. B. playerOwner in push.ts)
    const guards = new Set<string>();
    for (let changed = true; changed;) {
      changed = false;
      for (const [name, body] of a.locals)
        if (!guards.has(name) && verdictOf(body, a, guards).v === 'authz') {
          guards.add(name);
          changed = true;
        }
    }
    for (const fn of a.actions) results.push({ file: path.relative(ROOT, file).replace(/\\/g, '/'), action: fn.name, ...verdictOf(fn.body, a, new Set([...guards].filter((g) => g !== fn.name))) });
    nonFunctions.push(...a.nonFunctionExports.map((x) => `${path.relative(ROOT, file)}: ${x}`));
  }
  return { results, nonFunctions };
}

describe('S1: jede Server Action geht durch authz (statische Prüfung)', () => {
  const { results, nonFunctions } = scan();

  it('findet alle Actions (Dateien in src/app/actions und Inline-Actions der Seiten)', () => {
    expect(results.length).toBeGreaterThanOrEqual(60);
    expect(results.some((r) => r.file.startsWith('src/app/admin/') && r.action === 'manageFromList')).toBe(true);
    expect(nonFunctions).toEqual([]);
  });

  it('die Prüfung erkennt Verstöße (Gegenprobe mit erfundenem Code)', () => {
    const code = [
      "'use server';",
      "import { authorize } from '@/server/authz';",
      "import { getCampaign } from '@/server/campaigns';",
      "export async function vorher(id: string) { const row = getCampaign(id); await authorize('campaign.read', { campaignId: id }); return row; }",
      'export async function ohne(id: string) { return String(id); }',
      "export async function richtig(id: string) { try { await authorize('campaign.read', { campaignId: id }); return getCampaign(id); } catch { return null; } }",
      "export async function argumente(id: string) { return getCampaign(await authorize('account.self').then(() => id)); }",
      'export const WERT = 1;',
    ].join('\n');
    const r = scan({ [path.join(ROOT, 'src/app/actions/x.ts')]: code });
    expect(Object.fromEntries(r.results.map((x) => [x.action, x.v]))).toEqual({ vorher: 'violation', ohne: 'none', richtig: 'authz', argumente: 'authz' });
    expect(r.nonFunctions).toHaveLength(1);
  });

  it('keine Action berührt den Server vor der Berechtigungsprüfung', () => {
    const bad = results.filter((r) => r.v !== 'authz').map((r) => `${r.file} ${r.action}: ${r.v}${r.first ? ` (${r.first})` : ''}`);
    expect(bad).toEqual([]);
  });

  it('Seiten und Routen nutzen keine verstreuten Prüfungen mehr (auth.ts exportiert keine assert/require-Helfer)', async () => {
    const auth = await import('@/server/auth');
    for (const old of ['assertAdmin', 'assertCampaign', 'assertOwner', 'requireAdmin', 'requireCampaign', 'canCreateCampaign', 'uploadDenied', 'accessibleCampaignIds']) expect(old in auth).toBe(false);
    const offenders = walk(path.join(ROOT, 'src/app'))
      .filter((f) =>
        /\b(currentAdmin|canAccess|resolvePlayerToken|getCampaignByToken|checkCalendarKey|checkClubCalendarKey|checkUnsubscribe|checkInvite|seasonByToken|parseConfirmLink)\(/.test(fs.readFileSync(f, 'utf8')),
      )
      .map((f) => path.relative(ROOT, f).replace(/\\/g, '/'))
      // Anmeldeseite: nur Weiterleitung, wenn schon angemeldet (keine Berechtigung)
      .filter((f) => f !== 'src/app/login/page.tsx');
    expect(offenders).toEqual([]);
  });
});

describe('S1: Richtlinie – jede Zeile der Tabelle', () => {
  const CID = 'kampagne-1';
  const account = (role: 'ADMIN' | 'COWARMASTER') => ({ id: 1, username: 'x', role, locale: 'de' as const });
  const sample: Record<PrincipalKind, Principal> = {
    anonymous: { kind: 'anonymous' },
    owner: { kind: 'owner', account: account('ADMIN') },
    // Co-Warmaster ohne Freigabe: Kampagnen-Aktionen scheitern an der Ressourcenprüfung (siehe unten)
    cowarmaster: { kind: 'cowarmaster', account: account('COWARMASTER') },
    player: { kind: 'player', campaignId: CID, playerId: 'p', tokenHash: 'h', active: true, archived: false },
    viewer: { kind: 'viewer', campaignId: CID },
    confirm: { kind: 'confirm', campaignId: CID, playerId: 'p', battleId: 'b', active: true },
    discord: { kind: 'discord', campaignId: CID, playerId: 'p', user: 'u', active: true },
    calendar: { kind: 'calendar', campaignId: CID, playerId: 'p' },
    clubCalendar: { kind: 'clubCalendar' },
    hall: { kind: 'hall' },
    season: { kind: 'season', seasonId: 's' },
    unsubscribe: { kind: 'unsubscribe', campaignId: CID, playerId: 'p' },
    invite: { kind: 'invite', role: 'COWARMASTER', campaignIds: [] },
  };

  it.each(Object.keys(POLICY) as Action[])('%s: nur die genannten Principals', (action) => {
    const rule = POLICY[action] as { who: readonly PrincipalKind[]; campaign?: boolean; active?: boolean };
    for (const [kind, p] of Object.entries(sample) as [PrincipalKind, Principal][]) {
      const res = can(p, action, { campaignId: CID });
      // Co-Warmaster ohne Freigabe dürfen keine Kampagnen-Aktion (die Freigabe prüft canAccess in der Datenbank)
      const expectAllowed = rule.who.includes(kind) && !(kind === 'cowarmaster' && rule.campaign);
      expect(res === null, `${action} / ${kind}: ${res}`).toBe(expectAllowed);
    }
  });

  it('Links sind an ihre Kampagne gebunden, inaktive Spieler verlieren Schreib- und Allianzrechte', () => {
    const player = sample.player as Extract<Principal, { kind: 'player' }>;
    expect(can(player, 'player.command', { campaignId: 'andere' })).toBe('Kein Zugriff auf diese Kampagne');
    expect(can(sample.viewer, 'viewer.read', { campaignId: 'andere' })).toBe('Kein Zugriff auf diese Kampagne');
    const inactive = { ...player, active: false };
    expect(can(inactive, 'player.view', { campaignId: CID })).toBeNull();
    expect(can(inactive, 'player.allianceSecrets', { campaignId: CID })).toBe('Dein Spielerkonto ist inaktiv');
    expect(can(inactive, 'player.command', { campaignId: CID })).toBe('Dein Spielerkonto ist inaktiv');
    expect(can(inactive, 'player.upload', { campaignId: CID })).toBe('Dein Spielerkonto ist inaktiv');
    expect(can(null, 'account.self')).toBe('Nicht angemeldet');
    expect(can(sample.owner, 'campaign.read', { campaignId: 42 })).toBe('Ungültige Eingabe');
    expect(can(sample.cowarmaster, 'campaign.restore', { campaignId: CID })).toBe('Nur für Admins');
    expect(can(sample.cowarmaster, 'mail.test', { campaignId: CID })).toBe('Nur für Admins');
  });
});
