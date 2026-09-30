import { ALL_THEATRES, MAP_LIMITS, newPlanetId, validateMap, type MapDef } from './map';
import type { TheatreId } from './data/vespator';
import type { PlanetDef } from './data/vespator';

/**
 * Karten-Generator (NTH2 3.4): erzeugt aus einem Startwert (Seed) deterministisch eine spielbare Karte.
 * Gleicher Seed und gleiche Regler ergeben dieselbe Karte (Namen, Lage, Verbindungen, Theatres, Slots); nur die
 * internen Planeten-IDs sind zufällig, damit sie über alle Karten eindeutig bleiben.
 * Das Ergebnis besteht immer validateMap (zusammenhängend, Grenzen eingehalten) und lässt sich danach im Editor anpassen.
 */
export interface MapGenOptions {
  seed: string;
  /** Anzahl Planeten, 8–20 */
  planets: number;
  /** Verbindungsdichte 0–1: 0 = Baum (minimal verbunden), 1 = dichtes Netz */
  density: number;
  /** Theatre-Mix 0–1: 0 = wenige Theatre-Arten (einheitlicher Sektor), 1 = alle Arten gleichmäßig */
  theatreMix: number;
  /** Spanne der Infrastructure Locations je Planet */
  slotMin: number;
  slotMax: number;
  name?: string;
}

export const MAP_GEN_LIMITS = { minPlanets: 8, maxPlanets: 20 } as const;

export const DEFAULT_MAP_GEN: Omit<MapGenOptions, 'seed'> = { planets: 12, density: 0.4, theatreMix: 0.7, slotMin: 2, slotMax: 4 };

/** Seed aus Text → 32-Bit-Zahl (FNV-1a) */
function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Kleiner deterministischer Zufallsgenerator (mulberry32) */
export function rng(seed: string): () => number {
  let a = hashSeed(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Zufälliger Seed zum Vorbelegen (sechs Zeichen, gut abzuschreiben) */
export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Silben für gotisch klingende Weltennamen (frei erfunden)
const PRE = ['Vor', 'Kal', 'Mor', 'Tes', 'Ar', 'Sol', 'Dra', 'Hel', 'Ost', 'Var', 'Cel', 'Ul', 'Pry', 'Bel', 'Nox', 'Gor', 'Ith', 'Zeph', 'Mal', 'Syr', 'Tor', 'Ves', 'Ekh', 'Rha'];
const MID = ['a', 'e', 'i', 'o', 'u', 'ae', 'ar', 'en', 'is', 'or', 'ul', 'yr'];
const SUF = ['nus', 'thar', 'dex', 'mora', 'gant', 'lix', 'phos', 'drin', 'vane', 'kos', 'tia', 'rum', 'sis', 'gard', 'lon', 'vex'];
const EPITHET = ['Prime', 'Secundus', 'Tertius', 'Minoris', 'Majoris', 'IV', 'VII'];

function makeName(r: () => number, used: Set<string>): string {
  for (let tries = 0; tries < 50; tries++) {
    const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
    let n = pick(PRE) + (r() < 0.55 ? pick(MID) : '') + pick(SUF);
    if (r() < 0.2) n += ' ' + pick(EPITHET);
    const k = n.toLowerCase();
    if (!used.has(k)) {
      used.add(k);
      return n;
    }
  }
  const n = `Welt ${used.size + 1}`;
  used.add(n.toLowerCase());
  return n;
}

type Pt = { x: number; y: number };
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, (a.y - b.y) * 0.703);

/** Schneiden sich die Strecken ab und cd (ohne gemeinsame Endpunkte)? */
function crosses(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/** Normierte Optionen (Grenzen, Slot-Spanne geordnet) */
export function normalizeGenOptions(o: MapGenOptions): MapGenOptions {
  const lo = clamp(Math.round(Math.min(o.slotMin, o.slotMax)), MAP_LIMITS.minSlots, MAP_LIMITS.maxSlots);
  const hi = clamp(Math.round(Math.max(o.slotMin, o.slotMax)), MAP_LIMITS.minSlots, MAP_LIMITS.maxSlots);
  return {
    ...o,
    seed: String(o.seed || '1'),
    planets: clamp(Math.round(o.planets), MAP_GEN_LIMITS.minPlanets, MAP_GEN_LIMITS.maxPlanets),
    density: clamp(Number(o.density) || 0, 0, 1),
    theatreMix: clamp(Number(o.theatreMix) || 0, 0, 1),
    slotMin: lo,
    slotMax: hi,
  };
}

function build(o: MapGenOptions, attempt: number, id: () => string): MapDef {
  const r = rng(`${o.seed}#${attempt}`);
  const n = o.planets;
  // 1. Lage: Punkte mit Mindestabstand (weicht bei Platzmangel schrittweise auf)
  const pts: Pt[] = [];
  let minD = 62 / Math.sqrt(n);
  while (pts.length < n) {
    let placed = false;
    for (let t = 0; t < 400 && !placed; t++) {
      const p = { x: Math.round((8 + r() * 84) * 10) / 10, y: Math.round((10 + r() * 80) * 10) / 10 };
      if (pts.every((q) => dist(p, q) >= minD)) {
        pts.push(p);
        placed = true;
      }
    }
    if (!placed) minD *= 0.9;
  }
  // 2. Verbindungen: minimaler Spannbaum (zusammenhängend), dann kurze kreuzungsfreie Zusatzkanten
  const pairs: [number, number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j, dist(pts[i], pts[j])]);
  pairs.sort((a, b) => a[2] - b[2] || a[0] - b[0] || a[1] - b[1]);
  const parent = pts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const edges: [number, number][] = [];
  const free = (i: number, j: number) => edges.every(([a, b]) => a === i || a === j || b === i || b === j || !crosses(pts[i], pts[j], pts[a], pts[b]));
  for (const [i, j] of pairs) {
    if (find(i) === find(j)) continue;
    parent[find(i)] = find(j);
    edges.push([i, j]);
  }
  const nn = pts.map((p, i) => Math.min(...pts.filter((_, j) => j !== i).map((q) => dist(p, q))));
  const avgNN = nn.reduce((s, v) => s + v, 0) / n;
  const extraTarget = Math.round(o.density * n * 0.9);
  let extra = 0;
  for (const [i, j, d] of pairs) {
    if (extra >= extraTarget) break;
    if (edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) continue;
    if (d > avgNN * (1.8 + o.density)) continue;
    // Zufall mischt die Reihenfolge etwas auf, bleibt aber deterministisch
    if (r() < 0.25) continue;
    if (!free(i, j)) continue;
    edges.push([i, j]);
    extra++;
  }
  // 3. Theatres: Anzahl der Arten aus dem Mix (3–9), je Planet 1–3 verschiedene
  const pool = [...ALL_THEATRES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const kinds = pool.slice(0, clamp(3 + Math.round(o.theatreMix * 6), 3, 9));
  const used = new Set<string>();
  const planets: PlanetDef[] = pts.map((p, i) => {
    const count = 1 + Math.floor(r() * 3);
    const th: TheatreId[] = [];
    // gleichmäßig über die Arten verteilen: Startpunkt wandert mit dem Planeten
    let k = (i + Math.floor(r() * kinds.length)) % kinds.length;
    while (th.length < Math.min(count, kinds.length)) {
      if (!th.includes(kinds[k])) th.push(kinds[k]);
      k = (k + 1 + Math.floor(r() * 2)) % kinds.length;
    }
    const name = makeName(r, used);
    return {
      id: id(),
      name,
      system: `${makeName(r, used).split(' ')[0]} System`,
      slots: o.slotMin + Math.floor(r() * (o.slotMax - o.slotMin + 1)),
      theatres: th,
      x: p.x,
      y: p.y,
    };
  });
  return {
    name: o.name?.trim() || `Sektor ${o.seed}`,
    template: null,
    background: null,
    planets,
    connections: edges.map(([a, b]) => [planets[a].id, planets[b].id]),
  };
}

/**
 * Zufällige, validierte Karte. Scheitert eine Ziehung an der Prüfung (sollte nicht vorkommen), wird mit
 * abgeleitetem Seed neu gezogen – ebenfalls deterministisch.
 */
export function generateMap(opts: MapGenOptions, id: () => string = newPlanetId): MapDef {
  const o = normalizeGenOptions(opts);
  let last: MapDef | null = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const ids = new Set<string>();
    const uniqueId = () => {
      let v = id();
      while (ids.has(v)) v = id();
      ids.add(v);
      return v;
    };
    const m = build(o, attempt, uniqueId);
    if (validateMap(m).length === 0) return m;
    last = m;
  }
  throw new Error(`Karten-Generator: keine gültige Karte (${validateMap(last!)[0]})`);
}
