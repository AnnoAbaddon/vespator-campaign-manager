import { CONNECTIONS, PLANETS, type PlanetDef, type TheatreId } from './data/vespator';
import type { CampaignState } from './types';

/**
 * Karte einer Kampagne (N5.5). Liegt im Kampagnenzustand (`state.map`) und ist nach Setup-Schritt W0 gesperrt.
 *
 * Planeten-IDs sind über alle Karten eindeutig: Die Vespator-Karte behält ihre festen IDs, eigene oder
 * veränderte Karten bekommen zufällige IDs. Dadurch lassen sich Name und Nachbarschaft eines Planeten
 * allein über die ID nachschlagen (Registry unten), ohne den Zustand überall durchzureichen – während eines
 * Commands nur in der Karte dieses Zustands (`withMap`), sonst im globalen Rückfall.
 * Listen „aller Planeten“ kommen dagegen immer aus `mapOf(state)`.
 */
export interface MapDef {
  name: string;
  /** 'vespator' solange die Karte unverändert der Vorlage entspricht */
  template: string | null;
  /** Hintergrundfarbe der Übersichtskarte (optional) */
  background: string | null;
  planets: PlanetDef[];
  connections: [string, string][];
}

export const VESPATOR_MAP: MapDef = {
  name: 'Vespator Front',
  template: 'vespator',
  background: null,
  planets: PLANETS,
  connections: CONNECTIONS,
};

export const MAP_LIMITS = { minPlanets: 6, maxPlanets: 24, minSlots: 1, maxSlots: 6, minTheatres: 1, maxTheatres: 3 } as const;

// ---------------------------------------------------------------------------
// Registry: Planet-ID → Stammdaten und Nachbarn
//
// S6 (Architektur-Review): Jede Karte hat ihre eigene Registry (gecacht je MapDef-Objekt). Die Engine schlägt
// während eines Commands nur in der Karte des ausgeführten Zustands nach (`withMap`), damit sich Kampagnen nie
// gegenseitig beeinflussen. Außerhalb davon (Oberfläche, Ansichten ohne Zustand) gilt die globale Registry als
// Rückfall – sie enthält jede Karte, die über `registerMap`/`mapOf` bekannt gemacht wurde.

interface Registry {
  defs: Map<string, PlanetDef>;
  adj: Map<string, Set<string>>;
  dist: Map<string, Map<string, number>>;
}

const emptyRegistry = (): Registry => ({ defs: new Map(), adj: new Map(), dist: new Map() });

function addToRegistry(r: Registry, map: MapDef) {
  for (const p of map.planets) {
    r.defs.set(p.id, p);
    r.adj.set(p.id, new Set());
  }
  for (const [a, b] of map.connections) {
    r.adj.get(a)?.add(b);
    r.adj.get(b)?.add(a);
  }
  r.dist.clear();
}

/** globaler Rückfall (Oberfläche, Ansichten ohne Zustand) */
const GLOBAL = emptyRegistry();
const registered = new WeakSet<MapDef>();
/** Registry je Karte (nur diese Karte) */
const perMap = new WeakMap<MapDef, Registry>();

function registryOf(map: MapDef): Registry {
  let r = perMap.get(map);
  if (!r) {
    r = emptyRegistry();
    addToRegistry(r, map);
    perMap.set(map, r);
  }
  return r;
}

/** Zustand, dessen Karte gerade gilt (während eines Commands); null = globaler Rückfall */
let scoped: { map?: MapDef } | null = null;

/**
 * Führt `fn` mit der Karte dieses Zustands als einziger Nachschlagequelle aus (S6). Die Karte wird bei jedem
 * Nachschlagen neu aus `state.map` gelesen – ein MAP_SET im selben Command gilt also sofort.
 */
export function withMap<T>(state: { map?: MapDef }, fn: () => T): T {
  const prev = scoped;
  scoped = state;
  try {
    return fn();
  } finally {
    scoped = prev;
  }
}

const reg = (): Registry => (scoped ? registryOf(scoped.map ?? VESPATOR_MAP) : GLOBAL);

export function registerMap(map: MapDef) {
  if (registered.has(map)) return;
  registered.add(map);
  addToRegistry(GLOBAL, map);
}

registerMap(VESPATOR_MAP);

/** Karte des Zustands (ältere Zustände ohne Karte: Vespator) – registriert sie nebenbei */
export function mapOf(state: Pick<CampaignState, 'map'> | { map?: MapDef }): MapDef {
  const m = state.map ?? VESPATOR_MAP;
  registerMap(m);
  return m;
}

export const planetIds = (state: { map?: MapDef }) => mapOf(state).planets.map((p) => p.id);

export function planetDef(id: string): PlanetDef | undefined {
  return reg().defs.get(id);
}

export function planetName(id: string | null | undefined): string {
  return id ? (reg().defs.get(id)?.name ?? id) : '–';
}

export function adjacent(a: string, b: string): boolean {
  return reg().adj.get(a)?.has(b) ?? false;
}

export function neighbours(a: string): string[] {
  return [...(reg().adj.get(a) ?? [])];
}

export function distance(a: string, b: string): number {
  const r = reg();
  let d = r.dist.get(a);
  if (!d) {
    d = new Map([[a, 0]]);
    const q = [a];
    while (q.length) {
      const cur = q.shift()!;
      for (const n of r.adj.get(cur) ?? []) {
        if (!d.has(n)) {
          d.set(n, d.get(cur)! + 1);
          q.push(n);
        }
      }
    }
    r.dist.set(a, d);
  }
  return d.get(b) ?? Infinity;
}

// ---------------------------------------------------------------------------
// Validierung und Hilfen für den Editor

export const ALL_THEATRES: TheatreId[] = ['SPACEPORT', 'DESOLATE_WASTES', 'XENOFLORA_JUNGLE', 'RAD_ZONE', 'FORGE_COMPLEX', 'HAB_SPRAWL', 'DELVESITE_FACILITY', 'DEAD_LANDS', 'TOMB_COMPLEX'];

/** Liefert Fehlermeldungen; leer = Karte ist spielbar */
export function validateMap(map: MapDef): string[] {
  const err: string[] = [];
  const L = MAP_LIMITS;
  if (!map.name.trim()) err.push('Die Karte braucht einen Namen.');
  if (map.planets.length < L.minPlanets) err.push(`Mindestens ${L.minPlanets} Planeten nötig (aktuell ${map.planets.length}).`);
  if (map.planets.length > L.maxPlanets) err.push(`Höchstens ${L.maxPlanets} Planeten möglich.`);
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const p of map.planets) {
    if (ids.has(p.id)) err.push(`Doppelte Planeten-ID ${p.id}.`);
    ids.add(p.id);
    const n = p.name.trim().toLowerCase();
    if (!n) err.push('Ein Planet hat keinen Namen.');
    else if (names.has(n)) err.push(`Der Name „${p.name}“ kommt mehrfach vor.`);
    names.add(n);
    if (!Number.isInteger(p.slots) || p.slots < L.minSlots || p.slots > L.maxSlots) err.push(`${p.name}: ${L.minSlots}–${L.maxSlots} Infrastructure Locations erlaubt.`);
    if (p.theatres.length < L.minTheatres || p.theatres.length > L.maxTheatres) err.push(`${p.name}: ${L.minTheatres}–${L.maxTheatres} Theatres erlaubt.`);
    if (new Set(p.theatres).size !== p.theatres.length) err.push(`${p.name}: Theatre doppelt gewählt.`);
    if (p.theatres.some((t) => !ALL_THEATRES.includes(t))) err.push(`${p.name}: unbekanntes Theatre.`);
    if (!(p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100)) err.push(`${p.name}: Position außerhalb der Karte.`);
  }
  const seen = new Set<string>();
  for (const [a, b] of map.connections) {
    if (!ids.has(a) || !ids.has(b)) err.push('Eine Verbindung zeigt auf einen unbekannten Planeten.');
    if (a === b) err.push('Ein Planet kann nicht mit sich selbst verbunden sein.');
    const k = [a, b].sort().join('|');
    if (seen.has(k)) err.push('Eine Verbindung ist doppelt.');
    seen.add(k);
  }
  // Zusammenhang
  if (map.planets.length > 0 && err.length === 0) {
    const adj = new Map(map.planets.map((p) => [p.id, [] as string[]]));
    for (const [a, b] of map.connections) {
      adj.get(a)!.push(b);
      adj.get(b)!.push(a);
    }
    const start = map.planets[0].id;
    const vis = new Set([start]);
    const q = [start];
    while (q.length)
      for (const n of adj.get(q.shift()!)!)
        if (!vis.has(n)) {
          vis.add(n);
          q.push(n);
        }
    const lost = map.planets.filter((p) => !vis.has(p.id));
    if (lost.length) err.push(`Nicht alle Planeten sind verbunden: ${lost.map((p) => p.name).join(', ')}.`);
  }
  return err;
}

/** Hinweise ohne Blockade (Setup-Zahlen des Regelwerks passen erst ab 9 Planeten) */
export function mapWarnings(map: MapDef): string[] {
  const w: string[] = [];
  if (map.planets.length < 9) w.push('Unter 9 Planeten: Die Setup-Verteilung (1× PL 4, 3× PL 3, 4× PL 2 je Allianz) passt nicht vollständig.');
  return w;
}

export function newPlanetId(): string {
  return `p-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Eigenständige Kopie einer Karte mit frischen IDs – nötig, sobald eine Vorlage verändert wird,
 * damit die IDs der Vespator-Karte eindeutig bleiben. Liefert auch die Zuordnung alt → neu.
 */
export function forkMap(map: MapDef, suffix: () => string = () => Math.random().toString(36).slice(2, 8)): { map: MapDef; rename: Record<string, string> } {
  const rename: Record<string, string> = {};
  // Vespator-Planeten (auch bereits abgeleitete wie „norallus.x1y2“) behalten ihre Basis-ID für die Bilder
  for (const p of map.planets) rename[p.id] = VESPATOR_IDS.has(artId(p.id)) ? `${artId(p.id)}.${suffix()}` : `p-${suffix()}`;
  return {
    rename,
    map: {
      ...map,
      template: null,
      planets: map.planets.map((p) => ({ ...p, theatres: [...p.theatres], id: rename[p.id] })),
      connections: map.connections.map(([a, b]) => [rename[a], rename[b]]),
    },
  };
}

/** Basis-ID eines abgeleiteten Vespator-Planeten („norallus.x1y2“ → „norallus“); Porträts gibt es nur für unveränderte Vespator-IDs (N6) */
export const artId = (id: string) => id.split('.')[0];

const VESPATOR_IDS = new Set(PLANETS.map((p) => p.id));

const defKey = (p: PlanetDef) => JSON.stringify([p.name, p.system ?? '', p.slots, [...p.theatres], p.x, p.y]);

/**
 * Planeten-IDs einer Karte, die in der Registry bereits mit anderem Inhalt (Stammdaten oder Nachbarn)
 * stehen – etwa weil dieselbe Kampagne zweimal importiert und eine Kopie danach verändert wurde.
 * Solche Karten müssen eigene IDs bekommen, sonst überschreiben sie sich gegenseitig.
 */
export function registryConflicts(map: MapDef): string[] {
  const nb = new Map(map.planets.map((p) => [p.id, [] as string[]]));
  for (const [a, b] of map.connections) {
    nb.get(a)?.push(b);
    nb.get(b)?.push(a);
  }
  const out: string[] = [];
  for (const p of map.planets) {
    const d = GLOBAL.defs.get(p.id);
    if (!d) continue;
    const known = [...(GLOBAL.adj.get(p.id) ?? [])].sort().join('|');
    if (defKey(d) !== defKey(p) || known !== [...nb.get(p.id)!].sort().join('|')) out.push(p.id);
  }
  return out;
}
