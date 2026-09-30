import type { Alliance, CampaignState, Dispatch, PlanetState } from './types';

/**
 * Zweisprachige Kampagneninhalte (NTH2 7.3): Zu Dekreten/Dispatches, Planeten-Lore, Allianz-Lore und
 * Intro gibt es optional ein zweites, von Hand gepflegtes Textfeld je Sprache. Das Original ist in der
 * Kampagnensprache (meta.locale, Standard Deutsch) geschrieben. Die Ansicht zeigt die Fassung in der
 * Sprache des Lesers; fehlt sie, das Original mit einem Sprachhinweis. Keine automatische Übersetzung.
 */

export type ContentLang = 'de' | 'en' | 'fr' | 'es' | 'pl';
/** Sprachen für Inhalte; die App-Oberfläche kennt ggf. weniger (dann Rückfall wie im Wörterbuch) */
export const CONTENT_LANGS: ContentLang[] = ['de', 'en', 'fr', 'es', 'pl'];
export const normContentLang = (v: unknown): ContentLang | null => (CONTENT_LANGS.includes(v as ContentLang) ? (v as ContentLang) : null);

/** Übersetzungen eines Freitexts je Sprache (leer = keine) */
export type TextTr = Partial<Record<ContentLang, string>>;
/** Übersetzungen eines Dispatches je Sprache */
export type DispatchTr = Partial<Record<ContentLang, { title: string; body: string }>>;

/** Sprache, in der die Originaltexte der Kampagne geschrieben sind */
export const originalLang = (st: Pick<CampaignState, 'meta'>): ContentLang => normContentLang(st.meta.locale) ?? 'de';

/** Vorgeschlagene zweite Sprache (Deutsch ↔ Englisch, sonst Englisch) */
export const otherLang = (l: ContentLang): ContentLang => (l === 'en' ? 'de' : 'en');

export interface Picked<T> {
  value: T;
  /** Sprache der gezeigten Fassung */
  lang: ContentLang;
  /** true: der Leser bekommt das Original, weil die Übersetzung fehlt (Sprachhinweis zeigen) */
  fallback: boolean;
}

/** Fassung eines Freitexts für den Leser: Übersetzung, sonst Original (mit Hinweis, wenn es ein Original gibt) */
export function pickText(original: string, tr: TextTr | undefined, orig: ContentLang, readerIn: string): Picked<string> {
  const reader = normContentLang(readerIn) ?? orig;
  if (reader === orig) return { value: original, lang: orig, fallback: false };
  const t = tr?.[reader];
  if (t?.trim()) return { value: t, lang: reader, fallback: false };
  return { value: original, lang: orig, fallback: !!original.trim() };
}

export function introText(st: Pick<CampaignState, 'meta'>, reader: string): Picked<string> {
  return pickText(st.meta.intro ?? '', st.meta.introTr, originalLang(st), reader);
}

export function planetLore(st: Pick<CampaignState, 'meta'>, p: Pick<PlanetState, 'lore' | 'loreTr'>, reader: string): Picked<string> {
  return pickText(p.lore ?? '', p.loreTr, originalLang(st), reader);
}

export function allianceLore(st: Pick<CampaignState, 'meta'>, a: Pick<Alliance, 'lore' | 'loreTr'>, reader: string): Picked<string> {
  return pickText(a.lore ?? '', a.loreTr, originalLang(st), reader);
}

/** Titel und Text eines Dispatches in der Sprache des Lesers (Titel und Text gehören zusammen) */
export function dispatchText(st: Pick<CampaignState, 'meta'>, d: Pick<Dispatch, 'title' | 'body' | 'tr'>, readerIn: string): Picked<{ title: string; body: string }> {
  const orig = originalLang(st);
  const reader = normContentLang(readerIn) ?? orig;
  const own = { title: d.title, body: d.body };
  if (reader === orig) return { value: own, lang: orig, fallback: false };
  const t = d.tr?.[reader];
  if (t && (t.title.trim() || t.body.trim())) return { value: { title: t.title.trim() || d.title, body: t.body.trim() || d.body }, lang: reader, fallback: false };
  return { value: own, lang: orig, fallback: true };
}

/** Bereinigt Übersetzungen aus Eingaben: nur bekannte Sprachen, nie die Originalsprache, leere entfallen */
export function cleanTextTr(tr: TextTr | undefined, orig: ContentLang, max = 20000): TextTr | undefined {
  if (!tr) return undefined;
  const out: TextTr = {};
  for (const l of CONTENT_LANGS) {
    const v = tr[l];
    if (l !== orig && typeof v === 'string' && v.trim()) out[l] = v.slice(0, max);
  }
  return Object.keys(out).length ? out : undefined;
}

export function cleanDispatchTr(tr: DispatchTr | undefined, orig: ContentLang): DispatchTr | undefined {
  if (!tr) return undefined;
  const out: DispatchTr = {};
  for (const l of CONTENT_LANGS) {
    const v = tr[l];
    if (l === orig || !v) continue;
    const title = String(v.title ?? '').slice(0, 200);
    const body = String(v.body ?? '').slice(0, 20000);
    if (title.trim() || body.trim()) out[l] = { title, body };
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Inhaltssprache für Druck und Codex (NTH2 7.4): eine Sprache oder beide nebeneinander.
 * Liefert die Fassungen in Anzeigereihenfolge (Original zuerst); bei „beide“ nur, wenn es wirklich zwei gibt.
 */
export type ContentMode = ContentLang | 'both';

export const normContentMode = (v: unknown): ContentMode | null => (v === 'both' ? 'both' : normContentLang(v));

export function textVersions(original: string, tr: TextTr | undefined, orig: ContentLang, mode: ContentMode): Picked<string>[] {
  if (mode !== 'both') return [pickText(original, tr, orig, mode)];
  const out: Picked<string>[] = [{ value: original, lang: orig, fallback: false }];
  for (const l of CONTENT_LANGS) if (l !== orig && tr?.[l]?.trim()) out.push({ value: tr[l]!, lang: l, fallback: false });
  return out;
}

export function dispatchVersions(st: Pick<CampaignState, 'meta'>, d: Pick<Dispatch, 'title' | 'body' | 'tr'>, mode: ContentMode): Picked<{ title: string; body: string }>[] {
  if (mode !== 'both') return [dispatchText(st, d, mode)];
  const orig = originalLang(st);
  const out: Picked<{ title: string; body: string }>[] = [{ value: { title: d.title, body: d.body }, lang: orig, fallback: false }];
  for (const l of CONTENT_LANGS) {
    if (l === orig) continue;
    const v = dispatchText(st, d, l);
    if (!v.fallback) out.push(v);
  }
  return out;
}
