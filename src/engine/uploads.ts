import type { CampaignState } from './types';

const ID_RE = /^[A-Za-z0-9_-]{8,40}$/;

/** Alle Upload-IDs, die ein Kampagnenzustand verwendet (Felder und Bild-Links in Texten) */
export function referencedUploadIds(state: CampaignState): string[] {
  const ids = new Set<string>();
  for (const p of state.players) {
    if (p.avatar) ids.add(p.avatar);
    if (p.commander?.portrait) ids.add(p.commander.portrait);
  }
  for (const a of state.alliances) if (a.logo) ids.add(a.logo);
  // A8: Gelände-Layouts
  for (const l of state.meta.terrainLayouts ?? []) if (l.image) ids.add(l.image);
  // NTH2 4.2: eigene Planetenbilder; D5: Fotos der Bemal-Chronik; 4.3: Bild der Phase
  for (const p of state.planets) for (const id of [p.portrait, p.landscape]) if (id) ids.add(id);
  for (const p of state.players) for (const h of p.hobby ?? []) if (h.photo) ids.add(h.photo);
  for (const ph of state.phases) if (ph.photo?.uploadId) ids.add(ph.photo.uploadId);
  for (const b of state.battles) {
    for (const ph of b.photos) ids.add(ph);
    for (const g of b.games ?? []) for (const ph of g.photos ?? []) ids.add(ph);
  }
  for (const m of JSON.stringify(state).matchAll(/\/api\/uploads\/([A-Za-z0-9_-]{8,40})/g)) ids.add(m[1]);
  return [...ids].filter((id) => ID_RE.test(id));
}
