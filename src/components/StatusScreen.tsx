import { CreditsLink } from './CreditsLink';
import type { Locale } from '@/i18n/core';

/**
 * Ein-Bildschirm-Meldung (404, Fehler) im Stil der Anmeldung: Terminalnische mit Kathedralenwand, schweres Gehäuse
 * mit Messingschild, Kennung (z. B. „404“), Text und Aktionen; Nachweise darunter. Genau ein Bildschirm hoch – wird
 * es doch zu eng (Querformat), scrollt nur der Rahmen selbst. Ohne Hooks (Server- und Client-Komponenten).
 */
export function StatusScreen({ plate, code, title, text, locale, children }: { plate: string; code: string; title: string; text: string; locale: Locale; children?: React.ReactNode }) {
  return (
    <div className="status-screen auth-niche relative flex h-dvh flex-col items-center justify-center overflow-y-auto px-4 py-4">
      <div aria-hidden className="auth-niche-bg pointer-events-none fixed inset-0" />
      <main className="relative w-full max-w-[440px]">
        <section className="hud frame relative px-5 pb-5 pt-8 text-center sm:px-7 sm:pt-9">
          <span className="plate plate-head left-1/2 max-w-[calc(100%-24px)] -translate-x-1/2 whitespace-nowrap px-3 text-[12px] sm:px-5 sm:text-[15px]">{plate}</span>
          <div className="relative z-[1] flex flex-col items-center">
            <span aria-hidden className="block h-[46px] w-[130px] bg-[url('/ui/emblem-winged.webp')] bg-contain bg-center bg-no-repeat opacity-90 drop-shadow-[0_3px_4px_rgba(0,0,0,0.9)]" />
            <p className={`mt-2 font-mono leading-none text-accent [text-shadow:0_0_14px_rgba(221,169,77,0.35)] ${code.length > 5 ? 'text-[22px]' : 'text-[40px]'}`}>{code}</p>
            <div aria-hidden className="rule-gold my-4 w-full" />
            <h1 className="font-serif text-[19px] font-semibold normal-case leading-tight tracking-normal text-ink">{title}</h1>
            <p className="mt-2 text-[15px] text-dim">{text}</p>
            {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
          </div>
          <p className="relative z-[1] mt-5 flex items-center justify-center gap-2 border-t border-line/50 pt-3 text-[13px] text-dim">
            <span aria-hidden className="lamp lamp-alert h-2 w-2" />
            Vespator Front
          </p>
        </section>
        <CreditsLink locale={locale} className="mt-3 text-center" />
      </main>
    </div>
  );
}
