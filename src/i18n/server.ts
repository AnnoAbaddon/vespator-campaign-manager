import 'server-only';
// Zusatzsprachen (NTH2 7.1) auf dem Server registrieren
import './packs';
import { makeT, type Locale, type T } from './core';

// Sprachwahl in fester Reihenfolge (siehe src/server/requestLocale.ts)
export { LANG_COOKIE, adminLocale, publicLocale, playerLocale, readerLocale, requestLocale, contextLocale } from '@/server/requestLocale';

export const tFor = (l: Locale): T => makeT(l);
