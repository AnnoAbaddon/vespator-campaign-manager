import { forkMap, mapOf, type MapDef } from './map';
import type { CustomEffect, CustomEventDef } from './customEvents';
import type { CampaignState, RuleToggles } from './types';

/**
 * Kampagnen-Vorlagen (NTH2 2.6): Hausregeln und Schalter, Karte, Missionen, Spielgrößen, Phasenrhythmus und Texte
 * einer Kampagne als Vorlage für neue Kampagnen. Spieler, Flotten, Zustand der Planeten und Verlauf gehören nicht dazu.
 */
export interface CampaignTemplateData {
  version: 1;
  /** Stammdaten ohne Name, Anlagedatum und Sandbox-Kennung (auch Felder künftiger Erweiterungen) */
  meta: Omit<CampaignState['meta'], 'name' | 'createdAt' | 'sandbox'>;
  toggles: RuleToggles;
  map: MapDef;
  /** Allianzen mit Name, Farbe, Wappen und Text (IDs bleiben, damit eigene Ereignisse passen) */
  alliances: { id: string; name: string; color: string; logo: string | null; emblem: string | null; lore: string }[];
  /** Planetentexte je Planet (öffentliche Lore, nicht die SL-Notizen) */
  planetLore: Record<string, string>;
  /** Dispatches (Texte) */
  dispatches: { title: string; body: string; pinned: boolean; public: boolean }[];
  customEvents: CustomEventDef[];
}

const DAY = 24 * 3600_000;

/** Rhythmus der ersten Phase mit vollständigen Terminen, sonst der schon gespeicherte */
function rhythmOf(st: CampaignState): CampaignState['meta']['rhythm'] {
  for (const ph of st.phases) {
    if (!ph.startDate) continue;
    const s = new Date(ph.startDate).getTime();
    const d = (x: string | null) => (x ? new Date(x).getTime() - s : NaN);
    const r = { ops: d(ph.opsDeadline), battles: d(ph.battlesDeadline), end: d(ph.endDate) };
    if (Object.values(r).every((x) => Number.isFinite(x) && x > 0 && x < 365 * DAY)) return r;
  }
  return st.meta.rhythm;
}

export function extractTemplate(st: CampaignState): CampaignTemplateData {
  const meta = structuredClone(st.meta) as CampaignState['meta'];
  const rhythm = rhythmOf(st);
  const { name: _n, createdAt: _c, sandbox: _s, ...rest } = meta;
  void _n;
  void _c;
  void _s;
  return {
    version: 1,
    meta: { ...rest, ...(rhythm ? { rhythm } : {}) },
    toggles: structuredClone(st.toggles),
    map: structuredClone(mapOf(st)),
    alliances: st.alliances.map((a) => ({ id: a.id, name: a.name, color: a.color, logo: a.logo, emblem: a.emblem ?? null, lore: a.lore })),
    planetLore: Object.fromEntries(st.planets.filter((p) => p.lore.trim()).map((p) => [p.id, p.lore])),
    dispatches: st.dispatches.map((d) => ({ title: d.title, body: d.body, pinned: d.pinned, public: d.public })),
    customEvents: structuredClone(st.customEvents ?? []),
  };
}

/** Karte der Vorlage für eine neue Kampagne: eigene Karten bekommen frische Planeten-IDs (wie Kartenvorlagen, N5.5) */
export function templateMap(tpl: CampaignTemplateData, suffix?: () => string): { map: MapDef; rename: Record<string, string> } {
  if (tpl.map.template === 'vespator') return { map: structuredClone(tpl.map), rename: {} };
  return forkMap(tpl.map, suffix);
}

/**
 * Überträgt eine Vorlage auf einen frisch angelegten Zustand (Setup W0). `rename` stammt aus templateMap.
 * Allianzen werden nur übernommen, wenn ihre Zahl passt; Bezüge eigener Ereignisse auf fehlende Allianzen werden
 * zur Ziel-Allianz, Einplanungen jenseits der Phasenzahl entfallen.
 */
export function applyTemplate(st: CampaignState, tpl: CampaignTemplateData, rename: Record<string, string>, now: string, newId: (p: string) => string): CampaignState {
  const s = structuredClone(st);
  const ren = (id: string) => rename[id] ?? id;
  const { phaseCount, allianceCount, ...meta } = structuredClone(tpl.meta);
  void phaseCount;
  void allianceCount;
  s.meta = { ...s.meta, ...meta, name: s.meta.name, createdAt: s.meta.createdAt, phaseCount: s.meta.phaseCount, allianceCount: s.meta.allianceCount };
  // Kampagnensprache der neuen Kampagne hat Vorrang vor der Vorlage, falls gesetzt
  if (st.meta.locale) s.meta.locale = st.meta.locale;
  if (st.meta.intro.trim()) s.meta.intro = st.meta.intro;
  s.toggles = structuredClone(tpl.toggles);
  if (tpl.alliances.length === s.meta.allianceCount) {
    s.alliances = tpl.alliances.map((a, i) => ({ ...a, leaderPlayerId: null, strongholdDestroyed: false, order: i }));
  }
  for (const p of s.planets) {
    const orig = Object.entries(rename).find(([, v]) => v === p.id)?.[0] ?? p.id;
    if (tpl.planetLore[orig]) p.lore = tpl.planetLore[orig];
  }
  s.dispatches = tpl.dispatches.map((d) => ({ id: newId('disp'), at: now, ...d }));
  const known = new Set(s.alliances.map((a) => a.id));
  const special = new Set(['TARGET', 'OTHERS', 'ALL', 'LEADER', 'TRAILING']);
  const al = <T extends string | null>(a: T): T | 'TARGET' => (a === null || special.has(a) || known.has(a) ? a : 'TARGET');
  const pl = (p: string) => (['CHOSEN', 'ALL', 'STRONGHOLD'].includes(p) ? p : ren(p));
  s.customEvents = tpl.customEvents.map((d) => ({
    ...structuredClone(d),
    phase: d.phase !== null && d.phase < s.meta.phaseCount ? d.phase : null,
    target: d.target === null || d.target === 'LEADER' || d.target === 'TRAILING' || known.has(d.target) ? d.target : null,
    effects: d.effects.map((e): CustomEffect => {
      const x = { ...e, alliance: al(e.alliance) } as CustomEffect;
      if ('planet' in x) (x as { planet: string }).planet = pl(x.planet);
      return x;
    }),
  }));
  return s;
}
