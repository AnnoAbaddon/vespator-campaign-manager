// NTH2 3.3: Registry der Regelmodule. Vespator ist fest eingebaut und Standard für alle Stände ohne `meta.module`.

import type { CampaignState } from '../types';
import type { CampaignModule } from './types';
import { vespatorModule } from './vespator';

export const DEFAULT_MODULE_ID = 'vespator';

const MODULES = new Map<string, CampaignModule>([[vespatorModule.id, vespatorModule]]);

/** Meldet ein Modul an (z. B. weitere Kampagnensysteme oder Test-Module). Eine ID gibt es nur einmal. */
export function registerModule(mod: CampaignModule): void {
  const cur = MODULES.get(mod.id);
  if (cur && cur !== mod) throw new Error(`Regelmodul „${mod.id}“ ist bereits angemeldet`);
  MODULES.set(mod.id, mod);
}

/** Entfernt ein Modul wieder (nur für Tests; das Standardmodul bleibt). */
export function unregisterModule(id: string): void {
  if (id !== DEFAULT_MODULE_ID) MODULES.delete(id);
}

export function hasModule(id: string): boolean {
  return MODULES.has(id);
}

/** Modul zur ID; unbekannte IDs sind ein Fehler (ein Stand darf nicht still mit anderen Regeln laufen). */
export function getModule(id: string = DEFAULT_MODULE_ID): CampaignModule {
  const m = MODULES.get(id);
  if (!m) throw new Error(`Unbekanntes Regelmodul „${id}“`);
  return m;
}

/** Alle angemeldeten Module (Vespator zuerst) */
export function listModules(): CampaignModule[] {
  return [...MODULES.values()];
}

/** Modul eines Kampagnenzustands (ältere Stände ohne Angabe: Vespator) */
export function moduleOf(state: Pick<CampaignState, 'meta'>): CampaignModule {
  return getModule(state.meta?.module ?? DEFAULT_MODULE_ID);
}
