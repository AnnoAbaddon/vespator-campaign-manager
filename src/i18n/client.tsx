'use client';

import { createContext, use, useContext, useMemo } from 'react';
import { DEFAULT_LOCALE, hasPack, intlLocale, isExtraLocale, makeT, registerPack, setOverrides, translateMessage, type ExtraLocale, type Locale, type LocalePack, type T } from './core';

const LocaleCtx = createContext<Locale>(DEFAULT_LOCALE);

/** Zusatzsprachen (NTH2 7.1) werden erst bei Bedarf geladen – eigenes Bundle je Sprache */
const LOADERS: Record<ExtraLocale, () => Promise<{ PACK: LocalePack }>> = {
  fr: () => import('./fr'),
  es: () => import('./es'),
  pl: () => import('./pl'),
};
const loading = new Map<ExtraLocale, Promise<void>>();
function loadPack(l: ExtraLocale): Promise<void> {
  let p = loading.get(l);
  if (!p) loading.set(l, (p = LOADERS[l]().then((m) => registerPack(l, m.PACK))));
  return p;
}

/**
 * Sprache für Client-Komponenten. Bei einer Zusatzsprache wartet die Darstellung, bis das Sprachpaket geladen
 * ist (use/Suspense), damit Server- und Client-Ausgabe übereinstimmen.
 */
export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  if (isExtraLocale(locale) && !hasPack(locale)) use(loadPack(locale));
  return <LocaleCtx.Provider value={locale}>{children}</LocaleCtx.Provider>;
}

/**
 * Importierte Übersetzungen aus der Übersetzungsdatei (NTH2 7.2) im Client bekannt machen; sie gehen den
 * eingebauten vor. Steht im Root-Layout vor allen Seiten.
 */
export function I18nOverrides({ dicts, children }: { dicts: Partial<Record<Locale, Record<string, string>>>; children: React.ReactNode }) {
  for (const l of ['de', 'en', 'fr', 'es', 'pl'] as Locale[]) setOverrides(l, dicts[l]);
  return children;
}

export function useLocale(): Locale {
  return useContext(LocaleCtx);
}

/** Übersetzungsfunktion für Client-Komponenten */
export function useT(): T {
  const l = useLocale();
  return useMemo(() => makeT(l), [l]);
}

/** Übersetzung von Engine-Meldungen (Log, Fehler, Warnungen) */
export function useMsg(): (msg: string) => string {
  const l = useLocale();
  return useMemo(() => (m: string) => translateMessage(l, m), [l]);
}

export function useIntlLocale(): string {
  return intlLocale(useLocale());
}
