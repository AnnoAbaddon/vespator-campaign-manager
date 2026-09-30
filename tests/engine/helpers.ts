import { executeCommand, type Command } from '@/engine/commands';
import { createCampaignState } from '@/engine/init';
import type { CampaignState } from '@/engine/types';

let seq = 0;
export const idGen = (p: string) => `${p}${++seq}`;

/** Führt einen Command aus (force), würfelt mit festen Werten, wirft bei Fehlern. */
export function run(state: CampaignState, cmd: Command, dice: number[] = [], opts: { force?: boolean; reason?: string; random?: number } = {}): CampaignState {
  const r = executeCommand(state, cmd, {
    force: opts.force ?? true,
    reason: opts.reason ?? 'test',
    idGen,
    dice: { mode: dice.length ? 'MANUAL' : 'DIGITAL', manual: dice, random: () => opts.random ?? 4 },
  });
  if (!r.ok) throw new Error(r.kind === 'error' ? r.error : r.kind === 'confirm' ? r.warnings.join('; ') : `dice: ${r.dice.context}`);
  return r.state;
}

export function tryRun(state: CampaignState, cmd: Command, dice: number[] = []) {
  return executeCommand(state, cmd, { force: true, reason: 'test', idGen, dice: { mode: dice.length ? 'MANUAL' : 'DIGITAL', manual: dice, random: () => 4 } });
}

export const A = 'al1';
export const B = 'al2';
export const C = 'al3';

/** Kampagne mit 3 Allianzen, je 1 Spieler und 1 Flotte, fertiges Setup, Phase 1 Schritt OPS */
export function startedCampaign(opts: { phases?: number } = {}): CampaignState {
  seq = 0;
  let s = createCampaignState({ name: 'Test', phaseCount: opts.phases ?? 6, allianceCount: 3, now: '2026-01-01T00:00:00Z' });
  s = run(s, { type: 'ALLIANCE_UPSERT', name: 'Rot', color: '#ff0000' });
  s = run(s, { type: 'ALLIANCE_UPSERT', name: 'Blau', color: '#0000ff' });
  s = run(s, { type: 'ALLIANCE_UPSERT', name: 'Grün', color: '#00ff00' });
  const [a, b, c] = s.alliances.map((x) => x.id);
  s = run(s, { type: 'PLAYER_UPSERT', data: { nickname: 'P1', faction: 'Orks' }, allianceId: a });
  s = run(s, { type: 'PLAYER_UPSERT', data: { nickname: 'P2', faction: 'Necrons' }, allianceId: b });
  s = run(s, { type: 'PLAYER_UPSERT', data: { nickname: 'P3', faction: 'Tau' }, allianceId: c });
  for (const id of [a, b, c]) s = run(s, { type: 'FLEET_SET_COUNT', allianceId: id, count: 1 });
  s = run(s, { type: 'SETUP_W0_DONE' });
  s = run(s, { type: 'SETUP_STRONGHOLDS', allianceId: a, strongholdPlanetId: 'norallus', pl3: ['masnet', 'karabas', 'kryndaer'], pl2: ['felgris-secundas', 'caltus-novem', 'marvinius', 'vikus-decima'] });
  s = run(s, { type: 'SETUP_STRONGHOLDS', allianceId: b, strongholdPlanetId: 'jawardet', pl3: ['tarkad-vindix', 'astarthem', 'ikaron-prime'], pl2: ['novamagnor', 'felgris-secundas', 'masnet', 'vikus-decima'] });
  s = run(s, { type: 'SETUP_STRONGHOLDS', allianceId: c, strongholdPlanetId: 'caltus-novem', pl3: ['vikus-decima', 'marvinius', 'novamagnor'], pl2: ['kryndaer', 'karabas', 'ikaron-prime', 'astarthem'] });
  s = run(s, { type: 'SETUP_REVEAL_STRONGHOLDS' });
  s = run(s, { type: 'SETUP_W2_DONE' });
  s = run(s, { type: 'SETUP_INFRA', allianceId: a, items: [{ type: 'FORTIFICATION_LINE', planetId: 'masnet' }, { type: 'SUPPORT_FACILITY', planetId: 'karabas' }, { type: 'STAGING_GROUNDS', planetId: 'kryndaer' }] });
  s = run(s, { type: 'SETUP_INFRA', allianceId: b, items: [{ type: 'FORTIFICATION_LINE', planetId: 'tarkad-vindix' }, { type: 'SUPPORT_FACILITY', planetId: 'astarthem' }, { type: 'STAGING_GROUNDS', planetId: 'ikaron-prime' }] });
  s = run(s, { type: 'SETUP_INFRA', allianceId: c, items: [{ type: 'FORTIFICATION_LINE', planetId: 'marvinius' }, { type: 'SUPPORT_FACILITY', planetId: 'vikus-decima' }, { type: 'STAGING_GROUNDS', planetId: 'novamagnor' }] });
  s = run(s, { type: 'SETUP_REVEAL_INFRA' });
  s = run(s, { type: 'SETUP_W3_DONE' });
  const [fa, fb, fc] = s.fleets.map((f) => f.id);
  s = run(s, { type: 'SETUP_FLEET_STARTS', starts: { [fa]: 'kryndaer', [fb]: 'novamagnor', [fc]: 'caltus-novem' } });
  s = run(s, { type: 'SETUP_REVEAL_FLEETS' });
  s = run(s, { type: 'SETUP_W4_DONE' });
  s = run(s, { type: 'SETUP_START' });
  return s;
}

export function ids(s: CampaignState) {
  const [a, b, c] = s.alliances.map((x) => x.id);
  const [fa, fb, fc] = s.fleets.map((f) => f.id);
  const [pa, pb, pc] = s.players.map((p) => p.id);
  return { a, b, c, fa, fb, fc, pa, pb, pc };
}

export const PL = (s: CampaignState, al: string, p: string) => s.planets.find((x) => x.id === p)!.power[al];
export const slotsOf = (s: CampaignState, p: string) => s.planets.find((x) => x.id === p)!.slots;
