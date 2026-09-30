import 'server-only';
import { cookies, headers } from 'next/headers';
import { currentAdmin } from './auth';
import { db, defaultLocale } from './db';
import { loadPlayer, requireViewerRow } from './authz';
import { acceptLocale, normLocale, pickLocale, type Locale } from '@/i18n/core';
import { applyI18nOverrides } from './i18nStore';
import type { CampaignState, Player } from '@/engine/types';

/** Kopfzeilen, die der Proxy (src/proxy.ts) für Seiten ohne eigene Parameter setzt */
export const PATH_HEADER = 'x-vf-path';
export const LANG_HEADER = 'x-vf-lang';
export const LANG_COOKIE = 'vf_lang';

/**
 * Reihenfolge der Sprachwahl (überall gleich):
 * 1. ausdrückliche Wahl: ?lang= (vom Proxy als Kopfzeile gesetzt), sonst Cookie vf_lang (Sprachschalter)
 * 2. Kontext: Konto (Verwaltung), Spieler und Kampagne (Spielerseite), Kampagne (Leseansicht)
 * 3. globale Standardsprache (Einstellung defaultLocale, bei der Ersteinrichtung gewählt)
 * 4. Accept-Language des Browsers
 * 5. Build-Standardsprache NEXT_PUBLIC_DEFAULT_LOCALE (ohne Angabe Englisch)
 */
export interface LocaleInputs {
  /** ?lang= dieser Anfrage */
  explicit?: string | null;
  cookie?: string | null;
  /** Kontext in absteigendem Vorrang */
  context?: (string | null | undefined)[];
  defaultLocale?: string | null;
  acceptLanguage?: string | null;
}

/** Kern der Auflösung – ohne Next-Header testbar */
export function resolveLocale(i: LocaleInputs): Locale {
  return pickLocale(i.explicit, i.cookie, ...(i.context ?? []), i.defaultLocale, acceptLocale(i.acceptLanguage));
}

/** Anfrageunabhängige Teile (Kopfzeilen, Cookie, Standard) einmal einsammeln */
async function inputs(): Promise<Omit<LocaleInputs, 'context'>> {
  // Zusatzsprachen und importierte Übersetzungen (NTH2 7.1/7.2) für diese Anfrage bereitstellen
  applyI18nOverrides();
  const h = await headers();
  return { explicit: h.get(LANG_HEADER), cookie: (await cookies()).get(LANG_COOKIE)?.value ?? null, defaultLocale: defaultLocale(), acceptLanguage: h.get('accept-language') };
}

/** Seiten ohne Kontext (Anmeldung, Ersteinrichtung, Einladung, Nachweise, 404) */
export async function readerLocale(): Promise<Locale> {
  return resolveLocale(await inputs());
}

/** Verwaltung: Wahl → Sprache des angemeldeten Kontos → Standard */
export async function adminLocale(): Promise<Locale> {
  return resolveLocale({ ...(await inputs()), context: [(await currentAdmin())?.locale] });
}

/** Leseansicht: Wahl des Lesers → Standard der Kampagne → globaler Standard */
export async function publicLocale(state: Pick<CampaignState, 'meta'>): Promise<Locale> {
  return resolveLocale({ ...(await inputs()), context: [state.meta.locale] });
}

/** Spielerseite: Wahl → Einstellung des Spielers → Standard der Kampagne → globaler Standard */
export async function playerLocale(player: Pick<Player, 'locale'>, state: Pick<CampaignState, 'meta'>): Promise<Locale> {
  return resolveLocale({ ...(await inputs()), context: [player.locale, state.meta.locale] });
}

/**
 * Sprache einer Anfrage für Seiten ohne eigenen Kontext (Root-Layout, /credits, 404): Kontext ergibt sich aus
 * dem Pfad (Verwaltung: Konto, Spielerseite: Spieler und Kampagne, Leseansicht: Kampagne).
 */
export async function requestLocale(): Promise<Locale> {
  const h = await headers();
  return localeForPath(h.get(PATH_HEADER) ?? '', await inputs(), async () => (await currentAdmin())?.locale ?? null);
}

/** Pfadabhängiger Kontext plus feste Reihenfolge – ohne Next-Header testbar */
export async function localeForPath(path: string, i: Omit<LocaleInputs, 'context'>, account: () => Promise<Locale | null>): Promise<Locale> {
  const chosen = normLocale(i.explicit) ?? normLocale(i.cookie);
  if (chosen) return chosen;
  return resolveLocale({ ...i, context: await pathContext(path, account) });
}

async function pathContext(path: string, account: () => Promise<Locale | null>): Promise<(string | null | undefined)[]> {
  if (path === '/admin' || path.startsWith('/admin/')) return [await account()];
  const p = /^\/p\/([A-Za-z0-9_-]+)/.exec(path);
  if (p) {
    const s = loadPlayer(p[1]);
    return s ? [s.player.locale, s.state.meta.locale] : [];
  }
  const v = /^\/v\/([A-Za-z0-9_-]+)/.exec(path);
  if (v) {
    const row = requireViewerRow(v[1]);
    if (!row) return [];
    // nur die Sprache aus dem gespeicherten Zustand lesen, nicht den ganzen Zustand laden
    const r = db().prepare("SELECT json_extract(state, '$.meta.locale') AS l FROM revision WHERE campaign_id = ? AND number = ?").get(row.id, row.current_rev) as { l: string | null } | undefined;
    return [r?.l];
  }
  // Anmeldung, Ersteinrichtung, Einladung: ohne Konto (wie readerLocale der Seiten)
  if (/^\/(login|setup-admin|einladung)(\/|$)/.test(path)) return [];
  // übrige Seiten (Nachweise, 404): angemeldetes Konto, falls vorhanden
  return [await account()];
}

export { contextLocale } from './locale';
