import { fail, log, type Ctx } from './ctx';
import { effectiveVictor } from './outcomes';
import type { AutoHonor, Battle, CampaignState, Player } from './types';

/**
 * Kommandanten („Crusade light“, N3.4): Name, Titel, Portrait, Ehrungen und Narben je Spieler.
 * Vier Ehrungen vergibt die App automatisch bei der Verarbeitung; der Warmaster kann sie entfernen.
 */
export const AUTO_HONORS: Record<AutoHonor, { title: string; reason: string }> = {
  STREAK: { title: 'Unaufhaltsam', reason: '3 Siege in Folge' },
  WORLDBREAKER: { title: 'Weltenbrecher', reason: 'Location oder Planet in einer Schlacht zerstört' },
  BULWARK: { title: 'Bollwerk', reason: '3 gewonnene Schlachten als Verteidiger' },
  VETERAN: { title: 'Veteran', reason: '10 gespielte Schlachten' },
};

const player = (st: CampaignState, id: string) => {
  const p = st.players.find((x) => x.id === id);
  if (!p) fail('Spieler nicht gefunden');
  return p;
};

export function updateCommander(ctx: Ctx, playerId: string, c: { name: string; title: string; portrait: string | null }) {
  const p = player(ctx.state, playerId);
  p.commander = { name: c.name.trim().slice(0, 60), title: c.title.trim().slice(0, 80), portrait: c.portrait };
  log(ctx, `Kommandant von ${p.nickname}: ${p.commander.title ? `${p.commander.title} ` : ''}${p.commander.name || '–'}`);
}

export function addMark(ctx: Ctx, kind: 'HONOR' | 'SCAR', playerId: string, m: { title: string; reason: string; phase: number | null; battleId: string | null }) {
  const p = player(ctx.state, playerId);
  if (!m.title.trim()) fail('Titel fehlt');
  if (m.battleId && !ctx.state.battles.some((b) => b.id === m.battleId)) fail('Unbekannte Schlacht');
  const entry = { id: ctx.newId(kind === 'HONOR' ? 'honor' : 'scar'), title: m.title.trim(), reason: m.reason.trim(), phase: m.phase, battleId: m.battleId };
  if (kind === 'HONOR') p.honors = [...(p.honors ?? []), entry];
  else p.scars = [...(p.scars ?? []), entry];
  log(ctx, `${kind === 'HONOR' ? 'Ehrung' : 'Narbe'} für ${p.nickname}: ${entry.title}`);
}

export function removeMark(ctx: Ctx, kind: 'HONOR' | 'SCAR', playerId: string, id: string) {
  const p = player(ctx.state, playerId);
  const list = kind === 'HONOR' ? (p.honors ?? []) : (p.scars ?? []);
  const e = list.find((x) => x.id === id);
  if (!e) fail('Eintrag nicht gefunden');
  if (kind === 'HONOR') {
    p.honors = list.filter((x) => x.id !== id);
    // entfernte automatische Ehrungen werden nicht erneut vergeben
    if (e.auto) p.suppressedAuto = [...new Set([...(p.suppressedAuto ?? []), e.auto])];
  } else p.scars = list.filter((x) => x.id !== id);
  log(ctx, `${kind === 'HONOR' ? 'Ehrung' : 'Narbe'} von ${p.nickname} entfernt: ${e.title}`);
}

/** Schlachten eines Spielers in zeitlicher Reihenfolge mit seinem Ergebnis */
export function playerRecord(st: CampaignState, playerId: string): { b: Battle; side: 'ATTACKER' | 'DEFENDER'; result: 'W' | 'L' | 'D' }[] {
  const out: { b: Battle; side: 'ATTACKER' | 'DEFENDER'; result: 'W' | 'L' | 'D' }[] = [];
  for (const b of st.battles) {
    if (b.kind !== 'CAMPAIGN' && b.kind !== 'FINAL_TIEBREAK') continue;
    if (b.status !== 'PROCESSED' && b.status !== 'PLAYED' && b.status !== 'UNPLAYED_RESOLVED') continue;
    const side = b.attackers.some((p) => p.playerId === playerId) ? 'ATTACKER' : b.defenders.some((p) => p.playerId === playerId) ? 'DEFENDER' : null;
    const v = effectiveVictor(b);
    if (!side || !v) continue;
    out.push({ b, side, result: v === 'DRAW' ? 'D' : v === side ? 'W' : 'L' });
  }
  return out.sort((x, y) => x.b.phaseNumber - y.b.phaseNumber || (x.b.playedAt ?? '').localeCompare(y.b.playedAt ?? '') || x.b.createdSeq - y.b.createdSeq);
}

/**
 * Für die automatischen Ehrungen zählen nur tatsächlich gespielte Schlachten (N3.4: „gespielte Schlachten“,
 * „Schlachten des Spielers nach Datum“): verarbeitete Kampagnenschlachten und die Entscheidungsschlacht
 * am Kampagnenende, sobald sie ein Ergebnis hat. Ungespielt gewertete Schlachten zählen nicht.
 */
function counts(b: Battle): boolean {
  // auch nach der Verarbeitung (Status PROCESSED) erkennbar an unplayedResolution
  if (b.status === 'UNPLAYED_RESOLVED' || b.unplayedResolution) return false;
  if (b.kind === 'FINAL_TIEBREAK') return b.status === 'PLAYED' || b.status === 'PROCESSED';
  return b.status === 'PROCESSED';
}

function earned(st: CampaignState, p: Player, destroyedBy: Set<string>): AutoHonor[] {
  const rec = playerRecord(st, p.id).filter((r) => counts(r.b));
  const out: AutoHonor[] = [];
  let run = 0;
  for (const r of rec) {
    run = r.result === 'W' ? run + 1 : 0;
    if (run >= 3) {
      out.push('STREAK');
      break;
    }
  }
  if (rec.some((r) => destroyedBy.has(`${r.b.id}:${r.side}`))) out.push('WORLDBREAKER');
  if (rec.filter((r) => r.side === 'DEFENDER' && r.result === 'W').length >= 3) out.push('BULWARK');
  if (rec.length >= 10) out.push('VETERAN');
  return out;
}

/**
 * Nach der Verarbeitung einer Schlacht: automatische Ehrungen prüfen und vergeben.
 * `destroyed` markiert Schlachten, in denen die Siegerseite etwas zerstört hat (Weltenbrecher).
 */
export function awardAutoHonors(ctx: Ctx, destroyedIn?: { battleId: string; side: 'ATTACKER' | 'DEFENDER' }) {
  const st = ctx.state;
  if (destroyedIn) st.destructions = [...(st.destructions ?? []), `${destroyedIn.battleId}:${destroyedIn.side}`];
  const destroyedBy = new Set(st.destructions ?? []);
  const phase = st.stage.kind === 'PHASE' ? st.stage.phase : null;
  for (const p of st.players) {
    for (const h of earned(st, p, destroyedBy)) {
      if ((p.honors ?? []).some((x) => x.auto === h) || (p.suppressedAuto ?? []).includes(h)) continue;
      p.honors = [...(p.honors ?? []), { id: ctx.newId('honor'), title: AUTO_HONORS[h].title, reason: AUTO_HONORS[h].reason, phase, battleId: null, auto: h }];
      log(ctx, `Ehrung für ${p.nickname}: ${AUTO_HONORS[h].title} (${AUTO_HONORS[h].reason})`);
    }
  }
}
