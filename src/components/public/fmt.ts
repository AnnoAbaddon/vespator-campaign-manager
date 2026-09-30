// Server-taugliche Formatierungshelfer (ui.tsx ist ein Client-Modul und darf auf dem Server nicht aufgerufen werden)
import { planetDef } from '@/engine/map';
import { DEFAULT_LOCALE, intlLocale, type Locale } from '@/i18n/core';

export const planetName = (id: string | null | undefined) => (id ? (planetDef(id)?.name ?? id) : '–');

export function fmtDate(iso: string | null | undefined, withTime = false, locale: Locale = DEFAULT_LOCALE, timeZone = 'Europe/Berlin') {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(intlLocale(locale), { timeZone, day: '2-digit', month: '2-digit', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) });
}

export function uploadUrl(id: string | null | undefined, thumb = false) {
  return id ? `/api/uploads/${id}${thumb ? '?thumb=1' : ''}` : null;
}
