import { ATTACK_TYPES, INFRA } from '@/engine/data/vespator';
import type { Battle, CampaignState, OutcomeDecision } from '@/engine/types';
import { planetName } from '@/engine/map';
import type { T } from '@/i18n/core';

// Standard ohne Übersetzung (deutsche Texte mit eingesetzten Platzhaltern)
const deT: T = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : text);

/** Lesbarer Name einer Outcome-Entscheidung statt des Codes (PURGE_A → „Purge and Burn – Angreifer siegt“) */
export function decisionLabel(attackType: Battle['attackType'], type: OutcomeDecision['type'], t: T = deT): string {
  if (type === 'DRAW') return t('Unentschieden');
  const side = type.endsWith('_A') ? t('Angreifer siegt') : t('Verteidiger siegt');
  return attackType ? `${ATTACK_TYPES[attackType].name} – ${side}` : side;
}

/** Location als Text (ohne Übersetzung der Infrastrukturnamen, die sind Regelbegriffe) */
function slotText(state: CampaignState, planetId: string, i: number, t: T) {
  const s = state.planets.find((p) => p.id === planetId)?.slots[i];
  if (!s) return `Location ${i + 1}`;
  if (s.destroyed) return t('Location {n}: zerstört', { n: i + 1 });
  if (!s.infra) return t('Location {n}: frei', { n: i + 1 });
  const a = state.alliances.find((x) => x.id === s.infra!.allianceId);
  return `Location ${i + 1}: ${INFRA[s.infra.type].name} (${a?.name ?? '?'})`;
}

/**
 * Inhalt einer Outcome-Entscheidung in Klartext (für die Bestätigung durch die Gegenseite und die Übersicht
 * des Warmasters). Liefert eine Zeile je Wahl; ohne Wahl „keine weiteren Entscheidungen“.
 */
export function describeDecision(state: CampaignState, b: Battle, d: OutcomeDecision, t: T = deT): string[] {
  const P = b.planetId ?? '';
  const out: string[] = [];
  const fleet = (id: string | null) => state.fleets.find((f) => f.id === id)?.name ?? '?';
  if (d.type !== 'DRAW' && d.shift) out.push(t('PL des Siegers als {shift} behandelt', { shift: d.shift > 0 ? `+${d.shift}` : `−${-d.shift}` }));
  switch (d.type) {
    case 'SEIZE_A':
      if (d.captureSlot !== null) out.push(t('übernimmt {slot}', { slot: slotText(state, P, d.captureSlot, t) }));
      if (d.fallbackType) out.push(t('baut {infra} auf {planet}', { infra: INFRA[d.fallbackType].name, planet: planetName(P) }));
      if (d.bonusType) out.push(t('Zusatzbau: {infra}', { infra: INFRA[d.bonusType].name }));
      break;
    case 'SEIZE_D':
      if (d.build) out.push(t('baut {infra} auf {planet}', { infra: INFRA[d.build.type].name, planet: planetName(d.build.planetId) }));
      break;
    case 'PURGE_D':
      if (d.redistributions.length) out.push(t('Umverteilung von {from} nach {to}', { from: planetName(P), to: d.redistributions.map((p) => planetName(p)).join(', ') }));
      if (d.bonusPlanetId) out.push(t('+1 PL auf {planet}', { planet: planetName(d.bonusPlanetId) }));
      break;
    case 'ORBITAL_D':
      if (d.otherPlanetId)
        out.push(
          d.direction === 'OUT'
            ? t('verlegt {n} Infrastruktur von {from} nach {to}', { n: d.slots.length, from: planetName(P), to: planetName(d.otherPlanetId) })
            : t('verlegt {n} Infrastruktur von {from} nach {to}', { n: d.slots.length, from: planetName(d.otherPlanetId), to: planetName(P) }),
        );
      break;
    case 'BOMBARD_A':
      if (d.slot !== null) out.push(t('Ziel: {slot}', { slot: slotText(state, P, d.slot, t) }));
      break;
    case 'BOMBARD_D':
      if (d.planetId && d.strikes.length) out.push(t('Gegenschlag auf {planet}: {slots}', { planet: planetName(d.planetId), slots: d.strikes.map((s) => slotText(state, d.planetId!, s.slot, t)).join('; ') }));
      break;
    case 'RAID_A':
      if (d.strikes.length) out.push(t('Versuche auf {planets}', { planets: d.strikes.map((s) => planetName(s.planetId)).join(', ') }));
      break;
    case 'RAID_D':
      out.push(t('Angreifer −1 PL auf {planet}', { planet: planetName(d.reducePlanetId ?? P) }));
      break;
    case 'BOARDING_A':
      if (d.targetFleetId) out.push(d.path.length ? t('vertreibt {fleet} nach {path}', { fleet: fleet(d.targetFleetId), path: d.path.map((p) => planetName(p)).join(' → ') }) : t('vertreibt {fleet} nicht', { fleet: fleet(d.targetFleetId) }));
      break;
    case 'BOARDING_D':
      if (d.ownFleetId && d.toPlanetId) out.push(t('bewegt {fleet} nach {planet}', { fleet: fleet(d.ownFleetId), planet: planetName(d.toPlanetId) }));
      break;
  }
  if (!out.length) out.push(t('keine weiteren Entscheidungen'));
  return out;
}
