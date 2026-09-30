import { describe, expect, it } from 'vitest';
import '@/i18n/packs';
import { PACKS } from '@/i18n/packs';
import { EN } from '@/i18n/en';
import { EN_PATTERNS } from '@/i18n/en/engine';
import { EXTRA_LOCALES, intlLocale, normLocale, setOverrides, translate, translateMessage } from '@/i18n/core';
import { buildCatalog, checklist, importCatalog, parseCsv, toCsv, toJson } from '@/i18n/catalog';

const ph = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');

describe('Zusatzsprachen FR/ES/PL (NTH2 7.1)', () => {
  it('kennt die Sprachen und ihr Datumsformat', () => {
    expect(normLocale('fr')).toBe('fr');
    expect(normLocale('pl')).toBe('pl');
    expect(intlLocale('es')).toBe('es-ES');
  });

  it('übersetzt Oberflächentexte und fällt auf Englisch, dann Deutsch zurück', () => {
    expect(translate('fr', 'Speichern')).not.toBe('Speichern');
    expect(translate('fr', 'Speichern')).not.toBe(EN['Speichern']);
    expect(translate('es', 'Phase {n}', { n: 3 })).toContain('3');
    // unbekannt in FR und EN: deutscher Schlüssel
    expect(translate('pl', 'Völlig neuer Text {x}', { x: 1 })).toBe('Völlig neuer Text 1');
  });

  it('fällt bei fehlendem Eintrag auf Englisch zurück', () => {
    const key = Object.keys(EN).find((k) => EXTRA_LOCALES.every((l) => !PACKS[l].ui[k]));
    if (!key) return; // alles übersetzt
    for (const l of EXTRA_LOCALES) expect(translate(l, key)).toBe(EN[key]);
  });

  it('Wörterbücher: nur bekannte Schlüssel, Platzhalter vollständig', () => {
    for (const l of EXTRA_LOCALES) {
      for (const [k, v] of Object.entries(PACKS[l].ui)) {
        expect(k in EN, `${l}: unbekannter Schlüssel ${k}`).toBe(true);
        expect(ph(v) === ph(k) || ph(v) === ph(EN[k]), `${l}: Platzhalter in ${k}`).toBe(true);
      }
      const enDe = new Set(EN_PATTERNS.map(([de]) => de));
      for (const [de, v] of PACKS[l].patterns) {
        expect(enDe.has(de), `${l}: unbekanntes Muster ${de}`).toBe(true);
        expect(ph(v), `${l}: Platzhalter in ${de}`).toBe(ph(de));
      }
    }
  });

  it('Engine-Meldungen: eigenes Muster, sonst das englische, Platzhalter werden mitübersetzt', () => {
    const [de] = EN_PATTERNS.find(([d]) => /\{0\}/.test(d) && PACKS.fr.patterns.some(([x]) => x === d))!;
    const msg = de.replace(/\{(\d+)\}/g, 'Masnet');
    const fr = translateMessage('fr', msg);
    expect(fr).not.toBe(msg);
    expect(fr).toContain('Masnet');
    expect(translateMessage('de', msg)).toBe(msg);
  });

  it('importierte Übersetzungen gehen vor und lassen sich entfernen', () => {
    setOverrides('fr', { Speichern: 'Sauver !' });
    expect(translate('fr', 'Speichern')).toBe('Sauver !');
    setOverrides('fr', null);
    expect(translate('fr', 'Speichern')).not.toBe('Sauver !');
  });
});

describe('Übersetzungsdatei (NTH2 7.2)', () => {
  const rows = buildCatalog(PACKS);

  it('Katalog enthält Oberfläche und Engine-Muster', () => {
    expect(rows.some((r) => r.kind === 'ui' && r.de === 'Speichern')).toBe(true);
    expect(rows.some((r) => r.kind === 'engine')).toBe(true);
    expect(new Set(rows.map((r) => r.kind + r.de)).size).toBe(rows.length);
  });

  it('Prüfliste meldet fehlende und fehlerhafte Einträge', () => {
    const fake = [{ area: 'x', kind: 'ui' as const, de: 'A {n}', values: { en: 'A {n}', fr: 'B', es: '' } }];
    const c = checklist(fake);
    const fr = c.find((x) => x.locale === 'fr')!;
    expect(fr.broken).toHaveLength(1);
    expect(c.find((x) => x.locale === 'es')!.missing).toHaveLength(1);
    expect(c.find((x) => x.locale === 'en')!.translated).toBe(1);
  });

  it('CSV hin und zurück (Anführungszeichen, Kommas, Zeilenumbrüche)', () => {
    const csv = toCsv(rows.slice(0, 50));
    const table = parseCsv(csv);
    expect(table[0]).toEqual(['area', 'kind', 'de', 'en', 'fr', 'es', 'pl']);
    expect(table).toHaveLength(51);
    expect(parseCsv('a;b\n"x;1";"y ""z"""\n')).toEqual([
      ['a', 'b'],
      ['x;1', 'y "z"'],
    ]);
    expect(parseCsv('de,fr\r\n"Zeile\nzwei",deux\r\n')).toEqual([
      ['de', 'fr'],
      ['Zeile\nzwei', 'deux'],
    ]);
  });

  it('Import übernimmt nur Abweichungen mit passenden Platzhaltern', () => {
    const r = importCatalog('de,fr,es\r\nSpeichern,Enregistrer maintenant,\r\nPhase {n},Phase sans,\r\nGibt es nicht,x,y\r\n', rows);
    expect(r.overrides.fr?.['Speichern']).toBe('Enregistrer maintenant');
    expect(r.rejected.map((x) => x.de)).toContain('Phase {n}');
    expect(r.unknown).toBe(2);
    expect(r.overrides.es).toBeUndefined();
    const j = importCatalog(JSON.stringify({ pl: { Speichern: 'Zapisz teraz' } }), rows);
    expect(j.changed.pl).toBe(1);
    expect(() => importCatalog('{kaputt', rows)).toThrow();
    expect(() => importCatalog('fr,es\nx,y', rows)).toThrow();
  });

  it('JSON-Export enthält alle Sprachen', () => {
    const j = JSON.parse(toJson(rows.slice(0, 5)));
    expect(Object.keys(j)).toEqual(['de', 'en', 'fr', 'es', 'pl']);
  });
});
