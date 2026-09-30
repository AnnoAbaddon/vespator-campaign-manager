import { fail, hint, log, type Ctx } from './ctx';
import { alliance, allianceName } from './board';
import { modifierActive } from './graph';
import { house } from './houseRules';
import { allianceOf, carryCommanders, setMembership, stagePhase } from './players';
import type { Battle, CampaignState, Participant, Player } from './types';

/**
 * Spieler-Lebenszyklus (R2): Abwesenheit (A5), Flottenübergabe und Nachzügler (B2), Phasen-Puls (B4).
 */

const player = (st: CampaignState, id: string): Player => {
  const p = st.players.find((x) => x.id === id);
  if (!p) fail('Spieler nicht gefunden');
  return p;
};

// ─── A5 Abwesenheit ─────────────────────────────────────────────────────────

export function isAbsent(st: CampaignState, playerId: string | null | undefined, phase: number): boolean {
  if (!playerId) return false;
  return !!st.players.find((p) => p.id === playerId)?.absences?.includes(phase);
}

/** Phasen, deren Abwesenheit sich noch ändern lässt: laufende und künftige */
export function absencePhases(st: CampaignState): number[] {
  const from = st.stage.kind === 'PHASE' ? st.stage.phase : st.stage.kind === 'SETUP' ? 1 : st.meta.phaseCount + 1;
  const out: number[] = [];
  for (let n = from; n <= st.meta.phaseCount; n++) out.push(n);
  return out;
}

/** Spieler meldet sich für Phasen ab (bzw. wieder an). Laufende Phase im Schritt 1: Standardoperation sofort. */
export function setAbsence(ctx: Ctx, playerId: string, phases: number[], absent: boolean) {
  const st = ctx.state;
  const p = player(st, playerId);
  const allowed = absencePhases(st);
  const list = [...new Set(phases)].sort((a, b) => a - b);
  if (!list.length) fail('Keine Phase gewählt');
  for (const n of list) if (!allowed.includes(n)) fail(`Phase ${n} ist bereits vorbei oder existiert nicht`);
  const cur = new Set(p.absences ?? []);
  for (const n of list) {
    if (absent) cur.add(n);
    else cur.delete(n);
  }
  p.absences = [...cur].sort((a, b) => a - b);
  log(ctx, absent ? `${p.nickname} ist abwesend in Phase ${list.join(', ')}` : `${p.nickname} ist wieder dabei in Phase ${list.join(', ')}`);
  if (st.stage.kind === 'PHASE' && list.includes(st.stage.phase)) syncAbsenceOrders(ctx);
}

/**
 * Standardoperation für Flotten abwesender Kommandanten (A5, Buch-Empfehlung Logistical Auxilia) – nur im
 * Schritt „Operationen wählen“. Ohne erteilten Befehl erhält die Flotte sofort Logistical Auxilia (bzw. keine
 * Operation, wenn Logistical Auxilia gesperrt ist); ist der Kommandant wieder da, fällt der Eintrag weg.
 * Selbst erteilte Befehle bleiben immer stehen.
 */
export function syncAbsenceOrders(ctx: Ctx) {
  const st = ctx.state;
  if (st.stage.kind !== 'PHASE' || st.stage.step !== 'OPS') return;
  const n = st.stage.phase;
  const ph = st.phases.find((x) => x.number === n);
  if (!ph) return;
  const laAllowed = st.toggles.operations.logisticalAuxilia && (house(st, 'F6_AUXILIA_ANYWAY') || !modifierActive(st, 'NO_LOGISTICAL_AUXILIA', n));
  const added: string[] = [];
  const removed: string[] = [];
  for (const f of st.fleets) {
    if (f.reserve || !f.planetId) continue;
    const absent = isAbsent(st, f.commanders[String(n)], n);
    const existing = ph.operations.find((o) => o.fleetId === f.id && o.slot === 1);
    if (absent && !existing) {
      ph.operations.push({
        id: ctx.newId('op'),
        fleetId: f.id,
        allianceId: f.allianceId,
        slot: 1,
        type: laAllowed ? 'LOGISTICAL_AUXILIA' : 'NONE',
        originPlanetId: f.planetId,
        isDefault: true,
        absence: true,
        revealed: false,
        status: 'PLANNED',
      });
      added.push(f.name);
    } else if (!absent && existing?.absence) {
      ph.operations = ph.operations.filter((o) => o !== existing);
      removed.push(f.name);
    }
  }
  if (added.length) log(ctx, `Abwesend: ${added.join(', ')} → ${laAllowed ? 'Logistical Auxilia' : 'keine Operation'}`);
  if (removed.length) log(ctx, `Kommandant wieder da: Standardoperation für ${removed.join(', ')} entfernt`);
}

// ─── B2 Flotte übergeben / Nachzügler ───────────────────────────────────────

/** Laufende Phase für Kommandos und Mitgliedschaften (Setup = 0) */
const nowPhase = (st: CampaignState) => stagePhase(st);

function lateJoinHonor(ctx: Ctx, p: Player, fromPhase: number) {
  if (ctx.state.toggles.narrative?.lateJoinBonus !== true || fromPhase < 2) return;
  p.honors = [...(p.honors ?? []), { id: ctx.newId('honor'), title: 'Späte Verstärkung', reason: `Nachzügler ab Phase ${fromPhase}`, phase: fromPhase, battleId: null }];
  log(ctx, `Ehrung für ${p.nickname}: Späte Verstärkung (Startbonus für Nachzügler)`);
}

function newPlayer(ctx: Ctx, data: { nickname: string; faction?: string; subfaction?: string }): Player {
  const st = ctx.state;
  const nick = data.nickname.trim().slice(0, 40);
  if (!nick) fail('Nickname fehlt');
  if (st.players.some((x) => x.nickname.toLowerCase() === nick.toLowerCase())) fail('Nickname ist schon vergeben');
  const faction = (data.faction ?? '').trim();
  const subfaction = (data.subfaction ?? '').trim();
  const p: Player = {
    id: ctx.newId('pl'),
    nickname: nick,
    realName: '',
    email: '',
    discord: '',
    avatar: null,
    notes: '',
    faction,
    subfaction,
    memberships: [],
    active: true,
    isGameMaster: false,
    factionHistory: faction ? [{ faction, subfaction, fromPhase: 0 }] : [],
  };
  st.players.push(p);
  return p;
}

/** Nachzügler aufnehmen (B2): neuer Spieler in einer Allianz ab Phase n; die Historie der anderen bleibt unberührt */
export function joinPlayer(ctx: Ctx, data: { nickname: string; faction?: string; subfaction?: string; allianceId: string; fromPhase: number }) {
  const st = ctx.state;
  if (st.stage.kind === 'ENDED' || st.stage.kind === 'TIEBREAK') fail('Die Kampagne ist beendet');
  alliance(st, data.allianceId);
  const min = st.stage.kind === 'SETUP' ? 0 : nowPhase(st);
  if (!Number.isInteger(data.fromPhase) || data.fromPhase < min || data.fromPhase > st.meta.phaseCount) fail(`Beitritt nur ab Phase ${Math.max(min, 1)} bis ${st.meta.phaseCount}`);
  const p = newPlayer(ctx, data);
  const from = st.stage.kind === 'SETUP' ? 0 : data.fromPhase;
  if (p.factionHistory?.length) p.factionHistory[0].fromPhase = from;
  setMembership(p, data.allianceId, from);
  log(ctx, `Nachzügler ${p.nickname} tritt ${allianceName(st, data.allianceId)} bei${from ? ` (ab Phase ${from})` : ''}`);
  // freie Kommandos der laufenden Phase übernimmt der Neue sofort
  if (st.stage.kind === 'PHASE' && from === st.stage.phase) {
    carryCommanders(st, from);
    syncAbsenceOrders(ctx);
  }
  lateJoinHonor(ctx, p, from);
}

/** Teilnehmerlisten einer offenen Schlacht (auch Einzelspiele) von einem Spieler auf einen anderen umschreiben */
function swapParticipant(b: Battle, fromId: string, to: Player): boolean {
  let hit = false;
  const swap = (list: Participant[]) =>
    list.map((x) => {
      if (x.playerId !== fromId) return x;
      hit = true;
      return { playerId: to.id, faction: to.faction };
    });
  const dedupe = (list: Participant[]) => list.filter((x, i) => list.findIndex((y) => y.playerId === x.playerId) === i);
  b.attackers = dedupe(swap(b.attackers));
  b.defenders = dedupe(swap(b.defenders));
  for (const g of b.games ?? []) {
    g.attackers = dedupe(swap(g.attackers));
    g.defenders = dedupe(swap(g.defenders));
  }
  return hit;
}

export interface HandoverInput {
  fromPlayerId: string;
  /** bestehender Spieler (Allianzkollege oder Spieler ohne Allianz) */
  toPlayerId?: string | null;
  /** oder: neuer Spieler übernimmt */
  newPlayer?: { nickname: string; faction?: string; subfaction?: string };
  /** Abgebenden deaktivieren und aus der Allianz austragen (Abbrecher) */
  retire: boolean;
}

/**
 * Flotte übergeben (B2): Kommandos (ab der laufenden Phase), offene Schlachten und die Anführerrolle eines
 * Spielers gehen an einen Allianzkollegen oder einen neuen Spieler. Gespielte Schlachten, Ehrungen und die
 * Mitgliedschaften der Vergangenheit bleiben beim bisherigen Spieler (Historie).
 */
export function handover(ctx: Ctx, input: HandoverInput) {
  const st = ctx.state;
  if (st.stage.kind === 'ENDED' || st.stage.kind === 'TIEBREAK') fail('Die Kampagne ist beendet');
  const from = player(st, input.fromPlayerId);
  const cur = nowPhase(st);
  const al = allianceOf(from, cur);
  if (!al) fail(`${from.nickname} gehört in dieser Phase keiner Allianz an`);
  let to: Player;
  if (input.newPlayer) {
    to = newPlayer(ctx, input.newPlayer);
    if (to.factionHistory?.length) to.factionHistory[0].fromPhase = cur;
    setMembership(to, al, cur);
    log(ctx, `Nachzügler ${to.nickname} tritt ${allianceName(st, al)} bei${cur ? ` (ab Phase ${cur})` : ''}`);
    lateJoinHonor(ctx, to, cur);
  } else {
    if (!input.toPlayerId) fail('Übernehmenden Spieler wählen');
    to = player(st, input.toPlayerId);
    if (to.id === from.id) fail('Übergabe an sich selbst ist nicht möglich');
    if (!to.active) fail(`${to.nickname} ist inaktiv`);
    const toAl = allianceOf(to, cur);
    if (toAl && toAl !== al) fail(`${to.nickname} gehört einer anderen Allianz an`);
    if (!toAl) setMembership(to, al, cur);
  }
  // Kommandos ab der laufenden Phase (im Setup alle)
  const fleets: string[] = [];
  for (const f of st.fleets) {
    let moved = false;
    for (const [k, v] of Object.entries(f.commanders)) {
      if (v === from.id && Number(k) >= cur) {
        f.commanders[k] = to.id;
        moved = true;
      }
    }
    if (moved) fleets.push(f.name);
  }
  // offene Schlachten ohne gemeldetes Ergebnis
  const battles: string[] = [];
  for (const b of st.battles) {
    if (b.status !== 'SCHEDULED') continue;
    if (b.draft) {
      if ([...b.attackers, ...b.defenders].some((x) => x.playerId === from.id)) hint(ctx, `Schlacht mit gemeldetem Ergebnis bleibt bei ${from.nickname} – der Warmaster entscheidet`);
      continue;
    }
    if (swapParticipant(b, from.id, to)) battles.push(b.id);
  }
  const a = alliance(st, al);
  if (a.leaderPlayerId === from.id) a.leaderPlayerId = to.id;
  log(
    ctx,
    `Übergabe ${from.nickname} → ${to.nickname}: ${fleets.length ? fleets.join(', ') : 'keine Flotten'}${battles.length ? ` · ${battles.length} offene Schlacht(en)` : ''}${a.leaderPlayerId === to.id ? ' · Anführer' : ''}`,
  );
  if (input.retire) {
    // wer in der laufenden Phase schon gespielt hat, bleibt bis zu deren Ende Mitglied
    const played = st.stage.kind === 'PHASE' && st.battles.some((b) => b.phaseNumber === cur && b.status !== 'VOID' && [...b.attackers, ...b.defenders].some((x) => x.playerId === from.id));
    const leaveFrom = st.stage.kind === 'SETUP' ? 0 : played ? cur + 1 : cur;
    setMembership(from, null, leaveFrom);
    from.active = false;
    log(ctx, `${from.nickname} verlässt die Kampagne${leaveFrom ? ` (ab Phase ${leaveFrom})` : ''} – Historie bleibt erhalten`);
  }
  syncAbsenceOrders(ctx);
}

// ─── B4 Phasen-Puls ─────────────────────────────────────────────────────────

export type PulseTime = 'MUCH' | 'LITTLE' | 'NONE';

export interface PulseEntry {
  playerId: string;
  /** Spaß 1–5 */
  fun: number;
  /** Zeit in der nächsten Phase */
  time: PulseTime;
  comment: string;
  /** Name wird in der Auswertung nicht angezeigt */
  anonymous: boolean;
  at: string;
}

export const PULSE_TIME_LABEL: Record<PulseTime, string> = { MUCH: 'viel Zeit', LITTLE: 'wenig Zeit', NONE: 'keine Zeit' };

/** Für welche Phase fragt der Spielerlink gerade? Ab Schritt 3 der laufenden Phase, sonst die vorige Phase. */
export function pulsePhase(st: CampaignState): number | null {
  if (st.toggles.narrative?.pulse !== true) return null;
  if (st.stage.kind === 'PHASE') {
    const late = ['RESULTS', 'MOVE', 'BUILD'].includes(st.stage.step);
    const n = late ? st.stage.phase : st.stage.phase - 1;
    return n >= 1 ? n : null;
  }
  if (st.stage.kind === 'ENDED' || st.stage.kind === 'TIEBREAK') return st.meta.phaseCount;
  return null;
}

export function submitPulse(ctx: Ctx, playerId: string, phase: number, input: { fun: number; time: PulseTime; comment: string; anonymous: boolean; absentNext?: boolean }) {
  const st = ctx.state;
  if (st.toggles.narrative?.pulse !== true) fail('Der Phasen-Puls ist nicht aktiviert');
  const p = player(st, playerId);
  // die Frage gilt der gerade abgeschlossenen bzw. endenden Phase (oder der laufenden)
  const cur = st.stage.kind === 'PHASE' ? st.stage.phase : st.meta.phaseCount;
  if (phase !== cur && phase !== cur - 1) fail('Der Puls lässt sich nur für die laufende oder die letzte Phase abgeben');
  const ph = st.phases.find((x) => x.number === phase);
  if (!ph) fail('Phase nicht gefunden');
  if (!Number.isInteger(input.fun) || input.fun < 1 || input.fun > 5) fail('Bewertung 1–5');
  if (!['MUCH', 'LITTLE', 'NONE'].includes(input.time)) fail('Ungültige Zeitangabe');
  const entry: PulseEntry = { playerId, fun: input.fun, time: input.time, comment: input.comment.trim().slice(0, 500), anonymous: !!input.anonymous, at: ctx.now };
  ph.pulse = [...(ph.pulse ?? []).filter((e) => e.playerId !== playerId), entry];
  log(ctx, `Phasen-Puls für Phase ${phase} abgegeben`);
  // „keine Zeit“ kann direkt den Abwesenheitsmodus für die nächste Phase setzen
  const next = phase + 1;
  if (input.absentNext && next <= st.meta.phaseCount && absencePhases(st).includes(next) && !(p.absences ?? []).includes(next)) setAbsence(ctx, playerId, [next], true);
}

export interface PulseSummary {
  phase: number;
  count: number;
  /** Durchschnitt Spaß (1–5), null ohne Antworten */
  fun: number | null;
  time: Record<PulseTime, number>;
  comments: { text: string; by: string | null; fun: number }[];
  /** Spieler, die noch nicht geantwortet haben (aktive Mitglieder) */
  missing: string[];
}

export function pulseSummary(st: CampaignState, phase: number): PulseSummary {
  const entries = st.phases.find((p) => p.number === phase)?.pulse ?? [];
  const time: Record<PulseTime, number> = { MUCH: 0, LITTLE: 0, NONE: 0 };
  for (const e of entries) time[e.time]++;
  const nick = (id: string) => st.players.find((p) => p.id === id)?.nickname ?? '?';
  return {
    phase,
    count: entries.length,
    fun: entries.length ? Math.round((entries.reduce((s, e) => s + e.fun, 0) / entries.length) * 10) / 10 : null,
    time,
    comments: entries.filter((e) => e.comment).map((e) => ({ text: e.comment, by: e.anonymous ? null : nick(e.playerId), fun: e.fun })),
    missing: st.players.filter((p) => p.active && allianceOf(p, phase) && !entries.some((e) => e.playerId === p.id)).map((p) => p.id),
  };
}
