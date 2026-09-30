import 'server-only';
import crypto from 'node:crypto';
import { db } from './db';
import { validateMap, type MapDef } from '@/engine/map';

/** Gespeicherte eigene Karten als Vorlagen (N5.5) */
export function listMapTemplates(): { id: string; name: string; map: MapDef }[] {
  const rows = db().prepare('SELECT id, name, json FROM map_template ORDER BY name').all() as { id: string; name: string; json: string }[];
  return rows.map((r) => ({ id: r.id, name: r.name, map: JSON.parse(r.json) as MapDef }));
}

export function saveMapTemplate(map: MapDef, mayOverwrite = true): string {
  const errors = validateMap(map);
  if (errors.length) throw new Error(errors.join(' '));
  const clean: MapDef = { name: map.name.trim(), template: null, background: map.background ?? null, planets: map.planets, connections: map.connections };
  const existing = db().prepare('SELECT id FROM map_template WHERE name = ?').get(clean.name) as { id: string } | undefined;
  if (existing && !mayOverwrite) throw new Error('Eine Vorlage mit diesem Namen existiert bereits – nur Admins dürfen sie überschreiben.');
  const id = existing?.id ?? crypto.randomBytes(8).toString('base64url');
  db()
    .prepare('INSERT INTO map_template(id, name, json, created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, json = excluded.json')
    .run(id, clean.name, JSON.stringify(clean), new Date().toISOString());
  return id;
}

export function deleteMapTemplate(id: string) {
  db().prepare('DELETE FROM map_template WHERE id = ?').run(id);
}
