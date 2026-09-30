import { Markdown } from '@/components/ui';
import { makeT, type Locale } from '@/i18n/core';
import type { FaqBlock, FaqDoc as Doc } from './faqParse';

/** Farbe der Einstufung: Regeltext ruhig, Auslegung Bernstein, Hausregel rot (weicht vom Buch ab) */
function gradeClass(grade: string) {
  if (/hausregel|house rule/i.test(grade)) return 'border-[#b0433a] bg-[#2a1210] text-[#f0b3a8]';
  if (/auslegung|interpretation/i.test(grade)) return 'border-accent/70 bg-[#2a2210] text-accent';
  return 'border-ok/60 bg-[#10231b] text-ok';
}

/**
 * Regel-FAQ der Leseansicht als Nachschlagewerk: kurze Einleitung, Fragenverzeichnis mit Sprungmarken,
 * Hinweise und Legende eingeklappt, begrenzte Lesebreite. Je Frage steht die Entscheidung (mit Einstufung) zuerst,
 * danach Regelbezug und Hintergrund. Ohne Hooks (Server-Komponente).
 */
export function FaqDoc({ doc, locale }: { doc: Doc; locale: Locale }) {
  const t = makeT(locale);
  const withQ = doc.sections.filter((s) => s.questions.length);
  const order: Record<FaqBlock['kind'], number> = { note: 0, decision: 1, reference: 2, background: 3, other: 4 };
  return (
    <div className="mx-auto w-full max-w-[74ch] pb-8 text-[17px] leading-relaxed text-ink" id="faq-top">
      <h1 className="font-display text-[22px] font-bold uppercase leading-tight tracking-[0.03em] text-ink lg:text-[26px]">{doc.title}</h1>
      {/* Kurzer Vorspann (2–3 Zeilen); Zweck, Hintergrund und Verbindlichkeit stehen eingeklappt hinter dem Verzeichnis */}
      <p className="mt-1.5 text-[16px] leading-snug text-dim lg:text-[17px]">{t('Entscheidungen dieser Kampagne zu offenen Regelfragen. Frage im Verzeichnis wählen.')}</p>

      <nav className="hud mt-3 p-3 sm:p-4" aria-label={t('Fragenverzeichnis')}>
        <h2 className="section-title relative z-[1]">{t('Fragenverzeichnis')}</h2>
        <div className="relative z-[1] space-y-3">
          {withQ.map((s) => (
            <div key={s.anchor}>
              <a href={`#${s.anchor}`} className="inline-flex min-h-11 items-center font-display text-[15px] font-bold text-brass hover:text-accent lg:min-h-0">
                {s.title}
              </a>
              <ol className="mt-1">
                {s.questions.map((q) => (
                  <li key={q.anchor}>
                    <a href={`#${q.anchor}`} className="group flex min-h-11 items-baseline gap-2.5 py-1 text-[16px] leading-snug lg:min-h-0">
                      <span className="w-11 shrink-0 font-mono text-[14px] text-brass">{q.id}</span>
                      <span className="text-ink group-hover:text-accent group-hover:underline">{q.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </nav>

      {(doc.intro || doc.notes) && (
        <details className="group mt-3 rounded-[2px] border border-line/70 bg-[#101413]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-[16px] text-dim hover:text-ink [&::-webkit-details-marker]:hidden">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="shrink-0 transition-transform group-open:rotate-90">
              <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            {doc.notes ? t('Über dieses FAQ, Hinweise und Legende der Einstufung') : t('Über dieses FAQ')}
          </summary>
          {doc.intro && <Markdown text={doc.intro} className="px-4 !text-[16px]" />}
          {doc.notes && <Markdown text={doc.notes} className="px-4 pb-3 !text-[16px]" />}
        </details>
      )}

      {doc.sections.map((s) => (
        <section key={s.anchor} id={s.anchor} className="mt-8 scroll-mt-3" aria-label={s.title}>
          <h2 className="border-b border-line pb-1 font-display text-[19px] font-bold text-brass">{s.title}</h2>
          {s.questions.length === 0 && s.body && (
            <details className="mt-2">
              <summary className="flex min-h-11 cursor-pointer items-center text-[16px] text-dim hover:text-ink">{t('Anzeigen')}</summary>
              <Markdown text={s.body} className="faq !text-[15px]" />
            </details>
          )}
          {s.questions.map((q) => (
            <article key={q.anchor} id={q.anchor} className="mt-5 scroll-mt-3" aria-labelledby={`${q.anchor}-h`}>
              <h3 id={`${q.anchor}-h`} className="flex items-baseline gap-2.5 font-serif text-[20px] font-semibold leading-snug text-ink">
                <span className="shrink-0 font-mono text-[15px] font-normal text-brass">{q.id}</span>
                <span>{q.title}</span>
              </h3>
              <div className="mt-2 space-y-2">
                {[...q.blocks]
                  .sort((a, b) => order[a.kind] - order[b.kind])
                  .map((b, i) =>
                    b.kind === 'decision' ? (
                      <div key={i} className="border-l-4 border-brass bg-[#191d1b] px-3 py-2">
                        <p className="flex flex-wrap items-center gap-2 text-[15px]">
                          <span className="font-semibold text-[#f3e2b4]">{b.label}</span>
                          {b.grade && <span className={`rounded-[2px] border px-1.5 text-[13px] font-semibold ${gradeClass(b.grade)}`}>{b.grade}</span>}
                        </p>
                        <Markdown text={b.body} className="!text-[17px] [&>p:first-child]:mt-1" />
                      </div>
                    ) : b.kind === 'note' ? (
                      <div key={i} className="border-l-4 border-accent bg-[#2a2210]/60 px-3 py-2">
                        <Markdown text={b.body} className="!text-[16px] [&>p]:my-0" />
                      </div>
                    ) : b.kind === 'other' ? (
                      <Markdown key={i} text={b.label ? `**${b.label}${b.grade ? ` (${b.grade})` : ''}:** ${b.body}` : b.body} className="!text-[16px]" />
                    ) : (
                      <div key={i} className="grid gap-x-3 text-[15px] sm:grid-cols-[8.5rem_minmax(0,1fr)]">
                        <p className="pt-0.5 font-semibold text-dim">{b.label}</p>
                        <Markdown text={b.body} className="!text-[15px] text-dim [&>p:first-child]:mt-0.5 [&>ul:first-child]:mt-0.5" />
                      </div>
                    ),
                  )}
              </div>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
