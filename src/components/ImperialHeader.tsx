import Link from 'next/link';
import { HeaderMenu } from './HeaderMenu';
import { DEFAULT_LOCALE, makeT, type Locale } from '@/i18n/core';

/**
 * Kopfkonsole des Kommandoterminals: durchgehender gotischer Architrav (Bögen, Kerzennischen, Schädel), links das
 * Banner und die Markenplatte, rechts globale Navigation und Kampagnenstatus als eingelassene
 * Konsolenmodule gleicher Höhe (Portal-Ziel #hdr-status, befüllt von der jeweiligen Seite).
 * Schmuck fängt keine Maus- oder Touchereignisse ab. Höhe fest (--hdr), damit Seiten darunter genau den
 * restlichen Bildschirm füllen.
 */
export function ImperialHeader({
  href,
  title = 'Vespator Front',
  subtitle,
  children,
  locale,
  lang,
}: {
  href: string;
  title?: string;
  subtitle: string;
  children?: React.ReactNode;
  locale?: Locale;
  /** Sprachschalter (LangSwitch): ab md als eigenes Konsolenmodul, darunter im Menü bzw. ohne Menü direkt in der Kopfzeile */
  lang?: React.ReactNode;
}) {
  const t = makeT(locale ?? DEFAULT_LOCALE);
  return (
    <header className="console no-print relative z-30 h-[var(--hdr)]">
      {/* Banner oben links – ragt über die Kopfzeile hinaus */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-4 top-0 z-10 hidden h-[calc(var(--hdr)+34px)] w-[66px] bg-[url('/ui/banner-emblem.webp')] bg-[length:100%_auto] bg-top bg-no-repeat drop-shadow-[0_6px_8px_rgba(0,0,0,0.7)] lg:block"
      />

      <div className="relative mx-auto flex h-full max-w-[1920px] items-center gap-3 px-3 lg:gap-4 lg:pl-[96px] lg:pr-[calc(var(--gap)+4px)]">
        {/* Markenplatte: Adler und Titel in einer eingelassenen Platte */}
        <Link href={href} className="group relative z-[1] flex min-h-11 min-w-0 shrink items-center lg:console-module lg:h-[68px] lg:gap-1 lg:py-1 lg:pl-2 lg:pr-4 2xl:pr-6" aria-label={title}>
          <span
            aria-hidden
            className="relative block h-[30px] w-[70px] shrink-0 bg-[url('/ui/emblem-winged.webp')] bg-contain bg-center bg-no-repeat drop-shadow-[0_3px_4px_rgba(0,0,0,0.9)] lg:h-[46px] lg:w-[104px] 2xl:h-[54px] 2xl:w-[134px]"
          />
          <span className="relative min-w-0 px-2 leading-none lg:px-1">
            <span className="block truncate font-display text-[19px] font-bold uppercase tracking-[0.08em] text-ink lg:tracking-[0.05em] 2xl:tracking-[0.08em] [text-shadow:0_2px_0_#000,0_0_14px_rgba(0,0,0,0.9)] lg:text-[28px] 2xl:text-[31px]">
              {title}
            </span>
            <span className="mt-1 block truncate font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-brass lg:mt-1.5 lg:text-[13px] lg:tracking-[0.12em] 2xl:tracking-[0.2em]">{subtitle}</span>
          </span>
        </Link>

        {/* Zwischenfeld: die gotische Architektur des Kopfbands bleibt sichtbar */}
        <div aria-hidden className="hidden flex-1 lg:block" />

        <div className="relative z-[1] ml-auto flex items-center gap-2 sm:gap-3 lg:ml-0 lg:gap-4">
          {/* Instrumentenleiste: Kontonavigation und Sprachwahl in einer gemeinsamen, zurückhaltenden Stahlleiste
           * (ohne Messingfassung – die starke Fassung bleibt Titel und Fortschrittsanzeige vorbehalten) */}
          {(children || lang) && (
            <div className={`${lang ? 'hidden md:flex' : 'hidden xl:flex'} ${children ? 'hdr-strip-nav' : ''} items-center gap-1 lg:console-strip lg:h-[52px] lg:px-2`}>
              {children && <nav className="hidden items-center gap-1 xl:flex">{children}</nav>}
              {children && lang && <span aria-hidden className="console-strip-joint mx-1.5 hidden xl:block" />}
              {lang && (
                <div className="flex items-center" data-lang-switch>
                  {lang}
                </div>
              )}
            </div>
          )}
          {/* datenabhängiger Kampagnenstatus (Portal-Ziel) */}
          <div id="hdr-status" className="hidden empty:hidden md:block" />
          {(children || lang) && (
            <HeaderMenu
              label={t('Menü')}
              /* ohne Navigation nur auf dem Handy: Darstellung und Sprache wandern ins Menü, damit der Titel ganz sichtbar bleibt */
              hideFrom={children ? 'xl:hidden' : 'md:hidden'}
              extra={
                lang && (
                  <div className={`flex items-center justify-between gap-3 md:hidden ${children ? 'mt-1 border-t border-line/60 pt-2' : ''}`}>
                    <span className="font-serif text-[15px] text-dim">{t('Sprache')}</span>
                    {lang}
                  </div>
                )
              }
            >
              {children}
            </HeaderMenu>
          )}
        </div>
      </div>
    </header>
  );
}
