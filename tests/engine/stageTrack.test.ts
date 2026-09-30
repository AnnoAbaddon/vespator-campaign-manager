import { describe, expect, it } from 'vitest';
import { createCampaignState, newPhase } from '@/engine/init';
import { PHASE_STEPS, SETUP_STEPS } from '@/engine/types';
import { stageTrack } from '@/components/public/stageSteps';

const t = (text: string, vars?: Record<string, string | number | null | undefined>) => (vars ? text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : text);

describe('Schrittfolge für Leseansicht und Spielerseite', () => {
  it('zeigt im Aufbau die Setup-Schritte mit aktuellem Schritt', () => {
    const s = createCampaignState({ name: 'T', phaseCount: 5, allianceCount: 3, now: '2026-01-01T00:00:00.000Z' });
    const tr = stageTrack(s, t);
    expect(tr.title).toBe('Kampagnenaufbau');
    expect(tr.items).toHaveLength(SETUP_STEPS.length);
    expect(tr.items.filter((i) => i.status === 'current')).toHaveLength(1);
  });

  it('zeigt in einer Phase „Phase n von m“ und markiert erledigte Schritte', () => {
    const s = createCampaignState({ name: 'T', phaseCount: 5, allianceCount: 3, now: '2026-01-01T00:00:00.000Z' });
    s.phases.push(newPhase(2));
    s.stage = { kind: 'PHASE', phase: 2, step: PHASE_STEPS[2] } as typeof s.stage;
    const tr = stageTrack(s, t);
    expect(tr.title).toBe('Phase 2 von 5');
    expect(tr.items.map((i) => i.status).slice(0, 4)).toEqual(['done', 'done', 'current', 'open']);
    // Kampagnenphase und Schritt getrennt: eigene Phasenangabe, Schrittliste mit eigener Überschrift
    expect(tr.phase).toEqual({ n: 2, m: 5 });
    expect(tr.listTitle).toBe('Schritte der Phase 2');
    expect(tr.items).toHaveLength(PHASE_STEPS.length);
  });

  it('hat nach Kampagnenende keine Schritte', () => {
    const s = createCampaignState({ name: 'T', phaseCount: 5, allianceCount: 3, now: '2026-01-01T00:00:00.000Z' });
    s.stage = { kind: 'ENDED' } as typeof s.stage;
    expect(stageTrack(s, t)).toEqual({ title: 'Kampagne beendet', items: [] });
  });
});
