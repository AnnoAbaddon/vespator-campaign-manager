import { INFRA } from './data/vespator';
import { planetDef as lookupPlanet, planetName as mapPlanetName } from './map';
import { fail, log, type Ctx } from './ctx';
import { house } from './houseRules';
import { skirmishBonus } from './skirmish';
import type { Alliance, CampaignState, InfraType, PlanetState } from './types';

export const planetName = (id: string) => mapPlanetName(id);
export const planetDef = (id: string) => {
  const d = lookupPlanet(id);
  if (!d) fail(`Unbekannter Planet ${id}`);
  return d;
};

export function planet(state: CampaignState, id: string): PlanetState {
  const p = state.planets.find((x) => x.id === id);
  if (!p) fail(`Unbekannter Planet ${id}`);
  return p;
}

export function alliance(state: CampaignState, id: string): Alliance {
  const a = state.alliances.find((x) => x.id === id);
  if (!a) fail(`Unbekannte Allianz ${id}`);
  return a;
}

export const allianceName = (state: CampaignState, id: string) => state.alliances.find((a) => a.id === id)?.name ?? id;
export const fleetName = (state: CampaignState, id: string) => state.fleets.find((f) => f.id === id)?.name ?? id;
export const playerName = (state: CampaignState, id: string) => state.players.find((p) => p.id === id)?.nickname ?? id;

export function pl(state: CampaignState, allianceId: string, planetId: string): number {
  return planet(state, planetId).power[allianceId] ?? 0;
}

export function countOnPlanet(state: CampaignState, allianceId: string, planetId: string, type: InfraType): number {
  return planet(state, planetId).slots.filter((s) => !s.destroyed && s.infra?.type === type && s.infra.allianceId === allianceId).length;
}

export function countInfra(state: CampaignState, allianceId: string, type: InfraType): number {
  let n = 0;
  for (const p of state.planets) for (const s of p.slots) if (!s.destroyed && s.infra?.type === type && s.infra.allianceId === allianceId) n++;
  return n;
}

export function freeSlotIndex(state: CampaignState, planetId: string): number {
  return planet(state, planetId).slots.findIndex((s) => !s.destroyed && !s.infra);
}

export function minPL(state: CampaignState, allianceId: string, planetId: string): number {
  const p = planet(state, planetId);
  if (p.destroyed) return 0;
  const lines = countOnPlanet(state, allianceId, planetId, 'FORTIFICATION_LINE');
  // F-16: Standard kumulativ; Hausregel: jede Anzahl Lines ergibt Minimum 2
  return Math.min(4, 1 + (house(state, 'F16_LINES_NOT_CUMULATIVE') ? Math.min(1, lines) : lines));
}

/** Erhöht das PL; `cap` 5 nur für Wreath/Archeotech mit Hausregel F-17 */
export function increase(ctx: Ctx, allianceId: string, planetId: string, n = 1, why = '', cap = 4) {
  const p = planet(ctx.state, planetId);
  if (p.destroyed) {
    log(ctx, `${allianceName(ctx.state, allianceId)}: +${n} PL auf ${planetName(planetId)} ohne Wirkung (Planet zerstört)`);
    return;
  }
  const before = p.power[allianceId] ?? 1;
  const after = Math.max(before, Math.min(cap, before + n));
  p.power[allianceId] = after;
  log(ctx, `${allianceName(ctx.state, allianceId)} PL ${planetName(planetId)}: ${before}→${after}${why ? ` (${why})` : ''}`);
}

/** Senkt das PL schrittweise; an der Fortification-Grenze wird stattdessen eine Line zerstört. */
export function decrease(ctx: Ctx, allianceId: string, planetId: string, n = 1, why = '') {
  const p = planet(ctx.state, planetId);
  if (p.destroyed) {
    log(ctx, `${allianceName(ctx.state, allianceId)}: −${n} PL auf ${planetName(planetId)} ohne Wirkung (Planet zerstört)`);
    return;
  }
  for (let i = 0; i < n; i++) {
    const cur = p.power[allianceId] ?? 1;
    const min = minPL(ctx.state, allianceId, planetId);
    if (cur - 1 < min && min > 1) {
      // eine Fortification Line (höchster Slot-Index) wird zerstört
      let idx = -1;
      p.slots.forEach((s, j) => {
        if (!s.destroyed && s.infra?.type === 'FORTIFICATION_LINE' && s.infra.allianceId === allianceId) idx = j;
      });
      p.slots[idx].infra = null;
      log(ctx, `${allianceName(ctx.state, allianceId)}: Fortification Line auf ${planetName(planetId)} zerstört statt PL-Verlust${why ? ` (${why})` : ''}`);
    } else if (cur - 1 >= 1) {
      p.power[allianceId] = cur - 1;
      log(ctx, `${allianceName(ctx.state, allianceId)} PL ${planetName(planetId)}: ${cur}→${cur - 1}${why ? ` (${why})` : ''}`);
    } else {
      log(ctx, `${allianceName(ctx.state, allianceId)} PL ${planetName(planetId)} bleibt 1${why ? ` (${why})` : ''}`);
    }
  }
}

/** Setzt ein PL (Tausch/Setup) mit Clamp auf [min, 4]. */
export function setPL(ctx: Ctx, allianceId: string, planetId: string, value: number, why = '') {
  const p = planet(ctx.state, planetId);
  if (p.destroyed) return;
  const min = minPL(ctx.state, allianceId, planetId);
  const v = Math.max(min, Math.min(house(ctx.state, 'F17_PL_FIVE') ? 5 : 4, value));
  const before = p.power[allianceId];
  p.power[allianceId] = v;
  log(ctx, `${allianceName(ctx.state, allianceId)} PL ${planetName(planetId)}: ${before}→${v}${v !== value ? ` (angepasst von ${value})` : ''}${why ? ` (${why})` : ''}`);
}

export function canBuild(state: CampaignState, allianceId: string, type: InfraType, planetId: string, opts: { allowStronghold?: boolean } = {}): string | null {
  const p = planet(state, planetId);
  if (p.destroyed) return `${planetName(planetId)} ist zerstört`;
  if (type === 'STRONGHOLD' && !opts.allowStronghold) return 'Strongholds können hier nicht gebaut werden';
  if (freeSlotIndex(state, planetId) < 0) return `${planetName(planetId)} hat keine freie Infrastructure Location`;
  if (countInfra(state, allianceId, type) >= INFRA[type].max) return `${allianceName(state, allianceId)} hat bereits das Maximum an ${INFRA[type].name} (${INFRA[type].max})`;
  if (type === 'STRONGHOLD' && alliance(state, allianceId).strongholdDestroyed) return 'Der Stronghold dieser Allianz wurde zerstört';
  return null;
}

export function build(ctx: Ctx, allianceId: string, type: InfraType, planetId: string, opts: { allowStronghold?: boolean; slot?: number; why?: string } = {}) {
  const err = canBuild(ctx.state, allianceId, type, planetId, opts);
  if (err) fail(err);
  const p = planet(ctx.state, planetId);
  let idx = opts.slot ?? freeSlotIndex(ctx.state, planetId);
  if (idx < 0 || idx >= p.slots.length || p.slots[idx].destroyed || p.slots[idx].infra) idx = freeSlotIndex(ctx.state, planetId);
  p.slots[idx].infra = { type, allianceId };
  log(ctx, `${allianceName(ctx.state, allianceId)} baut ${INFRA[type].name} auf ${planetName(planetId)}${opts.why ? ` (${opts.why})` : ''}`);
  if (type === 'FORTIFICATION_LINE') {
    const min = minPL(ctx.state, allianceId, planetId);
    if ((p.power[allianceId] ?? 1) < min) {
      log(ctx, `${allianceName(ctx.state, allianceId)} PL ${planetName(planetId)}: ${p.power[allianceId]}→${min} (Fortification-Minimum)`);
      p.power[allianceId] = min;
    }
  }
  return idx;
}

/** Entfernt Infrastruktur ohne Zerstörung (Übernahme, Umzug). */
export function removeInfra(ctx: Ctx, planetId: string, slot: number, why = '') {
  const s = planet(ctx.state, planetId).slots[slot];
  if (!s?.infra) fail('Kein Infrastrukturstück an dieser Location');
  const info = s.infra;
  s.infra = null;
  log(ctx, `${INFRA[info.type].name} von ${allianceName(ctx.state, info.allianceId)} auf ${planetName(planetId)} entfernt${why ? ` (${why})` : ''}`);
  return info;
}

export function destroyInfra(ctx: Ctx, planetId: string, slot: number, why = '') {
  const s = planet(ctx.state, planetId).slots[slot];
  if (!s?.infra) return;
  const info = s.infra;
  s.infra = null;
  if (info.type === 'STRONGHOLD') alliance(ctx.state, info.allianceId).strongholdDestroyed = true;
  log(ctx, `${INFRA[info.type].name} von ${allianceName(ctx.state, info.allianceId)} auf ${planetName(planetId)} zerstört${why ? ` (${why})` : ''}`);
}

export function destroyLocation(ctx: Ctx, planetId: string, slot: number, why = '') {
  const p = planet(ctx.state, planetId);
  const s = p.slots[slot];
  if (!s || s.destroyed) return;
  if (s.infra) destroyInfra(ctx, planetId, slot, why);
  s.destroyed = true;
  log(ctx, `Infrastructure Location ${slot + 1} auf ${planetName(planetId)} zerstört${why ? ` (${why})` : ''}`);
  if (p.slots.every((x) => x.destroyed)) {
    p.destroyed = true;
    for (const a of Object.keys(p.power)) p.power[a] = 0;
    log(ctx, `${planetName(planetId)} ist zerstört und unbewohnbar – alle Power Level 0`);
  }
}

export function powerSum(state: CampaignState, allianceId: string): number {
  return state.planets.reduce((s, p) => s + (p.power[allianceId] ?? 0), 0);
}

export function campaignPoints(state: CampaignState, allianceId: string): number {
  // D2: Punkte-Boni/-Mali aus eigenen Ereignissen (fehlend = keine)
  const bonus = (state.pointsBonus ?? []).reduce((s, b) => s + (b.allianceId === allianceId ? b.points : 0), 0);
  // B5: gedeckelter Bonus aus freien Gefechten (nur mit Hausregel und Belohnung „Punkte“)
  const pts = powerSum(state, allianceId) + (alliance(state, allianceId).strongholdDestroyed ? 0 : 3) + bonus + skirmishBonus(state, allianceId);
  // F-23: Standard – Punkte über 55 zählen weiter; Hausregel: Obergrenze 55
  return house(state, 'F23_POINTS_CAP') ? Math.min(55, pts) : pts;
}

export function strongholdPlanet(state: CampaignState, allianceId: string): string | null {
  for (const p of state.planets) for (const s of p.slots) if (!s.destroyed && s.infra?.type === 'STRONGHOLD' && s.infra.allianceId === allianceId) return p.id;
  return null;
}

export function fleetsAt(state: CampaignState, planetId: string, allianceId?: string) {
  return state.fleets.filter((f) => f.planetId === planetId && (!allianceId || f.allianceId === allianceId));
}
