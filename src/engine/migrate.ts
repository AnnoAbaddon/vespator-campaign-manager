import { SCHEMA_VERSION, type CampaignState } from './types';
import { forkMap, registerMap, registryConflicts } from './map';
import { DEFAULT_MODULE_ID, getModule } from './modules/registry';

/**
 * Hebt ältere Zustände auf die aktuelle Schema-Version (SPEC 19.3).
 * `register: false` (Import): die Karte wird noch nicht in die globale Planeten-Registry eingetragen –
 * erst nach der Prüfung über `adoptImportedMap`, damit ein abgelehnter Import die Registry nicht verändert.
 */
export function migrateState(raw: unknown, opts: { register?: boolean } = {}): CampaignState {
  const s = raw as CampaignState;
  if (!s || typeof s !== 'object' || !('schemaVersion' in s)) throw new Error('Kein gültiger Kampagnenzustand');
  if (s.schemaVersion > SCHEMA_VERSION) throw new Error(`Schema-Version ${s.schemaVersion} ist neuer als diese App (${SCHEMA_VERSION})`);
  // v1: Felder defensiv ergänzen
  for (const ph of s.phases ?? []) {
    ph.flags ??= {};
    ph.processOrder ??= null;
    ph.noMoveFleets ??= [];
  }
  for (const p of s.players ?? []) {
    // Armee-Historie für Spieler aus älteren Ständen: aktuelle Armee gilt ab Setup
    p.factionHistory ??= p.faction ? [{ faction: p.faction, subfaction: p.subfaction ?? '', fromPhase: 0 }] : [];
  }
  // NTH2 3.3: Regelmodul – ältere Stände sind Vespator-Kampagnen
  s.meta.module ??= DEFAULT_MODULE_ID;
  const mod = getModule(s.meta.module);
  // v2: Karte im Zustand (vorher fest die Karte des Moduls, d. h. Vespator)
  s.map ??= structuredClone(mod.defaultMap());
  s.publishedAfterResistance ??= false;
  // modul-eigene Migration (Vespator: stellarStormsUsed)
  mod.migrate?.(s);
  s.schemaVersion = SCHEMA_VERSION;
  if (opts.register !== false) registerMap(s.map);
  return s;
}

/** Kurzer, deterministischer Hash (FNV-1a) – gleiche Karte ergibt beim Import immer dieselben neuen IDs */
function hash36(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, '0').slice(-7);
}

/** Ersetzt Planeten-IDs im ganzen Zustand (Werte und Schlüssel, z. B. `pointsHistory[].planets`) */
function renameIds(node: unknown, ren: Record<string, string>): unknown {
  if (typeof node === 'string') return ren[node] ?? node;
  if (Array.isArray(node)) return node.map((x) => renameIds(x, ren));
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) out[ren[k] ?? k] = renameIds(v, ren);
    return out;
  }
  return node;
}

/**
 * Review: Übernahme einer importierten, bereits geprüften Karte in die Registry. Stehen ihre Planeten-IDs dort
 * schon mit anderem Inhalt (Stammdaten oder Nachbarn), bekommt die Karte eigene IDs – wie bei MAP_SET –,
 * statt die Karte anderer Kampagnen umzuverdrahten. Die neuen IDs hängen nur vom Karteninhalt ab, damit
 * alle Revisionen einer importierten Historie dieselben IDs erhalten.
 */
export function adoptImportedMap(s: CampaignState): CampaignState {
  if (s.map && registryConflicts(s.map).length) {
    const h = hash36(JSON.stringify(s.map));
    let i = 0;
    const { rename } = forkMap(s.map, () => `${h}${(i++).toString(36)}`);
    const next = renameIds(s, rename) as CampaignState;
    // forkMap-Ergebnis übernehmen (Vorlage entfällt), übrige Felder wurden umbenannt
    next.map = { ...next.map!, template: null };
    Object.assign(s, next);
  }
  registerMap(s.map!);
  return s;
}
