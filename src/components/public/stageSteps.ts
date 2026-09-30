import { PHASE_STEPS, SETUP_STEPS, type CampaignState } from '@/engine/types';
import { SETUP_NAMES, STEP_NAMES } from '@/components/stageLabel';

type TFn = (text: string, vars?: Record<string, string | number | null | undefined>) => string;

export type StepStatus = 'done' | 'current' | 'open';
export interface StageTrack {
  /** Überschrift, z. B. „Phase 1 von 5“ */
  title: string;
  items: { key: string; label: string; status: StepStatus }[];
  /** Kampagnenphase n von m (nur während der Phasen) */
  phase?: { n: number; m: number };
  /** Überschrift der Schrittliste, z. B. „Schritte der Phase 1“ */
  listTitle?: string;
}

/**
 * Schrittfolge der aktuellen Stufe (Aufbau bzw. Phase) als schlanke, serialisierbare Daten –
 * für Schrittliste und Kopfzeilenstatus der Leseansicht und der Spielerseite (nur lesend).
 */
export function stageTrack(state: CampaignState, t: TFn): StageTrack {
  if (state.stage.kind === 'SETUP') {
    const cur = SETUP_STEPS.indexOf(state.stage.step);
    return { title: t('Kampagnenaufbau'), items: SETUP_STEPS.map((s, i) => ({ key: s, label: t(SETUP_NAMES[s]), status: i < cur ? 'done' : i === cur ? 'current' : 'open' })) };
  }
  if (state.stage.kind === 'PHASE') {
    const n = state.stage.phase;
    const ph = state.phases.find((p) => p.number === n);
    const cur = PHASE_STEPS.indexOf(state.stage.step);
    return {
      title: t('Phase {n} von {m}', { n, m: state.meta.phaseCount }),
      phase: { n, m: state.meta.phaseCount },
      listTitle: t('Schritte der Phase {n}', { n }),
      items: PHASE_STEPS.map((s, i) => ({ key: s, label: t(STEP_NAMES[s]), status: i === cur ? 'current' : ph?.stepStatus[s] === 'DONE' || i < cur ? 'done' : 'open' })),
    };
  }
  return { title: state.stage.kind === 'TIEBREAK' ? t('Entscheidungsschlacht') : t('Kampagne beendet'), items: [] };
}
