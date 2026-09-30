import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { activeHouseRules } from '@/engine/houseRules';
import type { CampaignState } from '@/engine/types';
import { translate, translateMessage, type Locale } from '@/i18n/core';

/** Kampagnen-FAQ (docs/FAQ.md bzw. docs/FAQ.en.md) – wird je Sprache einmal gelesen */
const cache: Partial<Record<Locale, string>> = {};

// Zusatzsprachen (NTH2 7.1) lesen die englische Fassung
const FILES: Record<Locale, string> = { de: 'FAQ.md', en: 'FAQ.en.md', fr: 'FAQ.en.md', es: 'FAQ.en.md', pl: 'FAQ.en.md' };
const NOTE: Record<Locale, string> = { de: 'In dieser Kampagne abweichend:', en: 'Different in this campaign:', fr: 'Différent dans cette campagne :', es: 'Distinto en esta campaña:', pl: 'W tej kampanii inaczej:' };

/** FAQ mit Hinweisen auf abweichende Hausregeln einer Kampagne (N2.1) */
export function faqForCampaign(state: Pick<CampaignState, 'toggles'>, locale: Locale = 'de'): string {
  let md = loadFaq(locale);
  for (const r of activeHouseRules(state)) {
    const re = new RegExp(`^(### ${r.faq} .*)$`, 'm');
    const alt = translateMessage(locale, r.alternative);
    md = md.replace(re, (h) => `${h}\n\n> **${NOTE[locale]}** ${alt}.`);
  }
  return md;
}

/** Querverweis auf die andere Sprachfassung – nur im Repository sinnvoll, in der App ein toter Link */
const stripLangLink = (md: string) => md.replace(/^(English|German) version: .*\r?\n(\r?\n)?/m, '');

function read(file: string): string | null {
  try {
    return stripLangLink(fs.readFileSync(path.join(process.cwd(), 'docs', file), 'utf8'));
  } catch {
    return null;
  }
}

export function loadFaq(locale: Locale = 'de'): string {
  let md = cache[locale];
  if (md === undefined || process.env.NODE_ENV === 'development') {
    // Fehlt die englische Fassung, gilt die deutsche
    md = read(FILES[locale]) ?? (locale === 'de' ? null : read(FILES.de)) ?? `_${translate(locale, 'Das FAQ ist nicht verfügbar.')}_`;
    cache[locale] = md;
  }
  return md;
}
