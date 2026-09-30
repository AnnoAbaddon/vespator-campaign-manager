import { EN } from './en';
import { EN_PATTERNS } from './en/engine';
import { DEFAULT_LOCALE } from './defaultLocale';

/**
 * Mehrsprachigkeit (N5.4). Schlüssel ist der deutsche Text selbst – so bleibt der Code lesbar und
 * fehlende Übersetzungen fallen auf Deutsch zurück. Platzhalter: {name}.
 * Spielbegriffe (Battle Operation, Power Level …) bleiben in beiden Sprachen englisch.
 */
export type Locale = 'de' | 'en' | 'fr' | 'es' | 'pl';
export { DEFAULT_LOCALE };
export const LOCALES: Locale[] = ['de', 'en', 'fr', 'es', 'pl'];
/** Zusatzsprachen (NTH2 7.1): Wörterbuch je Sprache, fehlende Einträge fallen auf Englisch, dann Deutsch zurück */
export const EXTRA_LOCALES = ['fr', 'es', 'pl'] as const;
export type ExtraLocale = (typeof EXTRA_LOCALES)[number];
export const isExtraLocale = (l: Locale): l is ExtraLocale => (EXTRA_LOCALES as readonly string[]).includes(l);
/** Eigenname je Sprache (Sprachschalter, Auswahllisten) */
export const LOCALE_NAMES: Record<Locale, string> = { de: 'Deutsch', en: 'English', fr: 'Français', es: 'Español', pl: 'Polski' };

/** Sprachpaket einer Zusatzsprache: Oberflächentexte (Schlüssel = Deutsch) und Muster der Engine-Meldungen */
export interface LocalePack {
  ui: Record<string, string>;
  patterns: [string, string][];
}
const PACKS: Partial<Record<ExtraLocale, LocalePack>> = {};
/** Zusätzliche Einträge aus dem Import der Übersetzungsdatei (NTH2 7.2); gehen den eingebauten vor */
const OVERRIDES: Partial<Record<Locale, Record<string, string>>> = {};

/** Registriert ein Sprachpaket (Server: src/i18n/packs.ts, Client: LocaleProvider lädt es nach) */
export function registerPack(l: ExtraLocale, pack: LocalePack) {
  if (PACKS[l] === pack) return;
  PACKS[l] = pack;
  compiledExtra.delete(l);
  memo.clear();
}
export const hasPack = (l: Locale) => !isExtraLocale(l) || !!PACKS[l];
/** Importierte Übersetzungen einer Sprache setzen (leer = entfernen) */
export function setOverrides(l: Locale, dict: Record<string, string> | null | undefined) {
  if (dict && Object.keys(dict).length) OVERRIDES[l] = dict;
  else delete OVERRIDES[l];
  memo.clear();
}
export const getOverrides = (l: Locale) => OVERRIDES[l];

export type Vars = Record<string, string | number | null | undefined>;

/** Nur bekannte Sprachen, alles andere null */
export const normLocale = (v: unknown): Locale | null => (typeof v === 'string' && (LOCALES as string[]).includes(v) ? (v as Locale) : null);
/** Wie normLocale, aber mit der Build-Standardsprache (NEXT_PUBLIC_DEFAULT_LOCALE) als Rückfall */
export const toLocale = (v: unknown): Locale => normLocale(v) ?? DEFAULT_LOCALE;

/**
 * Bevorzugte Sprache aus dem Accept-Language-Kopf (höchste Gewichtung zuerst, „en-GB“ zählt als „en“).
 * Nur unterstützte Sprachen; null, wenn keine davon genannt ist.
 */
export function acceptLocale(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const items = header
    .split(',')
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => /^\s*q=([\d.]+)\s*$/.exec(p)).find(Boolean);
      return { lang: normLocale(tag.trim().toLowerCase().split('-')[0]), q: q ? Number(q[1]) : 1, i };
    })
    .filter((x) => x.lang && x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  return items[0]?.lang ?? null;
}

/**
 * Sprachwahl in fester Reihenfolge: der erste gültige Kandidat gewinnt, sonst die Build-Standardsprache
 * (NEXT_PUBLIC_DEFAULT_LOCALE, ohne Angabe Englisch).
 * Aufrufer übergeben: ausdrückliche Wahl (?lang=, Cookie) → Kontext (Konto, Spieler, Kampagne) →
 * globale Standardsprache → Accept-Language.
 */
export function pickLocale(...candidates: unknown[]): Locale {
  for (const c of candidates) {
    const l = normLocale(c);
    if (l) return l;
  }
  return DEFAULT_LOCALE;
}

const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === undefined || vars[k] === null ? '' : String(vars[k]))) : s);

/** Wörterbuch-Nachschlag mit Rückfall: Import → Zusatzsprache → Englisch → Deutsch (der Schlüssel selbst) */
function lookup(locale: Locale, text: string): string | undefined {
  if (locale === 'de') return OVERRIDES.de?.[text];
  const o = OVERRIDES[locale]?.[text];
  if (o) return o;
  if (isExtraLocale(locale)) {
    const v = PACKS[locale]?.ui[text];
    if (v) return v;
    return OVERRIDES.en?.[text] ?? EN[text];
  }
  return EN[text];
}

export function translate(locale: Locale, text: string, vars?: Vars): string {
  return fill(lookup(locale, text) ?? text, vars);
}

export type T = (text: string, vars?: Vars) => string;
export const makeT =
  (locale: Locale): T =>
  (text, vars) =>
    translate(locale, text, vars);

/** Datums-/Zahlenformat je Sprache */
export const intlLocale = (l: Locale) => ({ de: 'de-DE', en: 'en-GB', fr: 'fr-FR', es: 'es-ES', pl: 'pl-PL' })[l] ?? 'de-DE';

// ─── Meldungen der Engine (Log, Fehler, Warnungen) ────────────────────────

/** generic: Muster ohne nennenswerten festen Text („{0}: {1}“) – greift nur, wenn der letzte Platzhalter übersetzt wird */
type Compiled = { re: RegExp; en: string; generic: boolean };
let compiled: Compiled[] | null = null;
const compiledExtra = new Map<ExtraLocale, Compiled[]>();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const toRe = (de: string) => new RegExp('^' + esc(de).replace(/\\\{(\d+)\\\}/g, '(.+?)') + '$', 's');
const literalLength = (template: string) => template.replace(/\{\d+\}/g, '').length;
/** Muster nach Spezifität sortieren (mehr fester Text zuerst), doppelte deutsche Vorlagen: erste gewinnt */
const compile = (pairs: [string, string][]): Compiled[] =>
  pairs
    .filter(([de], i) => pairs.findIndex(([d]) => d === de) === i)
    .map((p, i) => ({ p, i, n: literalLength(p[0]) }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map(({ p: [de, en] }) => toCompiled(de, en));
const toCompiled = (de: string, en: string): Compiled => ({ re: toRe(de), en, generic: literalLength(de) <= 2 });

function matchPatterns(list: Compiled[], locale: Locale, msg: string, depth: number): string | null {
  for (const c of list) {
    const m = c.re.exec(msg);
    if (!m) continue;
    const last = m.length - 1;
    let lastChanged = false;
    const out = c.en.replace(/\{(\d+)\}/g, (_, i: string) => {
      const part = m[Number(i) + 1] ?? '';
      const tr = translatePart(locale, part, false, depth + 1);
      if (Number(i) + 1 === last && tr !== part) lastChanged = true;
      return tr;
    });
    // generische Muster („Name: Meldung“) nur, wenn der Meldungsteil übersetzt wird – fremder Text (Dekret-Zeilen) bleibt unverändert
    if (c.generic && !lastChanged) continue;
    return out;
  }
  return null;
}

/**
 * Übersetzt eine Engine-Meldung über Muster mit Platzhaltern {0}, {1}, …
 * Zusatzsprachen: eigenes Muster, sonst das englische (Rückfall), sonst die deutsche Meldung.
 */
export function translateMessage(locale: Locale, msg: string): string {
  // überlange Meldungen bestehen fast nur aus Freitext – unverändert lassen (Aufwand)
  if (locale === 'de' || !msg || msg.length > MAX_MESSAGE_LENGTH) return msg;
  const key = `${locale}:${msg}`;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  budget = WORK_BUDGET;
  calls = MAX_CALLS;
  const out = translatePart(locale, msg, true, 0);
  if (memo.size >= MEMO_MAX) memo.clear();
  memo.set(key, out);
  return out;
}

/**
 * F11 (Review): Obergrenze gegen quadratischen Aufwand, wenn Meldungen langen Freitext der Spieler enthalten
 * (Begründungen, Berichte, Namen). Eingesetzte Werte und Teile zusammengesetzter Meldungen verbrauchen je Aufruf
 * ein Budget (Zeichen und Zahl der Teilübersetzungen); ist es aufgebraucht, bleibt der Rest unverändert (Freitext wird ohnehin nicht übersetzt).
 * Sehr lange Meldungen werden nicht mehr zerlegt.
 */
const WORK_BUDGET = 6000;
/** höchstens so viele Teilübersetzungen je Meldung (jede prüft alle Muster) */
const MAX_CALLS = 60;
const MAX_SPLIT_LENGTH = 1500;
const MAX_MESSAGE_LENGTH = 4000;
let budget = WORK_BUDGET;
let calls = MAX_CALLS;
/** Zwischenspeicher je (Sprache, Meldung): das Protokoll wird bei jedem Rendern erneut übersetzt */
const MEMO_MAX = 2000;
const memo = new Map<string, string>();

/**
 * Eingesetzte Werte (Platzhalter, whole = false) sind oft Namen von Spielern, Flotten oder Planeten. Einzelne Wörter
 * („Gast“, „Flotte“, „Rot“) laufen deshalb nur über die Engine-Muster, nie über das Oberflächen-Wörterbuch; feste
 * Spielbegriffe und Schrittnamen stehen dafür als Muster ohne Platzhalter in EN_PATTERNS. Mehrwortige Wendungen
 * („Angreifer siegt“, „zu viele Revisionen“) dürfen weiter das Wörterbuch nutzen – Namen sind das praktisch nie.
 */
function translatePart(locale: Locale, msg: string, whole: boolean, depth: number): string {
  if (locale === 'de' || !msg) return msg;
  if (depth > 0 || !whole) {
    budget -= msg.length;
    if (budget < 0 || --calls < 0) return msg;
  }
  const direct = whole || /\s/.test(msg.trim()) ? lookup(locale, msg) : undefined;
  if (direct) return direct;
  if (isExtraLocale(locale)) {
    const pack = PACKS[locale];
    if (pack) {
      let list = compiledExtra.get(locale);
      if (!list) compiledExtra.set(locale, (list = compile(pack.patterns)));
      const hit = matchPatterns(list, locale, msg, depth);
      if (hit !== null) return hit;
    }
  }
  // EN_PATTERNS ist bereits nach Spezifität sortiert
  compiled ??= EN_PATTERNS.map(([de, en]) => toCompiled(de, en));
  const hit = matchPatterns(compiled, locale, msg, depth);
  if (hit !== null) return hit;
  // zusammengesetzte Meldungen („A · B“, „A | B“) teilweise übersetzen
  if (msg.length > MAX_SPLIT_LENGTH) return msg;
  for (const sep of [' · ', ' | ', '; '])
    if (msg.includes(sep))
      return msg
        .split(sep)
        .map((p) => translatePart(locale, p, whole, depth + 1))
        .join(sep);
  return msg;
}
