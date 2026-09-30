'use client';

import { PrintIcon } from '@/components/icons';
import { useT } from '@/i18n/client';

/** Drucktaste; `shortLabel` ersetzt die Beschriftung auf schmalen Bildschirmen (z. B. „Drucken / PDF“) */
export function PrintButton({ label, shortLabel }: { label?: string; shortLabel?: string }) {
  const t = useT();
  const text = label ?? t('Drucken');
  return (
    <div className="no-print flex justify-end">
      <button type="button" className="btn btn-sm min-h-11 whitespace-nowrap lg:min-h-0" onClick={() => window.print()}>
        <PrintIcon />{' '}
        {shortLabel ? (
          <>
            <span className="sm:hidden">{shortLabel}</span>
            <span className="hidden sm:inline">{text}</span>
          </>
        ) : (
          text
        )}
      </button>
    </div>
  );
}
