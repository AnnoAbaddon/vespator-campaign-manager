/**
 * Build-time default language (`NEXT_PUBLIC_DEFAULT_LOCALE`: de | en | fr | es | pl, unset or unknown → en).
 *
 * It is the last step of the language resolution (after ?lang, cookie, context, the stored `defaultLocale`
 * setting and Accept-Language) and the preset wherever nothing else is known (client fallbacks, first setup
 * without a matching browser language, service-worker offline page). The value is inlined by `next build` /
 * `next dev` (NEXT_PUBLIC_ prefix, direct property access required), so changing it needs a rebuild or a
 * dev-server restart. Existing installations keep their language through the stored setting.
 */
export type BuildLocale = 'de' | 'en' | 'fr' | 'es' | 'pl';

const KNOWN: readonly string[] = ['de', 'en', 'fr', 'es', 'pl'];

/** Parses the build variable; everything that is not a supported language gives English */
export function parseDefaultLocale(v: string | null | undefined): BuildLocale {
  const l = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return KNOWN.includes(l) ? (l as BuildLocale) : 'en';
}

export const DEFAULT_LOCALE: BuildLocale = parseDefaultLocale(process.env.NEXT_PUBLIC_DEFAULT_LOCALE);
