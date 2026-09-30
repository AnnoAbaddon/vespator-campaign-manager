import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGuide, playerGuide } from '@/components/public/guideParse';

const SAMPLE = `# Hilfe zum Umgang

English version: [GUIDE.md](GUIDE.md)

Kurze Einleitung.

## Warmaster

Vorspann.

### Erste Einrichtung

Text mit **Fett**.

#### Detail

\`\`\`
## keine Überschrift im Codeblock
\`\`\`

### Kampagne anlegen

- Punkt

## Spieler

### Erste Einrichtung

Gleicher Titel, andere Sprungmarke.

## Zuschauer und Präsentationsmodus

## Probleme und häufige Fragen

### Link verloren

Antwort.
`;

describe('Hilfe: Zerlegung (docs/GUIDE*.md)', () => {
  it('liest Titel, Einleitung, Abschnitte und Themen; Sprachhinweis und Codeblöcke bleiben außen vor', () => {
    const d = parseGuide(SAMPLE);
    expect(d.title).toBe('Hilfe zum Umgang');
    expect(d.intro).toBe('Kurze Einleitung.');
    expect(d.sections.map((s) => s.title)).toEqual(['Warmaster', 'Spieler', 'Zuschauer und Präsentationsmodus', 'Probleme und häufige Fragen']);
    const wm = d.sections[0];
    expect(wm.lead).toBe('Vorspann.');
    expect(wm.topics.map((t) => t.title)).toEqual(['Erste Einrichtung', 'Kampagne anlegen']);
    expect(wm.topics[0].body).toContain('#### Detail');
    expect(wm.topics[0].body).toContain('## keine Überschrift im Codeblock');
  });

  it('vergibt eindeutige Sprungmarken', () => {
    const d = parseGuide(SAMPLE);
    const anchors = d.sections.flatMap((s) => [s.anchor, ...s.topics.map((t) => t.anchor)]);
    expect(new Set(anchors).size).toBe(anchors.length);
    expect(anchors.every((a) => /^h-[a-z0-9-]+$/.test(a))).toBe(true);
  });

  it('Spielerseite: nur Spieler und Probleme', () => {
    expect(playerGuide(parseGuide(SAMPLE)).sections.map((s) => s.title)).toEqual(['Spieler', 'Probleme und häufige Fragen']);
  });

  it.each([
    ['docs/GUIDE.md', ['Warmaster', 'Players', 'Viewers and presentation mode', 'Troubleshooting and FAQ']],
    ['docs/GUIDE.de.md', ['Warmaster', 'Spieler', 'Zuschauer und Präsentationsmodus', 'Probleme und häufige Fragen']],
  ])('%s hat die Abschnitte, die App und Spielerseite erwarten', (file, titles) => {
    const d = parseGuide(fs.readFileSync(file, 'utf8'));
    expect(d.title).not.toBe('');
    expect(d.sections.map((s) => s.title)).toEqual(titles);
    expect(d.sections.every((s) => s.topics.length > 0)).toBe(true);
    expect(playerGuide(d).sections).toHaveLength(2);
  });
});
