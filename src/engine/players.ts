import type { CampaignState, Player } from './types';

/** Allianz eines Spielers in einer Phase (0 = Setup) */
export function allianceOf(player: Player, phase: number): string | null {
  const m = player.memberships.find((m) => m.fromPhase <= phase && (m.toPhase === null || m.toPhase >= phase));
  return m?.allianceId ?? null;
}

export function currentAllianceOf(player: Player): string | null {
  const open = player.memberships.find((m) => m.toPhase === null);
  return open?.allianceId ?? null;
}

export function playersOfAlliance(state: CampaignState, allianceId: string, phase?: number): Player[] {
  return state.players.filter((p) => p.active && (phase === undefined ? currentAllianceOf(p) : allianceOf(p, phase)) === allianceId);
}

/** Alle Mitglieder einer Allianz in einer Phase – auch inaktive (z. B. Medaillen nach SPEC 12.2) */
export function membersOfAlliance(state: CampaignState, allianceId: string, phase: number): Player[] {
  return state.players.filter((p) => allianceOf(p, phase) === allianceId);
}

/** Setzt die Allianz eines Spielers ab Phase `fromPhase`. */
export function setMembership(player: Player, allianceId: string | null, fromPhase: number) {
  // Einträge, die erst ab fromPhase beginnen, werden ersetzt
  player.memberships = player.memberships.filter((m) => m.fromPhase < fromPhase);
  for (const m of player.memberships) {
    if (m.toPhase === null || m.toPhase >= fromPhase) m.toPhase = fromPhase - 1;
  }
  if (allianceId) player.memberships.push({ allianceId, fromPhase, toPhase: null });
}

/** Laufende Phase (Setup = 0, nach der letzten Phase = Phasenzahl) */
export function stagePhase(st: CampaignState): number {
  return st.stage.kind === 'PHASE' ? st.stage.phase : st.stage.kind === 'SETUP' ? 0 : st.meta.phaseCount;
}

/**
 * Ab welcher Phase gilt ein Armeewechsel? Im Setup ab Start, in Schritt 1–2 ab der laufenden Phase,
 * nach den Schlachten (Schritt 3–5) ab der nächsten; nach Kampagnenende berührt er keine gespielte Phase.
 */
export function factionFromPhase(st: CampaignState): number {
  const s = st.stage;
  if (s.kind === 'SETUP') return 0;
  if (s.kind === 'PHASE') return ['RESULTS', 'MOVE', 'BUILD'].includes(s.step) ? s.phase + 1 : s.phase;
  return st.meta.phaseCount + 1;
}

/** Armee-Historie nach einer Änderung von Armee/Subfraktion fortschreiben (Spielerdaten und Profil) */
export function recordFactionChange(st: CampaignState, p: Player, prev: { faction: string; subfaction: string }) {
  const from = factionFromPhase(st);
  // B12: nach Kampagnenende gibt es keine Phase mehr, ab der die Armee gelten könnte („ab Phase 5“ bei 4 Phasen);
  // die Historie bleibt, die aktuelle Armee gilt erst für eine Folgekampagne
  if (from > st.meta.phaseCount) {
    p.factionHistory ??= prev.faction ? [{ faction: prev.faction, subfaction: prev.subfaction, fromPhase: 0 }] : [];
    return;
  }
  let hist = p.factionHistory ?? [];
  // ältere Zustände ohne Historie: bisherige Armee gilt ab Start
  if (!hist.length && prev.faction && from > 0) hist = [{ faction: prev.faction, subfaction: prev.subfaction, fromPhase: 0 }];
  hist = hist.filter((h) => h.fromPhase < from);
  const last = hist.at(-1);
  if (p.faction && !(last && last.faction === p.faction && last.subfaction === p.subfaction)) hist.push({ faction: p.faction, subfaction: p.subfaction, fromPhase: from });
  p.factionHistory = hist;
}

export function commanderOf(state: CampaignState, fleetId: string, phase: number): string | null {
  const f = state.fleets.find((x) => x.id === fleetId);
  return f?.commanders[String(phase)] ?? null;
}

/** Überträgt Kommandanten in eine neue Phase (bleibt, falls Spieler noch in der Allianz). */
export function carryCommanders(state: CampaignState, phase: number) {
  for (const a of state.alliances) {
    const players = playersOfAlliance(state, a.id, phase);
    // wartende Reserveflotten (N2.5) haben keinen Kommandanten, erst nach der Aktivierung
    const fleets = state.fleets.filter((f) => f.allianceId === a.id && !f.reserve);
    fleets.forEach((f, i) => {
      const existing = f.commanders[String(phase)];
      if (existing && players.some((p) => p.id === existing)) return;
      const prev = f.commanders[String(phase - 1)];
      if (prev && players.some((p) => p.id === prev)) f.commanders[String(phase)] = prev;
      else if (players.length) f.commanders[String(phase)] = players[i % players.length].id;
      else delete f.commanders[String(phase)];
    });
  }
}
