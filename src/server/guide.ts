import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { translate, type Locale } from '@/i18n/core';

/**
 * Hilfe zum Umgang mit der App (docs/GUIDE.de.md bzw. docs/GUIDE.md). Die Hilfe gibt es auf Deutsch und Englisch;
 * Französisch, Spanisch und Polnisch zeigen die englische Fassung mit einem Hinweis. Wird wie das FAQ je Sprache
 * einmal gelesen (in der Entwicklung bei jedem Aufruf, damit Änderungen sofort sichtbar sind).
 */
const cache: Partial<Record<'de' | 'en', string | null>> = {};

/** Querverweis auf die andere Sprachfassung – nur im Repository sinnvoll, in der App ein toter Link */
const stripLangLink = (md: string) => md.replace(/^(English|German) version: .*\r?\n(\r?\n)?/m, '');

function read(file: string): string | null {
  try {
    return stripLangLink(fs.readFileSync(path.join(process.cwd(), 'docs', file), 'utf8'));
  } catch {
    return null;
  }
}

function load(lang: 'de' | 'en'): string | null {
  if (cache[lang] === undefined || process.env.NODE_ENV === 'development') cache[lang] = read(lang === 'de' ? 'GUIDE.de.md' : 'GUIDE.md');
  return cache[lang] ?? null;
}

export interface GuideSource {
  markdown: string;
  /** true, wenn die englische Fassung für eine andere Oberflächensprache als Deutsch/Englisch einspringt */
  fallback: boolean;
}

export function loadGuide(locale: Locale): GuideSource {
  const lang = locale === 'de' ? 'de' : 'en';
  // Fehlt eine Fassung, gilt die andere
  const md = load(lang) ?? load(lang === 'de' ? 'en' : 'de');
  if (md === null) return { markdown: `_${translate(locale, 'Die Hilfe ist nicht verfügbar.')}_`, fallback: false };
  return { markdown: md, fallback: locale !== 'de' && locale !== 'en' };
}
