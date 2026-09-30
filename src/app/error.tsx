'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { LocaleProvider, useLocale, useT } from '@/i18n/client';
import { DEFAULT_LOCALE, toLocale } from '@/i18n/core';
import { StatusScreen } from '@/components/StatusScreen';

const noop = () => () => undefined;

/**
 * Fehlerseite (Fehlergrenze unter dem Root-Layout) im Terminalstil: Meldung, erneut versuchen, zur Startseite.
 * Die Sprache kommt aus <html lang> (setzt das Root-Layout aus dem Kontext der Seite).
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const locale = toLocale(
    useSyncExternalStore(
      noop,
      () => document.documentElement.lang,
      () => DEFAULT_LOCALE,
    ),
  );
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <LocaleProvider locale={locale}>
      <ErrorBody digest={error.digest} retry={retry} />
    </LocaleProvider>
  );
}

function ErrorBody({ digest, retry }: { digest?: string; retry: () => void }) {
  const t = useT();
  const locale = useLocale();
  return (
    <StatusScreen
      plate={t('Übertragung gestört')}
      code={digest ? t('Fehler {code}', { code: digest.slice(0, 10) }) : t('Fehler')}
      title={t('Etwas ist schiefgegangen')}
      text={t('Beim Laden dieser Seite ist ein Fehler aufgetreten. Bitte erneut versuchen.')}
      locale={locale}
    >
      <button type="button" className="btn btn-primary" onClick={() => retry()}>
        {t('Erneut versuchen')}
      </button>
      {/* bewusst ein harter Seitenwechsel: der Fehlerzustand der App wird dabei verworfen */}
      <button type="button" className="btn" onClick={() => window.location.assign(window.location.origin)}>
        {t('Zur Startseite')}
      </button>
    </StatusScreen>
  );
}
