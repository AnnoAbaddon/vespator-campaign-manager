import type { CampaignState, Phase } from './types';

/**
 * Fristen einer Phase: welche gilt gerade (Kampagnenliste, B10) und Vorschläge für eine neue Phase ohne Termine.
 */

export type DeadlineKind = 'OPS' | 'BATTLES' | 'END';

export interface StageDeadline {
  kind: DeadlineKind;
  at: string;
}

/**
 * Frist, die zum laufenden Schritt passt: in „Operationen wählen“ die Befehlsfrist, bis einschließlich 2.3 die
 * Schlachtenfrist, danach das Phasenende. Fehlt die passende Frist, folgt die nächste gesetzte; ohne Phase null.
 */
export function stageDeadline(st: CampaignState): StageDeadline | null {
  if (st.stage.kind !== 'PHASE') return null;
  const n = st.stage.phase;
  const ph = st.phases.find((p) => p.number === n);
  if (!ph) return null;
  const step = st.stage.step;
  const order: DeadlineKind[] = step === 'OPS' ? ['OPS', 'BATTLES', 'END'] : ['REVEAL', 'EDIFICES', 'BATTLES'].includes(step) ? ['BATTLES', 'END'] : ['END'];
  const field = { OPS: ph.opsDeadline, BATTLES: ph.battlesDeadline, END: ph.endDate } as const;
  for (const k of order) if (field[k]) return { kind: k, at: field[k]! };
  return null;
}

/** Hat die laufende Phase noch gar keine Termine (Hinweis „Termine setzen“)? */
export function phaseDatesMissing(st: CampaignState): boolean {
  if (st.stage.kind !== 'PHASE') return false;
  const n = st.stage.phase;
  const ph = st.phases.find((p) => p.number === n);
  return !!ph && !ph.startDate && !ph.opsDeadline && !ph.battlesDeadline && !ph.endDate;
}

export interface PhaseDates {
  startDate: string;
  opsDeadline: string;
  battlesDeadline: string;
  endDate: string;
}

const DAY = 24 * 3600_000;
/** Standardrhythmus ohne Vorphase: Befehle nach 3 Tagen, Schlachten nach 14, Phasenende nach 16 */
export const DEFAULT_PHASE_RHYTHM = { ops: 3 * DAY, battles: 14 * DAY, end: 16 * DAY };

/**
 * Vorschlag für die Termine einer Phase (Wunsch „Termin-Dialog beim Phasenwechsel“): gleiche Abstände wie in
 * der Vorphase (Start → Befehle → Schlachten → Ende), Start = Ende der Vorphase oder jetzt, falls das später ist.
 * Ohne verwertbare Vorphase gilt DEFAULT_PHASE_RHYTHM. Bereits gesetzte Termine der Phase bleiben erhalten.
 */
export function proposePhaseDates(st: CampaignState, phaseNumber: number, now: string = new Date().toISOString()): PhaseDates {
  const cur = st.phases.find((p) => p.number === phaseNumber);
  const prev = st.phases.find((p) => p.number === phaseNumber - 1);
  const t = (s: string | null | undefined) => (s ? new Date(s).getTime() : NaN);
  // NTH2 2.6: Rhythmus aus der Kampagnen-Vorlage, solange es keine verwertbare Vorphase gibt
  const rhythm = rhythmOf(prev) ?? st.meta.rhythm ?? DEFAULT_PHASE_RHYTHM;
  const nowMs = new Date(now).getTime();
  const start = !Number.isNaN(t(cur?.startDate)) ? t(cur?.startDate) : Math.max(nowMs, Number.isNaN(t(prev?.endDate)) ? nowMs : t(prev?.endDate));
  const iso = (ms: number) => new Date(ms).toISOString();
  return {
    startDate: iso(start),
    opsDeadline: cur?.opsDeadline ?? iso(start + rhythm.ops),
    battlesDeadline: cur?.battlesDeadline ?? iso(start + rhythm.battles),
    endDate: cur?.endDate ?? iso(start + rhythm.end),
  };
}

function rhythmOf(ph: Phase | undefined): typeof DEFAULT_PHASE_RHYTHM | null {
  if (!ph?.startDate) return null;
  const s = new Date(ph.startDate).getTime();
  const d = (x: string | null) => (x ? new Date(x).getTime() - s : NaN);
  const ops = d(ph.opsDeadline);
  const battles = d(ph.battlesDeadline);
  const end = d(ph.endDate);
  if (![ops, battles, end].every((x) => Number.isFinite(x) && x > 0)) return null;
  return { ops, battles, end };
}
