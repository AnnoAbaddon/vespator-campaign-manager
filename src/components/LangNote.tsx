import { makeT, type Locale } from '@/i18n/core';

/** Sprachnamen in der eigenen Sprache (Endonyme) */
export const LANG_NAMES: Record<string, string> = { de: 'Deutsch', en: 'English', fr: 'Français', es: 'Español', pl: 'Polski' };

/**
 * Kleiner Sprachhinweis (NTH2 7.3): Der Text steht nur im Original, weil die Übersetzung in der Sprache
 * des Lesers fehlt. Ohne Hooks – in Server- und Client-Komponenten nutzbar.
 */
export function LangNote({ lang, locale, className = '' }: { lang: string; locale: Locale; className?: string }) {
  const t = makeT(locale);
  return (
    <span className={`chip inline-flex items-center gap-1 text-[13px] text-dim ${className}`} lang={locale}>
      {t('Nur im Original: {lang}', { lang: LANG_NAMES[lang] ?? lang })}
    </span>
  );
}

/** Sprachkennung über einer Fassung bei zweisprachiger Darstellung (Codex, Druck) */
export function LangTag({ lang }: { lang: string }) {
  return (
    <span className="codex-meta font-mono text-[12px] uppercase" lang={lang}>
      {LANG_NAMES[lang] ?? lang}
    </span>
  );
}
