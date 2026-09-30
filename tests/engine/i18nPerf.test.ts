import { describe, expect, it } from 'vitest';
import '@/i18n/packs';
import { translateMessage } from '@/i18n/core';

/**
 * F11 (Architektur-Review): translateMessage war auf langem Freitext quadratisch (640 ms für eine Zeile mit
 * 500 Zeichen Begründung). Jede Form einer 2000-Zeichen-Zeile muss jetzt deutlich unter 50 ms bleiben (Grenze im Test 250 ms gegen Last-Schwankungen; vorher Sekunden).
 */
describe('translateMessage – Aufwand bei langem Freitext', () => {
  const shapes = ['a: b · ', 'a: · ', ': ', ' · : ', 'a | b: ', 'a; b: c · ', 'x: ', 'x · '];

  it('übersetzt eine 2000-Zeichen-Zeile in in begrenzter Zeit', () => {
    translateMessage('en', 'Ergebnis gemeldet von Konrad – wartet auf Bestätigung der Gegenseite');
    for (const [i, unit] of shapes.entries()) {
      // jede Zeile ist neu (kein Treffer im Zwischenspeicher)
      const reason = `${i}${unit.repeat(Math.ceil(2000 / unit.length))}`.slice(0, 2000);
      for (const line of [`Ergebnis angefochten von Konrad: ${reason} – der Spielleiter entscheidet`, reason]) {
        for (const l of ['en', 'fr'] as const) {
          const t0 = performance.now();
          translateMessage(l, line);
          const ms = performance.now() - t0;
          expect(ms, `${JSON.stringify(unit)} (${l}, ${line.length} Zeichen)`).toBeLessThan(250);
        }
      }
    }
  });

  it('übersetzt normale Meldungen weiterhin vollständig', () => {
    expect(translateMessage('en', 'Ergebnis angefochten von Konrad: VP falsch – der Spielleiter entscheidet')).not.toContain('angefochten');
    const long = 'x'.repeat(400);
    // langer Freitext bleibt unverändert, der feste Teil wird übersetzt
    const out = translateMessage('en', `Ergebnis angefochten von Konrad: ${long} – der Spielleiter entscheidet`);
    expect(out).toContain(long);
    expect(out).not.toContain('angefochten');
  });
});
