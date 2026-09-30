import { describe, expect, it } from 'vitest';
import { createCampaignState } from '@/engine/init';
import { placeLabels, type LabelInput } from '@/components/map/MapSvg';
import { opArrow } from '@/components/admin/mapFocus';

const planet = (id: string, x: number, y: number, name: string, extra: LabelInput['marks'] = []): LabelInput => ({
  id,
  x,
  y,
  name,
  marks: [{ x0: x - 40, y0: y - 40, x1: x + 40, y1: y + 40 }, ...extra],
  top: y - 50,
  bottom: y + 90,
  right: x + 50,
  left: x - 50,
});

describe('Übersichtskarte: Namen ohne Überschneidung', () => {
  it('lässt freie Namen mittig über dem Globus', () => {
    const out = placeLabels([planet('a', 300, 300, 'Karabas'), planet('b', 900, 300, 'Masnet')], 30, 1600, 1200);
    expect(out.a).toEqual({ x: 300, y: 250, anchor: 'middle' });
    expect(out.b).toEqual({ x: 900, y: 250, anchor: 'middle' });
  });

  it('weicht aus, wenn die PL-Zahlen des Nachbarn im Weg liegen', () => {
    // Nachbar A trägt seine PL-Zahlen genau dort, wo B seinen Namen mittig setzen würde
    const a = planet('a', 400, 150, 'Felgris Secundas', [{ x0: 330, y0: 200, x1: 470, y1: 240 }]);
    const b = planet('b', 420, 290, 'Tarkad Vindix');
    const out = placeLabels([a, b], 30, 1600, 1200);
    expect(out.b).not.toEqual({ x: 420, y: 240, anchor: 'middle' });
  });

  it('setzt zwei Namen nicht übereinander', () => {
    const out = placeLabels([planet('a', 400, 300, 'Novamagnor'), planet('b', 430, 305, 'Vikus Decima')], 30, 1600, 1200);
    expect(out.a).not.toEqual(out.b);
  });
});

describe('Fokus-Pfeile', () => {
  it('baut Pfeile für Schlacht, Void Leap und Entwurf', () => {
    const s = createCampaignState({ name: 'T', phaseCount: 5, allianceCount: 3, now: '2026-01-01T00:00:00.000Z' });
    const al = { id: 'imp', name: 'Imperium', color: '#3b82f6', order: 0 } as (typeof s.alliances)[number];
    s.alliances.push(al);
    const base = { allianceId: al.id, originPlanetId: 'karabas', revealed: false, status: 'PLANNED' as const };
    expect(opArrow(s, { ...base, type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'norallus' })).toMatchObject({ from: 'karabas', to: 'norallus', color: al.color, dashed: true });
    expect(opArrow(s, { ...base, type: 'VOID_LEAP', destinationPlanetId: 'masnet' })).toMatchObject({ to: 'masnet', label: 'Void Leap' });
    expect(opArrow(s, { ...base, type: 'VOID_LEAP', destinationPlanetId: 'masnet', status: 'RESOLVED' as const })).toBeNull();
    expect(opArrow(s, { ...base, type: 'RAISE_EDIFICES' })).toBeNull();
    expect(opArrow(s, { ...base, originPlanetId: null, type: 'BATTLE', targetPlanetId: 'norallus' })).toBeNull();
  });
});
