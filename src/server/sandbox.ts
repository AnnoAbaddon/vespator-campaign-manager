import 'server-only';
import { db, tx } from './db';
import { getCampaign, listRevisionChain, listRevisions, loadState, newCampaignId, newToken } from './campaigns';
import { notifyChange } from './notify';
import { purgeCampaignData } from './cleanup';
import { validateState } from '@/engine/schema';
import type { CampaignState } from '@/engine/types';

/**
 * Szenario-Sandbox (NTH2 2.1): eine Kopie der Kampagne mit eigenen Revisionen. Dort lassen sich Befehle, Würfe
 * und (erzwungene) Ereignisse durchspielen. Danach wird die Sandbox verworfen oder bewusst übernommen:
 * Die Schritte der Sandbox werden als Revisionen an die Originalkampagne angehängt (Log, Codex und Zeitraffer
 * bleiben vollständig), abgeschlossen von der Revision „Sandbox übernommen“ (Override mit Begründung).
 * Ein Undo dieser Revision springt in einem Schritt auf den Stand vor der Übernahme zurück.
 * Sandboxes haben keine Leseansicht, benachrichtigen niemanden und werden nicht gesichert.
 */

export const SANDBOX_SUFFIX = ' (Sandbox)';

export interface SandboxInfo {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Revision der Originalkampagne beim Anlegen */
  baseRev: number;
  /** Zahl der Schritte in der Sandbox (aktiver Zweig ohne die Anlage) */
  steps: number;
}

const insRev = () => db().prepare('INSERT INTO revision(campaign_id, number, parent_number, command, state, summary, log, is_override, reason, undone, created_at, author) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');

/** Legt eine Sandbox als Kopie des aktuellen Stands an; liefert ihre ID */
export function createSandbox(originalId: string, author: string | null): string {
  return tx(() => {
    const row = getCampaign(originalId);
    if (!row) throw new Error('Kampagne nicht gefunden');
    if (row.sandbox_of) throw new Error('Eine Sandbox kann keine weitere Sandbox anlegen');
    const state = structuredClone(loadState(originalId, row.current_rev));
    state.meta.sandbox = { of: originalId, baseRev: row.current_rev, originalName: state.meta.name };
    state.meta.name = `${state.meta.name}${SANDBOX_SUFFIX}`.slice(0, 200);
    const id = newCampaignId();
    const now = new Date().toISOString();
    db()
      .prepare('INSERT INTO campaign(id, name, public_token, public_enabled, current_rev, previous_campaign_id, created_at, updated_at, sandbox_of) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id, state.meta.name, newToken(), 0, 1, row.previous_campaign_id, now, now, originalId);
    const log = [`Sandbox aus „${row.name}“ angelegt (Revision ${row.current_rev})`];
    insRev().run(id, 1, null, JSON.stringify({ type: 'SANDBOX_CREATE', from: originalId, baseRev: row.current_rev }), JSON.stringify(state), log[0], JSON.stringify(log), 0, null, 0, now, author);
    return id;
  });
}

export function listSandboxes(originalId: string): SandboxInfo[] {
  const rows = db().prepare('SELECT id, name, current_rev, created_at, updated_at FROM campaign WHERE sandbox_of = ? ORDER BY created_at DESC').all(originalId) as {
    id: string;
    name: string;
    current_rev: number;
    created_at: string;
    updated_at: string;
  }[];
  return rows.map((r) => {
    let baseRev = 0;
    try {
      baseRev = loadState(r.id, 1).meta.sandbox?.baseRev ?? 0;
    } catch {}
    return { id: r.id, name: r.name, createdAt: r.created_at, updatedAt: r.updated_at, baseRev, steps: listRevisionChain(r.id).filter((x) => x.active && x.parent_number !== null).length };
  });
}

/** Aktive Revisionen einer Sandbox nach der Anlage, älteste zuerst */
function activeChain(id: string) {
  return listRevisions(id)
    .filter((r) => r.active && r.parent_number !== null)
    .sort((a, b) => a.number - b.number);
}

/** Sandbox verwerfen (löscht Kopie und Revisionen; die Originalkampagne bleibt unberührt) */
export function discardSandbox(id: string): { name: string; of: string } {
  const row = getCampaign(id);
  if (!row?.sandbox_of) throw new Error('Keine Sandbox');
  db().prepare('DELETE FROM campaign WHERE id = ? AND sandbox_of IS NOT NULL').run(id);
  // in der Sandbox hochgeladene Bilder und sonstige Restdaten entfernen
  purgeCampaignData([id]);
  return { name: row.name, of: row.sandbox_of };
}

/** Sandbox-Kennung entfernen und den ursprünglichen Namen wiederherstellen (sofern nicht in der Sandbox umbenannt) */
export function stripSandbox(s: CampaignState): CampaignState {
  const sb = s.meta.sandbox;
  if (!sb) return s;
  const out = structuredClone(s);
  delete out.meta.sandbox;
  if (out.meta.name === `${sb.originalName}${SANDBOX_SUFFIX}`.slice(0, 200)) out.meta.name = sb.originalName;
  return out;
}

export type ApplyResult = { ok: true; revision: number; originalId: string; steps: number } | { ok: false; error: string } | { ok: false; confirm: string };

/**
 * Sandbox übernehmen. Wurde das Original seit dem Anlegen geändert, fragt die Funktion zuerst nach
 * (confirmed): Diese Änderungen werden durch den Sandbox-Stand ersetzt, bleiben aber in der Historie.
 */
export function applySandbox(id: string, opts: { reason: string; confirmed?: boolean; author: string | null }): ApplyResult {
  if (!opts.reason.trim()) return { ok: false, error: 'Für die Übernahme ist eine Begründung Pflicht' };
  let notify: { originalId: string; rev: number; before: CampaignState; after: CampaignState } | null = null;
  const result = tx((): ApplyResult => {
    const sb = getCampaign(id);
    if (!sb?.sandbox_of) return { ok: false, error: 'Keine Sandbox' };
    const orig = getCampaign(sb.sandbox_of);
    if (!orig) return { ok: false, error: 'Originalkampagne nicht gefunden' };
    if (orig.archived) return { ok: false, error: 'Kampagne ist archiviert (schreibgeschützt)' };
    const created = loadState(id, 1).meta.sandbox;
    const chain = activeChain(id);
    if (!chain.length) return { ok: false, error: 'Die Sandbox enthält keine Änderungen' };
    if (created && orig.current_rev !== created.baseRev && !opts.confirmed) {
      return {
        ok: false,
        confirm: `Die Kampagne wurde seit dem Anlegen der Sandbox geändert (Revision ${created.baseRev} → ${orig.current_rev}). Diese Änderungen werden durch den Stand der Sandbox ersetzt (sie bleiben in der Historie, Undo ist möglich). Trotzdem übernehmen?`,
      };
    }
    const before = loadState(orig.id, orig.current_rev);
    const stateRows = new Map((db().prepare('SELECT number, state FROM revision WHERE campaign_id = ?').all(id) as { number: number; state: string }[]).map((r) => [r.number, r.state]));
    let number = (db().prepare('SELECT MAX(number) AS m FROM revision WHERE campaign_id = ?').get(orig.id) as { m: number }).m;
    let parent = orig.current_rev;
    const mapping = new Map<number, number>();
    const ins = insRev();
    let last: CampaignState | null = null;
    for (const r of chain) {
      const st = stripSandbox(JSON.parse(stateRows.get(r.number)!) as CampaignState);
      number++;
      ins.run(orig.id, number, parent, r.command, JSON.stringify(st), r.summary, r.log, r.is_override, r.reason, 0, r.created_at, r.author ? `${r.author} · Sandbox` : 'Sandbox');
      mapping.set(r.number, number);
      parent = number;
      last = st;
    }
    const err = validateState(last);
    if (err) throw new Error(`Ungültiger Sandbox-Stand – ${err}`);
    // Phasen-Snapshots der Sandbox übernehmen (Codex, Zeitraffer)
    const snaps = db().prepare('SELECT phase, revision FROM snapshot WHERE campaign_id = ?').all(id) as { phase: number; revision: number }[];
    const snapIns = db().prepare('INSERT INTO snapshot(campaign_id, phase, revision) VALUES(?,?,?)');
    for (const s of snaps) if (mapping.has(s.revision)) snapIns.run(orig.id, s.phase, mapping.get(s.revision)!);
    number++;
    const now = new Date().toISOString();
    const log = [`Sandbox „${sb.name}“ übernommen (${chain.length} Schritt(e))`, ...chain.map((r) => `Sandbox: ${r.summary.replace(/^⚠\s*/, '')}`)];
    ins.run(
      orig.id,
      number,
      parent,
      JSON.stringify({ type: 'SANDBOX_APPLY', sandboxId: id, baseRev: created?.baseRev ?? null, originalRev: orig.current_rev, steps: chain.length }),
      JSON.stringify(last),
      `⚠ ${log[0]}`,
      JSON.stringify(log),
      1,
      opts.reason.trim(),
      0,
      now,
      opts.author,
    );
    db().prepare('UPDATE campaign SET current_rev = ?, name = ?, updated_at = ? WHERE id = ?').run(number, last!.meta.name, now, orig.id);
    // Bilder, die in der Sandbox hochgeladen wurden, gehören jetzt zur Kampagne
    db().prepare('UPDATE upload SET campaign_id = ? WHERE campaign_id = ?').run(orig.id, id);
    db().prepare('DELETE FROM campaign WHERE id = ?').run(id);
    notify = { originalId: orig.id, rev: number, before, after: last! };
    return { ok: true, revision: number, originalId: orig.id, steps: chain.length };
  });
  // Benachrichtigungen erst nach dem Commit; ein Fehler lässt die Übernahme nie scheitern
  const n = notify as { originalId: string; rev: number; before: CampaignState; after: CampaignState } | null;
  if (n) {
    try {
      notifyChange(n.originalId, n.rev, n.before, n.after);
    } catch (e) {
      console.error('Benachrichtigung fehlgeschlagen', e);
    }
  }
  return result;
}
