import 'server-only';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA_SQL } from './schema-sql';
import { P1_SCHEMA_SQL } from './p1-schema';
import { DEFAULT_LOCALE, normLocale, type Locale } from '@/i18n/core';

export const DATA_DIR = process.env.DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), 'data');
export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads');

const g = globalThis as unknown as { __vfdb?: DatabaseSync };

function open(): DatabaseSync {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  plainRows(db);
  return db;
}

/**
 * node:sqlite liefert Zeilen als Objekte ohne Prototyp. React verweigert solche Objekte an der Grenze
 * Server → Client („null prototypes are not supported“) – z. B. die Outbox-Liste im Admin brach so die ganze
 * Kampagnenseite. Daher gibt jede Abfrage gewöhnliche Objekte zurück.
 */
function plainRows(db: DatabaseSync) {
  const prepare = db.prepare.bind(db);
  const plain = <T>(r: T): T => (r && typeof r === 'object' && Object.getPrototypeOf(r) === null ? ({ ...r } as T) : r);
  db.prepare = ((sql: string) => {
    const st = prepare(sql);
    const get = st.get.bind(st);
    const all = st.all.bind(st);
    const iterate = st.iterate.bind(st);
    st.get = ((...a: Parameters<typeof get>) => plain(get(...a))) as typeof st.get;
    st.all = ((...a: Parameters<typeof all>) => all(...a).map(plain)) as typeof st.all;
    st.iterate = function* (...a: Parameters<typeof iterate>) {
      for (const r of iterate(...a)) yield plain(r);
    } as unknown as typeof st.iterate;
    return st;
  }) as typeof db.prepare;
}

/** Schema anlegen und nachziehen – in einer Transaktion, damit parallel startende Prozesse sich nicht in die Quere kommen */
function migrate(db: DatabaseSync) {
  db.exec('BEGIN IMMEDIATE');
  try {
    migrateSchema(db);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function migrateSchema(db: DatabaseSync) {
  db.exec(SCHEMA_SQL);
  // Block P1: Web-Push, Einmal-Links, Discord-Bot
  db.exec(P1_SCHEMA_SQL);
  // Spalten, die nach der ersten Version dazugekommen sind
  const cols = (table: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  if (!cols('revision').includes('author')) db.exec('ALTER TABLE revision ADD COLUMN author TEXT');
  // Konten und Rollen (N5.2): bestehende Konten sind Admins
  if (!cols('admin').includes('role')) db.exec("ALTER TABLE admin ADD COLUMN role TEXT NOT NULL DEFAULT 'ADMIN'");
  if (!cols('outbox').includes('revision')) db.exec('ALTER TABLE outbox ADD COLUMN revision INTEGER');
  if (!cols('outbox').includes('next_attempt_at')) db.exec('ALTER TABLE outbox ADD COLUMN next_attempt_at TEXT');
  if (!cols('admin').includes('locale')) db.exec("ALTER TABLE admin ADD COLUMN locale TEXT NOT NULL DEFAULT 'de'");
  // Szenario-Sandbox (NTH2 2.1): Kopie einer Kampagne mit eigenen Revisionen
  if (!cols('campaign').includes('sandbox_of')) db.exec('ALTER TABLE campaign ADD COLUMN sandbox_of TEXT');
  // F6: wer ein Bild hochgeladen hat (p:<Spieler-ID> bzw. a:<Konto-ID>); ältere Bilder ohne Angabe
  if (!cols('upload').includes('uploader')) db.exec('ALTER TABLE upload ADD COLUMN uploader TEXT');
  // Sitzungen: Anlegezeit für die absolute Höchstdauer; die ID steht seit „sessionHashV1“ nur noch als SHA-256-Hash in
  // der Tabelle. Alte Sitzungen (Klartext-IDs) werden einmalig gelöscht – alle melden sich einmal neu an.
  if (!cols('session').includes('created_at')) db.exec('ALTER TABLE session ADD COLUMN created_at TEXT');
  if (!db.prepare("SELECT 1 FROM meta WHERE key = 'sessionHashV1'").get()) {
    db.exec('DELETE FROM session');
    db.prepare("INSERT INTO meta(key, value) VALUES('sessionHashV1', ?)").run(new Date().toISOString());
  }
  // Einstellung „Planetenbilder verwenden“: früherer Schlüssel wird auf `planetArt` umgezogen (neuer Wert hat Vorrang)
  db.prepare('INSERT OR IGNORE INTO settings(key, value) SELECT ?, value FROM settings WHERE key = ?').run(PLANET_ART_KEY, LEGACY_PLANET_ART_KEY);
  db.prepare('DELETE FROM settings WHERE key = ?').run(LEGACY_PLANET_ART_KEY);
}

export function db(): DatabaseSync {
  if (!g.__vfdb) g.__vfdb = open();
  return g.__vfdb;
}

export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    d.exec('COMMIT');
    return r;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

export function getSetting(key: string): string | null {
  const r = db().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return r?.value ?? null;
}

export function setSetting(key: string, value: string) {
  db().prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

/** Einstellung „Planetenbilder verwenden“ (N6): Schlüssel in der Tabelle `settings` */
export const PLANET_ART_KEY = 'planetArt';
/** Früherer Schlüssel derselben Einstellung; wird beim Öffnen migriert und beim Lesen noch als Rückfall beachtet */
export const LEGACY_PLANET_ART_KEY = 'aiArt';

/** Planetenbilder an (Standard) oder aus; liest den neuen Schlüssel, sonst den früheren */
export function planetArtEnabled(): boolean {
  return (getSetting(PLANET_ART_KEY) ?? getSetting(LEGACY_PLANET_ART_KEY)) !== 'off';
}

/** Schreibt die Einstellung unter dem neuen Schlüssel und entfernt einen Rest unter dem früheren */
export function setPlanetArt(on: boolean) {
  setSetting(PLANET_ART_KEY, on ? 'on' : 'off');
  db().prepare('DELETE FROM settings WHERE key = ?').run(LEGACY_PLANET_ART_KEY);
}

/** Globale Standardsprache (Einstellung `defaultLocale`, bei der Ersteinrichtung gewählt); null, wenn nicht gesetzt */
export function defaultLocale(): Locale | null {
  return normLocale(getSetting('defaultLocale'));
}

export function setDefaultLocale(locale: Locale) {
  setSetting('defaultLocale', normLocale(locale) ?? DEFAULT_LOCALE);
}
