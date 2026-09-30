'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useT } from '@/i18n/client';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/i18n/core';

/** Merkt sich die Sprache des Lesers ein Jahr lang (Cookie vf_lang, gilt vor Konto-, Spieler- und Kampagnensprache) */
export function setLangCookie(l: Locale) {
  document.cookie = `vf_lang=${l}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

/** Neu vom Server laden; ein ?lang= in der Adresse ginge dem Cookie vor und wird daher entfernt */
export function reloadWithoutLang(router: { refresh: () => void; replace: (href: string) => void }) {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('lang')) return router.refresh();
  url.searchParams.delete('lang');
  router.replace(url.pathname + url.search + url.hash);
}

/**
 * Sprachschalter DE | EN | FR | ES | PL im Terminal-Stil (NTH2 7.1); auf schmalen Bildschirmen als kompakte Auswahlliste. Setzt immer das Cookie vf_lang; `persist` speichert die Wahl
 * zusätzlich im Kontext (Verwaltung: Kontosprache, Spielerseite: Profil des Spielers). Danach wird die Seite
 * neu vom Server geladen.
 */
export function LangSwitch({ persist, className = '', size = 'md' }: { persist?: (l: Locale) => Promise<unknown>; className?: string; size?: 'sm' | 'md' }) {
  const locale = useLocale();
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = (l: Locale) => {
    if (l === locale) return;
    setLangCookie(l);
    start(async () => {
      if (persist) await persist(l);
      reloadWithoutLang(router);
    });
  };
  return (
    <>
      <span className={`inset hidden shrink-0 p-0.5 md:inline-flex ${pending ? 'opacity-70' : ''} ${className}`} role="group" aria-label={t('Sprache')} aria-busy={pending || undefined}>
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            lang={l}
            title={LOCALE_NAMES[l]}
            aria-pressed={l === locale}
            disabled={pending}
            onClick={() => pick(l)}
            className={`${size === 'sm' ? 'min-h-8 min-w-8 text-[14px]' : 'min-h-8 min-w-9 text-[15px]'} rounded-[2px] px-1.5 font-serif font-semibold ${
              l === locale ? 'bg-[#262b28] text-ink shadow-[inset_0_0_0_1px_rgba(179,151,95,0.6)]' : 'text-faint hover:text-dim'
            }`}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </span>
      {/* kompakt: Auswahlliste auf schmalen Bildschirmen */}
      <select
        className={`select w-auto min-h-11 shrink-0 py-1 pl-1.5 pr-6 font-serif text-[14px] font-semibold md:hidden ${pending ? 'opacity-70' : ''} ${className}`}
        aria-label={t('Sprache')}
        value={locale}
        disabled={pending}
        onChange={(e) => pick(e.target.value as Locale)}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {l.toUpperCase()}
          </option>
        ))}
      </select>
    </>
  );
}
