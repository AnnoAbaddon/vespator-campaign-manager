import 'server-only';
import crypto from 'node:crypto';
import { db } from './db';
import { currentState } from './campaigns';
import { extractTemplate, type CampaignTemplateData } from '@/engine/campaignTemplate';
import { validateMap } from '@/engine/map';

/** Kampagnen-Vorlagen (NTH2 2.6): gespeichert wie Kartenvorlagen, gleicher Name überschreibt (nur Admins) */
export interface CampaignTemplateInfo {
  id: string;
  name: string;
  createdAt: string;
  createdBy: string | null;
  phaseCount: number;
  allianceCount: 2 | 3;
  mapName: string;
}

export function listCampaignTemplates(): CampaignTemplateInfo[] {
  const rows = db().prepare('SELECT id, name, json, created_at, created_by FROM campaign_template ORDER BY name').all() as { id: string; name: string; json: string; created_at: string; created_by: string | null }[];
  const out: CampaignTemplateInfo[] = [];
  for (const r of rows) {
    try {
      const t = JSON.parse(r.json) as CampaignTemplateData;
      out.push({ id: r.id, name: r.name, createdAt: r.created_at, createdBy: r.created_by, phaseCount: t.meta.phaseCount, allianceCount: t.meta.allianceCount, mapName: t.map.name });
    } catch {
      // defekte Vorlage überspringen
    }
  }
  return out;
}

export function getCampaignTemplate(id: string): CampaignTemplateData | null {
  const r = db().prepare('SELECT json FROM campaign_template WHERE id = ?').get(id) as { json: string } | undefined;
  if (!r) return null;
  const t = JSON.parse(r.json) as CampaignTemplateData;
  if (t.version !== 1 || validateMap(t.map).length) throw new Error('Vorlage ist beschädigt');
  return t;
}

/** Stand einer Kampagne als Vorlage speichern; liefert die ID */
export function saveCampaignTemplate(campaignId: string, name: string, author: string | null, mayOverwrite: boolean): string {
  const clean = name.trim().slice(0, 120);
  if (!clean) throw new Error('Name fehlt');
  const tpl = extractTemplate(currentState(campaignId).state);
  const existing = db().prepare('SELECT id FROM campaign_template WHERE name = ?').get(clean) as { id: string } | undefined;
  if (existing && !mayOverwrite) throw new Error('Eine Vorlage mit diesem Namen existiert bereits – nur Admins dürfen sie überschreiben.');
  const id = existing?.id ?? crypto.randomBytes(8).toString('base64url');
  db()
    .prepare(
      'INSERT INTO campaign_template(id, name, json, created_at, created_by) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, created_at = excluded.created_at, created_by = excluded.created_by',
    )
    .run(id, clean, JSON.stringify(tpl), new Date().toISOString(), author);
  return id;
}

export function deleteCampaignTemplate(id: string): string | null {
  const r = db().prepare('SELECT name FROM campaign_template WHERE id = ?').get(id) as { name: string } | undefined;
  db().prepare('DELETE FROM campaign_template WHERE id = ?').run(id);
  return r?.name ?? null;
}
