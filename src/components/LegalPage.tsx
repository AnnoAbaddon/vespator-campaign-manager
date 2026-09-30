import { Markdown } from '@/components/ui';
import { LocaleProvider } from '@/i18n/client';
import { makeT, type Locale } from '@/i18n/core';
import { LangSwitch } from '@/components/LangSwitch';
import { BackButton } from '@/components/BackButton';

/**
 * Datenschutzhinweis und Impressum: ein Bildschirm wie die Nachweise – Gehäuse mit Schild, der Text scrollt darin.
 * Markdown ohne HTML (Text stammt vom Admin).
 */
export function LegalPage({ locale, title, text }: { locale: Locale; title: string; text: string }) {
  return (
    <LocaleProvider locale={locale}>
      <div className="flex h-dvh flex-col px-3 py-5 sm:px-4 sm:py-8">
        <div className="mx-auto mb-4 flex w-full max-w-3xl items-center justify-between gap-3">
          <BackButton label={makeT(locale)('Zurück')} />
          <LangSwitch size="sm" />
        </div>
        <main className="hud frame relative mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col p-3 pt-7 sm:p-5 sm:pt-8">
          <span className="plate plate-head">{title}</span>
          <div className="relative z-[1] min-h-0 flex-1 overflow-y-auto pr-1" tabIndex={0} role="region" aria-label={title}>
            <h1 className="sr-only">{title}</h1>
            <Markdown text={text} className="faq" />
          </div>
        </main>
      </div>
    </LocaleProvider>
  );
}
