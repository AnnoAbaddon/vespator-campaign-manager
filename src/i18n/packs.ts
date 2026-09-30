/**
 * Alle Zusatzsprachen auf dem Server registrieren (NTH2 7.1). Wird von den Server-Modulen der Sprachwahl
 * eingebunden; der Client lädt nur das Paket der aktiven Sprache nach (LocaleProvider).
 */
import { registerPack, type ExtraLocale, type LocalePack } from './core';
import { PACK as FR } from './fr';
import { PACK as ES } from './es';
import { PACK as PL } from './pl';

export const PACKS: Record<ExtraLocale, LocalePack> = { fr: FR, es: ES, pl: PL };
for (const [l, p] of Object.entries(PACKS)) registerPack(l as ExtraLocale, p);
