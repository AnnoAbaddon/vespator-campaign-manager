import { ATTACK_TYPES } from './data/vespator';
import { fail, hint, log, warn, type Ctx } from './ctx';
import { allMissions, VESPATOR_MISSIONS } from './missions';
import type { AttackType, Battle, CampaignState, MissionDef } from './types';

/**
 * Missions-Pool je Angriffsart und Wiederholungssperre (A1), Missions-Mix (A2).
 *
 * Der Warmaster hinterlegt je Angriffsart 1–3 Missionen (Vespator, Vorlagen, eigene). Beim Ansetzen einer
 * Schlacht schlägt die App eine Mission aus dem Pool vor; die Campaign Outcomes bleiben immer die der
 * Angriffsart. Spielt dieselbe Allianz mit derselben Angriffsart zweimal hintereinander dieselbe Mission,
 * gibt es einen Hinweis – mit Hausregel eine Sperre, die nur der Spielleiter per Override aufhebt.
 */

export const POOL_MAX = 3;

/** Vespator-Mission einer Angriffsart */
export const vespatorMissionId = (t: AttackType) => VESPATOR_MISSIONS.find((m) => m.attackTypes[0] === t)!.id;

/** Standardmission einer Angriffsart ohne Pool (Boarding Action: Boarding-Actions-Mission extern) */
export function defaultMission(t: AttackType | null): Battle['mission'] {
  return t === 'BOARDING_ACTION' ? { source: 'EXTERNAL', externalName: 'Boarding Actions' } : { source: 'VESPATOR', externalName: '' };
}

/** Pool einer Angriffsart (nur existierende Missionen) */
export function missionPool(state: Pick<CampaignState, 'meta'>, t: AttackType | null): MissionDef[] {
  if (!t) return [];
  const all = allMissions(state);
  return (state.meta.missionPool?.[t] ?? []).map((id) => all.find((m) => m.id === id)).filter((m): m is MissionDef => !!m);
}

/** Eindeutiger Schlüssel der gespielten Mission (Vespator = Vespator-Mission der Angriffsart) */
export function missionKey(b: Pick<Battle, 'mission' | 'attackType'>): string {
  const m = b.mission;
  if (m.source === 'VESPATOR') return b.attackType ? vespatorMissionId(b.attackType) : 'vespator';
  if (m.source === 'LIST') return m.missionId ?? '';
  // Boarding Actions als Standard der Angriffsart zählt wie die Vespator-Mission
  if (m.source === 'EXTERNAL' && b.attackType === 'BOARDING_ACTION' && m.externalName === 'Boarding Actions') return vespatorMissionId('BOARDING_ACTION');
  return `ext:${m.externalName.trim().toLowerCase()}`;
}

/** Mission aus einer Pool-ID */
export function missionFromId(t: AttackType, id: string): Battle['mission'] {
  return id === vespatorMissionId(t) ? defaultMission(t) : { source: 'LIST', externalName: '', missionId: id };
}

const before = (x: Battle, b: Pick<Battle, 'phaseNumber' | 'createdSeq'>) => x.phaseNumber < b.phaseNumber || (x.phaseNumber === b.phaseNumber && x.createdSeq < b.createdSeq);

/** Vorherige Kampagnenschlacht derselben angreifenden Allianz mit derselben Angriffsart */
export function previousBattle(state: CampaignState, b: Pick<Battle, 'id' | 'phaseNumber' | 'createdSeq' | 'attackerAllianceId' | 'attackType'>): Battle | null {
  let best: Battle | null = null;
  for (const x of state.battles) {
    if (x.id === b.id || x.kind !== 'CAMPAIGN' || x.status === 'VOID' || x.attackerAllianceId !== b.attackerAllianceId || x.attackType !== b.attackType) continue;
    if (!before(x, b)) continue;
    if (!best || before(best, x)) best = x;
  }
  return best;
}

/**
 * Vorschlag aus dem Pool beim Ansetzen: die Mission, die diese Allianz mit dieser Angriffsart am
 * seltensten gespielt hat – ohne die zuletzt gespielte. Ohne Pool: Standardmission der Angriffsart.
 */
export function suggestMission(state: CampaignState, b: Pick<Battle, 'id' | 'phaseNumber' | 'createdSeq' | 'attackerAllianceId' | 'attackType'>): Battle['mission'] {
  const t = b.attackType;
  const pool = missionPool(state, t);
  if (!t || !pool.length) return defaultMission(t);
  const prev = previousBattle(state, b);
  const last = prev ? missionKey(prev) : null;
  const used: Record<string, number> = {};
  for (const x of state.battles) {
    if (x.id === b.id || x.kind !== 'CAMPAIGN' || x.status === 'VOID' || x.attackerAllianceId !== b.attackerAllianceId || x.attackType !== t) continue;
    used[missionKey(x)] = (used[missionKey(x)] ?? 0) + 1;
  }
  const cands = pool.filter((m) => m.id !== last);
  const pick = (cands.length ? cands : pool).map((m, i) => ({ m, i })).sort((x, y) => (used[x.m.id] ?? 0) - (used[y.m.id] ?? 0) || x.i - y.i)[0].m;
  return missionFromId(t, pick.id);
}

export interface RepeatInfo {
  /** Name der wiederholten Mission */
  mission: string;
  /** Pool enthält eine andere Mission – nur dann greift die Sperre */
  alternative: boolean;
}

/** Wäre die Mission eine Wiederholung (gleiche Allianz, gleiche Angriffsart, direkt hintereinander)? */
export function missionRepeat(state: CampaignState, b: Battle, mission: Battle['mission'] = b.mission): RepeatInfo | null {
  if (b.kind !== 'CAMPAIGN' || !b.attackType) return null;
  const pool = missionPool(state, b.attackType);
  // ohne echte Auswahl (Pool mit mindestens zwei Missionen) gibt es nichts zu wechseln
  if (pool.length < 2) return null;
  const prev = previousBattle(state, b);
  if (!prev) return null;
  const key = missionKey({ mission, attackType: b.attackType });
  if (missionKey(prev) !== key) return null;
  const name = allMissions(state).find((m) => m.id === key)?.name ?? (mission.externalName || key);
  return { mission: name, alternative: pool.some((m) => m.id !== key) };
}

/**
 * Prüfung beim Ändern der Mission: Hinweis bei Wiederholung; mit Hausregel Sperre (Warnung = Override
 * mit Begründung für den Spielleiter, für Spieler nicht übergehbar), sofern der Pool eine Alternative hat.
 */
export function checkMissionRepeat(ctx: Ctx, b: Battle, mission: Battle['mission']) {
  const r = missionRepeat(ctx.state, b, mission);
  if (!r) return;
  const who = ctx.state.alliances.find((a) => a.id === b.attackerAllianceId)?.name ?? '?';
  if (ctx.state.toggles.missionRepeatLock && r.alternative) warn(ctx, `Wiederholungssperre: ${who} hat „${r.mission}“ zuletzt schon gespielt – bitte eine andere Mission aus dem Pool wählen`);
  else hint(ctx, `Wiederholung: ${who} spielt „${r.mission}“ zweimal hintereinander`);
}

/** Pool setzen (A1): je Angriffsart höchstens 3 bekannte, zur Angriffsart passende Missionen */
export function setMissionPool(ctx: Ctx, pool: Partial<Record<AttackType, string[]>>) {
  const st = ctx.state;
  const all = allMissions(st);
  const clean: Partial<Record<AttackType, string[]>> = {};
  for (const [t, ids] of Object.entries(pool) as [AttackType, string[]][]) {
    if (!ATTACK_TYPES[t]) fail('Unbekannte Angriffsart');
    const uniq = [...new Set((ids ?? []).filter(Boolean))];
    if (uniq.length > POOL_MAX) fail(`Höchstens ${POOL_MAX} Missionen je Angriffsart`);
    for (const id of uniq) {
      const m = all.find((x) => x.id === id);
      if (!m) fail('Mission ist nicht in der Missionsliste');
      if (m.attackTypes.length && !m.attackTypes.includes(t)) fail(`Mission „${m.name}“ ist nicht für ${ATTACK_TYPES[t].name} vorgesehen`);
    }
    if (uniq.length) clean[t] = uniq;
  }
  st.meta.missionPool = clean;
  log(ctx, 'Missions-Pool aktualisiert');
}

// ─── Mix-Statistik (A2) ────────────────────────────────────────────────────

export interface MixCell {
  types: Partial<Record<AttackType, number>>;
  missions: Record<string, number>;
  total: number;
}

export interface MissionMix {
  phases: number[];
  /** allianceId → Phase (0 = gesamt) → Verteilung */
  byAlliance: Record<string, Record<number, MixCell>>;
  /** Missions-ID → Anzeigename */
  names: Record<string, string>;
  /** Frühwarnung vor Monokultur */
  warnings: { allianceId: string; kind: 'TYPE' | 'MISSION'; key: string; count: number; total: number }[];
}

const emptyCell = (): MixCell => ({ types: {}, missions: {}, total: 0 });

/** Monokultur: mindestens 3 Angriffe und ein Anteil von mindestens zwei Dritteln */
export const MONO_MIN = 3;
export const MONO_SHARE = 2 / 3;

/** Verteilung der Angriffsarten und Missionen je Phase und Allianz (angesetzte Kampagnenschlachten) */
export function missionMix(state: CampaignState): MissionMix {
  const byAlliance: MissionMix['byAlliance'] = {};
  const names: Record<string, string> = {};
  const all = allMissions(state);
  const phases = [...new Set(state.battles.filter((b) => b.kind === 'CAMPAIGN').map((b) => b.phaseNumber))].sort((a, b) => a - b);
  for (const a of state.alliances) byAlliance[a.id] = { 0: emptyCell() };
  for (const b of state.battles) {
    if (b.kind !== 'CAMPAIGN' || !b.attackType || b.status === 'VOID' || !byAlliance[b.attackerAllianceId]) continue;
    const key = missionKey(b);
    names[key] ??= all.find((m) => m.id === key)?.name ?? (b.mission.externalName || key);
    for (const ph of [0, b.phaseNumber]) {
      const c = (byAlliance[b.attackerAllianceId][ph] ??= emptyCell());
      c.types[b.attackType] = (c.types[b.attackType] ?? 0) + 1;
      c.missions[key] = (c.missions[key] ?? 0) + 1;
      c.total++;
    }
  }
  const warnings: MissionMix['warnings'] = [];
  for (const [aid, rows] of Object.entries(byAlliance)) {
    const c = rows[0];
    if (c.total < MONO_MIN) continue;
    for (const [k, n] of Object.entries(c.types)) if (n! / c.total >= MONO_SHARE) warnings.push({ allianceId: aid, kind: 'TYPE', key: k, count: n!, total: c.total });
    // die Vespator-Mission einer schon gewarnten Angriffsart ist dieselbe Monokultur
    const typeWarned = (k: string) => warnings.some((w) => w.allianceId === aid && w.kind === 'TYPE' && vespatorMissionId(w.key as AttackType) === k);
    for (const [k, n] of Object.entries(c.missions)) if (n / c.total >= MONO_SHARE && !typeWarned(k)) warnings.push({ allianceId: aid, kind: 'MISSION', key: k, count: n, total: c.total });
  }
  return { phases, byAlliance, names, warnings };
}
