import { fail, log, type Ctx } from './ctx';
import { allianceOf } from './players';
import { battleWhere, claimableSide } from './playerActions';
import type { Battle, BattleGuest, CampaignState } from './types';

/**
 * Gastspieler (B3): Eine Seite darf eine Schlacht mit einem einmaligen Gast ohne Konto bestreiten
 * (Name und Armee, kein Spielerlink). Gäste stehen nicht in den Teilnehmerlisten und zählen deshalb nicht
 * für Spielerstatistik, Spiellast, Obergrenzen und Paarungen. Ergebnis melden und bestätigen für die
 * Gastseite die übrigen Mitglieder der Allianz oder der Spielleiter.
 */

export const MAX_GUESTS_PER_SIDE = 2;

export function guestsOf(b: Pick<Battle, 'guests'>, side: 'ATTACKER' | 'DEFENDER'): BattleGuest[] {
  return (b.guests ?? []).filter((g) => g.side === side);
}

/** Anzeigenamen einer Seite: Spieler, dann Gäste mit Kennzeichnung */
export function sideNames(st: CampaignState, b: Battle, side: 'ATTACKER' | 'DEFENDER', guestLabel = 'Gast'): string[] {
  const list = side === 'ATTACKER' ? b.attackers : b.defenders;
  return [...list.map((p) => st.players.find((x) => x.id === p.playerId)?.nickname ?? '?'), ...guestsOf(b, side).map((g) => `${g.name} (${guestLabel})`)];
}

/**
 * Gast einer Seite setzen oder entfernen. `playerId` null = Spielleiter; ein Spieler darf nur die Seite
 * seiner eigenen Allianz belegen, solange die Schlacht offen ist.
 */
export function setGuest(ctx: Ctx, battleId: string, playerId: string | null, side: 'ATTACKER' | 'DEFENDER', guest: { name: string; faction: string } | null, index = 0) {
  const st = ctx.state;
  const b = st.battles.find((x) => x.id === battleId);
  if (!b) fail('Schlacht nicht gefunden');
  if (playerId) {
    const p = st.players.find((x) => x.id === playerId);
    if (!p) fail('Spieler nicht gefunden');
    if (b.status !== 'SCHEDULED' || b.draft) fail('Gäste lassen sich nur eintragen, solange die Schlacht offen ist – bitte beim Spielleiter melden');
    const al = allianceOf(p, b.phaseNumber);
    const own = side === 'ATTACKER' ? b.attackerAllianceId : b.defenderAllianceId;
    if (al !== own || claimableSide(st, b, playerId) !== side) fail('Einen Gast trägt nur die eigene Seite ein');
  } else if (b.status === 'PROCESSED') fail('Schlacht bereits verarbeitet');
  const mine = guestsOf(b, side);
  const others = (b.guests ?? []).filter((g) => g.side !== side);
  if (!guest) {
    if (!mine[index]) fail('Kein Gast eingetragen');
    const gone = mine[index];
    b.guests = [...others, ...mine.filter((_, i) => i !== index)];
    if (!b.guests.length) delete b.guests;
    log(ctx, `Gast entfernt: ${gone.name} (${battleWhere(b)})`);
    return;
  }
  const name = guest.name.trim().slice(0, 40);
  if (!name) fail('Name des Gasts fehlt');
  if (st.players.some((p) => p.nickname.toLowerCase() === name.toLowerCase())) fail('Dieser Name gehört zu einem Spieler der Kampagne – bitte als Spieler eintragen');
  const g: BattleGuest = { side, name, faction: guest.faction.trim().slice(0, 60) };
  if (index < mine.length) mine[index] = g;
  else {
    if (mine.length >= MAX_GUESTS_PER_SIDE) fail(`Höchstens ${MAX_GUESTS_PER_SIDE} Gäste je Seite`);
    mine.push(g);
  }
  b.guests = [...(side === 'ATTACKER' ? mine : others), ...(side === 'ATTACKER' ? others : mine)];
  log(ctx, `Gast ${side === 'DEFENDER' ? 'verteidigt' : 'greift an'}: ${name}${g.faction ? ` (${g.faction})` : ''} – ${battleWhere(b)}`);
}
