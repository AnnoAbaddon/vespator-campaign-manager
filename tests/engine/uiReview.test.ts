import { describe, expect, it } from 'vitest';
import { labelBox, placeLabels, type Box, type LabelInput } from '@/components/map/MapSvg';
import { EN } from '@/i18n/en';
import { PACKS } from '@/i18n/packs';
import { UI_REVIEW } from '@/i18n/en/ui-review';

const planet = (id: string, x: number, y: number, name: string): LabelInput => ({
  id,
  x,
  y,
  name,
  marks: [{ x0: x - 40, y0: y - 40, x1: x + 40, y1: y + 40 }],
  top: y - 50,
  bottom: y + 90,
  right: x + 50,
  left: x - 50,
});
const hit = (a: Box, b: Box) => Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0);

describe('Review UI: Namen der Übersicht auf dichten (Handy-)Karten', () => {
  it('trennt die Namen dicht benachbarter Planeten (Novamagnor/Vikus Decima im Hochformat)', () => {
    const f = 30;
    // zwei Planeten fast übereinander, ein dritter direkt darunter – die Standardlagen überdecken sich
    const ps = [planet('a', 400, 300, 'Novamagnor'), planet('b', 410, 420, 'Vikus Decima'), planet('c', 395, 560, 'Astarthem')];
    const out = placeLabels(ps, f, 900, 1600);
    const boxes = ps.map((p) => labelBox(out[p.id], p.name.length * f * 0.66, f));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(hit(boxes[i], boxes[j]), `${ps[i].name} / ${ps[j].name}`).toBe(false);
  });
});

describe('Review UI: neue Texte in allen Sprachen', () => {
  it('jeder neue Schlüssel hat Englisch, Französisch, Spanisch und Polnisch', () => {
    for (const k of Object.keys(UI_REVIEW)) {
      expect(EN[k], k).toBeTruthy();
      for (const l of ['fr', 'es', 'pl'] as const) expect(PACKS[l].ui[k], `${l}: ${k}`).toBeTruthy();
    }
  });
});
