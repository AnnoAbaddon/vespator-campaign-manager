/**
 * Helles Archiv-Thema (NTH2 5.3): reine Hilfen ohne React, damit Layout-Skript, Schalter und Tests
 * dieselben Regeln nutzen. Das Terminal bleibt der Standard; das Archiv gilt nur für Leseansicht (/v/)
 * und Spielerseite (/p/) und wird je Leser im Browser gemerkt (localStorage, Rückfall Cookie).
 */
export type Theme = 'terminal' | 'archiv';
export const THEMES: Theme[] = ['terminal', 'archiv'];
export const THEME_KEY = 'vf_theme';

/** Nur bekannte Werte; alles andere ist das Terminal */
export const normTheme = (v: unknown): Theme => (v === 'archiv' ? 'archiv' : 'terminal');

/** Gilt das Leser-Thema auf diesem Pfad? (nie in der Verwaltung) */
export const themeApplies = (path: string | null | undefined): boolean => !!path && (path.startsWith('/v/') || path.startsWith('/p/'));

/** Gespeichertes Thema aus einem Cookie-String („vf_theme=archiv; …“) */
export function themeFromCookie(cookie: string | null | undefined): Theme | null {
  const m = /(?:^|;\s*)vf_theme=([^;]+)/.exec(cookie ?? '');
  return m ? normTheme(decodeURIComponent(m[1])) : null;
}

/**
 * Inline-Skript vor der Hydrierung: setzt data-theme am <html>, bevor die Seite gezeichnet wird (kein Aufblitzen).
 * Jeder Zugriff in try/catch – gesperrter Speicher (privates Fenster) lässt das Terminal stehen.
 */
export const THEME_SCRIPT = `(function(){try{var p=location.pathname;if(p.indexOf('/v/')!==0&&p.indexOf('/p/')!==0)return;var t=null;try{t=localStorage.getItem('${THEME_KEY}')}catch(e){}if(!t){var m=/(?:^|;\\s*)${THEME_KEY}=([^;]+)/.exec(document.cookie||'');if(m)t=m[1]}if(t==='archiv')document.documentElement.setAttribute('data-theme','archiv')}catch(e){}})();`;
