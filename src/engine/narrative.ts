import { confirmRule, fail, hint, log, type Ctx } from './ctx';
import { alliance, allianceName, campaignPoints, increase, planet, planetName, powerSum } from './board';
import { effectiveVictor } from './outcomes';
import { allianceOf, playersOfAlliance, stagePhase } from './players';
import type { Battle, CampaignState, Player } from './types';

/**
 * Erzählung (R2): Warmaster-Sonderziele je Phase (C3), geheime persönliche Ziele (C4), Nemesis und
 * Rivalitäten (C5).
 */

const player = (st: CampaignState, id: string): Player => {
  const p = st.players.find((x) => x.id === id);
  if (!p) fail('Spieler nicht gefunden');
  return p;
};

// ─── C3 Warmaster-Sonderziel je Phase ───────────────────────────────────────

export type ObjectiveRewardKind = 'NONE' | 'PL' | 'END_POINTS' | 'HONOR';

export interface PhaseObjective {
  id: string;
  phaseNumber: number;
  title: string;
  text: string;
  /** Allianz, für die das Ziel gilt; null = jede Allianz */
  allianceId: string | null;
  /** HOLD_PLANET: am Phasenende automatisch geprüft (höchstes Power Level); MANUAL: Warmaster hakt ab */
  check: 'MANUAL' | 'HOLD_PLANET';
  planetId: string | null;
  /** Belohnung: +PL auf einem Planeten, Punkte nur für die Endwertung, Ehrung oder rein erzählerisch */
  reward: { kind: ObjectiveRewardKind; value: number; planetId: string | null; text: string };
  /** nur für die Ziel-Allianz sichtbar, bis es ausgewertet ist */
  secret?: boolean;
  status: 'OPEN' | 'MET' | 'FAILED';
  achievedBy: string[];
  reason: string;
}

export type ObjectiveInput = Omit<PhaseObjective, 'id' | 'status' | 'achievedBy' | 'reason'> & { id?: string };

export function upsertObjective(ctx: Ctx, input: ObjectiveInput) {
  const st = ctx.state;
  if (st.stage.kind === 'ENDED' || st.stage.kind === 'TIEBREAK') fail('Die Kampagne ist beendet');
  const title = input.title.trim().slice(0, 120);
  if (!title) fail('Titel fehlt');
  const now = st.stage.kind === 'PHASE' ? st.stage.phase : 1;
  if (!Number.isInteger(input.phaseNumber) || input.phaseNumber < now || input.phaseNumber > st.meta.phaseCount) fail(`Sonderziele nur für Phase ${now} bis ${st.meta.phaseCount}`);
  if (input.allianceId) alliance(st, input.allianceId);
  if (input.check === 'HOLD_PLANET') {
    if (!input.planetId) fail('Planet für „Planet halten“ fehlt');
    planet(st, input.planetId);
  }
  const r = input.reward;
  if (!['NONE', 'PL', 'END_POINTS', 'HONOR'].includes(r.kind)) fail('Unbekannte Belohnung');
  const value = Math.trunc(Number(r.value) || 0);
  if ((r.kind === 'PL' || r.kind === 'END_POINTS') && (value < 1 || value > 10)) fail('Belohnung: 1–10');
  const rewardPlanet = r.kind === 'PL' ? (r.planetId ?? input.planetId) : null;
  if (r.kind === 'PL') {
    if (!rewardPlanet) fail('Planet für die PL-Belohnung fehlt');
    planet(st, rewardPlanet);
  }
  const list = st.objectives ?? [];
  const existing = input.id ? list.find((o) => o.id === input.id) : undefined;
  if (input.id && !existing) fail('Sonderziel nicht gefunden');
  if (existing && existing.status !== 'OPEN') fail('Ausgewertete Sonderziele lassen sich nicht mehr ändern');
  const obj: PhaseObjective = {
    id: existing?.id ?? ctx.newId('obj'),
    phaseNumber: input.phaseNumber,
    title,
    text: input.text.trim().slice(0, 1000),
    allianceId: input.allianceId || null,
    check: input.check === 'HOLD_PLANET' ? 'HOLD_PLANET' : 'MANUAL',
    planetId: input.planetId || null,
    reward: { kind: r.kind, value: r.kind === 'PL' || r.kind === 'END_POINTS' ? value : 0, planetId: rewardPlanet, text: r.text.trim().slice(0, 200) },
    secret: !!input.secret && !!input.allianceId,
    status: 'OPEN',
    achievedBy: [],
    reason: '',
  };
  st.objectives = existing ? list.map((o) => (o.id === obj.id ? obj : o)) : [...list, obj];
  log(ctx, `Sonderziel Phase ${obj.phaseNumber}: ${obj.title}${obj.allianceId ? ` (${allianceName(st, obj.allianceId)})` : ''}`);
}

export function deleteObjective(ctx: Ctx, id: string) {
  const st = ctx.state;
  const o = (st.objectives ?? []).find((x) => x.id === id);
  if (!o) fail('Sonderziel nicht gefunden');
  if (o.status !== 'OPEN') fail('Ausgewertete Sonderziele lassen sich nicht mehr löschen');
  st.objectives = (st.objectives ?? []).filter((x) => x.id !== id);
  log(ctx, `Sonderziel gelöscht: ${o.title}`);
}

/** Wer hält den Planeten? Allianz mit dem höchsten Power Level (ohne Gleichstand), sonst niemand */
export function planetHolder(st: CampaignState, planetId: string): string | null {
  const p = st.planets.find((x) => x.id === planetId);
  if (!p || p.destroyed) return null;
  const vals = st.alliances.map((a) => ({ id: a.id, v: p.power[a.id] ?? 0 })).sort((a, b) => b.v - a.v);
  if (!vals.length || (vals[1] && vals[1].v === vals[0].v)) return null;
  return vals[0].id;
}

/** Vorschlag für die Auswertung (UI): wer erfüllt ein „Planet halten“-Ziel gerade? */
export function objectiveSuggestion(st: CampaignState, o: PhaseObjective): string[] {
  if (o.check !== 'HOLD_PLANET' || !o.planetId) return [];
  const h = planetHolder(st, o.planetId);
  return h && (!o.allianceId || o.allianceId === h) ? [h] : [];
}

function applyReward(ctx: Ctx, o: PhaseObjective, allianceId: string): boolean {
  const st = ctx.state;
  const r = o.reward;
  if (r.kind === 'PL' && r.planetId) {
    increase(ctx, allianceId, r.planetId, r.value, `Sonderziel „${o.title}“`);
    return true;
  }
  if (r.kind === 'END_POINTS') {
    st.endBonus = [...(st.endBonus ?? []), { id: ctx.newId('bonus'), allianceId, points: r.value, reason: `Sonderziel: ${o.title}`, phaseNumber: o.phaseNumber }];
    log(ctx, `${allianceName(st, allianceId)}: +${r.value} Punkte für die Endwertung (Sonderziel „${o.title}“)`);
  }
  if (r.kind === 'HONOR') {
    for (const p of playersOfAlliance(st, allianceId, o.phaseNumber)) {
      p.honors = [...(p.honors ?? []), { id: ctx.newId('honor'), title: r.text || o.title, reason: `Sonderziel Phase ${o.phaseNumber}: ${o.title}`, phase: o.phaseNumber, battleId: null }];
    }
    log(ctx, `Ehrung für ${allianceName(st, allianceId)}: ${r.text || o.title}`);
  }
  return false;
}

/** Punktestand der Phase nach einer PL-Belohnung aktualisieren (solange die Events noch nicht erzeugt sind) */
function refreshPoints(ctx: Ctx, phaseNumber: number) {
  const st = ctx.state;
  const ph = st.phases.find((p) => p.number === phaseNumber);
  const entry = st.pointsHistory.find((p) => p.phaseNumber === phaseNumber);
  if (!ph?.flags.scored || !entry) return;
  if (ph.flags.eventsGenerated) {
    hint(ctx, 'Die Events dieser Phase sind schon erzeugt – die PL-Belohnung zählt ab der nächsten Punktewertung');
    return;
  }
  entry.points = Object.fromEntries(st.alliances.map((a) => [a.id, campaignPoints(st, a.id)]));
  entry.powerSum = Object.fromEntries(st.alliances.map((a) => [a.id, powerSum(st, a.id)]));
  entry.planets = Object.fromEntries(st.planets.map((p) => [p.id, { ...p.power }]));
  log(ctx, `Kampagnenpunkte Phase ${phaseNumber} neu berechnet: ${st.alliances.map((a) => `${a.name} ${entry.points[a.id]}`).join(', ')}`);
}

/** Warmaster wertet ein Sonderziel aus (Häkchen mit Begründung); leere Liste = nicht erfüllt */
export function resolveObjective(ctx: Ctx, id: string, achievedBy: string[], reason: string) {
  const st = ctx.state;
  const o = (st.objectives ?? []).find((x) => x.id === id);
  if (!o) fail('Sonderziel nicht gefunden');
  if (o.status !== 'OPEN') fail('Das Sonderziel ist bereits ausgewertet');
  if (o.phaseNumber > stagePhase(st)) fail('Das Sonderziel gehört zu einer späteren Phase');
  const who = [...new Set(achievedBy)];
  for (const a of who) alliance(st, a);
  if (o.allianceId && who.some((a) => a !== o.allianceId)) fail('Das Sonderziel gilt nur für eine andere Allianz');
  finishObjective(ctx, o, who, reason.trim().slice(0, 300));
}

function finishObjective(ctx: Ctx, o: PhaseObjective, who: string[], reason: string) {
  const st = ctx.state;
  o.status = who.length ? 'MET' : 'FAILED';
  o.achievedBy = who;
  o.reason = reason;
  o.secret = false;
  log(ctx, who.length ? `Sonderziel „${o.title}“ erfüllt: ${who.map((a) => allianceName(st, a)).join(', ')}` : `Sonderziel „${o.title}“ nicht erfüllt`);
  let pl = false;
  for (const a of who) pl = applyReward(ctx, o, a) || pl;
  if (pl) refreshPoints(ctx, o.phaseNumber);
}

/** Phasenende (Punkte berechnen): „Planet halten“-Ziele automatisch auswerten */
export function evaluateObjectives(ctx: Ctx) {
  const st = ctx.state;
  if (st.stage.kind !== 'PHASE' || st.stage.step !== 'RESULTS') return;
  const n = st.stage.phase;
  for (const o of (st.objectives ?? []).filter((x) => x.phaseNumber === n && x.status === 'OPEN' && x.check === 'HOLD_PLANET' && x.planetId)) {
    const holder = planetHolder(st, o.planetId!);
    const ok = holder && (!o.allianceId || o.allianceId === holder) ? [holder] : [];
    finishObjective(ctx, o, ok, ok.length ? `${planetName(o.planetId!)} gehalten (höchstes Power Level am Phasenende)` : `${planetName(o.planetId!)} nicht gehalten`);
  }
}

/** Phase verlassen: nicht ausgewertete Sonderziele verfallen (Bestätigung des Regelfalls) */
export function closeObjectives(ctx: Ctx, phaseNumber: number) {
  const open = (ctx.state.objectives ?? []).filter((o) => o.phaseNumber === phaseNumber && o.status === 'OPEN');
  if (!open.length) return;
  confirmRule(ctx, `Sonderziel nicht ausgewertet: ${open.map((o) => o.title).join(', ')} – gilt als nicht erfüllt`);
  for (const o of open) finishObjective(ctx, o, [], 'nicht ausgewertet');
}

// ─── C4 Geheime persönliche Ziele ───────────────────────────────────────────

export interface GoalDef {
  id: string;
  title: string;
  text: string;
}

export interface PersonalGoal {
  id: string;
  /** Eintrag der Zielliste (null = eigenes Ziel des Warmasters) */
  goalId: string | null;
  title: string;
  text: string;
  /** CLAIMED: Spieler meldet Erfüllung, der Warmaster bestätigt */
  status: 'OPEN' | 'CLAIMED' | 'MET' | 'FAILED';
  note: string;
  by: 'GM' | 'PLAYER';
  at: string;
  resolvedAt?: string | null;
}

export const openGoal = (p: Pick<Player, 'goals'>) => (p.goals ?? []).find((g) => g.status === 'OPEN' || g.status === 'CLAIMED') ?? null;

export function setGoalList(ctx: Ctx, goals: GoalDef[]) {
  const ids = new Set<string>();
  const clean: GoalDef[] = [];
  for (const g of goals) {
    const title = g.title.trim().slice(0, 120);
    if (!title) fail('Jedes Ziel braucht einen Titel');
    if (!g.id || ids.has(g.id)) fail('Ungültige Ziel-ID');
    ids.add(g.id);
    clean.push({ id: g.id, title, text: g.text.trim().slice(0, 1000) });
  }
  ctx.state.goalList = clean;
  log(ctx, `Zielliste gespeichert (${clean.length} Ziele)`);
}

function addGoal(ctx: Ctx, p: Player, g: { goalId: string | null; title: string; text: string }, by: 'GM' | 'PLAYER') {
  const goal: PersonalGoal = { id: ctx.newId('goal'), goalId: g.goalId, title: g.title, text: g.text, status: 'OPEN', note: '', by, at: ctx.now, resolvedAt: null };
  p.goals = [...(p.goals ?? []), goal];
}

/** Warmaster teilt ein Ziel zu (aus der Liste oder frei formuliert) */
export function assignGoal(ctx: Ctx, playerId: string, input: { goalId?: string | null; title?: string; text?: string }) {
  const st = ctx.state;
  const p = player(st, playerId);
  let g: { goalId: string | null; title: string; text: string };
  if (input.goalId) {
    const d = (st.goalList ?? []).find((x) => x.id === input.goalId);
    if (!d) fail('Ziel nicht in der Liste');
    g = { goalId: d.id, title: d.title, text: d.text };
  } else {
    const title = (input.title ?? '').trim().slice(0, 120);
    if (!title) fail('Titel fehlt');
    g = { goalId: null, title, text: (input.text ?? '').trim().slice(0, 1000) };
  }
  if (openGoal(p)) hint(ctx, `${p.nickname} hat bereits ein offenes Ziel`);
  addGoal(ctx, p, g, 'GM');
  // der Titel ist geheim: im Log steht nur, dass es ein Ziel gibt
  log(ctx, `Geheimes Ziel für ${p.nickname} festgelegt`);
}

/** Spieler wählt selbst ein Ziel aus der Liste (nur ohne offenes Ziel) */
export function chooseGoal(ctx: Ctx, playerId: string, goalId: string) {
  const st = ctx.state;
  if (st.toggles.narrative?.secretGoals !== true) fail('Persönliche Ziele sind nicht aktiviert');
  if (st.stage.kind === 'ENDED') fail('Die Kampagne ist beendet');
  const p = player(st, playerId);
  if (openGoal(p)) fail('Du hast bereits ein offenes Ziel');
  const d = (st.goalList ?? []).find((x) => x.id === goalId);
  if (!d) fail('Ziel nicht in der Liste');
  addGoal(ctx, p, { goalId: d.id, title: d.title, text: d.text }, 'PLAYER');
  log(ctx, `${p.nickname} hat ein geheimes Ziel gewählt`);
}

/** Spieler meldet Erfüllung bzw. Fortschritt; der Warmaster bestätigt */
export function claimGoal(ctx: Ctx, playerId: string, id: string, note: string) {
  const p = player(ctx.state, playerId);
  const g = (p.goals ?? []).find((x) => x.id === id);
  if (!g) fail('Ziel nicht gefunden');
  if (g.status !== 'OPEN' && g.status !== 'CLAIMED') fail('Das Ziel ist bereits ausgewertet');
  g.status = 'CLAIMED';
  g.note = note.trim().slice(0, 500);
  log(ctx, `${p.nickname} meldet ein persönliches Ziel als erfüllt – der Warmaster bestätigt`);
}

/** Warmaster bestätigt (Ehrung für den Kommandanten) oder lehnt ab */
export function resolveGoal(ctx: Ctx, playerId: string, id: string, met: boolean, reason: string) {
  const st = ctx.state;
  const p = player(st, playerId);
  const g = (p.goals ?? []).find((x) => x.id === id);
  if (!g) fail('Ziel nicht gefunden');
  if (g.status === 'MET' || g.status === 'FAILED') fail('Das Ziel ist bereits ausgewertet');
  g.status = met ? 'MET' : 'FAILED';
  if (reason.trim()) g.note = reason.trim().slice(0, 500);
  g.resolvedAt = ctx.now;
  if (met) {
    const phase = st.stage.kind === 'PHASE' ? st.stage.phase : null;
    p.honors = [...(p.honors ?? []), { id: ctx.newId('honor'), title: 'Geheimauftrag erfüllt', reason: g.title, phase, battleId: null, goal: true }];
    log(ctx, `Ehrung für ${p.nickname}: Geheimauftrag erfüllt`);
  } else log(ctx, `Persönliches Ziel von ${p.nickname} nicht erfüllt`);
}

export function removeGoal(ctx: Ctx, playerId: string, id: string) {
  const p = player(ctx.state, playerId);
  if (!(p.goals ?? []).some((g) => g.id === id)) fail('Ziel nicht gefunden');
  p.goals = (p.goals ?? []).filter((g) => g.id !== id);
  log(ctx, `Persönliches Ziel von ${p.nickname} entfernt`);
}

// ─── C5 Nemesis und Rivalitäten ─────────────────────────────────────────────

export function setNemesis(ctx: Ctx, playerId: string, nemesisId: string | null) {
  const st = ctx.state;
  if (st.toggles.narrative?.nemesis !== true) fail('Nemesis ist nicht aktiviert');
  const p = player(st, playerId);
  if (nemesisId) {
    const n = player(st, nemesisId);
    if (n.id === p.id) fail('Du kannst nicht dein eigener Nemesis sein');
    const phase = stagePhase(st);
    const mine = allianceOf(p, phase);
    if (mine && allianceOf(n, phase) === mine) fail('Die Nemesis muss einer anderen Allianz angehören');
    p.nemesisId = n.id;
    log(ctx, `${p.nickname} erklärt ${n.nickname} zur Nemesis`);
  } else {
    p.nemesisId = null;
    log(ctx, `${p.nickname} hat keine Nemesis mehr`);
  }
}

export interface RivalryRow {
  opponentId: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface Rivalries {
  rows: RivalryRow[];
  /** häufigster Gegner */
  mostPlayed: RivalryRow | null;
  /** meiste Siege gegen */
  mostBeaten: RivalryRow | null;
  /** meiste Niederlagen gegen */
  mostLostTo: RivalryRow | null;
  /** knappste Bilanz (mind. 2 Spiele) */
  closest: RivalryRow | null;
}

/** Gewertete Paarungen: Einzelspiele mit VP, sonst die Schlacht (ungespielt gewertete zählen nicht) */
function pairings(st: CampaignState): { a: string[]; d: string[]; v: 'ATTACKER' | 'DEFENDER' | 'DRAW' }[] {
  const out: { a: string[]; d: string[]; v: 'ATTACKER' | 'DEFENDER' | 'DRAW' }[] = [];
  const counted = (b: Battle) => (b.kind === 'CAMPAIGN' || b.kind === 'FINAL_TIEBREAK') && (b.status === 'PLAYED' || b.status === 'PROCESSED') && !b.unplayedResolution;
  for (const b of st.battles.filter(counted)) {
    const games = (b.games ?? []).filter((g) => g.vp && g.attackers.length && g.defenders.length);
    if (games.length) {
      for (const g of games)
        out.push({ a: g.attackers.map((x) => x.playerId), d: g.defenders.map((x) => x.playerId), v: g.vp!.attacker > g.vp!.defender ? 'ATTACKER' : g.vp!.attacker < g.vp!.defender ? 'DEFENDER' : 'DRAW' });
      continue;
    }
    const v = effectiveVictor(b);
    if (v) out.push({ a: b.attackers.map((x) => x.playerId), d: b.defenders.map((x) => x.playerId), v });
  }
  return out;
}

export function rivalries(st: CampaignState, playerId: string): Rivalries {
  const map = new Map<string, RivalryRow>();
  for (const g of pairings(st)) {
    const side = g.a.includes(playerId) ? 'ATTACKER' : g.d.includes(playerId) ? 'DEFENDER' : null;
    if (!side) continue;
    for (const o of side === 'ATTACKER' ? g.d : g.a) {
      let r = map.get(o);
      if (!r) map.set(o, (r = { opponentId: o, games: 0, wins: 0, losses: 0, draws: 0 }));
      r.games++;
      if (g.v === 'DRAW') r.draws++;
      else if (g.v === side) r.wins++;
      else r.losses++;
    }
  }
  const nick = (id: string) => st.players.find((p) => p.id === id)?.nickname ?? id;
  const rows = [...map.values()].sort((x, y) => y.games - x.games || nick(x.opponentId).localeCompare(nick(y.opponentId)));
  const best = (score: (r: RivalryRow) => number, min = 1) => {
    const c = rows.filter((r) => score(r) >= min);
    return c.length ? c.reduce((m, r) => (score(r) > score(m) ? r : m)) : null;
  };
  const close = rows.filter((r) => r.games >= 2);
  return {
    rows,
    mostPlayed: best((r) => r.games),
    mostBeaten: best((r) => r.wins),
    mostLostTo: best((r) => r.losses),
    closest: close.length ? close.reduce((m, r) => (Math.abs(r.wins - r.losses) < Math.abs(m.wins - m.losses) ? r : m)) : null,
  };
}

/** Haben zwei Spieler schon gegeneinander gespielt oder sind angesetzt (egal welche Seite)? */
export function havePlayed(st: CampaignState, a: string, b: string): boolean {
  return st.battles.some((x) => {
    if (x.status === 'VOID') return false;
    const att = x.attackers.map((p) => p.playerId);
    const def = x.defenders.map((p) => p.playerId);
    return (att.includes(a) && def.includes(b)) || (att.includes(b) && def.includes(a));
  });
}

/**
 * Nemesis-Paarung (C5) für den Verteidigervorschlag: Kandidat und einer der Angreifer haben sich gegenseitig
 * bzw. einseitig als Nemesis gewählt und noch nie gegeneinander gespielt (einmal pro Kampagne).
 */
export function nemesisMatch(st: CampaignState, candidateId: string, attackerIds: string[]): boolean {
  if (st.toggles.narrative?.nemesis !== true) return false;
  const cand = st.players.find((p) => p.id === candidateId);
  if (!cand) return false;
  return attackerIds.some((aid) => {
    const att = st.players.find((p) => p.id === aid);
    const linked = cand.nemesisId === aid || att?.nemesisId === cand.id;
    return linked && !havePlayed(st, cand.id, aid);
  });
}
