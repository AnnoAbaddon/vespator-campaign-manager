import { INFRA, type InfraType } from './data/vespator';
import { fail, log, roll, warn, type Ctx } from './ctx';
import { allianceName, build, canBuild, countInfra, decrease, destroyInfra, destroyLocation, fleetName, increase, minPL, pl, planet, planetName, removeInfra, strongholdPlanet } from './board';
import { connectedFor, inRangeOf, modifierActive } from './graph';
import { house } from './houseRules';
import { lastPhaseRule } from './campaignRules';
import type { Battle, CampaignState, Operation, OutcomeDecision, Victor } from './types';

export type Side = 'ATTACKER' | 'DEFENDER';

export function sideAlliance(b: Battle, side: Side) {
  return side === 'ATTACKER' ? b.attackerAllianceId : b.defenderAllianceId;
}

export function effectiveVictor(b: Battle): Victor | null {
  if (b.status === 'UNPLAYED_RESOLVED') {
    if (b.unplayedResolution === 'ATTACKER_WINS') return 'ATTACKER';
    if (b.unplayedResolution === 'DEFENDER_WINS') return 'DEFENDER';
    return null;
  }
  // Review: verfallene oder verschobene Schlachten haben keinen Sieger (ältere Stände behielten ihn)
  if (b.status === 'VOID') return null;
  return b.victor;
}

/** Quellen für ±1 beim effektiven Power Level (SPEC 7.5) */
export function powerSources(state: CampaignState, b: Battle, side: Side): { mission: string[]; outcome: string[] } {
  const res = { mission: [] as string[], outcome: [] as string[] };
  if (!b.planetId) return res;
  const own = sideAlliance(b, side);
  const opp = sideAlliance(b, side === 'ATTACKER' ? 'DEFENDER' : 'ATTACKER');
  const phase = b.phaseNumber;
  for (const p of state.planets) {
    for (const s of p.slots) {
      if (s.destroyed || s.infra?.allianceId !== own) continue;
      if (s.infra.type === 'STAGING_GROUNDS' && inRangeOf(state, own, p.id, b.planetId, phase)) {
        if (!res.mission.includes('Staging Grounds')) res.mission.push('Staging Grounds');
      }
    }
  }
  const sh = strongholdPlanet(state, own);
  if (sh && inRangeOf(state, own, sh, b.planetId, phase)) res.outcome.push('Stronghold');
  const co = state.modifiers.find((m) => m.kind === 'COORDINATED_OPPOSITION' && m.phaseNumber === phase);
  if (co && co.allianceId === opp && own !== opp) {
    res.mission.push('Coordinated Opposition');
    res.outcome.push('Coordinated Opposition');
  }
  return res;
}

export function decisionTypesFor(attackType: Battle['attackType'], victor: Victor): OutcomeDecision['type'] {
  if (victor === 'DRAW') return 'DRAW';
  const w = victor === 'ATTACKER' ? 'A' : 'D';
  const base = {
    SEIZE_POWER_BASE: 'SEIZE',
    PURGE_AND_BURN: 'PURGE',
    ORBITAL_INVASION: 'ORBITAL',
    PLANETARY_BOMBARDMENT: 'BOMBARD',
    SUPPLY_BASE_RAID: 'RAID',
    BOARDING_ACTION: 'BOARDING',
  }[attackType!];
  return `${base}_${w}` as OutcomeDecision['type'];
}

export function defaultDecision(type: OutcomeDecision['type']): OutcomeDecision {
  switch (type) {
    case 'SEIZE_A':
      return { type, captureSlot: null, fallbackType: null, bonusType: null, shift: 0 };
    case 'SEIZE_D':
      return { type, build: null, shift: 0 };
    case 'PURGE_A':
    case 'ORBITAL_A':
      return { type, shift: 0 };
    case 'PURGE_D':
      return { type, redistributions: [], bonusPlanetId: null, shift: 0 };
    case 'ORBITAL_D':
      return { type, otherPlanetId: null, direction: 'OUT', slots: [], shift: 0 };
    case 'BOMBARD_A':
      return { type, slot: null, roll: null, shift: 0 };
    case 'BOMBARD_D':
      return { type, planetId: null, strikes: [], shift: 0 };
    case 'RAID_A':
      return { type, strikes: [], shift: 0 };
    case 'RAID_D':
      return { type, reducePlanetId: null, shift: 0 };
    case 'BOARDING_A':
      return { type, targetFleetId: null, path: [], shift: 0 };
    case 'BOARDING_D':
      return { type, ownFleetId: null, toPlanetId: null, shift: 0 };
    case 'DRAW':
      return { type: 'DRAW' };
  }
}

/**
 * Standard-Entscheidung mit Vorbelegung aus dem Befehl: Bei Boarding Action übernimmt der Sieger die beim
 * Befehl gewählte Zielflotte (R4), solange sie noch als Verteidiger-Flotte auf dem Planeten steht.
 */
export function defaultDecisionFor(st: CampaignState | undefined, b: Battle, opId: string, type: OutcomeDecision['type']): OutcomeDecision {
  const d = defaultDecision(type);
  if (d.type === 'BOARDING_A' && st) {
    let op: Operation | undefined;
    for (const p of st.phases) op ??= p.operations.find((o) => o.id === opId);
    const f = op?.targetFleetId ? st.fleets.find((x) => x.id === op.targetFleetId) : undefined;
    if (f && f.allianceId === b.defenderAllianceId && f.planetId === b.planetId) d.targetFleetId = f.id;
  }
  return d;
}

/**
 * Vorprüfung einer Entscheidung beim Eintragen (nicht erst in 2.4): alles, was vom Würfeln unabhängig ist.
 * Liefert einen Fehlertext oder null. Stand der Karte = jetzt; die Verarbeitung prüft erneut.
 */
export function precheckDecision(st: CampaignState, b: Battle, victor: Victor, d: OutcomeDecision): string | null {
  const P = b.planetId;
  if (!P || d.type === 'DRAW') return null;
  const se = shiftError(st, b, victor, d, false);
  if (se) return se;
  const D = b.defenderAllianceId;
  if (d.type === 'BOMBARD_A' && d.slot !== null) {
    const valid = bombardSlots(st, P, (s) => !s.infra || s.infra.allianceId === D);
    if (!valid.includes(d.slot)) return 'gültige Infrastructure Location wählen (frei oder mit Verteidiger-Infrastruktur, Stronghold nur wenn nötig)';
  }
  if (d.type === 'BOMBARD_D') {
    if (!d.planetId) return d.strikes.length ? 'Planet für den Gegenschlag wählen' : null;
    if (!connectedFor(st, D, P, d.planetId, b.phaseNumber)) return 'Planet ist nicht verbunden';
    const bonus = powerSources(st, b, victor as Side).outcome.length ? (d.shift ?? 0) : 0;
    const maxStrikes = pl(st, D, P) + bonus >= 3 ? 2 : 1;
    if (d.strikes.length > maxStrikes) return `höchstens ${maxStrikes} Schläge`;
    const valid = bombardSlots(st, d.planetId, () => true);
    for (const s of d.strikes) if (!valid.includes(s.slot)) return `Location ${s.slot + 1} ist nicht wählbar`;
  }
  return null;
}

/**
 * Review: „PL anders behandeln“ (±) muss eine ganze Zahl sein und darf die verfügbaren Quellen nicht
 * übersteigen (Standard ±1, Hausregel F-15: ±1 je Quelle). Fehlt der Wert (ältere Entscheidungen), gilt 0.
 * Beim Eintragen (`atProcessing = false`) nur Typ und Obergrenze (±2 = Stronghold + Coordinated Opposition):
 * Welche Quellen gelten, entscheidet der Stand der Karte bei der Verarbeitung (2.4).
 */
export function shiftError(st: CampaignState, b: Battle, victor: Victor, d: OutcomeDecision, atProcessing = true): string | null {
  if (d.type === 'DRAW') return null;
  const shift: unknown = d.shift ?? 0;
  if (typeof shift !== 'number' || !Number.isInteger(shift)) return 'Power Level nur um eine ganze Zahl anders behandeln';
  if (shift === 0) return null;
  if (!atProcessing) return Math.abs(shift) > 2 ? 'Power Level höchstens um ±2 anders behandeln' : null;
  const src = powerSources(st, b, victor as Side).outcome;
  if (!src.length) return '±1 auf das Power Level ist ohne Stronghold oder Coordinated Opposition nicht erlaubt';
  // F-15: Standard höchstens ±1; Hausregel: ±1 je Quelle
  const maxShift = house(st, 'F15_TREAT_STACKS') ? src.length : 1;
  if (Math.abs(shift) > maxShift) return `Power Level höchstens um ±${maxShift} anders behandeln`;
  return null;
}

function invalid(msg: string): never {
  fail(`Entscheidung ungültig: ${msg}`);
}

function tryBuild(ctx: Ctx, allianceId: string, type: InfraType, planetId: string, why: string, slot?: number) {
  const err = canBuild(ctx.state, allianceId, type, planetId, { allowStronghold: type === 'STRONGHOLD' });
  if (err) {
    log(ctx, `Bau entfällt (${why}): ${err}`);
    return false;
  }
  build(ctx, allianceId, type, planetId, { slot, why, allowStronghold: type === 'STRONGHOLD' });
  return true;
}

/** Gültige Ziel-Locations für Bombardierungen: Stronghold nur, wenn nichts anderes geht. */
export function bombardSlots(state: CampaignState, planetId: string, filter: (s: { infra: { allianceId: string; type: InfraType } | null }) => boolean): number[] {
  const p = planet(state, planetId);
  const cands = p.slots.map((s, i) => ({ s, i })).filter(({ s }) => !s.destroyed && filter(s));
  const nonSh = cands.filter(({ s }) => s.infra?.type !== 'STRONGHOLD');
  return (nonSh.length ? nonSh : cands).map(({ i }) => i);
}

/**
 * Wendet das Campaign Outcome einer Operation an (SPEC 10.4).
 * PL-Bedingungen verwenden die Werte zum Verarbeitungszeitpunkt.
 */
export function applyOutcome(ctx: Ctx, b: Battle, op: Operation, victor: Victor, d: OutcomeDecision) {
  const st = ctx.state;
  const A = b.attackerAllianceId;
  const D = b.defenderAllianceId;
  const P = b.planetId!;
  const phase = b.phaseNumber;
  const expected = decisionTypesFor(b.attackType, victor);
  if (d.type !== expected) invalid(`erwartet ${expected}, erhalten ${d.type}`);
  const conn = (al: string, to: string) => connectedFor(st, al, P, to, phase);

  const shift = d.type !== 'DRAW' ? (d.shift ?? 0) : 0;
  const se = shiftError(st, b, victor, d);
  if (se) invalid(se);
  if (shift !== 0) {
    const src = powerSources(st, b, victor as Side).outcome;
    log(ctx, `Sieger behandelt sein PL als ${shift > 0 ? `+${shift}` : `−${-shift}`} (${src.join(', ')})`);
  }
  const ePL = (al: string) => pl(st, al, P) + shift;
  // N2.4: in der letzten Phase zählen PL-Erhöhungen des Siegers doppelt (max. 4); Reduktionen bleiben einfach
  const winnerAl = victor === 'ATTACKER' ? A : victor === 'DEFENDER' ? D : null;
  const gain = (al: string, planetId: string, why: string) => {
    const twice = al === winnerAl && lastPhaseRule(st, phase, 'doubleGains');
    increase(ctx, al, planetId, twice ? 2 : 1, twice ? `${why}, letzte Phase doppelt` : why);
  };

  switch (d.type) {
    case 'DRAW':
      increase(ctx, A, P, 1, 'Unentschieden');
      return;

    case 'SEIZE_A': {
      const ePLA = ePL(A);
      const dSlots = planet(st, P)
        .slots.map((s, i) => ({ s, i }))
        .filter(({ s }) => !s.destroyed && s.infra && s.infra.allianceId === D && s.infra.type !== 'STRONGHOLD');
      if (dSlots.length) {
        if (d.captureSlot === null || !dSlots.some((x) => x.i === d.captureSlot)) invalid('ein Infrastrukturstück des Verteidigers auf dem Planeten wählen');
        const capType = planet(st, P).slots[d.captureSlot].infra!.type;
        // F-10: Standard – Stück wird auch entfernt, wenn der Angreifer am Limit ist; Hausregel: es bleibt stehen
        const blocked = countInfra(st, A, capType) >= INFRA[capType].max ? `${INFRA[capType].name}-Limit des Angreifers erreicht` : null;
        if (blocked && house(st, 'F10_SEIZE_KEEP')) log(ctx, `Hausregel (F-10): ${INFRA[capType].name} bleibt stehen – ${blocked}`);
        else {
          const info = removeInfra(ctx, P, d.captureSlot, 'Seize Power Base');
          tryBuild(ctx, A, info.type, P, 'übernommen', d.captureSlot);
        }
      } else if (d.fallbackType) {
        if (d.fallbackType === 'STRONGHOLD') invalid('kein Stronghold');
        tryBuild(ctx, A, d.fallbackType, P, 'Seize Power Base');
      } else {
        log(ctx, 'Keine Infrastruktur des Verteidigers vorhanden, kein Ersatzbau gewählt');
      }
      if (ePLA >= 3) {
        if (d.bonusType) {
          if (d.bonusType === 'STRONGHOLD') invalid('kein Stronghold');
          tryBuild(ctx, A, d.bonusType, P, 'Seize Power Base, PL ≥ 3');
        } else log(ctx, 'Zusatzbau (PL ≥ 3) nicht genutzt');
      } else if (d.bonusType) warn(ctx, 'Zusatzbau nur bei Power Level ≥ 3 – wird ignoriert');
      gain(A, P, 'Seize Power Base');
      return;
    }

    case 'SEIZE_D': {
      if (d.build) {
        const t = d.build.type;
        if (t !== 'FORTIFICATION_LINE' && t !== 'STAGING_GROUNDS') invalid('nur Fortification Line oder Staging Grounds');
        if (t === 'STAGING_GROUNDS' && ePL(D) < 3) invalid('Staging Grounds nur bei Power Level ≥ 3');
        if (d.build.planetId !== P && !conn(D, d.build.planetId)) invalid('Planet muss dieser oder ein verbundener sein');
        if (t === 'STAGING_GROUNDS' && d.build.planetId !== P && house(st, 'F11_STAGING_SAME_PLANET')) invalid('Hausregel (F-11): Staging Grounds nur auf dem umkämpften Planeten');
        tryBuild(ctx, D, t, d.build.planetId, 'Seize Power Base, Verteidigung');
      }
      gain(D, P, 'Seize Power Base, Verteidigung');
      return;
    }

    case 'PURGE_A':
      if (ePL(A) >= pl(st, D, P)) decrease(ctx, D, P, 1, 'Purge and Burn');
      else log(ctx, 'Angreifer-PL kleiner als Verteidiger-PL – keine Reduktion');
      gain(A, P, 'Purge and Burn');
      return;

    case 'PURGE_D': {
      for (const to of d.redistributions) {
        if (!conn(D, to)) invalid(`${planetName(to)} ist nicht verbunden`);
        const cur = pl(st, D, P);
        // F-12: Standard – das Zerstören einer Line zählt als Senkung; Hausregel: nur echte PL-Senkung
        const canSubtract = !planet(st, P).destroyed && (house(st, 'F12_LINE_NOT_SUBTRACT') ? cur - 1 >= minPL(st, D, P) : cur - 1 >= 1 || minPL(st, D, P) > 1);
        if (!canSubtract) invalid(`Power Level auf ${planetName(P)} kann nicht weiter gesenkt werden`);
        decrease(ctx, D, P, 1, 'Purge and Burn, Umverteilung');
        increase(ctx, D, to, 1, 'Purge and Burn, Umverteilung');
      }
      if (d.bonusPlanetId) {
        if (!conn(D, d.bonusPlanetId)) invalid('Bonus-Planet ist nicht verbunden');
        gain(D, d.bonusPlanetId, 'Purge and Burn, Verteidigung');
      } else warn(ctx, 'Kein verbundener Planet für +1 gewählt');
      return;
    }

    case 'ORBITAL_A':
      if (ePL(A) < pl(st, D, P)) decrease(ctx, D, P, 1, 'Orbital Invasion');
      else log(ctx, 'Angreifer-PL nicht kleiner als Verteidiger-PL – keine Reduktion');
      gain(A, P, 'Orbital Invasion');
      return;

    case 'ORBITAL_D': {
      if (d.otherPlanetId && d.slots.length) {
        if (!conn(D, d.otherPlanetId)) invalid('Planet ist nicht verbunden');
        const from = d.direction === 'OUT' ? P : d.otherPlanetId;
        const to = d.direction === 'OUT' ? d.otherPlanetId : P;
        const fromP = planet(st, from);
        for (const i of d.slots) {
          const s = fromP.slots[i];
          if (!s || s.destroyed || !s.infra || s.infra.allianceId !== D) invalid(`Location ${i + 1} auf ${planetName(from)} trägt keine eigene Infrastruktur`);
          if (s.infra.type === 'STRONGHOLD' && house(st, 'F13_STRONGHOLD_FIXED')) invalid('Hausregel (F-13): Der Stronghold darf nicht umziehen');
        }
        const free = planet(st, to).slots.filter((s) => !s.destroyed && !s.infra).length;
        if (planet(st, to).destroyed) invalid(`${planetName(to)} ist zerstört`);
        if (d.slots.length > free) invalid(`${planetName(to)} hat nur ${free} freie Locations`);
        for (const i of d.slots) {
          const info = removeInfra(ctx, from, i, 'Orbital Invasion, Verlegung');
          build(ctx, D, info.type, to, { allowStronghold: true, why: 'Orbital Invasion, Verlegung' });
        }
      }
      gain(D, P, 'Orbital Invasion, Verteidigung');
      return;
    }

    case 'BOMBARD_A': {
      const valid = bombardSlots(st, P, (s) => !s.infra || s.infra.allianceId === D);
      if (valid.length) {
        if (d.slot === null || !valid.includes(d.slot)) invalid('gültige Infrastructure Location wählen (frei oder mit Verteidiger-Infrastruktur, Stronghold nur wenn nötig)');
        const bonus = ePL(A) >= 3 ? 1 : 0;
        const r = roll(ctx, 'D6', `Planetary Bombardment ${planetName(P)} Location ${d.slot + 1}${bonus ? ' (+1)' : ''}`, bonus);
        if (r >= 3) {
          log(ctx, `Bombardement trifft (${r})`);
          destroyLocation(ctx, P, d.slot, 'Planetary Bombardment');
        } else log(ctx, `Bombardement verfehlt (${r})`);
      } else log(ctx, 'Keine gültige Location für das Bombardement');
      gain(A, P, 'Planetary Bombardment');
      return;
    }

    case 'BOMBARD_D': {
      if (d.planetId) {
        if (!conn(D, d.planetId)) invalid('Planet ist nicht verbunden');
        const maxStrikes = ePL(D) >= 3 ? 2 : 1;
        if (d.strikes.length > maxStrikes) invalid(`höchstens ${maxStrikes} Schläge`);
        const before = d.strikes.map((s) => planet(st, d.planetId!).slots[s.slot]?.destroyed ?? true);
        for (const [k, sIdx] of d.strikes.entries()) {
          // Zweiter Schlag auf dieselbe Location, die der erste zerstört hat: entfällt (keine ungültige Entscheidung)
          if (k > 0 && !before[k] && planet(st, d.planetId).slots[sIdx.slot]?.destroyed) {
            log(ctx, `Gegenschlag ${k + 1} entfällt – Location ${sIdx.slot + 1} auf ${planetName(d.planetId)} ist bereits zerstört`);
            continue;
          }
          const valid = bombardSlots(st, d.planetId, () => true);
          if (!valid.includes(sIdx.slot)) invalid(`Location ${sIdx.slot + 1} ist nicht wählbar`);
          const tgt = planet(st, d.planetId).slots[sIdx.slot];
          if (tgt.infra?.allianceId === D) warn(ctx, 'Gegenschlag trifft eigene Infrastruktur');
          const r = roll(ctx, 'D6', `Gegenschlag ${k + 1} auf ${planetName(d.planetId)} Location ${sIdx.slot + 1}`);
          if (r === 6) {
            log(ctx, `Gegenschlag trifft die Location (${r})`);
            destroyLocation(ctx, d.planetId, sIdx.slot, 'Gegenschlag');
          } else if (r >= 4) {
            log(ctx, `Gegenschlag trifft die Infrastruktur (${r})`);
            destroyInfra(ctx, d.planetId, sIdx.slot, 'Gegenschlag');
          } else log(ctx, `Gegenschlag ohne Wirkung (${r})`);
        }
      }
      gain(D, P, 'Planetary Bombardment, Verteidigung');
      return;
    }

    case 'RAID_A': {
      const maxStrikes = ePL(A) >= 3 ? 2 : 1;
      if (d.strikes.length > maxStrikes) invalid(`höchstens ${maxStrikes} Versuche`);
      for (const [k, s] of d.strikes.entries()) {
        if (s.planetId !== P && !conn(A, s.planetId)) invalid(`${planetName(s.planetId)} ist nicht dieser oder ein verbundener Planet`);
        const r = roll(ctx, 'D6', `Supply Base Raid ${k + 1} auf ${planetName(s.planetId)}`);
        if (r >= 4) {
          log(ctx, `Raid erfolgreich (${r})`);
          decrease(ctx, D, s.planetId, 1, 'Supply Base Raid');
        } else log(ctx, `Raid ohne Wirkung (${r})`);
      }
      gain(A, P, 'Supply Base Raid');
      return;
    }

    case 'RAID_D': {
      const target = d.reducePlanetId ?? P;
      if (target !== P) {
        if (ePL(D) < 3) invalid('verbundener Planet nur bei Power Level ≥ 3');
        if (!conn(D, target)) invalid('Planet ist nicht verbunden');
      }
      decrease(ctx, A, target, 1, 'Supply Base Raid, Verteidigung');
      gain(D, P, 'Supply Base Raid, Verteidigung');
      return;
    }

    case 'BOARDING_A': {
      if (d.targetFleetId) {
        const f = st.fleets.find((x) => x.id === d.targetFleetId);
        if (!f || f.allianceId !== D || f.planetId !== P) invalid('Zielflotte muss eine Verteidiger-Flotte auf dem Planeten sein');
        if (d.path.length > 2) invalid('höchstens zwei Bewegungen');
        let cur = P;
        for (const next of d.path) {
          // R3: Bewegung nach den Regeln des Schritts Move Fleets – mit F-18-Alternative gilt die Support Facility hier auch
          if (!connectedFor(st, D, cur, next, phase, 'move')) invalid(`${planetName(next)} ist von ${planetName(cur)} aus nicht verbunden`);
          cur = next;
        }
        if (d.path.length) {
          f.planetId = cur;
          log(ctx, `${fleetName(st, f.id)} wird nach ${planetName(cur)} vertrieben`);
        }
      } else if (st.fleets.some((f) => f.allianceId === D && f.planetId === P)) {
        log(ctx, 'Keine Flotte vertrieben');
      }
      gain(A, P, 'Boarding Action');
      return;
    }

    case 'BOARDING_D': {
      const ph = st.phases.find((p) => p.number === phase);
      if (ph && !ph.noMoveFleets.includes(op.fleetId)) ph.noMoveFleets.push(op.fleetId);
      log(ctx, `${fleetName(st, op.fleetId)} darf in dieser Phase nicht ziehen`);
      if (d.ownFleetId) {
        const f = st.fleets.find((x) => x.id === d.ownFleetId);
        if (!f || f.allianceId !== D || f.planetId !== P) invalid('eigene Flotte muss auf dem Planeten stehen');
        if (!d.toPlanetId || !connectedFor(st, D, P, d.toPlanetId, phase, 'move')) invalid('Zielplanet muss verbunden sein');
        f.planetId = d.toPlanetId;
        log(ctx, `${fleetName(st, f.id)} zieht nach ${planetName(d.toPlanetId)}`);
      }
      gain(D, P, 'Boarding Action, Verteidigung');
      return;
    }
  }
}

/** Kurzbeschreibung der möglichen Outcomes (eigene Worte, für Briefing) */
export const OUTCOME_SUMMARY: Record<string, { A: string; D: string }> = {
  SEIZE_POWER_BASE: {
    A: 'Übernimmt ein Infrastrukturstück des Verteidigers (sonst Neubau); bei PL ≥ 3 ein weiterer Bau; +1 PL.',
    D: 'Darf eine Fortification Line (bei PL ≥ 3 alternativ Staging Grounds) hier oder verbunden bauen; +1 PL.',
  },
  PURGE_AND_BURN: {
    A: 'Ist das Angreifer-PL ≥ dem Verteidiger-PL: Verteidiger −1 PL; Angreifer +1 PL.',
    D: 'Darf PL von hier beliebig auf verbundene Planeten umschichten; +1 PL auf einem verbundenen Planeten.',
  },
  ORBITAL_INVASION: {
    A: 'Ist das Angreifer-PL kleiner als das Verteidiger-PL: Verteidiger −1 PL; Angreifer +1 PL.',
    D: 'Darf Infrastruktur zwischen hier und einem verbundenen Planeten verlegen; +1 PL.',
  },
  PLANETARY_BOMBARDMENT: {
    A: 'Eine Location (frei oder mit Verteidiger-Infrastruktur) wird bei 3+ (W6, +1 bei PL ≥ 3) zerstört; +1 PL.',
    D: 'Gegenschlag auf einen verbundenen Planeten (4–5: Infrastruktur, 6: Location zerstört; bei PL ≥ 3 zweimal); +1 PL.',
  },
  SUPPLY_BASE_RAID: {
    A: 'Hier oder verbunden: bei 4+ Verteidiger −1 PL (bei PL ≥ 3 zweimal); +1 PL.',
    D: 'Angreifer −1 PL hier (bei PL ≥ 3 wahlweise auf einem verbundenen Planeten); +1 PL.',
  },
  BOARDING_ACTION: {
    A: 'Eine Verteidiger-Flotte hier wird bis zu zweimal verschoben; +1 PL.',
    D: 'Die angreifende Flotte darf diese Phase nicht ziehen; eine eigene Flotte darf einmal ziehen; +1 PL.',
  },
};

export const DRAW_SUMMARY = 'Angreifer +1 PL.';

export function infraLabel(t: InfraType) {
  return INFRA[t].name;
}

export { allianceName, modifierActive };
