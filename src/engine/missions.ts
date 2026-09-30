import { ATTACK_TYPES } from './data/vespator';
import type { AttackType, Battle, BattleGame, CampaignState, MissionDef, Victor } from './types';

/**
 * Missionen (N2.2): Standard ist die Vespator-Mission der Angriffsart. Spielen die Spieler mit
 * Zustimmung eine andere, wählt der Warmaster sie aus der Liste (Vorlagen + eigene).
 */
export const MISSION_TEMPLATES: MissionDef[] = [
  { id: 'tpl-ca', name: 'Chapter Approved (aktuelles Missionspaket)', source: 'Games Workshop', note: '', attackTypes: [] },
  { id: 'tpl-pn', name: 'Pariah Nexus', source: 'Games Workshop', note: '', attackTypes: [] },
  { id: 'tpl-lev', name: 'Leviathan', source: 'Games Workshop', note: '', attackTypes: [] },
  { id: 'tpl-crusade', name: 'Crusade-Mission', source: 'Games Workshop', note: '', attackTypes: [] },
  { id: 'tpl-gt', name: 'Grand-Tournament-Mission', source: 'Games Workshop', note: '', attackTypes: [] },
  { id: 'tpl-kt', name: 'Kill Team', source: 'Games Workshop', note: 'für Kill-Team-Gefechte', attackTypes: [] },
  { id: 'tpl-bfg', name: 'Battlefleet Gothic (Raumkampf)', source: 'Fan', note: 'für Boarding Actions als Raumkampf', attackTypes: ['BOARDING_ACTION'] },
];

/** Die sechs Vespator-Missionen (fest, N2.2) – je eine Angriffsart; wählbar, wenn eine andere gespielt wird */
export const VESPATOR_MISSIONS: MissionDef[] = (Object.keys(ATTACK_TYPES) as AttackType[]).map((t) => ({
  id: `tpl-vsp-${t.toLowerCase().replace(/_/g, '-')}`,
  name: `Vespator – ${ATTACK_TYPES[t].name}`,
  source: 'Vespator',
  note: '',
  attackTypes: [t],
}));

export function allMissions(state: Pick<CampaignState, 'meta'>): MissionDef[] {
  return [...VESPATOR_MISSIONS, ...MISSION_TEMPLATES, ...(state.meta.missions ?? [])];
}

/** Anzeigename der gespielten Mission */
export function missionLabel(state: Pick<CampaignState, 'meta'>, b: Pick<Battle, 'mission' | 'attackType' | 'kind'>): string {
  const m = b.mission;
  if (m.source === 'LIST') return allMissions(state).find((x) => x.id === m.missionId)?.name ?? (m.externalName || 'Mission aus der Liste');
  if (m.source === 'SPACE') return m.externalName ? `Raumkampf: ${m.externalName}` : 'Raumkampf (extern)';
  if (m.source === 'EXTERNAL') return m.externalName || 'externe Mission';
  if (b.kind === 'KILL_TEAM') return 'Kill Team';
  if (b.kind === 'INTERCEPT') return 'Abfanggefecht';
  return b.attackType ? `Vespator – ${ATTACK_TYPES[b.attackType].name}` : 'Vespator';
}

const gameVictor = (g: BattleGame): Victor | null => {
  if (!g.vp) return null;
  const a = g.vp.attacker + (g.battleReady.attacker ? 10 : 0);
  const d = g.vp.defender + (g.battleReady.defender ? 10 : 0);
  return a > d ? 'ATTACKER' : d > a ? 'DEFENDER' : 'DRAW';
};

/**
 * Gesamtergebnis mehrerer Einzelspiele (N2.3): Mehrheit der Einzelsiege, bei Gleichstand die
 * VP-Summe inklusive Battle-Ready-Bonus, sonst Unentschieden. Nur gewertet, wenn alle Spiele ein Ergebnis haben.
 */
export function aggregateGames(games: BattleGame[]): { victor: Victor | null; vp: { attacker: number; defender: number } | null; playedAt: string | null } {
  if (!games.length || games.some((g) => !g.vp)) return { victor: null, vp: null, playedAt: latest(games) };
  let wa = 0;
  let wd = 0;
  let sa = 0;
  let sd = 0;
  for (const g of games) {
    const v = gameVictor(g);
    if (v === 'ATTACKER') wa++;
    if (v === 'DEFENDER') wd++;
    sa += g.vp!.attacker + (g.battleReady.attacker ? 10 : 0);
    sd += g.vp!.defender + (g.battleReady.defender ? 10 : 0);
  }
  const victor: Victor = wa !== wd ? (wa > wd ? 'ATTACKER' : 'DEFENDER') : sa !== sd ? (sa > sd ? 'ATTACKER' : 'DEFENDER') : 'DRAW';
  return { victor, vp: { attacker: sa, defender: sd }, playedAt: latest(games) };
}

function latest(games: BattleGame[]): string | null {
  const t = games
    .map((g) => g.playedAt)
    .filter((x): x is string => !!x)
    .sort();
  return t.at(-1) ?? null;
}

export { gameVictor };
