'use client';

import { ArrowLeftIcon } from '@/components/icons';

/** Rückweg für eigenständige Seiten (z. B. Nachweise): zur vorigen Seite, ohne Verlauf zur Startseite */
export function BackButton({ label, fallback = '/' }: { label: string; fallback?: string }) {
  return (
    <a
      href={fallback}
      className="btn btn-sm"
      onClick={(e) => {
        if (window.history.length > 1) {
          e.preventDefault();
          window.history.back();
        }
      }}
    >
      <ArrowLeftIcon /> {label}
    </a>
  );
}
