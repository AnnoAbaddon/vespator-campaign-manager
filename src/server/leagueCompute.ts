import { MEDALS, type MedalId } from '@/engine/data/vespator';
import type { CampaignState } from '@/engine/types';
import { playerStats } from '@/components/stats/compute';

/**
 * Liga (NTH2 3.1): Saison aus mehreren Kampagnen. Reine Berechnung (ohne Datenbank, testbar).
 *
 * Spieler-Identität über Kampagnen: Standard ist der Nickname (ohne Groß-/Kleinschreibung und doppelte
 * Leerzeichen). Der Admin kann jede Zuordnung „Kampagne/Spieler → Identität“ überschreiben (zusammenführen
 * oder trennen). Rangliste nach konfigurierbaren Punkten für Siege, Unentschieden, Niederlagen, Teilnahme,
 * Medaillen und Kampagnensiege.
 */

export interface SeasonConfig {
  win: number;
  draw: number;
  loss: number;
  /** je teilgenommener Kampagne */
  participation: number;
  /** je Medaille */
  medal: number;
  /** je Kampagne, die die eigene Allianz gewonnen hat */
  campaignWin: number;
}

export const DEFAULT_SEASON_CONFIG: SeasonConfig = { win: 3, draw: 1, loss: 0, participation: 2, medal: 2, campaignWin: 5 };

export interface SeasonData {
  campaignIds: string[];
  config: SeasonConfig;
  /** „campaignId:playerId“ → Identitätsschlüssel (Überschreibung durch den Admin) */
  identity: Record<string, string>;
  /** Anzeigename je Identitätsschlüssel (optional) */
  names: Record<string, string>;
  /** öffentliche Ruhmeshalle der Saison */
  public: boolean;
  note: string;
}

export const emptySeason = (): SeasonData => ({ campaignIds: [], config: { ...DEFAULT_SEASON_CONFIG }, identity: {}, names: {}, public: true, note: '' });

export const identityKey = (nickname: string) => nickname.trim().toLowerCase().replace(/\s+/g, ' ');

export interface SeasonCampaign {
  id: string;
  name: string;
  state: CampaignState;
}

export interface CabinetEntry {
  kind: 'MEDAL' | 'HONOR' | 'WIN';
  title: string;
  campaign: string;
  medal?: MedalId;
}

export interface SeasonPlayer {
  key: string;
  name: string;
  campaigns: number;
  battles: number;
  wins: number;
  draws: number;
  losses: number;
  medals: number;
  campaignWins: number;
  points: number;
  /** Zuordnung der Kampagnen-Spieler zu dieser Identität */
  members: { campaignId: string; playerId: string; nickname: string }[];
  cabinet: CabinetEntry[];
  factions: string[];
}

/** Welche Allianz war der Spieler am Kampagnenende (letzte Mitgliedschaft)? */
function finalAlliance(state: CampaignState, playerId: string): string | null {
  const p = state.players.find((x) => x.id === playerId);
  if (!p?.memberships.length) return null;
  return p.memberships.reduce((a, b) => (b.fromPhase >= a.fromPhase ? b : a)).allianceId;
}

/** Zuordnung eines Kampagnen-Spielers zu seiner Identität (Überschreibung oder Nickname) */
export const resolveIdentity = (season: Pick<SeasonData, 'identity'>, campaignId: string, playerId: string, nickname: string) => season.identity[`${campaignId}:${playerId}`] || identityKey(nickname);

export function seasonStandings(season: SeasonData, campaigns: SeasonCampaign[]): SeasonPlayer[] {
  const cfg = { ...DEFAULT_SEASON_CONFIG, ...season.config };
  const map = new Map<string, SeasonPlayer>();
  for (const c of campaigns) {
    const stats = new Map(playerStats(c.state).map((s) => [s.playerId, s]));
    const winner = c.state.stage.kind === 'ENDED' ? (c.state.result?.winnerAllianceId ?? null) : null;
    for (const p of c.state.players) {
      const s = stats.get(p.id);
      const medals = c.state.medals.filter((m) => m.playerIds.includes(p.id));
      // nur Spieler, die wirklich dabei waren (aktiv, Schlacht oder Medaille)
      if (!p.active && !s?.battles && !medals.length) continue;
      const key = resolveIdentity(season, c.id, p.id, p.nickname);
      let e = map.get(key);
      if (!e) {
        e = { key, name: season.names[key] || p.nickname, campaigns: 0, battles: 0, wins: 0, draws: 0, losses: 0, medals: 0, campaignWins: 0, points: 0, members: [], cabinet: [], factions: [] };
        map.set(key, e);
      }
      e.members.push({ campaignId: c.id, playerId: p.id, nickname: p.nickname });
      if (!e.members.slice(0, -1).some((m) => m.campaignId === c.id)) e.campaigns++;
      e.battles += s?.battles ?? 0;
      e.wins += s?.wins ?? 0;
      e.draws += s?.draws ?? 0;
      e.losses += s?.losses ?? 0;
      if (p.faction && !e.factions.includes(p.faction)) e.factions.push(p.faction);
      for (const m of medals) {
        e.medals++;
        e.cabinet.push({ kind: 'MEDAL', title: MEDALS[m.medal]?.name ?? m.medal, campaign: c.name, medal: m.medal });
      }
      for (const h of p.honors ?? []) if (!h.goal || c.state.stage.kind === 'ENDED') e.cabinet.push({ kind: 'HONOR', title: h.title, campaign: c.name });
      if (winner && finalAlliance(c.state, p.id) === winner) {
        e.campaignWins++;
        e.cabinet.push({ kind: 'WIN', title: c.state.alliances.find((a) => a.id === winner)?.name ?? '', campaign: c.name });
      }
    }
  }
  for (const e of map.values()) e.points = e.wins * cfg.win + e.draws * cfg.draw + e.losses * cfg.loss + e.campaigns * cfg.participation + e.medals * cfg.medal + e.campaignWins * cfg.campaignWin;
  return [...map.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || b.medals - a.medals || a.name.localeCompare(b.name));
}

/** Kurzfassung je Kampagne: Stand und Sieger */
export function seasonCampaignSummary(c: SeasonCampaign) {
  const st = c.state;
  const winner = st.stage.kind === 'ENDED' ? st.alliances.find((a) => a.id === st.result?.winnerAllianceId) : undefined;
  return { id: c.id, name: c.name, ended: st.stage.kind === 'ENDED', winner: winner ? { name: winner.name, color: winner.color } : null, players: st.players.filter((p) => p.active).length };
}

/** Normierte Konfiguration (ganze Zahlen, −10…50) */
export function cleanConfig(c: Partial<SeasonConfig>): SeasonConfig {
  const out = { ...DEFAULT_SEASON_CONFIG };
  for (const k of Object.keys(out) as (keyof SeasonConfig)[]) {
    const v = Number(c[k]);
    if (Number.isFinite(v)) out[k] = Math.max(-10, Math.min(50, Math.round(v)));
  }
  return out;
}
