import { describe, expect, it } from 'vitest';
import { createCampaignState } from '@/engine/init';
import { mapOf, planetDef } from '@/engine/map';
import { fullContentBounds, MAP_H, MAP_W } from '@/components/map/MapSvg';

describe('Detailkarte: enge Einpassung', () => {
  it('umschließt alle Planeten samt Raster und bleibt kleiner als die ganze Karte', () => {
    const s = createCampaignState({ name: 'T', phaseCount: 5, allianceCount: 3, now: '2026-01-01T00:00:00.000Z' });
    const b = fullContentBounds(s);
    for (const def of mapOf(s).planets) {
      const p = planetDef(def.id)!;
      const x = (p.x / 100) * MAP_W;
      const y = (p.y / 100) * MAP_H;
      expect(x).toBeGreaterThan(b.x);
      expect(x).toBeLessThan(b.x + b.w);
      expect(y - 118).toBeGreaterThan(b.y);
      expect(y + 78).toBeLessThan(b.y + b.h);
    }
    // Punkteleiste und leerer Rand gehören nicht zur Einpassung
    expect(b.h).toBeLessThan(MAP_H);
    expect(b.w * b.h).toBeLessThan(MAP_W * MAP_H);
  });
});
