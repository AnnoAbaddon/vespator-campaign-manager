import 'server-only';
import '@/i18n/packs';
import { getSetting, setSetting } from './db';
import { setOverrides, type Locale } from '@/i18n/core';

/**
 * Importierte Übersetzungen (NTH2 7.2) liegen als Einstellung `i18nOverrides` ({ sprache: { deutsch: text } }).
 * Der Server liest sie bei jeder Sprachauflösung (billig: eine Einstellungszeile, Zwischenspeicher über den Rohtext);
 * der Client erhält sie über das Root-Layout (I18nOverrides).
 */
const KEY = 'i18nOverrides';
let lastRaw: string | null | undefined;
let lastParsed: Partial<Record<Locale, Record<string, string>>> = {};

export function i18nOverrides(): Partial<Record<Locale, Record<string, string>>> {
  let raw: string | null;
  try {
    raw = getSetting(KEY);
  } catch {
    return lastParsed;
  }
  if (raw === lastRaw) return lastParsed;
  lastRaw = raw;
  try {
    lastParsed = raw ? (JSON.parse(raw) as Partial<Record<Locale, Record<string, string>>>) : {};
  } catch {
    lastParsed = {};
  }
  for (const l of ['de', 'en', 'fr', 'es', 'pl'] as Locale[]) setOverrides(l, lastParsed[l]);
  return lastParsed;
}

/** Importierte Übersetzungen auf den Server anwenden (vor jeder Übersetzung aufrufen) */
export const applyI18nOverrides = () => void i18nOverrides();

export function saveI18nOverrides(o: Partial<Record<Locale, Record<string, string>>>) {
  const clean = Object.fromEntries(Object.entries(o).filter(([, d]) => d && Object.keys(d).length));
  setSetting(KEY, JSON.stringify(clean));
  i18nOverrides();
}
