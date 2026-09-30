import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Build-Standardsprache NEXT_PUBLIC_DEFAULT_LOCALE: ohne Angabe Englisch, deutsche Installationen bauen mit „de“.
 * Die gespeicherte Einstellung defaultLocale (Ersteinrichtung) geht ihr immer vor.
 */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-deflocale-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');

/** Module frisch laden, damit die Build-Variable (beim Laden gelesen) neu ausgewertet wird */
async function load(value: string | undefined) {
  vi.resetModules();
  if (value === undefined) vi.stubEnv('NEXT_PUBLIC_DEFAULT_LOCALE', undefined);
  else vi.stubEnv('NEXT_PUBLIC_DEFAULT_LOCALE', value);
  return {
    core: await import('@/i18n/core'),
    req: await import('@/server/requestLocale'),
    locale: await import('@/server/locale'),
    db: await import('@/server/db'),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    // Windows: noch offene Datenbank-Handles der neu geladenen Module
  }
});

describe('Build-Standardsprache', () => {
  it('liest die Variable: unbekannt oder leer → Englisch, sonst die genannte Sprache', async () => {
    const { parseDefaultLocale } = await import('@/i18n/defaultLocale');
    expect(parseDefaultLocale(undefined)).toBe('en');
    expect(parseDefaultLocale(null)).toBe('en');
    expect(parseDefaultLocale('')).toBe('en');
    expect(parseDefaultLocale('xx')).toBe('en');
    expect(parseDefaultLocale('de')).toBe('de');
    expect(parseDefaultLocale(' DE ')).toBe('de');
    for (const l of ['en', 'fr', 'es', 'pl'] as const) expect(parseDefaultLocale(l)).toBe(l);
  });

  it('ohne Angabe Englisch als letzter Rückfall', async () => {
    const m = await load(undefined);
    expect(m.core.DEFAULT_LOCALE).toBe('en');
    expect(m.core.pickLocale()).toBe('en');
    expect(m.core.toLocale('xx')).toBe('en');
    expect(m.req.resolveLocale({})).toBe('en');
    expect(m.locale.contextLocale()).toBe('en');
  });

  it('NEXT_PUBLIC_DEFAULT_LOCALE=de: Deutsch als letzter Rückfall', async () => {
    const m = await load('de');
    expect(m.core.DEFAULT_LOCALE).toBe('de');
    expect(m.core.pickLocale(null, 'xx')).toBe('de');
    expect(m.core.toLocale(undefined)).toBe('de');
    expect(m.req.resolveLocale({ acceptLanguage: 'it-IT' })).toBe('de');
    expect(m.locale.contextLocale(undefined)).toBe('de');
  });

  it('Vorrang: Wahl → Kontext → gespeicherte Standardsprache → Accept-Language → Build-Standard', async () => {
    const m = await load('en');
    const r = m.req.resolveLocale;
    expect(r({ acceptLanguage: 'fr-FR' })).toBe('fr');
    expect(r({ defaultLocale: 'de', acceptLanguage: 'fr-FR' })).toBe('de');
    expect(r({ context: ['pl'], defaultLocale: 'de' })).toBe('pl');
    expect(r({ cookie: 'es', context: ['pl'], defaultLocale: 'de' })).toBe('es');
    expect(r({ explicit: 'en', cookie: 'es' })).toBe('en');
  });

  it('bestehende Installation: die gespeicherte Einstellung geht dem Build-Standard vor', async () => {
    const m = await load(undefined);
    expect(m.db.defaultLocale()).toBeNull();
    expect(m.locale.contextLocale(undefined)).toBe('en');
    m.db.setDefaultLocale('de');
    try {
      expect(m.locale.contextLocale(undefined, null)).toBe('de');
      // auch in der umgekehrten Richtung: deutscher Build, englische Einstellung
      const d = await load('de');
      d.db.setDefaultLocale('en');
      expect(d.locale.contextLocale()).toBe('en');
    } finally {
      m.db.db().prepare("DELETE FROM settings WHERE key = 'defaultLocale'").run();
    }
  });
});
