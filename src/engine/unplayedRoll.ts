import { fail, log, roll, type Ctx } from './ctx';
import { allianceName, planetName } from './board';
import { battleById, resolveUnplayed } from './phase';
import type { Battle, CampaignState } from './types';

/**
 * Hausregel „Auswürfeln statt verfallen“ (B1): Eine ungespielte Schlacht wird per W6-Duell entschieden
 * statt regelgemäß als Sieg des Angreifers gewertet. Optional erhält die Seite mit dem höheren Power Level
 * auf dem umkämpften Planeten +1. Gleichstand wird neu gewürfelt. Beide Würfe stehen im Würfelprotokoll,
 * das Ergebnis im Log und im Phasenbericht („ausgewürfelt“).
 */

export const rollOffActive = (st: Pick<CampaignState, 'toggles'>) => st.toggles.unplayedRollOff?.enabled === true;

/** PL-Modifikator je Seite (+1 für die Seite mit höherem PL, bei Gleichstand keiner) */
export function rollOffModifiers(st: CampaignState, b: Battle): { attacker: number; defender: number } {
  if (!st.toggles.unplayedRollOff?.plModifier || !b.planetId) return { attacker: 0, defender: 0 };
  const p = st.planets.find((x) => x.id === b.planetId);
  const a = p?.power[b.attackerAllianceId] ?? 0;
  const d = p?.power[b.defenderAllianceId] ?? 0;
  return { attacker: a > d ? 1 : 0, defender: d > a ? 1 : 0 };
}

/** W6-Duell für eine ungespielte Kampagnenschlacht */
export function rollOffUnplayed(ctx: Ctx, battleId: string) {
  const st = ctx.state;
  const b = battleById(ctx, battleId);
  if (b.kind !== 'CAMPAIGN') fail('Nur Kampagnenschlachten werden ausgewürfelt');
  if (b.status !== 'SCHEDULED') fail('Nur ungespielte Schlachten');
  const mod = rollOffModifiers(st, b);
  const where = b.planetId ? planetName(b.planetId) : 'Schlacht';
  let ra = 0;
  let rd = 0;
  // Gleichstand: neu würfeln (Schutz gegen endlose Gleichstände)
  for (let i = 0; i < 12; i++) {
    ra = roll(ctx, 'D6', `Auswürfeln ${where}: ${allianceName(st, b.attackerAllianceId)} (Angreifer)`, mod.attacker);
    rd = roll(ctx, 'D6', `Auswürfeln ${where}: ${allianceName(st, b.defenderAllianceId)} (Verteidiger)`, mod.defender);
    if (ra !== rd) break;
  }
  const attackerWins = ra >= rd;
  resolveUnplayed(ctx, b.id, attackerWins ? 'ATTACKER_WINS' : 'DEFENDER_WINS');
  b.unplayedRoll = { attacker: ra, defender: rd, modAttacker: mod.attacker, modDefender: mod.defender };
  log(ctx, `Ausgewürfelt (Hausregel) auf ${where}: ${ra} : ${rd} – ${attackerWins ? 'Angreifer siegt' : 'Verteidiger siegt'}`);
}
