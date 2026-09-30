import { describe, expect, it } from 'vitest';
import { translate, translateMessage } from '@/i18n/core';

describe('Übersetzung (N5.4)', () => {
  it('fällt auf Deutsch zurück und setzt Platzhalter ein', () => {
    expect(translate('de', 'Phase {n}', { n: 2 })).toBe('Phase 2');
    expect(translate('en', 'Ein Text ohne Übersetzung {x}', { x: 'a' })).toBe('Ein Text ohne Übersetzung a');
  });
  it('Engine-Meldungen: unbekannte bleiben unverändert, Deutsch bleibt Deutsch', () => {
    expect(translateMessage('de', 'Irgendwas')).toBe('Irgendwas');
    expect(translateMessage('en', 'Völlig unbekannte Meldung')).toBe('Völlig unbekannte Meldung');
  });
});

describe('Sprachwahl (Reihenfolge und Browsersprache)', () => {
  it('nimmt den ersten gültigen Kandidaten, sonst die Build-Standardsprache', async () => {
    const { DEFAULT_LOCALE, pickLocale, normLocale } = await import('@/i18n/core');
    expect(pickLocale(null, undefined, 'xx', 'en', 'de')).toBe('en');
    expect(pickLocale(null, 'fr', 'en')).toBe('fr');
    expect(pickLocale('de', 'en')).toBe('de');
    expect(pickLocale()).toBe(DEFAULT_LOCALE);
    expect(pickLocale(null, 'xx')).toBe(DEFAULT_LOCALE);
    expect(normLocale('EN')).toBeNull();
  });
  it('liest Accept-Language nach Gewichtung', async () => {
    const { acceptLocale } = await import('@/i18n/core');
    expect(acceptLocale('en-US,en;q=0.9')).toBe('en');
    expect(acceptLocale('de-DE,de;q=0.9,en;q=0.8')).toBe('de');
    expect(acceptLocale('it-IT,it;q=0.9,en;q=0.5,de;q=0.4')).toBe('en');
    expect(acceptLocale('fr-FR,fr;q=0.9,en;q=0.5')).toBe('fr');
    expect(acceptLocale('en;q=0.3, de;q=0.7')).toBe('de');
    expect(acceptLocale('en;q=0,de')).toBe('de');
    expect(acceptLocale('it, nl')).toBeNull();
    expect(acceptLocale('')).toBeNull();
    expect(acceptLocale(null)).toBeNull();
  });
});
