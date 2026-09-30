import { fail, log, type Ctx } from './ctx';
import { allianceOf, stagePhase } from './players';
import type { CampaignState, Player } from './types';

/**
 * Bemal-Chronik (D5): Hobby-Fortschritt je Spieler (Datum, Einheit, Stand, Foto, Punkte). Spieler pflegen
 * ihre Einträge über den Spielerlink, der Warmaster für alle. Die Chronik ist öffentlich (Profil, Codex)
 * und liefert dem vorhandenen Bonus „Battle Ready“ (+10 VP bei bemalter Armee) einen Vorschlag.
 */

export type HobbyStatus = 'BUILT' | 'PRIMED' | 'WIP' | 'DONE';
export const HOBBY_STATUS: HobbyStatus[] = ['BUILT', 'PRIMED', 'WIP', 'DONE'];
/** Anzeigenamen (Übersetzungsschlüssel) */
export const HOBBY_STATUS_LABEL: Record<HobbyStatus, string> = { BUILT: 'gebaut', PRIMED: 'grundiert', WIP: 'in Arbeit', DONE: 'fertig bemalt' };

export interface HobbyEntry {
  id: string;
  /** Datum (JJJJ-MM-TT) */
  date: string;
  unit: string;
  status: HobbyStatus;
  photo: string | null;
  /** Punktwert der Einheit */
  points: number;
  /** Phase beim Eintragen (0 = Setup) */
  phase: number;
  at: string;
}

export type HobbyInput = Pick<HobbyEntry, 'date' | 'unit' | 'status' | 'photo' | 'points'>;

export const HOBBY_MAX_ENTRIES = 200;

/** Summe der fertig bemalten Punkte eines Spielers */
export function paintedPoints(p: Pick<Player, 'hobby'>): number {
  return (p.hobby ?? []).filter((h) => h.status === 'DONE').reduce((s, h) => s + h.points, 0);
}

/** Hobby-Leiste je Allianz: fertig bemalte Punkte der (aktuellen) Mitglieder */
export function allianceHobby(st: CampaignState): Record<string, number> {
  const phase = Math.max(1, stagePhase(st));
  const out: Record<string, number> = Object.fromEntries(st.alliances.map((a) => [a.id, 0]));
  for (const p of st.players) {
    const al = allianceOf(p, phase);
    if (al && al in out) out[al] += paintedPoints(p);
  }
  return out;
}

/**
 * Vorschlag für „Battle Ready“: Laut Chronik sind mindestens so viele Punkte fertig bemalt wie die Spielgröße
 * verlangt. Nur ein Vorschlag – das Häkchen setzt der Spieler bzw. der Warmaster.
 */
export function battleReadyFromHobby(p: Pick<Player, 'hobby'>, sizePoints: number | null | undefined): boolean {
  return !!sizePoints && sizePoints > 0 && paintedPoints(p) >= sizePoints;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function addHobby(ctx: Ctx, playerId: string, input: HobbyInput) {
  const st = ctx.state;
  const p = st.players.find((x) => x.id === playerId);
  if (!p) fail('Spieler nicht gefunden');
  const unit = String(input.unit ?? '')
    .trim()
    .slice(0, 120);
  if (!unit) fail('Einheit fehlt');
  if (!DATE_RE.test(input.date ?? '') || Number.isNaN(Date.parse(input.date))) fail('Ungültiges Datum');
  if (!HOBBY_STATUS.includes(input.status)) fail('Ungültiger Stand');
  const points = Math.round(Number(input.points));
  if (!Number.isFinite(points) || points < 0 || points > 5000) fail('Punkte 0–5000');
  if ((p.hobby ?? []).length >= HOBBY_MAX_ENTRIES) fail(`Höchstens ${HOBBY_MAX_ENTRIES} Einträge je Spieler`);
  const photo = input.photo && /^[A-Za-z0-9_-]{8,40}$/.test(input.photo) ? input.photo : null;
  p.hobby = [...(p.hobby ?? []), { id: ctx.newId('hb'), date: input.date, unit, status: input.status, photo, points, phase: stagePhase(st), at: ctx.now }];
  log(ctx, `Bemal-Chronik ${p.nickname}: ${unit} (${points} Punkte)`);
}

export function deleteHobby(ctx: Ctx, playerId: string, id: string) {
  const p = ctx.state.players.find((x) => x.id === playerId);
  if (!p) fail('Spieler nicht gefunden');
  const e = (p.hobby ?? []).find((h) => h.id === id);
  if (!e) fail('Eintrag nicht gefunden');
  p.hobby = (p.hobby ?? []).filter((h) => h.id !== id);
  log(ctx, `Bemal-Chronik ${p.nickname}: ${e.unit} entfernt`);
}
