/**
 * Übersetzungsdatei (NTH2 7.2): alle Wörterbücher als Tabelle – Export (CSV/JSON), Import und Prüfliste
 * fehlender Einträge je Sprache. Reine Funktionen ohne Server-Abhängigkeit (testbar).
 *
 * Eine Zeile je deutschem Schlüssel: Bereich, Art (ui = Oberflächentext, engine = Muster einer Engine-Meldung mit
 * Platzhaltern {0}, {1} …), Deutsch und die Übersetzungen. Leere Zellen bedeuten „fehlt“ (Rückfall auf Englisch).
 */
import { COMMON } from './en/common';
import { ADMIN_CORE } from './en/admin-core';
import { ADMIN_PHASE } from './en/admin-phase';
import { ADMIN_SETUP } from './en/admin-setup';
import { ADMIN_MISC } from './en/admin-misc';
import { PUBLIC } from './en/public';
import { PLAYER } from './en/player';
import { EN_PATTERNS } from './en/engine';
import { EN } from './en';
import { P3 } from './en/p3';
import { EXTRA_LOCALES, LOCALES, type ExtraLocale, type Locale, type LocalePack } from './core';

export const TRANSLATABLE: Exclude<Locale, 'de'>[] = LOCALES.filter((l): l is Exclude<Locale, 'de'> => l !== 'de');

export interface CatalogRow {
  area: string;
  kind: 'ui' | 'engine';
  de: string;
  /** eingebaute Übersetzung (ohne Import) */
  values: Partial<Record<Exclude<Locale, 'de'>, string>>;
}

// übrige Bereiche (von anderen Blöcken ergänzte Wörterbücher) landen unter „other“
const AREAS: [string, Record<string, string>][] = [
  ['common', COMMON],
  ['admin-core', ADMIN_CORE],
  ['admin-phase', ADMIN_PHASE],
  ['admin-setup', ADMIN_SETUP],
  ['admin-misc', ADMIN_MISC],
  ['public', PUBLIC],
  ['player', PLAYER],
  ['p3', P3],
  ['other', EN],
];

/** Alle Schlüssel mit den eingebauten Übersetzungen (Paket je Zusatzsprache) */
export function buildCatalog(packs: Partial<Record<ExtraLocale, LocalePack>>): CatalogRow[] {
  const rows: CatalogRow[] = [];
  const seen = new Set<string>();
  const extra = (l: ExtraLocale, key: string, kind: 'ui' | 'engine') => {
    const p = packs[l];
    if (!p) return undefined;
    if (kind === 'ui') return p.ui[key];
    return p.patterns.find(([de]) => de === key)?.[1] ?? p.ui[key];
  };
  for (const [area, dict] of AREAS)
    for (const [de, en] of Object.entries(dict)) {
      if (seen.has('ui:' + de)) continue;
      seen.add('ui:' + de);
      const values: CatalogRow['values'] = { en };
      for (const l of EXTRA_LOCALES) values[l] = extra(l, de, 'ui');
      rows.push({ area, kind: 'ui', de, values });
    }
  for (const [de, en] of EN_PATTERNS) {
    if (seen.has('engine:' + de)) continue;
    seen.add('engine:' + de);
    const values: CatalogRow['values'] = { en };
    for (const l of EXTRA_LOCALES) values[l] = extra(l, de, 'engine');
    rows.push({ area: 'engine', kind: 'engine', de, values });
  }
  return rows;
}

/** Eingebaute Werte plus Import (Import gewinnt) */
export function mergedValue(row: CatalogRow, l: Exclude<Locale, 'de'>, overrides: Partial<Record<Locale, Record<string, string>>>): string {
  return overrides[l]?.[row.de] || row.values[l] || '';
}

const placeholders = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');

export interface ChecklistEntry {
  locale: Exclude<Locale, 'de'>;
  total: number;
  translated: number;
  missing: { area: string; de: string }[];
  /** Übersetzungen, deren Platzhalter nicht zum deutschen Text passen */
  broken: { area: string; de: string; value: string }[];
}

/** Prüfliste je Sprache: fehlende Einträge und Platzhalter-Fehler */
export function checklist(rows: CatalogRow[], overrides: Partial<Record<Locale, Record<string, string>>> = {}): ChecklistEntry[] {
  return TRANSLATABLE.map((l) => {
    const missing: ChecklistEntry['missing'] = [];
    const broken: ChecklistEntry['broken'] = [];
    for (const r of rows) {
      const v = mergedValue(r, l, overrides);
      if (!v) missing.push({ area: r.area, de: r.de });
      else if (placeholders(v) !== placeholders(r.de) && placeholders(v) !== placeholders(r.values.en ?? '')) broken.push({ area: r.area, de: r.de, value: v });
    }
    return { locale: l, total: rows.length, translated: rows.length - missing.length, missing, broken };
  });
}

// ─── CSV ───────────────────────────────────────────────────────────────────

const csvCell = (s: string) => (/[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** CSV (Komma, UTF-8 mit BOM für Tabellenprogramme): area,kind,de,en,fr,es,pl */
export function toCsv(rows: CatalogRow[], overrides: Partial<Record<Locale, Record<string, string>>> = {}): string {
  const head = ['area', 'kind', 'de', ...TRANSLATABLE];
  const lines = [head.join(',')];
  for (const r of rows) lines.push([r.area, r.kind, r.de, ...TRANSLATABLE.map((l) => mergedValue(r, l, overrides))].map(csvCell).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** CSV einlesen (RFC 4180: Anführungszeichen, verdoppelte Anführungszeichen, Zeilenumbrüche in Zellen; Komma oder Semikolon) */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out.filter((r) => r.some((c) => c.trim() !== ''));
}

// ─── JSON ──────────────────────────────────────────────────────────────────

/** JSON-Format: { "fr": { "Deutscher Text": "Texte français" }, … } – je Sprache ein flaches Wörterbuch */
export function toJson(rows: CatalogRow[], overrides: Partial<Record<Locale, Record<string, string>>> = {}): string {
  const out: Record<string, Record<string, string>> = { de: {} };
  for (const l of TRANSLATABLE) out[l] = {};
  for (const r of rows) {
    out.de[r.de] = r.de;
    for (const l of TRANSLATABLE) out[l][r.de] = mergedValue(r, l, overrides);
  }
  return JSON.stringify(out, null, 2);
}

export interface ImportResult {
  /** nur Einträge, die sich von den eingebauten unterscheiden */
  overrides: Partial<Record<Exclude<Locale, 'de'>, Record<string, string>>>;
  changed: Partial<Record<Exclude<Locale, 'de'>, number>>;
  unknown: number;
  rejected: { locale: string; de: string; reason: string }[];
}

/**
 * Import einer Übersetzungsdatei (CSV oder JSON). Übernommen werden nur bekannte Schlüssel mit passenden
 * Platzhaltern, die sich vom eingebauten Stand unterscheiden; leere Zellen lassen den eingebauten Stand stehen.
 */
export function importCatalog(text: string, rows: CatalogRow[]): ImportResult {
  const byDe = new Map(rows.map((r) => [r.de, r]));
  const res: ImportResult = { overrides: {}, changed: {}, unknown: 0, rejected: [] };
  const take = (l: string, de: string, value: string) => {
    if (!(TRANSLATABLE as string[]).includes(l)) return;
    const loc = l as Exclude<Locale, 'de'>;
    const v = value.trim() === '' ? '' : value;
    if (!v) return;
    const row = byDe.get(de);
    if (!row) return void res.unknown++;
    if (placeholders(v) !== placeholders(de) && placeholders(v) !== placeholders(row.values.en ?? '')) return void res.rejected.push({ locale: loc, de, reason: 'Platzhalter' });
    if (v.length > 4000) return void res.rejected.push({ locale: loc, de, reason: 'zu lang' });
    if (row.values[loc] === v) return;
    (res.overrides[loc] ??= {})[de] = v;
    res.changed[loc] = (res.changed[loc] ?? 0) + 1;
  };
  const trimmed = text.replace(/^﻿/, '').trimStart();
  if (trimmed.startsWith('{')) {
    let data: unknown;
    try {
      data = JSON.parse(trimmed);
    } catch {
      throw new Error('Ungültiges JSON');
    }
    if (!data || typeof data !== 'object') throw new Error('Ungültiges JSON');
    for (const [l, dict] of Object.entries(data as Record<string, unknown>)) {
      if (!dict || typeof dict !== 'object') continue;
      for (const [de, v] of Object.entries(dict as Record<string, unknown>)) if (typeof v === 'string') take(l, de, v);
    }
    return res;
  }
  const table = parseCsv(text);
  const head = table.shift()?.map((h) => h.trim().toLowerCase());
  if (!head || !head.includes('de')) throw new Error('CSV ohne Spalte „de“');
  const deCol = head.indexOf('de');
  for (const r of table) {
    const de = r[deCol];
    if (!de) continue;
    head.forEach((h, i) => {
      if (i !== deCol && r[i] !== undefined) take(h, de, r[i]);
    });
  }
  return res;
}
