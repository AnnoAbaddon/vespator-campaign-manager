/**
 * Sprachneutrale Zeitangabe für Log- und Engine-Meldungen („2026-10-02 18:00“ in der Zeitzone der Kampagne).
 * Meldungen werden gespeichert und erst beim Anzeigen übersetzt – ein deutsches Datumsformat bliebe sonst in
 * jeder Sprache stehen.
 */
export function neutralTime(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const fmt = (tz: string | undefined) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = fmt(timeZone || undefined);
  } catch {
    parts = fmt('UTC');
  }
  const g = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
}

/** Frühestes und spätestes Jahr, das ein Termin der Kampagne haben darf (F1, Architektur-Review) */
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;
const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * Strikte Prüfung eines Zeitpunkts aus Benutzerhand (Terminvorschlag, Termin, „Gespielt am“, Fristen):
 * ISO-Zeichenkette (Datum oder Datum mit Uhrzeit), gültig und zwischen 2000 und 2100. Werte außerhalb
 * brachten sonst Kalender-Feeds (toISOString) oder Sortierungen zum Absturz.
 */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !ISO_RE.test(v)) return false;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return false;
  const y = new Date(t).getUTCFullYear();
  return y >= MIN_YEAR && y <= MAX_YEAR;
}

/**
 * Zeitfenster eines Termins für Kalender-Feeds (F1, Verteidigung in der Tiefe): ungültige, nicht als Text
 * gespeicherte oder extreme Werte (außerhalb 2000–2100) liefern null – die Zeile wird übersprungen, statt den
 * ganzen Feed mit „Invalid time value“ scheitern zu lassen.
 */
export function eventWindow(at: unknown, hours = 3): { start: string; end: string } | null {
  if (typeof at !== 'string') return null;
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;
  const start = new Date(t);
  const end = new Date(t + hours * 3600_000);
  if (!Number.isFinite(end.getTime())) return null;
  const y = start.getUTCFullYear();
  if (y < MIN_YEAR || y > MAX_YEAR) return null;
  return { start: start.toISOString(), end: end.toISOString() };
}
