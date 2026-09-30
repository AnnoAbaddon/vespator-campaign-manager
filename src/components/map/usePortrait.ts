import { useSyncExternalStore } from 'react';

/** Ab dieser Fensterbreite gilt das Gerät als Desktop/Tablet quer (wie `lg` in Tailwind und useIsDesktop) */
const DESKTOP_QUERY = '(min-width: 1024px)';

function subscribe(cb: () => void) {
  const m = window.matchMedia(DESKTOP_QUERY);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
}

/**
 * Hochformat-Karte (um 90° gedreht) nur auf echten Handys/schmalen Fenstern (Fenster < 1024 px) und nur,
 * wenn die Fläche deutlich höher als breit ist. Auf dem Desktop bleibt die Buchausrichtung immer erhalten –
 * auch wenn die Kartenspalte dort schmal ist (z. B. 1280 px Fensterbreite mit Seitenspalten).
 */
export function usePortraitMap(w: number, h: number): boolean {
  const desktop = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
  return !desktop && h > w * 1.1;
}
