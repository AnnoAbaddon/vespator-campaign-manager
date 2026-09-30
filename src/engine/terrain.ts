import { THEATRES } from './data/vespator';
import { fail, log, type Ctx } from './ctx';
import { planetDef } from './map';
import { allMissions } from './missions';
import { missionKey } from './missionPool';
import type { Battle, CampaignState, TerrainLayout } from './types';

/**
 * Gelände-Layouts je Theatre bzw. Mission (A8): Der Warmaster hinterlegt ein Bild (Upload), einen Link und
 * eine Beschreibung. Das Briefing zeigt das passendste Layout: Mission und Theatre > nur Mission > nur Theatre.
 */

export const MAX_LAYOUTS = 40;

const safeLink = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());

export function setTerrainLayouts(ctx: Ctx, layouts: TerrainLayout[]) {
  const st = ctx.state;
  if (layouts.length > MAX_LAYOUTS) fail(`Höchstens ${MAX_LAYOUTS} Gelände-Layouts`);
  const ids = new Set<string>();
  const missions = allMissions(st);
  const clean = layouts.map((l) => {
    if (!l.id || ids.has(l.id)) fail('Gelände-Layout ohne eindeutige ID');
    ids.add(l.id);
    if (!l.theatre && !l.missionId) fail('Gelände-Layout braucht ein Theatre oder eine Mission');
    if (l.theatre && !THEATRES[l.theatre]) fail('Unbekanntes Theatre');
    if (l.missionId && !missions.some((m) => m.id === l.missionId)) fail('Mission ist nicht in der Missionsliste');
    const link = (l.link ?? '').trim();
    if (link && !safeLink(link)) fail('Link muss mit http:// oder https:// beginnen');
    if (!l.image && !link && !(l.note ?? '').trim()) fail('Gelände-Layout braucht ein Bild, einen Link oder eine Beschreibung');
    return { id: l.id, theatre: l.theatre ?? null, missionId: l.missionId ?? null, title: (l.title ?? '').trim().slice(0, 80), image: l.image ?? null, link: link.slice(0, 500), note: (l.note ?? '').slice(0, 2000) };
  });
  st.meta.terrainLayouts = clean;
  log(ctx, 'Gelände-Layouts aktualisiert');
}

/** Passende Layouts einer Schlacht, spezifischstes zuerst. Ohne gewähltes Theatre: alle Theatres des Planeten */
export function layoutsFor(state: Pick<CampaignState, 'meta'>, b: Pick<Battle, 'mission' | 'attackType' | 'theatre' | 'planetId'>): TerrainLayout[] {
  const all = state.meta.terrainLayouts ?? [];
  if (!all.length) return [];
  const key = missionKey(b);
  const theatres = b.theatre ? [b.theatre] : b.planetId ? (planetDef(b.planetId)?.theatres ?? []) : [];
  const score = (l: TerrainLayout) => (l.missionId ? 2 : 0) + (l.theatre ? 1 : 0);
  return all.filter((l) => (!l.missionId || l.missionId === key) && (!l.theatre || theatres.includes(l.theatre))).sort((x, y) => score(y) - score(x));
}
