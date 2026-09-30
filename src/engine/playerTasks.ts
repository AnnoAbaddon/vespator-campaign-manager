import { eventInputRights } from './events';
import { claimableSide, mayBuild, sideOf } from './playerActions';
import { allianceOf, stagePhase } from './players';
import type { Battle, CampaignState, Player } from './types';

/**
 * Offene Aufgaben eines Spielers als Liste (für den Discord-Bot `/aufgaben`, NTH2 1.2). Dieselben Regeln wie
 * die Aufgabenansicht der Spielerseite, aber ohne Oberfläche.
 */
export type PlayerTask =
  | { kind: 'ORDERS'; fleetName: string }
  | { kind: 'MOVE'; fleetName: string }
  | { kind: 'EVENT' }
  | { kind: 'BUILD' }
  | { kind: 'CONFIRM'; battle: Battle }
  | { kind: 'PROPOSAL'; battle: Battle }
  | { kind: 'SCHEDULE'; battle: Battle }
  | { kind: 'CLAIM'; battle: Battle }
  | { kind: 'REPORT'; battle: Battle };

export function openBattles(st: CampaignState, playerId: string): Battle[] {
  if (st.stage.kind === 'ENDED') return [];
  return st.battles.filter((b) => (b.status === 'SCHEDULED' || b.status === 'PLAYED') && sideOf(st, b, playerId));
}

export function playerTasks(st: CampaignState, me: Player, now: number): PlayerTask[] {
  if (!me.active) return [];
  const out: PlayerTask[] = [];
  const step = st.stage.kind === 'PHASE' ? st.stage.step : null;
  const phase = st.stage.kind === 'PHASE' ? st.stage.phase : null;
  const ph = phase ? st.phases.find((p) => p.number === phase) : null;
  const fleets = phase ? st.fleets.filter((f) => !f.reserve && f.planetId && f.commanders[String(phase)] === me.id) : [];
  if (step === 'OPS' && ph) for (const f of fleets) if (!ph.operations.some((o) => o.fleetId === f.id && !o.isDefault)) out.push({ kind: 'ORDERS', fleetName: f.name });
  if (step === 'MOVE') for (const f of fleets) out.push({ kind: 'MOVE', fleetName: f.name });
  if (step === 'RESULTS' && st.events.some((e) => e.phaseNumber === phase && e.status === 'PENDING' && Object.values(eventInputRights(st, e.id, me.id)).some((v) => (Array.isArray(v) ? v.length > 0 : v))))
    out.push({ kind: 'EVENT' });
  const al = allianceOf(me, stagePhase(st));
  if (step === 'BUILD' && ph && al && ph.flags.buildStarted && !ph.builds[al] && ph.buildOrder.slice(0, ph.buildOrder.indexOf(al)).every((a) => ph.builds[a]) && mayBuild(st, al, me.id)) out.push({ kind: 'BUILD' });
  for (const b of openBattles(st, me.id)) {
    const side = sideOf(st, b, me.id);
    if (b.draft) {
      if (b.draft.status === 'PENDING' && side !== sideOf(st, b, b.draft.byPlayerId)) out.push({ kind: 'CONFIRM', battle: b });
      continue;
    }
    if (b.status !== 'SCHEDULED') continue;
    const own = side === 'ATTACKER' ? b.attackers : b.defenders;
    if (!own.length && claimableSide(st, b, me.id) === side) out.push({ kind: 'CLAIM', battle: b });
    else if (!b.scheduledAt && (b.proposals ?? []).some((p) => p.side !== side)) out.push({ kind: 'PROPOSAL', battle: b });
    // eigener Vorschlag offen: Die Gegenseite ist dran
    else if (!b.scheduledAt && !(b.proposals ?? []).length) out.push({ kind: 'SCHEDULE', battle: b });
    else if (b.scheduledAt && b.vp === null && new Date(b.scheduledAt).getTime() < now) out.push({ kind: 'REPORT', battle: b });
  }
  return out;
}
