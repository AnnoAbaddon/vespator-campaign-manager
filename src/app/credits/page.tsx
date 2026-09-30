import fs from 'node:fs';
import path from 'node:path';
import { Markdown } from '@/components/ui';
import { requestLocale } from '@/server/requestLocale';
import { LocaleProvider } from '@/i18n/client';
import { makeT } from '@/i18n/core';
import { LangSwitch } from '@/components/LangSwitch';
import { BackButton } from '@/components/BackButton';

/** Sprache: aus dem Fußzeilen-Link (?lang=, Sprache der aufrufenden Seite), sonst Cookie, Konto, Standardsprache, Browser */
const readerLocale = requestLocale;

export async function generateMetadata() {
  return { title: makeT(await readerLocale())('Nachweise'), robots: { index: false } };
}

/** Querverweis auf die andere Sprachfassung – in der App ein toter Link */
const stripLangLink = (md: string) => md.replace(/^(English|German) version: .*\r?\n(\r?\n)?/m, '');

function read(file: string): string | null {
  try {
    return stripLangLink(fs.readFileSync(path.join(process.cwd(), file), 'utf8'));
  } catch {
    return null;
  }
}

export default async function Credits() {
  const locale = await readerLocale();
  // Fehlt die englische Fassung, gilt die deutsche
  const text =
    (locale !== 'de' ? read('CREDITS.en.md') : null) ??
    read('CREDITS.md') ??
    (locale === 'en'
      ? 'Icons: game-icons.net (CC BY 3.0) · Fonts: SIL Open Font License 1.1 · Image credits: see CREDITS.md in the source code'
      : 'Icons: game-icons.net (CC BY 3.0) · Schriften: SIL Open Font License 1.1 · Bildnachweise: siehe CREDITS.md im Quellcode');
  const title = makeT(locale)('Nachweise');
  // Ein Bildschirm: Gehäuse mit Schild, der Text scrollt darin
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
            <Markdown text={text} className="faq" />
          </div>
        </main>
      </div>
    </LocaleProvider>
  );
}
