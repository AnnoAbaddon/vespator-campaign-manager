import type { CampaignState } from './types';

/**
 * Spielersicht der R2-Daten (Abwesenheit, Puls, Ziele, Sonderziele): ergänzt die öffentliche Projektion (Allowlist in
 * publicView.ts) um das, was der Spieler zusätzlich sehen darf. `s` ist die öffentliche Kopie, `orig` der ungefilterte Stand.
 */
export function r2PlayerView(s: CampaignState, orig: CampaignState, playerId: string, allianceId: string | null) {
  const me = orig.players.find((p) => p.id === playerId);
  const mine = s.players.find((p) => p.id === playerId);
  if (me && mine) {
    if (me.goals) mine.goals = structuredClone(me.goals);
    if (me.honors) mine.honors = structuredClone(me.honors);
  }
  // Mitspieler sollen wissen, wer in welcher Phase fehlt
  for (const p of s.players) {
    const o = orig.players.find((x) => x.id === p.id);
    if (o?.absences?.length) p.absences = [...o.absences];
  }
  for (const ph of s.phases) {
    const own = orig.phases.find((x) => x.number === ph.number)?.pulse?.filter((e) => e.playerId === playerId);
    if (own?.length) ph.pulse = structuredClone(own);
  }
  if (orig.toggles.narrative?.secretGoals && orig.goalList) s.goalList = structuredClone(orig.goalList);
  if (allianceId && orig.objectives) s.objectives = structuredClone(orig.objectives.filter((o) => !o.secret || o.status !== 'OPEN' || o.allianceId === allianceId));
}
