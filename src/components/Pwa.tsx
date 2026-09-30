'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { DEFAULT_LOCALE, makeT, type Locale } from '@/i18n/core';

/** Adresse des Service Workers: Build-Kennung (Cache-Version) und Build-Standardsprache (Offline-Seite) */
export const SW_URL = `/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'}&dl=${DEFAULT_LOCALE}`;

/**
 * Registriert den Service Worker (N5.3) und zeigt einen deutlichen Hinweis, solange keine Verbindung
 * besteht: Lesen geht mit dem zuletzt geladenen Stand, Eingaben brauchen eine Verbindung.
 */
export function Pwa({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const online = useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register(SW_URL).catch(() => undefined);
  }, []);
  if (online) return null;
  const t = makeT(locale);
  return (
    <div role="status" className="no-print pointer-events-none fixed inset-x-0 top-0 z-[80] flex justify-center px-3 pt-1.5">
      <div className="hud frame-lite pointer-events-auto flex max-w-3xl items-center gap-2.5 px-3.5 py-1.5 text-[14px] font-semibold leading-snug text-warn">
        <span aria-hidden className="lamp lamp-alert relative z-[1] shrink-0" />
        <span className="relative z-[1]">{t('Offline – du siehst den zuletzt geladenen Stand. Eingaben sind erst mit Verbindung möglich.')}</span>
      </div>
    </div>
  );
}
