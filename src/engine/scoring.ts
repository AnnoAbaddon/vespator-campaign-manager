import { MEDALS, type MedalId } from './data/vespator';
import { fail, log, rollOff, warn, type Ctx } from './ctx';
import { closeObjectives } from './narrative';
import { END_SCORING_LABEL, finalScores, grandEnabled, scoresDeviate } from './finale';
import { allianceName, campaignPoints, powerSum } from './board';
import { distance } from './graph';
import { curPhase } from './phase';
import { membersOfAlliance, playersOfAlliance } from './players';
import { awardAutoHonors } from './commanders';
import { house } from './houseRules';
import type { Battle, MedalAward, Participant } from './types';

export function scorePhase(ctx: Ctx) {
  const s = ctx.state.stage;
  if (s.kind !== 'PHASE' || s.step !== 'RESULTS') fail('Punkte nur in Schritt 3');
  const st = ctx.state;
  const ph = curPhase(ctx);
  const entry = {
    phaseNumber: ph.number,
    points: Object.fromEntries(st.alliances.map((a) => [a.id, campaignPoints(st, a.id)])),
    powerSum: Object.fromEntries(st.alliances.map((a) => [a.id, powerSum(st, a.id)])),
    planets: Object.fromEntries(st.planets.map((p) => [p.id, { ...p.power }])),
  };
  st.pointsHistory = st.pointsHistory.filter((p) => p.phaseNumber !== ph.number);
  st.pointsHistory.push(entry);
  ph.flags.scored = true;
  log(ctx, `Kampagnenpunkte Phase ${ph.number}: ${st.alliances.map((a) => `${a.name} ${entry.points[a.id]}`).join(', ')}`);
}

/** Beendet die Kampagne nach der letzten Phase (SPEC 12.1) */
export function endCampaign(ctx: Ctx) {
  const s = ctx.state.stage;
  if (s.kind !== 'PHASE' || s.step !== 'RESULTS') fail('Kampagnenende nur in Schritt 3 der letzten Phase');
  const st = ctx.state;
  const ph = curPhase(ctx);
  if (ph.number < st.meta.phaseCount) fail(`Die Kampagne hat ${st.meta.phaseCount} Phasen`);
  if (!ph.flags.scored) fail('Erst Punkte berechnen');
  ph.stepStatus.RESULTS = 'DONE';
  // C3: offene Sonderziele der letzten Phase verfallen; C6: eine Großschlacht ohne Ergebnis zählt nicht
  closeObjectives(ctx, ph.number);
  if (grandEnabled(st) && !st.grandBattle?.done) warn(ctx, 'Großschlacht ohne Ergebnis – sie geht nicht in die Endwertung ein');
  // C2/C6: Endwertung – Standard sind die Kampagnenpunkte nach Buch
  const scores = finalScores(st);
  const pts = scores.total;
  if (scoresDeviate(scores)) log(ctx, `Endwertung (${END_SCORING_LABEL[scores.mode]}): ${st.alliances.map((a) => `${a.name} ${pts[a.id]}`).join(', ')}`);
  st.result = { winnerAllianceId: null, tiebreak: 'NONE', tied: [], scores };
  const max = Math.max(...Object.values(pts));
  const tied = Object.keys(pts).filter((a) => pts[a] === max);
  if (tied.length === 1) {
    finish(ctx, tied[0], 'NONE', []);
    return;
  }
  const withSh = tied.filter((a) => !st.alliances.find((x) => x.id === a)!.strongholdDestroyed);
  if (withSh.length === 1) {
    finish(ctx, withSh[0], 'STRONGHOLD', tied);
    return;
  }
  st.result = { winnerAllianceId: null, tiebreak: 'FINAL_BATTLE', tied, scores };
  st.stage = { kind: 'TIEBREAK' };
  log(ctx, `Gleichstand zwischen ${tied.map((a) => allianceName(st, a)).join(', ')} – Entscheidungsschlacht(en) nötig`);
}

export function addTiebreakBattle(ctx: Ctx, attackerAllianceId: string, defenderAllianceId: string) {
  const st = ctx.state;
  if (st.stage.kind !== 'TIEBREAK') fail('Keine Entscheidungsschlacht nötig');
  if (!st.result?.tied.includes(attackerAllianceId) || !st.result.tied.includes(defenderAllianceId) || attackerAllianceId === defenderAllianceId) fail('Nur gleichauf liegende Allianzen');
  st.battleSeq++;
  // Vorbelegung (R1): je Seite der Anführer der Allianz, sonst ihr einziges Mitglied; Spieler können die Seite übernehmen
  const pick = (al: string): Participant[] => {
    const members = playersOfAlliance(st, al, st.meta.phaseCount);
    const leader = st.alliances.find((a) => a.id === al)?.leaderPlayerId;
    const p = members.find((m) => m.id === leader) ?? (members.length === 1 ? members[0] : null);
    return p ? [{ playerId: p.id, faction: p.faction }] : [];
  };
  const b: Battle = {
    id: ctx.newId('battle'),
    phaseNumber: st.meta.phaseCount,
    kind: 'FINAL_TIEBREAK',
    operationIds: [],
    attackType: null,
    planetId: null,
    attackerAllianceId,
    defenderAllianceId,
    attackers: pick(attackerAllianceId),
    defenders: pick(defenderAllianceId),
    status: 'SCHEDULED',
    playedAt: null,
    createdSeq: st.battleSeq,
    size: null,
    mission: { source: 'EXTERNAL', externalName: '' },
    theatre: null,
    theatreChosenBy: null,
    twist: null,
    vp: null,
    battleReady: { attacker: false, defender: false },
    victor: null,
    victorOverride: false,
    decisions: {},
    applied: [],
    report: '',
    photos: [],
    notes: '',
    processedOrder: null,
    unplayedResolution: null,
    postponedFrom: null,
  };
  st.battles.push(b);
  log(ctx, `Entscheidungsschlacht angesetzt: ${allianceName(st, attackerAllianceId)} vs. ${allianceName(st, defenderAllianceId)}`);
}

export function decideTiebreak(ctx: Ctx, winnerAllianceId: string) {
  const st = ctx.state;
  if (st.stage.kind !== 'TIEBREAK') fail('Keine Entscheidungsschlacht offen');
  if (!st.result?.tied.includes(winnerAllianceId)) fail('Sieger muss eine der gleichauf liegenden Allianzen sein');
  finish(ctx, winnerAllianceId, 'FINAL_BATTLE', st.result.tied);
}

function finish(ctx: Ctx, winner: string, tiebreak: 'NONE' | 'STRONGHOLD' | 'FINAL_BATTLE', tied: string[]) {
  const st = ctx.state;
  st.result = { winnerAllianceId: winner, tiebreak, tied, ...(st.result?.scores ? { scores: st.result.scores } : {}) };
  log(ctx, `${allianceName(st, winner)} gewinnt die Kampagne${tiebreak === 'STRONGHOLD' ? ' (Tiebreak: Stronghold)' : tiebreak === 'FINAL_BATTLE' ? ' (Entscheidungsschlacht)' : ''}`);
  // B8: Entscheidungsschlachten sind damit abgeschlossen – gespielte gelten als verarbeitet, offene verfallen
  let order = 0;
  for (const b of st.battles.filter((x) => x.kind === 'FINAL_TIEBREAK')) {
    if (b.status === 'PLAYED') {
      b.status = 'PROCESSED';
      b.processedOrder = ++order;
    } else if (b.status === 'SCHEDULED') {
      b.status = 'VOID';
      b.unplayedResolution = 'VOID';
      b.draft = null;
      log(ctx, 'Entscheidungsschlacht ohne Ergebnis – verfällt');
    }
  }
  if (st.toggles.medals) awardMedals(ctx);
  // N3.4: Die Entscheidungsschlacht ist eine gespielte Schlacht und zählt für die automatischen Ehrungen
  if (tiebreak === 'FINAL_BATTLE') awardAutoHonors(ctx);
  st.stage = { kind: 'ENDED' };
}

/** Kennzahlen je Medaille (SPEC 12.2) */
export function medalValues(ctx: Ctx | { state: Ctx['state'] }): Record<Exclude<MedalId, 'LAUREL'>, Record<string, number | null>> {
  const st = ctx.state;
  const wreath: Record<string, number | null> = {};
  const star: Record<string, number | null> = {};
  const dagger: Record<string, number | null> = {};
  for (const a of st.alliances) {
    wreath[a.id] = st.planets.filter((p) => !p.destroyed && p.power[a.id] === 1).length;
    const sf = [...new Set(st.planets.filter((p) => p.slots.some((s) => !s.destroyed && s.infra?.type === 'SUPPORT_FACILITY' && s.infra.allianceId === a.id)).map((p) => p.id))];
    star[a.id] = sf.length >= 2 ? maxPairDistance(sf) : null;
    const fp = [...new Set(st.fleets.filter((f) => f.allianceId === a.id && f.planetId).map((f) => f.planetId!))];
    dagger[a.id] = fp.length >= 2 ? maxPairDistance(fp) : null;
  }
  return { WREATH: wreath, STAR: star, DAGGER: dagger };
}

function maxPairDistance(ids: string[]) {
  let m = 0;
  for (const a of ids) for (const b of ids) if (a !== b) m = Math.max(m, distance(a, b));
  return m;
}

export function awardMedals(ctx: Ctx) {
  const st = ctx.state;
  const winner = st.result?.winnerAllianceId;
  const awards: MedalAward[] = [];
  const phase = st.meta.phaseCount;
  // SPEC 12.2: an alle Spieler, die bei Kampagnenende Mitglied waren – auch inaktive (R5)
  const members = (a: string) => membersOfAlliance(st, a, phase).map((p) => p.id);
  if (winner) awards.push({ medal: 'LAUREL', allianceId: winner, playerIds: members(winner), value: null, note: '' });
  const vals = medalValues(ctx);
  for (const m of ['WREATH', 'STAR', 'DAGGER'] as const) {
    const v = vals[m];
    const cands = Object.keys(v).filter((a) => v[a] !== null && (m !== 'WREATH' || (v[a] ?? 0) > 0));
    if (!cands.length) {
      log(ctx, `${MEDALS[m].name}: nicht vergeben (Kriterium von keiner Allianz erfüllt)`);
      continue;
    }
    const max = Math.max(...cands.map((a) => v[a]!));
    let top = cands.filter((a) => v[a] === max);
    let note = '';
    if (top.length > 1) {
      const count = (a: string) => awards.filter((x) => x.allianceId === a).length;
      const minC = Math.min(...top.map(count));
      top = top.filter((a) => count(a) === minC);
      note = 'Gleichstand: wenigste andere Medaillen';
      if (top.length > 1 && house(st, 'F22_MEDAL_TIE_NONE')) {
        log(ctx, `${MEDALS[m].name}: nicht vergeben (Gleichstand, Hausregel F-22)`);
        continue;
      }
      if (top.length > 1) {
        top = rollOff(ctx, top, MEDALS[m].name, (a) => allianceName(st, a)).slice(0, 1);
        note += ', dann Roll-off';
      }
    }
    awards.push({ medal: m, allianceId: top[0], playerIds: members(top[0]), value: max, note });
  }
  st.medals = awards;
  for (const a of awards) log(ctx, `Medaille ${MEDALS[a.medal].name} → ${allianceName(st, a.allianceId)}${a.note ? ` (${a.note})` : ''}`);
}

export function overrideMedal(ctx: Ctx, medal: MedalId, allianceId: string | null) {
  const st = ctx.state;
  if (st.stage.kind !== 'ENDED') fail('Medaillen erst nach Kampagnenende');
  st.medals = st.medals.filter((m) => m.medal !== medal);
  if (allianceId) st.medals.push({ medal, allianceId, playerIds: membersOfAlliance(st, allianceId, st.meta.phaseCount).map((p) => p.id), value: null, note: 'Override' });
  log(ctx, `${MEDALS[medal].name}: ${allianceId ? allianceName(st, allianceId) : 'nicht vergeben'} (Override)`);
}
