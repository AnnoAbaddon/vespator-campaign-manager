import { effectiveVictor } from './outcomes';
import { timeClashes } from './playerActions';
import { playersOfAlliance } from './players';
import type { Battle, CampaignState } from './types';

/**
 * „Erinnern“-Knopf in „Handlungsbedarf“ (NTH2 2.7): Wen betrifft die offene Aufgabe einer Schlacht?
 * Je Schlacht zählt die dringendste Aufgabe:
 * 1. gemeldetes Ergebnis wartet auf Bestätigung → die Gegenseite der Meldung
 * 2. Outcome-Entscheidung fehlt → die Siegerseite
 * 3. kein Termin → beide Seiten (bei offenem Vorschlag die Seite, die antworten muss)
 * 4. Terminüberschneidung → beide Seiten
 * 5. kein Verteidiger bzw. Angreifer → Anführer (sonst alle Mitglieder) der betroffenen Allianz
 * Angefochtene Meldungen klärt der Warmaster – dafür gibt es keine Erinnerung.
 */
export type ReminderReason = 'CONFIRM' | 'DECISION' | 'SCHEDULE' | 'CLASH' | 'DEFENDER' | 'ATTACKER';

export interface ReminderTarget {
  reason: ReminderReason;
  playerIds: string[];
}

const ids = (list: { playerId: string }[]) => [...new Set(list.map((p) => p.playerId))];

function allianceContacts(st: CampaignState, allianceId: string, phase: number): string[] {
  const members = playersOfAlliance(st, allianceId, phase);
  const leader = st.alliances.find((a) => a.id === allianceId)?.leaderPlayerId;
  if (leader && members.some((p) => p.id === leader)) return [leader];
  return members.map((p) => p.id);
}

export function reminderTarget(st: CampaignState, b: Battle): ReminderTarget | null {
  if (b.status !== 'SCHEDULED' && b.status !== 'PLAYED') return null;
  const active = (list: string[]) => list.filter((id) => st.players.some((p) => p.id === id && p.active));
  const out = (reason: ReminderReason, list: string[]): ReminderTarget | null => {
    const p = active(list);
    return p.length ? { reason, playerIds: p } : null;
  };
  if (b.draft?.status === 'DISPUTED') return null;
  if (b.draft?.status === 'PENDING') {
    const by = b.draft.byPlayerId;
    const bySide = b.attackers.some((p) => p.playerId === by) ? 'ATTACKER' : 'DEFENDER';
    return out('CONFIRM', ids(bySide === 'ATTACKER' ? b.defenders : b.attackers));
  }
  const v = effectiveVictor(b);
  if (b.kind === 'CAMPAIGN' && v && v !== 'DRAW' && b.operationIds.some((o) => !b.decisions[o])) return out('DECISION', ids(v === 'ATTACKER' ? b.attackers : b.defenders));
  if (b.status === 'SCHEDULED') {
    if (!b.defenders.length) return out('DEFENDER', allianceContacts(st, b.defenderAllianceId, b.phaseNumber));
    if (!b.attackers.length) return out('ATTACKER', allianceContacts(st, b.attackerAllianceId, b.phaseNumber));
    if (!b.scheduledAt) {
      const last = (b.proposals ?? []).at(-1);
      if (last?.side === 'ATTACKER') return out('SCHEDULE', ids(b.defenders));
      if (last?.side === 'DEFENDER') return out('SCHEDULE', ids(b.attackers));
      return out('SCHEDULE', ids([...b.attackers, ...b.defenders]));
    }
    if (timeClashes(st, b, b.scheduledAt).length) return out('CLASH', ids([...b.attackers, ...b.defenders]));
  }
  return null;
}
