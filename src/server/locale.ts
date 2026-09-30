import { defaultLocale } from './db';
import { applyI18nOverrides } from './i18nStore';
import { pickLocale, type Locale } from '@/i18n/core';

/** Sprache ohne Anfrage (E-Mails, Kalender, Berichte, Meldungen an Spieler): Kontext → globaler Standard → Build-Standardsprache */
export function contextLocale(...context: (string | null | undefined)[]): Locale {
  applyI18nOverrides();
  return pickLocale(...context, defaultLocale());
}
