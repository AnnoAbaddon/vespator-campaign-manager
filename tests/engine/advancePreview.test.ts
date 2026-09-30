import { describe, expect, it } from 'vitest';
import { advancePreview } from '@/components/admin/phase/advancePreview';
import type { CampaignState } from '@/engine/types';
import { ids, run, startedCampaign } from './helpers';

/** Standardoperationen, die das Weiterschalten aus „Operationen wählen“ tatsächlich angelegt hat */
const defaults = (s: CampaignState) => s.phases.find((p) => p.number === 1)!.operations.filter((o) => o.isDefault);

describe('Vorschau der Weiter-Taste (Cockpit)', () => {
  it('nennt Folgeschritt und offene Befehle wie die Engine', () => {
    let s = startedCampaign();
    const { fa, c } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
    const pre = advancePreview(s)!;
    expect(pre).toEqual({ next: 'REVEAL', openOrders: 2, auxilia: true });
    const after = run(s, { type: 'ADVANCE' });
    expect(defaults(after)).toHaveLength(pre.openOrders);
    expect(defaults(after).every((o) => o.type === 'LOGISTICAL_AUXILIA')).toBe(true);
    // nach dem Weiterschalten gibt es nichts mehr zu ergänzen
    expect(advancePreview(after)).toEqual({ next: 'EDIFICES', openOrders: 0, auxilia: true });
  });

  it('ohne Logistical Auxilia erhalten offene Befehle keine Operation', () => {
    let s = startedCampaign();
    s = run(s, { type: 'TOGGLES_UPDATE', toggles: { ...s.toggles, operations: { ...s.toggles.operations, logisticalAuxilia: false } } });
    const pre = advancePreview(s)!;
    expect(pre.auxilia).toBe(false);
    expect(pre.openOrders).toBe(3);
    const after = run(s, { type: 'ADVANCE' });
    expect(defaults(after).map((o) => o.type)).toEqual(['NONE', 'NONE', 'NONE']);
  });

  it('im Bauschritt geht es zur nächsten Phase, außerhalb einer Phase gibt es keine Vorschau', () => {
    const s = startedCampaign();
    const build = { ...s, stage: { kind: 'PHASE', phase: 1, step: 'BUILD' } } as CampaignState;
    expect(advancePreview(build)?.next).toBe('NEXT_PHASE');
    expect(advancePreview(build)?.openOrders).toBe(0);
    const setup = { ...s, stage: { kind: 'SETUP', step: 'W0' } } as unknown as CampaignState;
    expect(advancePreview(setup)).toBeNull();
  });
});
