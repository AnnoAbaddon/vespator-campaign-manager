'use client';

import { useT } from '@/i18n/client';

/**
 * Sprunglink „Zum Inhalt“ (erste Tabulatorstation, nur bei Fokus sichtbar): setzt den Fokus auf den Hauptbereich
 * der Seite (erstes <main>) und überspringt Kopfzeile und Navigation.
 */
export function SkipLink({ label }: { label?: string }) {
  const t = useT();
  return (
    <a
      href="#main"
      className="skip-link"
      onClick={(e) => {
        const main = document.querySelector<HTMLElement>('main#main, main');
        if (!main) return;
        e.preventDefault();
        if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
        main.focus();
      }}
    >
      {label ?? t('Zum Inhalt')}
    </a>
  );
}
