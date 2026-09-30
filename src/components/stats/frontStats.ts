import type { Battle, CampaignState } from '@/engine/types';
import { mapOf } from '@/engine/map';
import { countedBattles } from './compute';

/**
 * Front-Analyse (D4): volatilster Planet, aktivste Spieler, Siegesserien, Heatmap Planet × Phase und
 * Momentum der Allianzen. Rechnet nur mit dem übergebenen Zustand – in der Leseansicht ist das die öffentliche
 * Projektion; unter dem Nebel über dem Punktestand (C1) fehlt dort der Punkte- und PL-Verlauf, dann zählen
 * nur die Schlachten (kein Rückschluss auf verdeckte Zahlen).
 */

export interface PlanetVolatility {
  planetId: string;
  name: string;
  /** Anzahl der PL-Änderungen (je Allianz und Phase eine) */
  changes: number;
  /** Summe der PL-Beträge, um die sich der Planet verändert hat */
  swing: number;
  battles: number;
  /** Besitzerwechsel: Allianz mit dem höchsten PL hat gewechselt */
  flips: number;
}

/** Stand der PL je Planet und Phase (0 = Start) aus dem Punkteverlauf */
function snapshots(st: CampaignState) {
  return st.pointsHistory
    .filter((h) => h.planets)
    .slice()
    .sort((a, b) => a.phaseNumber - b.phaseNumber)
    .map((h) => ({ phase: h.phaseNumber, planets: h.planets! }));
}

const leader = (power: Record<string, number> | undefined): string | null => {
  if (!power) return null;
  let best: string | null = null;
  let v = 0;
  let tie = false;
  for (const [a, p] of Object.entries(power)) {
    if (p > v) {
      best = a;
      v = p;
      tie = false;
    } else if (p === v && p > 0) tie = true;
  }
  return tie ? null : best;
};

export function planetVolatility(st: CampaignState): PlanetVolatility[] {
  const snaps = snapshots(st);
  return mapOf(st)
    .planets.map((p) => {
      let changes = 0;
      let swing = 0;
      let flips = 0;
      for (let i = 1; i < snaps.length; i++) {
        const a = snaps[i - 1].planets[p.id] ?? {};
        const b = snaps[i].planets[p.id] ?? {};
        for (const al of new Set([...Object.keys(a), ...Object.keys(b)])) {
          const d = (b[al] ?? 0) - (a[al] ?? 0);
          if (d) {
            changes++;
            swing += Math.abs(d);
          }
        }
        const la = leader(a);
        const lb = leader(b);
        if (la && lb && la !== lb) flips++;
      }
      const battles = st.battles.filter((b) => b.kind === 'CAMPAIGN' && b.planetId === p.id && b.status !== 'VOID').length;
      return { planetId: p.id, name: p.name, changes, swing, battles, flips };
    })
    .sort((x, y) => y.changes - x.changes || y.swing - x.swing || y.battles - x.battles || x.name.localeCompare(y.name));
}

/** Chronologische Reihenfolge gewerteter Schlachten */
export function chronological(st: CampaignState): Battle[] {
  return countedBattles(st)
    .slice()
    .sort((a, b) => a.phaseNumber - b.phaseNumber || (a.playedAt ?? '').localeCompare(b.playedAt ?? '') || a.createdSeq - b.createdSeq);
}

export interface PlayerActivity {
  playerId: string;
  nickname: string;
  battles: number;
  /** Phasen mit mindestens einer Schlacht */
  phases: number;
  wins: number;
  /** längste Siegesserie */
  bestStreak: number;
  /** laufende Serie (positiv = Siege, negativ = Niederlagen, 0 = keine bzw. Unentschieden zuletzt) */
  current: number;
}

type Res = 'W' | 'D' | 'L';

function resultFor(b: Battle, playerId: string): Res | null {
  const a = b.attackers.some((p) => p.playerId === playerId);
  const d = b.defenders.some((p) => p.playerId === playerId);
  if (!a && !d) return null;
  if (b.victor === 'DRAW') return 'D';
  return (b.victor === 'ATTACKER') === a ? 'W' : 'L';
}

/** Aktivste Spieler und Siegesserien (nur gewertete Kampagnenschlachten; Gäste zählen nicht) */
export function playerActivity(st: CampaignState): PlayerActivity[] {
  const battles = chronological(st);
  return st.players
    .map((p) => {
      const res: Res[] = [];
      const phases = new Set<number>();
      for (const b of battles) {
        const r = resultFor(b, p.id);
        if (!r) continue;
        res.push(r);
        phases.add(b.phaseNumber);
      }
      let best = 0;
      let run = 0;
      for (const r of res) {
        run = r === 'W' ? run + 1 : 0;
        best = Math.max(best, run);
      }
      let current = 0;
      const last = res.at(-1);
      if (last === 'W' || last === 'L') for (let i = res.length - 1; i >= 0 && res[i] === last; i--) current += last === 'W' ? 1 : -1;
      return { playerId: p.id, nickname: p.nickname, battles: res.length, phases: phases.size, wins: res.filter((r) => r === 'W').length, bestStreak: best, current };
    })
    .filter((x) => x.battles > 0)
    .sort((a, b) => b.battles - a.battles || b.phases - a.phases || b.wins - a.wins || a.nickname.localeCompare(b.nickname));
}

export interface HeatCell {
  battles: number;
  /** Summe der PL-Beträge, um die sich der Planet in dieser Phase verändert hat (null = unbekannt) */
  swing: number | null;
}

/** Heatmap Planet × Phase: Schlachten und PL-Bewegung */
export function heatmap(st: CampaignState): { phases: number[]; rows: { planetId: string; name: string; cells: HeatCell[] }[]; max: { battles: number; swing: number } } {
  const last = st.stage.kind === 'PHASE' ? st.stage.phase : st.phases.length ? Math.max(...st.phases.map((p) => p.number)) : 0;
  const phases = Array.from({ length: Math.max(0, last) }, (_, i) => i + 1);
  const snaps = new Map(snapshots(st).map((s) => [s.phase, s.planets]));
  const max = { battles: 0, swing: 0 };
  const rows = mapOf(st).planets.map((p) => ({
    planetId: p.id,
    name: p.name,
    cells: phases.map((n) => {
      const battles = st.battles.filter((b) => b.kind === 'CAMPAIGN' && b.planetId === p.id && b.phaseNumber === n && b.status !== 'VOID').length;
      const a = snaps.get(n - 1)?.[p.id];
      const b = snaps.get(n)?.[p.id];
      let swing: number | null = null;
      if (a && b) {
        swing = 0;
        for (const al of new Set([...Object.keys(a), ...Object.keys(b)])) swing += Math.abs((b[al] ?? 0) - (a[al] ?? 0));
      }
      max.battles = Math.max(max.battles, battles);
      if (swing !== null) max.swing = Math.max(max.swing, swing);
      return { battles, swing };
    }),
  }));
  return { phases, rows, max };
}

export interface MomentumPoint {
  phase: number;
  /** je Allianz: Siege minus Niederlagen in dieser Phase */
  net: Record<string, number>;
  /** je Allianz: geglättetes Momentum (Summe der letzten zwei Phasen) */
  momentum: Record<string, number>;
}

/**
 * Momentum der Allianzen je Phase aus den Schlachtergebnissen (Siege minus Niederlagen, geglättet über die
 * aktuelle und die vorige Phase). Unabhängig vom Punktestand – verrät unter dem Nebel nichts Verdecktes.
 */
export function allianceMomentum(st: CampaignState): MomentumPoint[] {
  const { phases } = heatmap(st);
  const counted = countedBattles(st);
  const out: MomentumPoint[] = [];
  for (const n of phases) {
    const net: Record<string, number> = Object.fromEntries(st.alliances.map((a) => [a.id, 0]));
    for (const b of counted) {
      if (b.phaseNumber !== n || b.victor === 'DRAW' || !b.victor) continue;
      const w = b.victor === 'ATTACKER' ? b.attackerAllianceId : b.defenderAllianceId;
      const l = b.victor === 'ATTACKER' ? b.defenderAllianceId : b.attackerAllianceId;
      if (w in net) net[w]++;
      if (l in net) net[l]--;
    }
    const prev = out.at(-1);
    const momentum = Object.fromEntries(st.alliances.map((a) => [a.id, net[a.id] + (prev?.net[a.id] ?? 0)]));
    out.push({ phase: n, net, momentum });
  }
  return out;
}

/** Kennzahlen für die Kopfzeile der Front-Analyse */
export function frontHighlights(st: CampaignState) {
  const vol = planetVolatility(st);
  const act = playerActivity(st);
  const streak = act.slice().sort((a, b) => b.bestStreak - a.bestStreak || b.wins - a.wins || a.nickname.localeCompare(b.nickname))[0];
  const hasHistory = snapshots(st).length > 1;
  const volatile = vol.find((v) => (hasHistory ? v.changes > 0 : v.battles > 0)) ?? null;
  return { volatile, hasHistory, active: act[0] ?? null, streak: streak && streak.bestStreak > 0 ? streak : null };
}
