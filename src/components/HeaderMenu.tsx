'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Aufklappmenü der Kopfzeile auf schmalen Bildschirmen (M7). Schließt bei Seitenwechsel,
 * bei Klick außerhalb, bei Klick auf einen Eintrag und mit Escape.
 */
export function HeaderMenu({
  label,
  children,
  extra,
  hideFrom = 'xl:hidden',
}: {
  label: string;
  children?: React.ReactNode;
  extra?: React.ReactNode;
  /** Ab welcher Breite das Menü entfällt (vollständige Tailwind-Klasse, z. B. 'md:hidden') */
  hideFrom?: 'xl:hidden' | 'md:hidden';
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);
  useEffect(() => {
    const close = (e: Event) => {
      const d = ref.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent) {
        if (e.key !== 'Escape') return;
        d.open = false;
        d.querySelector('summary')?.focus();
        return;
      }
      if (!d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, []);
  return (
    <details ref={ref} className={`group relative ${hideFrom}`}>
      <summary className="btn btn-sm list-none px-2.5" aria-label={label}>
        <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden>
          <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </summary>
      <nav
        className="hud frame-lite absolute right-0 top-full z-50 mt-3 flex min-w-52 flex-col gap-1 p-2 pt-5 [&_.btn]:w-full [&_.btn]:justify-start [&_form]:w-full"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a') && ref.current) ref.current.open = false;
        }}
      >
        <span aria-hidden className="plate plate-sm plate-head left-auto right-3">
          {label}
        </span>
        {children}
        {extra}
      </nav>
    </details>
  );
}
