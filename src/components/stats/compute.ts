import { ATTACK_TYPES, type AttackType } from '@/engine/data/vespator';
import { missionLabel } from '@/engine/missions';
import type { Battle, CampaignState } from '@/engine/types';
import { mapOf } from '@/engine/map';

export function countedBattles(state: CampaignState): Battle[] {
  // ungespielt gewertete Schlachten zählen nicht (SPEC 18.1) – auch nach der Verarbeitung (PROCESSED) erkennbar
  return state.battles.filter((b) => b.kind === 'CAMPAIGN' && (b.status === 'PLAYED' || b.status === 'PROCESSED') && !b.unplayedResolution && b.victor && b.vp);
}

export interface PlayerStat {
  playerId: string;
  nickname: string;
  battles: number;
  wins: number;
  draws: number;
  losses: number;
  vpFor: number;
  vpAgainst: number;
  battleReady: number;
  attacks: number;
  defenses: number;
  medals: number;
}

export interface FactionStat {
  faction: string;
  battles: number;
  wins: number;
  draws: number;
  losses: number;
  vpFor: number;
  vpAgainst: number;
}

function sideTotals(b: Battle) {
  const a = (b.vp?.attacker ?? 0) + (b.battleReady.attacker ? 10 : 0);
  const d = (b.vp?.defender ?? 0) + (b.battleReady.defender ? 10 : 0);
  return { a, d };
}

export function playerStats(state: CampaignState): PlayerStat[] {
  const map = new Map<string, PlayerStat>();
  const get = (id: string) => {
    let s = map.get(id);
    if (!s) {
      const p = state.players.find((x) => x.id === id);
      s = { playerId: id, nickname: p?.nickname ?? id, battles: 0, wins: 0, draws: 0, losses: 0, vpFor: 0, vpAgainst: 0, battleReady: 0, attacks: 0, defenses: 0, medals: 0 };
      map.set(id, s);
    }
    return s;
  };
  for (const b of countedBattles(state)) {
    const { a, d } = sideTotals(b);
    for (const [list, side] of [
      [b.attackers, 'A'],
      [b.defenders, 'D'],
    ] as const) {
      for (const p of list) {
        const s = get(p.playerId);
        s.battles++;
        if (side === 'A') s.attacks++;
        else s.defenses++;
        s.vpFor += side === 'A' ? a : d;
        s.vpAgainst += side === 'A' ? d : a;
        if (side === 'A' ? b.battleReady.attacker : b.battleReady.defender) s.battleReady++;
        if (b.victor === 'DRAW') s.draws++;
        else if ((b.victor === 'ATTACKER') === (side === 'A')) s.wins++;
        else s.losses++;
      }
    }
  }
  for (const m of state.medals) for (const pid of m.playerIds) get(pid).medals++;
  for (const p of state.players) if (p.active) get(p.id);
  // Spieler ohne gewertete Schlacht stehen ohne Rang am Ende (alphabetisch)
  return [...map.values()].sort((x, y) => Number(y.battles > 0) - Number(x.battles > 0) || y.wins - x.wins || y.vpFor - y.vpAgainst - (x.vpFor - x.vpAgainst) || x.nickname.localeCompare(y.nickname));
}

/** Bilanz eines Spielers für sein Profil – dieselbe Zählung wie die Statistik (ungespielt gewertete Schlachten zählen nicht, B8) */
export function profileRecord(state: CampaignState, playerId: string): { battles: number; wins: number; draws: number; losses: number } {
  const s = playerStats(state).find((x) => x.playerId === playerId);
  return { battles: s?.battles ?? 0, wins: s?.wins ?? 0, draws: s?.draws ?? 0, losses: s?.losses ?? 0 };
}

export function factionStats(state: CampaignState): FactionStat[] {
  const map = new Map<string, FactionStat>();
  for (const b of countedBattles(state)) {
    const { a, d } = sideTotals(b);
    for (const [list, side] of [
      [b.attackers, 'A'],
      [b.defenders, 'D'],
    ] as const) {
      for (const p of list) {
        const f = p.faction?.trim() || 'Unbekannt';
        let s = map.get(f);
        if (!s) map.set(f, (s = { faction: f, battles: 0, wins: 0, draws: 0, losses: 0, vpFor: 0, vpAgainst: 0 }));
        s.battles++;
        s.vpFor += side === 'A' ? a : d;
        s.vpAgainst += side === 'A' ? d : a;
        if (b.victor === 'DRAW') s.draws++;
        else if ((b.victor === 'ATTACKER') === (side === 'A')) s.wins++;
        else s.losses++;
      }
    }
  }
  return [...map.values()].sort((x, y) => y.battles - x.battles);
}

export function planetStats(state: CampaignState) {
  return mapOf(state)
    .planets.map((p) => {
      const bs = state.battles.filter((b) => b.kind === 'CAMPAIGN' && b.planetId === p.id && b.status !== 'VOID');
      const ps = state.planets.find((x) => x.id === p.id)!;
      return {
        id: p.id,
        name: p.name,
        battles: bs.length,
        destroyedSlots: ps.slots.filter((s) => s.destroyed).length,
        destroyed: ps.destroyed,
        power: ps.power,
      };
    })
    .sort((a, b) => b.battles - a.battles || a.name.localeCompare(b.name));
}

export function allianceAttackStats(state: CampaignState) {
  const types = Object.keys(ATTACK_TYPES) as AttackType[];
  return state.alliances.map((a) => {
    const row: Record<string, { w: number; l: number; d: number }> = {};
    for (const t of types) row[t] = { w: 0, l: 0, d: 0 };
    const ops: Record<string, number> = {};
    for (const ph of state.phases) for (const o of ph.operations) if (o.allianceId === a.id && !o.hidden) ops[o.type] = (ops[o.type] ?? 0) + 1;
    for (const b of state.battles) {
      if (b.kind !== 'CAMPAIGN' || !b.attackType || !b.victor) continue;
      if (b.status !== 'PLAYED' && b.status !== 'PROCESSED' && b.status !== 'UNPLAYED_RESOLVED') continue;
      const side = b.attackerAllianceId === a.id ? 'A' : b.defenderAllianceId === a.id ? 'D' : null;
      if (!side) continue;
      const r = row[b.attackType];
      if (b.victor === 'DRAW') r.d++;
      else if ((b.victor === 'ATTACKER') === (side === 'A')) r.w++;
      else r.l++;
    }
    return { alliance: a, byType: row, ops };
  });
}

/** Planet-PL-Verlauf ist nicht historisiert; Punkte-Historie je Phase */
export function pointsSeries(state: CampaignState) {
  return state.pointsHistory
    .slice()
    .sort((a, b) => a.phaseNumber - b.phaseNumber)
    .map((h) => {
      const row: Record<string, number | string> = { phase: h.phaseNumber === 0 ? 'Start' : `P${h.phaseNumber}` };
      for (const a of state.alliances) {
        row[a.id] = h.points[a.id] ?? 0;
        row[`${a.id}_pl`] = h.powerSum?.[a.id] ?? 0;
        row[`${a.id}_sh`] = (h.points[a.id] ?? 0) - (h.powerSum?.[a.id] ?? 0);
      }
      return row;
    });
}

export const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)} %` : '–');
export const avg = (n: number, d: number) => (d ? (n / d).toFixed(1) : '–');

/** Gespielte Missionen nach Häufigkeit (N2.2) */
export function missionStats(state: CampaignState): { name: string; count: number }[] {
  const n: Record<string, number> = {};
  for (const b of state.battles) {
    if (b.status !== 'PLAYED' && b.status !== 'PROCESSED') continue;
    if (b.games?.length) for (const g of b.games) n[g.missionName || missionLabel(state, b)] = (n[g.missionName || missionLabel(state, b)] ?? 0) + 1;
    else n[missionLabel(state, b)] = (n[missionLabel(state, b)] ?? 0) + 1;
  }
  return Object.entries(n)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Gleichmäßig verteilte Achsenwerte ab 0 (etwa `count` Abschnitte mit „runder“ Schrittweite 1/2/4/5/8/10 × 10^n),
 * z. B. max 29 → 0/8/16/24/32. Der letzte Wert liegt immer auf oder über `max`.
 */
export function niceTicks(max: number, count = 4): number[] {
  const m = Math.max(1, Math.ceil(max));
  const raw = m / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  // Punkte sind ganzzahlig: Schrittweite mindestens 1
  const step = Math.max(1, [1, 2, 4, 5, 8, 10].map((f) => f * mag).find((s) => s >= raw) ?? 10 * mag);
  const n = Math.ceil(m / step);
  return Array.from({ length: n + 1 }, (_, i) => Math.round(i * step * 1e6) / 1e6);
}

/** Größter Punktwert aller Allianzen im Verlauf (Grundlage der Achsenwerte) */
export function seriesMax(series: Record<string, number | string>[], keys: string[]): number {
  let m = 0;
  for (const row of series) for (const k of keys) m = Math.max(m, Number(row[k]) || 0);
  return m;
}
