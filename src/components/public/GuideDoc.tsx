import { Markdown } from '@/components/ui';
import { makeT, type Locale } from '@/i18n/core';
import type { GuideDoc as Doc } from './guideParse';

/**
 * Hilfe zum Umgang mit der App (Verwaltung und Spielerseite): Titel, kurzer Vorspann, Verzeichnis mit Sprungmarken
 * (Abschnitte und Themen, Tasten mit 44 px Höhe), danach die Abschnitte mit begrenzter Lesebreite. Aufbau und
 * Typografie wie das Regel-FAQ (FaqDoc). Ohne Hooks (Server-Komponente); gescrollt wird im umgebenden Gehäuse.
 */
export function GuideDoc({ doc, locale, lead, fallback = false }: { doc: Doc; locale: Locale; lead?: string; fallback?: boolean }) {
  const t = makeT(locale);
  return (
    <div className="mx-auto w-full max-w-[76ch] pb-8 text-[17px] leading-relaxed text-ink" id="hilfe-top">
      <h1 className="font-display text-[22px] font-bold uppercase leading-tight tracking-[0.03em] text-ink lg:text-[26px]">{doc.title}</h1>
      {lead ? <p className="mt-1.5 text-[16px] leading-snug text-dim lg:text-[17px]">{lead}</p> : <Markdown text={doc.intro} className="mt-1.5 !text-[16px] text-dim lg:!text-[17px] [&>p]:my-0" />}
      {fallback && (
        <p lang={locale} className="mt-3 border-l-4 border-accent bg-[#2a2210]/60 px-3 py-2 text-[15px] text-ink">
          {t('Diese Hilfe gibt es auf Deutsch und Englisch. Angezeigt wird die englische Fassung.')}
        </p>
      )}

      {doc.sections.length > 0 && (
        <nav className="hud mt-3 p-3 sm:p-4" aria-label={t('Inhalt')}>
          <h2 className="section-title relative z-[1]">{t('Inhalt')}</h2>
          <div className="relative z-[1] space-y-2">
            {doc.sections.map((s) => (
              <div key={s.anchor}>
                <a href={`#${s.anchor}`} className="inline-flex min-h-11 items-center font-display text-[15px] font-bold text-brass hover:text-accent">
                  {s.title}
                </a>
                {s.topics.length > 0 && (
                  <ul className="flex flex-wrap gap-x-5 border-l border-line/70 pl-3">
                    {s.topics.map((q) => (
                      <li key={q.anchor}>
                        <a href={`#${q.anchor}`} className="inline-flex min-h-11 items-center text-[16px] leading-snug text-ink hover:text-accent hover:underline">
                          {q.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </nav>
      )}

      {doc.sections.map((s) => (
        <section key={s.anchor} id={s.anchor} className="mt-8 scroll-mt-3" aria-labelledby={`${s.anchor}-h`}>
          <h2 id={`${s.anchor}-h`} className="border-b border-line pb-1 font-display text-[19px] font-bold text-brass">
            {s.title}
          </h2>
          <Markdown text={s.lead} className="mt-2 !text-[17px]" />
          {s.topics.map((q) => (
            <article key={q.anchor} id={q.anchor} className="mt-6 scroll-mt-3" aria-labelledby={`${q.anchor}-h`}>
              <h3 id={`${q.anchor}-h`} className="font-serif text-[20px] font-semibold leading-snug text-ink">
                {q.title}
              </h3>
              <Markdown text={q.body} className="mt-1 !text-[17px] [&>p:first-child]:mt-1" />
            </article>
          ))}
          <p className="no-print mt-3">
            <a href="#hilfe-top" className="inline-flex min-h-11 items-center text-[15px] text-dim hover:text-accent hover:underline">
              {t('Zum Seitenanfang')}
            </a>
          </p>
        </section>
      ))}
    </div>
  );
}
