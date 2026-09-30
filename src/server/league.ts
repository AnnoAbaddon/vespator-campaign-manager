import 'server-only';
import crypto from 'node:crypto';
import { db } from './db';
import { listCampaigns } from './campaigns';
import { listedCampaigns } from './publicList';
import { toPublicView } from '@/engine/publicView';
import { cleanConfig, emptySeason, seasonStandings, type SeasonCampaign, type SeasonData } from './leagueCompute';

/**
 * Liga (NTH2 3.1): Saisons in einer eigenen Tabelle (Name, öffentliches Token, Daten als JSON).
 * Die Tabelle wird bei Bedarf angelegt, damit ältere Datenbanken ohne Migration weiterlaufen.
 */
let ready = false;
function ensure() {
  if (ready) return;
  db().exec('CREATE TABLE IF NOT EXISTS season (id TEXT PRIMARY KEY, name TEXT NOT NULL, token TEXT NOT NULL UNIQUE, json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
  ready = true;
}

export interface SeasonRow {
  id: string;
  name: string;
  token: string;
  data: SeasonData;
  created_at: string;
  updated_at: string;
}

function parse(r: { id: string; name: string; token: string; json: string; created_at: string; updated_at: string }): SeasonRow {
  let data: SeasonData;
  try {
    data = { ...emptySeason(), ...(JSON.parse(r.json) as Partial<SeasonData>) };
  } catch {
    data = emptySeason();
  }
  return { id: r.id, name: r.name, token: r.token, data, created_at: r.created_at, updated_at: r.updated_at };
}

export function listSeasons(): SeasonRow[] {
  ensure();
  return (db().prepare('SELECT * FROM season ORDER BY created_at DESC').all() as Parameters<typeof parse>[0][]).map(parse);
}

export function getSeason(id: string): SeasonRow | null {
  ensure();
  const r = db().prepare('SELECT * FROM season WHERE id = ?').get(id) as Parameters<typeof parse>[0] | undefined;
  return r ? parse(r) : null;
}

export function seasonByToken(token: string): SeasonRow | null {
  ensure();
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
  const rows = db().prepare('SELECT * FROM season').all() as Parameters<typeof parse>[0][];
  // Vergleich in konstanter Zeit
  const hit = rows.find((r) => r.token.length === token.length && crypto.timingSafeEqual(Buffer.from(r.token), Buffer.from(token)));
  return hit ? parse(hit) : null;
}

export function createSeason(name: string): string {
  ensure();
  const id = crypto.randomBytes(9).toString('base64url');
  const now = new Date().toISOString();
  db()
    .prepare('INSERT INTO season(id, name, token, json, created_at, updated_at) VALUES(?,?,?,?,?,?)')
    .run(id, name.trim().slice(0, 80), crypto.randomBytes(24).toString('base64url'), JSON.stringify(emptySeason()), now, now);
  return id;
}

export function updateSeason(id: string, patch: { name?: string; data?: Partial<SeasonData> }) {
  const cur = getSeason(id);
  if (!cur) throw new Error('Saison nicht gefunden');
  const d = { ...cur.data, ...(patch.data ?? {}) };
  const known = new Set(listCampaigns().map((c) => c.id));
  const data: SeasonData = {
    campaignIds: [...new Set(d.campaignIds)].filter((c) => known.has(c)).slice(0, 50),
    config: cleanConfig(d.config),
    identity: Object.fromEntries(
      Object.entries(d.identity ?? {})
        .filter(([k, v]) => /^[\w-]+:[\w-]+$/.test(k) && typeof v === 'string' && v.trim())
        .map(([k, v]) => [k, v.trim().toLowerCase().slice(0, 60)]),
    ),
    names: Object.fromEntries(
      Object.entries(d.names ?? {})
        .filter(([, v]) => typeof v === 'string' && v.trim())
        .map(([k, v]) => [k.slice(0, 60), v.trim().slice(0, 60)]),
    ),
    public: d.public !== false,
    note: String(d.note ?? '').slice(0, 2000),
  };
  db()
    .prepare('UPDATE season SET name = ?, json = ?, updated_at = ? WHERE id = ?')
    .run((patch.name ?? cur.name).trim().slice(0, 80) || cur.name, JSON.stringify(data), new Date().toISOString(), id);
}

export function regenerateSeasonToken(id: string) {
  ensure();
  db().prepare('UPDATE season SET token = ? WHERE id = ?').run(crypto.randomBytes(24).toString('base64url'), id);
}

export function deleteSeason(id: string) {
  ensure();
  db().prepare('DELETE FROM season WHERE id = ?').run(id);
}

/**
 * Kampagnen einer Saison. `pub`: nur öffentlich gelistete Kampagnen (Leseansicht an, keine Sandbox – dieselbe Regel wie
 * die Hall of Fame, F5) als öffentliche Projektion (keine Kontaktdaten, Nebel beachtet) – für die Ruhmeshalle; die
 * Rangliste nutzt nur öffentliche Daten (Schlachten, Medaillen, Ehrungen, Sieger).
 */
export function seasonCampaigns(s: SeasonRow, pub = false): SeasonCampaign[] {
  const byId = new Map((pub ? listedCampaigns() : listCampaigns()).map((c) => [c.id, c]));
  return s.data.campaignIds
    .map((id) => byId.get(id))
    .filter((c): c is NonNullable<typeof c> => !!c && !c.broken)
    .map((c) => ({ id: c.id, name: c.state.meta.name, state: pub ? toPublicView(c.state) : c.state }));
}

export function seasonStandingsFor(s: SeasonRow, pub = false) {
  return seasonStandings(s.data, seasonCampaigns(s, pub));
}
