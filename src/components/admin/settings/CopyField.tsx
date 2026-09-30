'use client';

import { useState } from 'react';
import { CheckIcon } from '@/components/icons';
import { useT } from '@/i18n/client';

/** Link gekürzt anzeigen: Adresse bis zum Pfadanfang plus die ersten Zeichen des Schlüssels */
export function maskUrl(value: string): string {
  const m = /^(https?:\/\/[^/]+)?(\/[a-z]+\/)([^/?#]+)(.*)$/i.exec(value);
  if (!m) return value;
  const [, origin = '', path, token] = m;
  const host = origin.replace(/^https?:\/\//, '');
  return `${host}${path}${token.length > 8 ? `${token.slice(0, 6)}…` : token}`;
}

/**
 * Nur-Lese-Feld mit Kopierknopf; `label` benennt das Feld für Screenreader (Standard: „Link“).
 * `masked`: statt der ganzen Tokenfolge nur eine gekürzte Kennung zeigen – kopiert wird der volle Link.
 * Mobil liegt die Kopieraktion unter dem Feld, damit der Wert die volle Breite behält.
 */
export function CopyField({
  value,
  label,
  masked = false,
  buttonOnly = false,
}: {
  value: string;
  label?: string;
  masked?: boolean;
  /** nur die Kopiertaste (Wert steht anderswo, z. B. im QR-Code) */ buttonOnly?: boolean;
}) {
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const t = useT();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {buttonOnly && !failed ? null : masked && !failed ? (
        <span className="inset flex min-h-10 min-w-0 flex-1 items-center px-3 font-mono text-[14px] text-dim" title={value}>
          <span className="sr-only">{label ?? t('Link')}: </span>
          <span className="truncate">{maskUrl(value)}</span>
        </span>
      ) : (
        <input className="input min-w-0 flex-1 font-mono text-[13px]" readOnly value={value} aria-label={label ?? t('Link')} onFocus={(e) => e.currentTarget.select()} />
      )}
      <button
        type="button"
        className="btn btn-sm shrink-0 self-start sm:self-auto"
        aria-label={buttonOnly ? `${t('Link kopieren')}: ${label ?? t('Link')}` : undefined}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setFailed(false);
            setDone(true);
            setTimeout(() => setDone(false), 2000);
          } catch {
            setFailed(true);
          }
        }}
      >
        {done ? (
          <>
            <CheckIcon /> {t('Kopiert')}
          </>
        ) : masked || buttonOnly ? (
          t('Link kopieren')
        ) : (
          t('Kopieren')
        )}
      </button>
      <span className="sr-only" role="status">
        {done ? t('In die Zwischenablage kopiert') : ''}
      </span>
      {failed && (
        <span className="sr-only" role="alert">
          {t('Kopieren nicht möglich – bitte manuell markieren')}
        </span>
      )}
    </div>
  );
}
