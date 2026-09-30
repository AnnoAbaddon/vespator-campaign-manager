import { WaxSeal } from './emblems';
import { CreditsLink } from './CreditsLink';
import { LangSwitch } from './LangSwitch';
import { makeT, type Locale } from '@/i18n/core';

/**
 * Ein-Bildschirm-Rahmen für Anmeldung, Ersteinrichtung und Einladung: schweres imperiales Gehäuse mit
 * Eckbeschlägen, Messingschild und geflügeltem Schädel, eingelassen in eine Terminalnische. Nachweise direkt darunter statt
 * des langen Seitenfußes. Passt auf einen Bildschirm; wird es doch zu hoch (Fehlermeldung, Querformat),
 * scrollt nur der Rahmen selbst.
 */
export function AuthScreen({
  subtitle,
  locale,
  plate,
  title,
  intro,
  langSwitch = true,
  children,
}: {
  subtitle: string;
  locale: Locale;
  /** Text des Messingschilds, z. B. „Identifikation erforderlich“ */
  plate: string;
  /** Seitenüberschrift (h1) */
  title: string;
  intro?: string;
  /** Sprachschalter über dem Gehäuse (Ersteinrichtung: stattdessen die Standardsprache im Formular) */
  langSwitch?: boolean;
  children: React.ReactNode;
}) {
  const t = makeT(locale);
  return (
    <div className="auth-niche relative flex h-dvh flex-col items-center overflow-y-auto px-4 py-4 [scrollbar-gutter:stable] sm:py-6">
      {/* Nische: Kathedralenwand und Lichtkegel binden das Gehäuse in den Hintergrund ein (rein dekorativ) */}
      <div aria-hidden className="auth-niche-bg pointer-events-none fixed inset-0" />
      <main className="relative mt-[4dvh] w-full max-w-[420px] pt-3 sm:my-auto">
        {langSwitch && (
          <div className="relative z-[6] mb-4 flex justify-end">
            <LangSwitch size="sm" />
          </div>
        )}
        <section className="hud frame relative px-5 pb-4 pt-8 sm:px-7 sm:pb-5 sm:pt-9">
          {/* Servo-Schädel wacht über dem Terminal (rein dekorativ) */}
          <span
            aria-hidden
            className="sentinel pointer-events-none absolute -left-16 -top-10 z-[5] hidden h-[96px] w-[60px] bg-[url('/ui/sentinel.webp')] bg-contain bg-no-repeat drop-shadow-[0_8px_10px_rgba(0,0,0,0.8)] sm:block"
          />
          <span className="plate plate-head left-1/2 max-w-[calc(100%-24px)] -translate-x-1/2 whitespace-nowrap px-3 text-[12px] sm:px-5 sm:text-[15px]">{plate}</span>
          <WaxSeal size={34} className="absolute right-3 top-6 z-[4] hidden drop-shadow-[0_4px_4px_rgba(0,0,0,0.7)] sm:block" />

          {/* Kopf: geflügelter Schädel und Marke – die größte Überschrift der Seite */}
          <div className="relative z-[1] flex flex-col items-center text-center">
            <span aria-hidden className="block h-[46px] w-[130px] bg-[url('/ui/emblem-winged.webp')] bg-contain bg-center bg-no-repeat drop-shadow-[0_3px_4px_rgba(0,0,0,0.9)] sm:h-[54px] sm:w-[150px]" />
            <p className="mt-1 font-display text-[24px] font-bold uppercase leading-none tracking-[0.08em] text-ink [text-shadow:0_2px_0_#000] sm:text-[26px]">Vespator Front</p>
            <p className="mt-1.5 font-display text-[12px] font-semibold uppercase tracking-[0.14em] text-brass">{subtitle}</p>
          </div>

          <div aria-hidden className="rule-gold relative z-[1] my-4" />

          {/* Formular direkt auf der Arbeitsfläche – kein zweiter Innenrahmen */}
          <div className="relative z-[1]">
            <h1 className="font-serif text-[19px] font-semibold normal-case leading-tight tracking-normal text-ink">{title}</h1>
            {intro && <p className="mt-1 text-[15px] text-dim">{intro}</p>}
            <div className="mt-3">{children}</div>
          </div>

          {/* Hinweis mit Warnleuchte: Zugang ist beschränkt */}
          <p className="relative z-[1] mt-4 flex items-center justify-center gap-2 border-t border-line/50 pt-3 text-[13px] text-dim">
            <span aria-hidden className="lamp lamp-alert h-2 w-2" />
            {t('Zugriff nur für autorisiertes Personal')}
          </p>
        </section>
        <CreditsLink locale={locale} className="mt-3 text-center" />
      </main>
    </div>
  );
}
