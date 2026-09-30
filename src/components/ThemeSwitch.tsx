'use client';

import { useSyncExternalStore } from 'react';
import { useT } from '@/i18n/client';
import { THEME_KEY, THEMES, type Theme } from './themeCore';

/** Beobachter für Themenwechsel (mehrere Schalter auf einer Seite, z. B. Kopfzeile und Menü) */
const listeners = new Set<() => void>();

function readTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'archiv' ? 'archiv' : 'terminal';
}

/** Wahl merken: localStorage, sonst Cookie (gesperrter Speicher im privaten Fenster) */
function store(t: Theme) {
  try {
    localStorage.setItem(THEME_KEY, t);
    return;
  } catch {
    /* Rückfall unten */
  }
  try {
    document.cookie = `${THEME_KEY}=${t}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  } catch {
    /* dann nur für diese Seite */
  }
}

export function applyTheme(t: Theme) {
  const el = document.documentElement;
  if (t === 'archiv') el.setAttribute('data-theme', 'archiv');
  else el.removeAttribute('data-theme');
  store(t);
  for (const l of listeners) l();
}

const NAMES: Record<Theme, string> = { terminal: 'Terminal', archiv: 'Archiv' };

/**
 * Schalter „Terminal | Archiv“ für Leseansicht und Spielerseite (NTH2 5.3). Das Terminal bleibt Standard;
 * das helle Archiv-Thema ist für Tageslicht gedacht und wird je Leser im Browser gemerkt.
 */
export function ThemeSwitch({ className = '', size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  const t = useT();
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    readTheme,
    () => 'terminal' as Theme,
  );
  return (
    <>
      {/* schmale Kopfzeile (Handy): eine Umschalttaste statt zwei Segmenten */}
      <button
        type="button"
        aria-pressed={theme === 'archiv'}
        title={t('Helles Archiv-Thema für Tageslicht')}
        onClick={() => applyTheme(theme === 'archiv' ? 'terminal' : 'archiv')}
        className={`theme-key touch-44 inset inline-flex min-h-8 shrink-0 items-center rounded-[2px] px-2 font-serif text-[14px] font-semibold sm:hidden ${theme === 'archiv' ? 'text-ink' : 'text-dim'} ${className}`}
      >
        {t('Archiv')}
      </button>
      <span className={`inset hidden shrink-0 p-0.5 sm:inline-flex ${className}`} role="group" aria-label={t('Darstellung')}>
        {THEMES.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === theme}
            title={k === 'archiv' ? t('Helles Archiv-Thema für Tageslicht') : t('Dunkles Kommandoterminal')}
            onClick={() => k !== theme && applyTheme(k)}
            className={`theme-key touch-44 ${size === 'sm' ? 'min-h-8 text-[14px]' : 'min-h-8 text-[15px]'} rounded-[2px] px-2 font-serif font-semibold ${
              k === theme ? 'bg-[#262b28] text-ink shadow-[inset_0_0_0_1px_rgba(179,151,95,0.6)]' : 'text-faint hover:text-dim'
            }`}
          >
            {t(NAMES[k])}
          </button>
        ))}
      </span>
    </>
  );
}
