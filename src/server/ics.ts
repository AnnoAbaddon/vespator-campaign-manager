/**
 * Hilfen für .ics-Abos (RFC 5545): Text-Werte escapen und Zeitstempel formatieren.
 * Steuerzeichen (auch \r) werden entfernt – sonst ließen sich über Namen eigene Kalenderzeilen einschleusen.
 */

const CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F\u2028\u2029]/g;

export const icsEscape = (s: string) =>
  String(s ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');

export const icsStamp = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
