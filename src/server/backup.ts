import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { db, tx, UPLOAD_DIR } from './db';
import { checkImportedHistory, currentState, insertImportedCampaign, listRevisions, newCampaignId, prepareImportedState, setPublicEnabled, type ImportedHistory } from './campaigns';
import { audit, auditForCampaign } from './audit';
import type { CampaignState } from '@/engine/types';
import { referencedUploadIds } from '@/engine/uploads';

const ID_RE = /^[A-Za-z0-9_-]{8,40}$/;
const KINDS = new Set(['AVATAR', 'ALLIANCE_LOGO', 'BATTLE_PHOTO', 'LORE_IMAGE', 'PLANET_PORTRAIT', 'PLANET_LANDSCAPE']);
/** Obergrenzen für die Historie im Backup: Revisionen und entpackte Größe aller Zustände */
export const HISTORY_MAX_REVISIONS = 20_000;
export const HISTORY_MAX_BYTES = 300 * 1024 * 1024;
const str = (v: unknown, max = 2000): string | null => (typeof v === 'string' ? v.slice(0, max) : null);

interface BackupRevision {
  number: number;
  parent: number | null;
  command: unknown;
  summary: string;
  log: string[];
  isOverride: boolean;
  reason: string | null;
  undone: boolean;
  active?: boolean;
  createdAt: string;
  author: string | null;
  /** nur im JSON-Backup: Zustand dieser Revision */
  state?: unknown;
}

/**
 * Historie aus einem Backup lesen: Metadaten aus backup.json bzw. der JSON-Datei, Zustände aus
 * `revisions/<n>.json` (ZIP) oder direkt aus `revisions[i].state` (JSON-Backup).
 * Fehlt etwas oder ist ein Zustand ungültig, wird nur der aktuelle Stand importiert (Hinweis im Log).
 */
function readHistory(
  json: { revisions?: unknown; currentRevision?: unknown; snapshots?: unknown },
  hasState: (r: BackupRevision) => boolean,
  stateOf: (r: BackupRevision) => unknown,
): { history: ImportedHistory | null; note: string | null } {
  const metas = Array.isArray(json.revisions) ? (json.revisions as BackupRevision[]) : [];
  if (!metas.length) return { history: null, note: null };
  if (!metas.every((r) => r && typeof r === 'object' && hasState(r))) return { history: null, note: 'Historie nicht übernommen: Zustände fehlen im Backup' };
  if (metas.length > HISTORY_MAX_REVISIONS) return { history: null, note: 'Historie nicht übernommen: zu viele Revisionen' };
  try {
    const active = metas.filter((r) => r.active).map((r) => r.number);
    const current = typeof json.currentRevision === 'number' ? json.currentRevision : active.length ? Math.max(...active) : Math.max(...metas.map((r) => r.number));
    const history: ImportedHistory = {
      current,
      revisions: metas.map((r) => ({
        number: r.number,
        parent: typeof r.parent === 'number' ? r.parent : null,
        command: r.command ?? null,
        state: prepareImportedState(stateOf(r)),
        summary: str(r.summary) ?? '',
        log: Array.isArray(r.log) ? r.log.filter((l): l is string => typeof l === 'string').map((l) => l.slice(0, 2000)) : [],
        isOverride: !!r.isOverride,
        reason: str(r.reason),
        undone: !!r.undone,
        createdAt: str(r.createdAt, 40) ?? new Date().toISOString(),
        author: str(r.author, 100),
      })),
      snapshots: (Array.isArray(json.snapshots) ? (json.snapshots as { phase: number; revision: number }[]) : [])
        .filter((x) => x && typeof x === 'object')
        .map((x) => ({ phase: Number(x.phase), revision: Number(x.revision) })),
    };
    const err = checkImportedHistory(history);
    return err ? { history: null, note: `Historie nicht übernommen: ${err}` } : { history, note: null };
  } catch (e) {
    return { history: null, note: `Historie nicht übernommen: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Protokolleinträge aus dem Backup (N5.2) unter der neuen Kampagnen-ID übernehmen */
function readAudit(json: { audit?: unknown }): { at: string; author: string; action: string; detail: string | null }[] {
  if (!Array.isArray(json.audit)) return [];
  return (json.audit as Record<string, unknown>[])
    .filter((a) => a && typeof a === 'object' && typeof a.action === 'string' && typeof a.author === 'string' && typeof a.at === 'string')
    .slice(-5000)
    .map((a) => ({ at: str(a.at, 40)!, author: str(a.author, 100)!, action: str(a.action, 200)!, detail: str(a.detail, 500) }));
}

/** Standardname einer importierten Kopie: „<Name> (Kopie TT.MM.JJJJ)“ */
export function copyName(original: string, now = new Date()): string {
  const d = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
  return `${original.replace(/ \(Kopie \d{2}\.\d{2}\.\d{4}\)$/, '')} (Kopie ${d})`.slice(0, 200);
}

export interface UploadMeta {
  id: string;
  kind: string;
  width: number | null;
  height: number | null;
  created_at: string;
}

/** Uploads für das ZIP-Backup: alle referenzierten, unabhängig von der Herkunftskampagne */
export function uploadsForBackup(state: CampaignState, extraIds: Iterable<string> = []): { meta: UploadMeta; main: Buffer; thumb: Buffer | null }[] {
  const out: { meta: UploadMeta; main: Buffer; thumb: Buffer | null }[] = [];
  for (const id of new Set([...referencedUploadIds(state), ...extraIds])) {
    const row = db().prepare('SELECT id, kind, file, thumb, width, height, created_at FROM upload WHERE id = ?').get(id) as (UploadMeta & { file: string; thumb: string | null }) | undefined;
    if (!row) continue;
    try {
      const main = fs.readFileSync(path.resolve(UPLOAD_DIR, row.file));
      let thumb: Buffer | null = null;
      try {
        thumb = row.thumb ? fs.readFileSync(path.resolve(UPLOAD_DIR, row.thumb)) : null;
      } catch {}
      out.push({ meta: { id: row.id, kind: row.kind, width: row.width, height: row.height, created_at: row.created_at }, main, thumb });
    } catch {
      // Datei fehlt auf der Platte – überspringen
    }
  }
  return out;
}

/**
 * Importiert ein JSON- oder ZIP-Backup als neue Kampagne. Alles wird vorab geprüft; Datenbank-
 * Einträge entstehen in einer Transaktion. Bei einem Fehler bleibt nichts zurück (auch keine Dateien).
 */
/** `publicEnabled: false` legt die Kampagne mit ausgeschalteter Leseansicht an (Wiederherstellung, F4) */
export function importBackup(bytes: Uint8Array, name?: string, opts: { author?: string | null; action?: string; detail?: string | null; publicEnabled?: boolean } = {}): string {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  let json: { state?: unknown; revisions?: unknown; currentRevision?: unknown; snapshots?: unknown; audit?: unknown };
  let history: ImportedHistory | null = null;
  let note: string | null = null;
  let images: { meta: UploadMeta; main: Uint8Array; thumb: Uint8Array | null }[] = [];
  if (isZip) {
    let files: Record<string, Uint8Array>;
    try {
      // Schutz vor ZIP-Bomben: entpackte Größe begrenzen, bevor entpackt wird
      let total = 0;
      files = unzipSync(bytes, {
        filter: (f) => {
          total += f.originalSize;
          if (f.originalSize > 60 * 1024 * 1024 || total > 600 * 1024 * 1024) throw new Error('Backup entpackt zu groß');
          return true;
        },
      });
    } catch (e) {
      throw new Error(e instanceof Error && e.message === 'Backup entpackt zu groß' ? e.message : 'ZIP-Datei ist beschädigt');
    }
    if (!files['backup.json']) throw new Error('backup.json fehlt im ZIP');
    json = JSON.parse(strFromU8(files['backup.json']));
    ({ history, note } = readHistory(
      json,
      (r) => !!files[`revisions/${r.number}.json`],
      (r) => JSON.parse(strFromU8(files[`revisions/${r.number}.json`])),
    ));
    const manifest: unknown = files['uploads.json'] ? JSON.parse(strFromU8(files['uploads.json'])) : [];
    if (!Array.isArray(manifest)) throw new Error('uploads.json ist ungültig');
    images = manifest
      .filter((r): r is UploadMeta => !!r && typeof r === 'object' && typeof (r as UploadMeta).id === 'string' && ID_RE.test((r as UploadMeta).id))
      .filter((r) => files[`uploads/${r.id}.webp`])
      .map((r) => ({
        meta: {
          id: r.id,
          kind: KINDS.has(r.kind) ? r.kind : 'LORE_IMAGE',
          width: Number.isFinite(r.width) ? r.width : null,
          height: Number.isFinite(r.height) ? r.height : null,
          created_at: typeof r.created_at === 'string' ? r.created_at : new Date().toISOString(),
        },
        main: files[`uploads/${r.id}.webp`],
        thumb: files[`uploads/${r.id}_t.webp`] ?? null,
      }));
  } else {
    json = JSON.parse(strFromU8(bytes));
    // B3: JSON-Backups mit Zuständen je Revision behalten die Historie wie ein ZIP-Backup
    if (json.state)
      ({ history, note } = readHistory(
        json,
        (r) => !!r.state && typeof r.state === 'object',
        (r) => r.state,
      ));
  }
  const state = prepareImportedState(json.state ?? json);
  // Ohne Namensangabe: „<Name> (Kopie <Datum>)“, damit Original und Kopie unterscheidbar bleiben
  state.meta.name = name?.trim() || copyName(state.meta.name);
  const id = newCampaignId();
  const dir = path.join(UPLOAD_DIR, id);
  const written: string[] = [];
  try {
    const fresh = images.filter((i) => !db().prepare('SELECT 1 FROM upload WHERE id = ?').get(i.meta.id));
    if (fresh.length) fs.mkdirSync(dir, { recursive: true });
    const rows = fresh.map((i) => {
      const f1 = path.join(dir, `${i.meta.id}.webp`);
      fs.writeFileSync(f1, i.main);
      written.push(f1);
      let f2: string | null = null;
      if (i.thumb) {
        f2 = path.join(dir, `${i.meta.id}_t.webp`);
        fs.writeFileSync(f2, i.thumb);
        written.push(f2);
      }
      return { ...i.meta, file: path.relative(UPLOAD_DIR, f1), thumb: f2 ? path.relative(UPLOAD_DIR, f2) : null, bytes: i.main.length };
    });
    const oldAudit = readAudit(json);
    tx(() => {
      insertImportedCampaign(state, id, history, opts.author ? `SL: ${opts.author}` : null, note);
      if (opts.publicEnabled === false) setPublicEnabled(id, false);
      for (const a of oldAudit) audit(a.author, a.action, a.detail, id, a.at);
      if (opts.author) audit(opts.author, opts.action ?? 'Backup importiert', opts.detail ?? null, id);
      const ins = db().prepare('INSERT INTO upload(id, campaign_id, kind, file, thumb, mime, width, height, bytes, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
      for (const r of rows) ins.run(r.id, id, r.kind, r.file, r.thumb, 'image/webp', r.width, r.height, r.bytes, r.created_at);
    });
    return id;
  } catch (e) {
    for (const f of written) fs.rmSync(f, { force: true });
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}

/** Gemeinsamer Inhalt von ZIP- und JSON-Backup: Stand, Metadaten der Revisionen, Snapshots, Protokoll */
function backupBody(id: string, data: ReturnType<typeof currentState>, withRevisions: boolean) {
  return {
    format: 'vespator-campaign-backup',
    exportedAt: new Date().toISOString(),
    campaign: { id, name: data.row.name, createdAt: data.row.created_at },
    state: data.state,
    currentRevision: data.row.current_rev,
    snapshots: withRevisions ? (db().prepare('SELECT phase, revision FROM snapshot WHERE campaign_id = ? ORDER BY phase, revision').all(id) as { phase: number; revision: number }[]) : undefined,
    audit: auditForCampaign(id).map((a) => ({ at: a.at, author: a.author, action: a.action, detail: a.detail })),
    revisions: withRevisions
      ? listRevisions(id).map((r) => ({
          number: r.number,
          parent: r.parent_number,
          command: JSON.parse(r.command),
          summary: r.summary,
          log: JSON.parse(r.log),
          isOverride: !!r.is_override,
          reason: r.reason,
          undone: !!r.undone,
          active: r.active,
          createdAt: r.created_at,
          author: r.author,
        }))
      : undefined,
  };
}

/**
 * JSON-Backup (B3): mit Historie enthält jede Revision ihren Zustand, damit ein Import Log, Zeitreise und
 * Zeitraffer behält – wie beim ZIP. Wird die Historie zu groß, fehlen die Zustände (Import dann nur mit Stand).
 */
export function buildBackupJson(id: string, withRevisions = true): { json: string; filename: string } {
  const data = currentState(id);
  const body = backupBody(id, data, withRevisions);
  let text: string;
  if (body.revisions) {
    const states = new Map<number, string>();
    let total = 0;
    for (const r of db().prepare('SELECT number, state FROM revision WHERE campaign_id = ? ORDER BY number').iterate(id) as Iterable<{ number: number; state: string }>) {
      total += r.state.length;
      if (total > HISTORY_MAX_BYTES) {
        states.clear();
        break;
      }
      states.set(r.number, r.state);
    }
    // Zustände roh einsetzen statt neu zu parsen – kompakt, weil die Datei sonst sehr groß wird
    const revs = body.revisions.map((r) => {
      const meta = JSON.stringify(r);
      const st = states.get(r.number);
      return st ? `${meta.slice(0, -1)},"state":${st}}` : meta;
    });
    text = JSON.stringify({ ...body, revisions: '__REVS__' }).replace('"__REVS__"', () => `[${revs.join(',')}]`);
  } else {
    text = JSON.stringify(body, null, 2);
  }
  const slug =
    data.row.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'kampagne';
  return { json: text, filename: `campaign-${slug}-${new Date().toISOString().slice(0, 10)}.json` };
}

/** Vollständiges Backup einer Kampagne als ZIP (Stand, Historie, Bilder) */
export function buildBackupZip(id: string, withRevisions = true): { zip: Uint8Array; filename: string; name: string } {
  const data = currentState(id);
  // Zustände aller Revisionen (komprimiert) – damit eine Wiederherstellung die Zeitleiste behält
  const states: Record<string, [Uint8Array, { level: 6 }]> = {};
  let historyStates = false;
  const historyUploads = new Set<string>();
  if (withRevisions) {
    let total = 0;
    historyStates = true;
    for (const r of db().prepare('SELECT number, state FROM revision WHERE campaign_id = ? ORDER BY number').iterate(id) as Iterable<{ number: number; state: string }>) {
      total += r.state.length;
      if (total > HISTORY_MAX_BYTES) {
        historyStates = false;
        break;
      }
      states[`revisions/${r.number}.json`] = [strToU8(r.state), { level: 6 }];
      // Bilder älterer Stände mitsichern – Codex und Zeitraffer zeigen sie weiterhin
      try {
        for (const u of referencedUploadIds(JSON.parse(r.state) as CampaignState)) historyUploads.add(u);
      } catch {}
    }
  }
  const body = backupBody(id, data, withRevisions);
  const files: Record<string, Uint8Array | [Uint8Array, { level: 6 }]> = { 'backup.json': [strToU8(JSON.stringify(body)), { level: 6 }], ...(historyStates ? states : {}) };
  const manifest = [];
  for (const u of uploadsForBackup(data.state, historyStates ? historyUploads : [])) {
    files[`uploads/${u.meta.id}.webp`] = u.main;
    if (u.thumb) files[`uploads/${u.meta.id}_t.webp`] = u.thumb;
    manifest.push(u.meta);
  }
  files['uploads.json'] = strToU8(JSON.stringify(manifest));
  const slug =
    data.row.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'kampagne';
  return { zip: zipSync(files, { level: 0 }), filename: `campaign-${slug}-${new Date().toISOString().slice(0, 10)}.zip`, name: data.row.name };
}
