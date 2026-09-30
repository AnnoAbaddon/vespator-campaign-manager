'use client';

import './globals.css';
import { useEffect, useSyncExternalStore } from 'react';
import { DEFAULT_LOCALE, makeT, toLocale } from '@/i18n/core';
import { StatusScreen } from '@/components/StatusScreen';

const noop = () => () => undefined;

/**
 * Letzte Fehlergrenze (Fehler im Root-Layout): ersetzt das ganze Dokument, daher eigene <html>/<body> und die
 * globalen Stile. Sprache aus der Browsersprache (Sprachpakete FR/ES/PL sind hier nicht geladen: Englisch als Rückfall).
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const locale = toLocale(
    useSyncExternalStore(
      noop,
      () => navigator.language.slice(0, 2).toLowerCase(),
      () => DEFAULT_LOCALE,
    ),
  );
  const t = makeT(locale);
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <title>{t('Übertragung gestört')}</title>
        <StatusScreen plate={t('Übertragung gestört')} code={t('Fehler')} title={t('Etwas ist schiefgegangen')} text={t('Beim Laden dieser Seite ist ein Fehler aufgetreten. Bitte erneut versuchen.')} locale={locale}>
          <button type="button" className="btn btn-primary" onClick={() => retry()}>
            {t('Erneut versuchen')}
          </button>
          <button type="button" className="btn" onClick={() => window.location.assign(window.location.origin)}>
            {t('Zur Startseite')}
          </button>
        </StatusScreen>
      </body>
    </html>
  );
}
