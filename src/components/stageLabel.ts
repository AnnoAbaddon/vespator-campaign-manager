import type { CampaignState } from '@/engine/types';

const STEP: Record<string, string> = {
  OPS: 'Operationen wählen',
  REVEAL: 'Reveal',
  EDIFICES: 'Edifice Raising',
  BATTLES: 'Schlachten laufen',
  PROCESS: 'Ergebnisse verarbeiten',
  ARRIVAL: 'Fleet Arrival',
  RESISTANCE: 'Low-level Resistance',
  RESULTS: 'Punkte & Events',
  MOVE: 'Flotten bewegen',
  BUILD: 'Infrastruktur bauen',
};
const SETUP: Record<string, string> = {
  W0: 'Allianzen & Spieler',
  W1: 'Medaillen zuordnen',
  W2: 'Strongholds & Power Level',
  W3: 'Start-Infrastruktur',
  W4: 'Flotten-Startpositionen',
  W5: 'Start vorbereiten',
};

type TFn = (text: string, vars?: Record<string, string | number | null | undefined>) => string;
const deT: TFn = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : text);

/** Beschriftung der aktuellen Stufe; optional mit Übersetzungsfunktion (Standard: Deutsch) */
export function stageLabel(s: CampaignState, t: TFn = deT): string {
  switch (s.stage.kind) {
    case 'SETUP':
      return `Setup · ${t(SETUP[s.stage.step])}`;
    case 'PHASE':
      return `${t('Phase {n}/{m}', { n: s.stage.phase, m: s.meta.phaseCount })} · ${t(STEP[s.stage.step])}`;
    case 'TIEBREAK':
      return t('Entscheidungsschlacht');
    case 'ENDED':
      return t('Kampagne beendet');
  }
}

export const STEP_NAMES = STEP;
export const SETUP_NAMES = SETUP;
