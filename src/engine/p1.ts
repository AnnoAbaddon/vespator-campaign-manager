import { fail, log, type Ctx } from './ctx';
import { planetName } from './map';
import { CLASH_WINDOW_MS, draftOverdue, sideOf } from './playerActions';
import type { Battle, CampaignState } from './types';

/**
 * Block P1 (Nice-to-have Stufe 2): Spieltisch je Schlacht (NTH2 2.5) und Hinweise für die Spielleitung
 * (Web-Push „Handlungsbedarf“, NTH2 1.1). Die Tische selbst sind eine Club-Einstellung außerhalb der
 * Kampagne; in der Schlacht stehen ID und Name (der Name bleibt lesbar, auch wenn der Tisch später wegfällt).
 */
export type P1Command = { type: 'BATTLE_TABLE_SET'; battleId: string; playerId: string | null; table: { id: string; name: string } | null };

export const P1_TYPES = new Set<P1Command['type']>(['BATTLE_TABLE_SET']);

export function dispatchP1(ctx: Ctx, cmd: P1Command) {
  switch (cmd.type) {
    case 'BATTLE_TABLE_SET':
      return setTable(ctx, cmd.battleId, cmd.playerId, cmd.table);
  }
}

/** Offene Schlachten, deren Termin noch gespielt wird (für Tischbelegung und Kalender) */
export const tableRelevant = (b: Battle) => b.status === 'SCHEDULED' || b.status === 'PLAYED';

function setTable(ctx: Ctx, battleId: string, playerId: string | null, table: { id: string; name: string } | null) {
  const st = ctx.state;
  const b = st.battles.find((x) => x.id === battleId);
  if (!b) fail('Schlacht nicht gefunden');
  if (!tableRelevant(b)) fail('Einen Spieltisch gibt es nur für offene Schlachten');
  if (playerId && !sideOf(st, b, playerId)) fail('Nur Teilnehmer der Schlacht können den Spieltisch wählen');
  const where = b.planetId ? planetName(b.planetId) : 'Schlacht';
  if (!table) {
    if (!b.table) fail('Kein Spieltisch eingetragen');
    b.table = null;
    log(ctx, `Spieltisch für ${where} freigegeben`);
    return;
  }
  const id = String(table.id ?? '').trim();
  const name = String(table.name ?? '').trim();
  if (!id || !name || id.length > 40 || name.length > 60) fail('Ungültiger Spieltisch');
  b.table = { id, name };
  log(ctx, `Spieltisch für ${where}: ${name}`);
}

/** Termin eines Tisches (kampagnenübergreifend, vom Server gesammelt) */
export interface TableBooking {
  campaignId: string;
  battleId: string;
  tableId: string;
  at: string;
}

/**
 * Kollisionsprüfung je Tisch (NTH2 2.5): Buchungen desselben Tisches, deren Termin weniger als 3 h
 * (Spieldauer wie bei der Spielerprüfung) entfernt liegt. Die eigene Schlacht zählt nicht.
 */
export function tableClashes(bookings: TableBooking[], tableId: string, at: string, self: { campaignId: string; battleId: string } | null): TableBooking[] {
  const t = new Date(at).getTime();
  if (Number.isNaN(t)) return [];
  return bookings.filter((x) => x.tableId === tableId && !(self && x.campaignId === self.campaignId && x.battleId === self.battleId) && Math.abs(new Date(x.at).getTime() - t) < CLASH_WINDOW_MS);
}

// ─── Handlungsbedarf für die Spielleitung (Web-Push) ───────────────────────

export type GmAlertKind = 'DISPUTED' | 'ORDERS_COMPLETE' | 'BATTLES_COMPLETE' | 'OVERDUE';

export interface GmAlert {
  kind: GmAlertKind;
  /** eindeutiger Schlüssel (Dedupe in der Outbox) */
  key: string;
  battleId?: string;
  phase?: number;
}

/** Alle Flotten mit Befehl? (nur Flotten auf der Karte; Standardbefehle zählen nicht als gegeben) */
function ordersComplete(st: CampaignState): boolean {
  if (st.stage.kind !== 'PHASE' || st.stage.step !== 'OPS') return false;
  const phase = st.stage.phase;
  const ph = st.phases.find((p) => p.number === phase);
  if (!ph) return false;
  const fleets = st.fleets.filter((f) => !f.reserve && f.planetId);
  return fleets.length > 0 && fleets.every((f) => ph.operations.some((o) => o.fleetId === f.id));
}

/** Alle Schlachten der laufenden Phase entschieden (Ergebnis eingetragen oder ungespielt gewertet)? */
function battlesComplete(st: CampaignState): boolean {
  if (st.stage.kind !== 'PHASE' || st.stage.step !== 'BATTLES') return false;
  const phase = st.stage.phase;
  const list = st.battles.filter((b) => b.phaseNumber === phase && b.status !== 'VOID');
  return list.length > 0 && list.every((b) => b.status !== 'SCHEDULED' || !!b.victor);
}

/**
 * Neue Punkte für „Handlungsbedarf“ zwischen zwei Ständen: angefochtene Meldungen, alle Befehle eingegangen,
 * alle Schlachten der Phase gemeldet. Nur Übergänge – ein Stand, der schon vorher galt, löst nichts aus.
 */
export function gmAlerts(before: CampaignState, after: CampaignState): GmAlert[] {
  const out: GmAlert[] = [];
  for (const b of after.battles) {
    const old = before.battles.find((x) => x.id === b.id);
    if (b.draft?.status === 'DISPUTED' && old?.draft?.status !== 'DISPUTED') out.push({ kind: 'DISPUTED', key: `gm:disputed:${b.id}:${b.draft.at}`, battleId: b.id });
  }
  const phase = after.stage.kind === 'PHASE' ? after.stage.phase : null;
  if (phase !== null && ordersComplete(after) && !ordersComplete(before)) out.push({ kind: 'ORDERS_COMPLETE', key: `gm:orders:${phase}`, phase });
  if (phase !== null && battlesComplete(after) && !battlesComplete(before)) out.push({ kind: 'BATTLES_COMPLETE', key: `gm:battles:${phase}`, phase });
  return out;
}

/** Meldungen, die seit über 48 h auf Bestätigung warten (Prüflauf des Schedulers) */
export function overdueAlerts(st: CampaignState, now: number): GmAlert[] {
  return st.battles.filter((b) => b.draft?.status === 'PENDING' && tableRelevant(b) && draftOverdue(b, now)).map((b) => ({ kind: 'OVERDUE' as const, key: `gm:overdue:${b.id}:${b.draft!.at}`, battleId: b.id }));
}
