import { describe, expect, it } from 'vitest';
import { THEME_SCRIPT, normTheme, themeApplies, themeFromCookie } from '@/components/themeCore';
import { newMessageKeys, shouldChime, volumeGain } from '@/components/public/audioCore';

describe('Archiv-Thema (NTH2 5.3)', () => {
  it('normalisiert unbekannte Werte auf das Terminal', () => {
    expect(normTheme('archiv')).toBe('archiv');
    expect(normTheme('terminal')).toBe('terminal');
    expect(normTheme('dark')).toBe('terminal');
    expect(normTheme(null)).toBe('terminal');
  });
  it('gilt nur für Leseansicht und Spielerseite, nie in der Verwaltung', () => {
    expect(themeApplies('/v/abc')).toBe(true);
    expect(themeApplies('/p/abc/battles/x')).toBe(true);
    expect(themeApplies('/admin/c/x')).toBe(false);
    expect(themeApplies('/login')).toBe(false);
    expect(themeApplies(null)).toBe(false);
  });
  it('liest den Cookie-Rückfall', () => {
    expect(themeFromCookie('a=1; vf_theme=archiv; b=2')).toBe('archiv');
    expect(themeFromCookie('vf_theme=xyz')).toBe('terminal');
    expect(themeFromCookie('a=1')).toBeNull();
  });
  it('Skript setzt das Thema nur auf /v/ und /p/', () => {
    const run = (path: string, stored: string | null) => {
      const attrs: Record<string, string> = {};
      const fn = new Function('location', 'localStorage', 'document', THEME_SCRIPT);
      fn({ pathname: path }, { getItem: () => stored }, { cookie: '', documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } });
      return attrs['data-theme'] ?? null;
    };
    expect(run('/v/x', 'archiv')).toBe('archiv');
    expect(run('/admin', 'archiv')).toBeNull();
    expect(run('/p/x', null)).toBeNull();
    expect(run('/v/x', 'terminal')).toBeNull();
  });
  it('übersteht gesperrten Speicher', () => {
    const fn = new Function('location', 'localStorage', 'document', THEME_SCRIPT);
    expect(() =>
      fn(
        { pathname: '/v/x' },
        {
          getItem: () => {
            throw new Error('blocked');
          },
        },
        { cookie: 'vf_theme=archiv', documentElement: { setAttribute: () => undefined } },
      ),
    ).not.toThrow();
  });
});

describe('Präsentationsmodus: Ton (NTH2 4.4)', () => {
  it('meldet beim ersten Stand keine neuen Einträge', () => {
    expect(newMessageKeys(null, ['a', 'b'])).toEqual([]);
    expect(newMessageKeys(['a'], ['b', 'a'])).toEqual(['b']);
  });
  it('Ton nur mit Ton an, ohne reduzierte Bewegung und bei neuen Meldungen', () => {
    expect(shouldChime(['a'], ['a', 'b'], { on: true, reducedMotion: false })).toBe(true);
    expect(shouldChime(['a'], ['a', 'b'], { on: false, reducedMotion: false })).toBe(false);
    expect(shouldChime(['a'], ['a', 'b'], { on: true, reducedMotion: true })).toBe(false);
    expect(shouldChime(['a', 'b'], ['a', 'b'], { on: true, reducedMotion: false })).toBe(false);
    expect(shouldChime(null, ['a'], { on: true, reducedMotion: false })).toBe(false);
  });
  it('Lautstärke bleibt leise und begrenzt', () => {
    expect(volumeGain(0)).toBe(0);
    expect(volumeGain(100)).toBe(0.35);
    expect(volumeGain(200)).toBe(0.35);
    expect(volumeGain(-5)).toBe(0);
    expect(volumeGain(50)).toBeCloseTo(0.088, 3);
  });
});
