import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFaq } from '@/components/public/faqParse';

const SAMPLE = `# Kampagnen-FAQ

Einleitung in einem Absatz.

- **Offizielle Klärungen:** keine.

Legende der Einstufung:
- **Regeltext**: eindeutig.

---

## A. Ablauf

### F-1 Erste Frage?
- **Regelbezug:** Schritt 5.
- **Hintergrund:**
  - Quelle eins.
  - Quelle zwei.
- **Entscheidung (Regeltext):** **Summe** der PL.

### F-2 Zweite Frage?

> **In dieser Kampagne abweichend:** anders.

- **Entscheidung (Hausregel):**
  - Punkt A.
  - Punkt B.

## Quellen

- Buch
`;

describe('FAQ-Struktur für die Leseansicht', () => {
  it('trennt Einleitung, Hinweise, Abschnitte und Fragen', () => {
    const d = parseFaq(SAMPLE);
    expect(d.title).toBe('Kampagnen-FAQ');
    expect(d.intro).toBe('Einleitung in einem Absatz.');
    expect(d.notes).toContain('Offizielle Klärungen');
    expect(d.notes).toContain('Legende der Einstufung');
    expect(d.sections.map((s) => s.title)).toEqual(['A. Ablauf', 'Quellen']);
    expect(d.sections[1].questions).toHaveLength(0);
    expect(d.sections[1].body).toContain('Buch');
  });

  it('erkennt Regelbezug, Hintergrund und Entscheidung samt Einstufung', () => {
    const [q1, q2] = parseFaq(SAMPLE).sections[0].questions;
    expect(q1).toMatchObject({ id: 'F-1', anchor: 'f-1', title: 'Erste Frage?' });
    expect(q1.blocks.map((b) => b.kind)).toEqual(['reference', 'background', 'decision']);
    expect(q1.blocks[1].body).toBe('- Quelle eins.\n- Quelle zwei.');
    expect(q1.blocks[2]).toMatchObject({ label: 'Entscheidung', grade: 'Regeltext', body: '**Summe** der PL.' });
    // Hinweis auf abweichende Hausregel der Kampagne bleibt als eigener Block erhalten
    expect(q2.blocks[0]).toMatchObject({ kind: 'note' });
    expect(q2.blocks[0].body).toContain('In dieser Kampagne abweichend');
    expect(q2.blocks[1]).toMatchObject({ kind: 'decision', grade: 'Hausregel', body: '- Punkt A.\n- Punkt B.' });
  });

  it('zerlegt das echte FAQ in beiden Sprachen vollständig', () => {
    for (const [file, decision] of [
      ['docs/FAQ.md', 'Entscheidung'],
      ['docs/FAQ.en.md', 'Decision'],
    ] as const) {
      const d = parseFaq(fs.readFileSync(file, 'utf8'));
      const qs = d.sections.flatMap((s) => s.questions);
      expect(qs.length).toBeGreaterThanOrEqual(25);
      expect(qs[0].id).toBe('F-1');
      // jede Frage mit Entscheidung hat genau eine, und sie trägt eine Einstufung
      for (const q of qs.filter((x) => x.blocks.some((b) => b.kind === 'decision'))) {
        const ds = q.blocks.filter((b) => b.kind === 'decision');
        expect(ds, q.id).toHaveLength(1);
        expect(ds[0].label, q.id).toBe(decision);
        expect(ds[0].grade, q.id).toBeTruthy();
      }
      expect(d.intro.length).toBeGreaterThan(40);
    }
  });
});
