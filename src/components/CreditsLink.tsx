import { DEFAULT_LOCALE, makeT, type Locale } from '@/i18n/core';

/**
 * Kompakter Rechte- und Nachweis-Hinweis für die Ein-Bildschirm-Apps (Admin-Kampagne, Leseansicht,
 * Spielerseite), in denen der globale Seitenfuß nicht gerendert wird. Ohne Hooks, damit er in Server-
 * und Client-Komponenten passt; die Sprache kommt als Prop (Client: useLocale()).
 * Lesbare Textschrift (13 px), die Links „Nachweise“, „Datenschutz“ und „Impressum“ sind farblich abgesetzt und haben
 * eigene Trefferflächen.
 */
export function CreditsLink({ locale = DEFAULT_LOCALE, className = '' }: { locale?: Locale; className?: string }) {
  const t = makeT(locale);
  return (
    <p className={`credits no-print ${className}`}>
      {t('Inoffizielles Fanprojekt, keine Verbindung zu Games Workshop.')} <a href={`/credits?lang=${locale}`}>{t('Nachweise')}</a>
      <a href={`/datenschutz?lang=${locale}`}>{t('Datenschutz')}</a>
      <a href={`/impressum?lang=${locale}`}>{t('Impressum')}</a>
    </p>
  );
}
