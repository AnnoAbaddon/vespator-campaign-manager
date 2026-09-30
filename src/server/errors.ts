import 'server-only';
import '@/i18n/packs';
import { translateMessage } from '@/i18n/core';
import { recordError } from './health';
import { DiceNeeded, RuleError } from '@/engine/ctx';

/** Allgemeiner Text für unerwartete Fehler (Details nur im Fehlerprotokoll der Health-Seite) */
export const INTERNAL_ERROR = 'Interner Fehler – bitte später erneut versuchen';

/**
 * Ist das eine absichtliche Fachmeldung (deutscher Text für den Nutzer) statt eines internen Fehlers?
 * Fachmeldungen sind gewöhnliche `Error`-Objekte ohne Systemcode; bekannte Katalogtexte gelten immer als Fachmeldung.
 * SQLite-, Dateisystem- und Netzwerkfehler tragen `code`/`errno`, Programmierfehler sind TypeError, RangeError usw.
 */
export function isDomainError(e: unknown): e is Error {
  if (!(e instanceof Error) || !e.message) return false;
  if (translateMessage('en', e.message) !== e.message) return true;
  const x = e as Error & { code?: unknown; errno?: unknown; syscall?: unknown };
  // Regelverstöße der Engine (RuleError, DiceNeeded) sind Fachmeldungen; andere Unterklassen (TypeError …) nicht
  if (e instanceof RuleError || e instanceof DiceNeeded) return true;
  if (e.name !== 'Error' || Object.getPrototypeOf(e) !== Error.prototype) return false;
  if (x.code !== undefined || x.errno !== undefined || x.syscall !== undefined) return false;
  // Pfade oder Stack-artige Texte nie ausgeben
  return !/[\\/][\w.-]+[\\/]|\bat \S+ \(|\bnode:|SQLITE|ENOENT|EACCES/.test(e.message);
}

/**
 * Fehlertext für den Client (OWASP A10 / ASVS 16.5.1): Fachmeldungen unverändert, alles andere wird mit Details
 * protokolliert und durch einen allgemeinen Text ersetzt.
 */
export function publicError(e: unknown, source = 'action'): string {
  if (isDomainError(e)) return e.message;
  recordError(source, e);
  return INTERNAL_ERROR;
}
