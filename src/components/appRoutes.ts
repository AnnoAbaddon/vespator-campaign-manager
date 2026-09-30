/**
 * Ein-Bildschirm-Apps (N0): Admin-Cockpit, Leseansicht und Spielerseite (mit allen Unterseiten), Hall of Fame,
 * Zeitraffer und Präsentation
 * füllen genau den Bildschirm. Dort entfällt der globale Seitenfuß; die Nachweise stehen stattdessen
 * in der App-Shell (CreditsLink).
 */
export function isAppRoute(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '');
  // Leseansicht und Spielerseite samt Unterseiten (Terminal-Rahmen), Hall of Fame
  return /^\/admin\/c\/[^/]+(\/zeitraffer|\/codex)?$/.test(p) || /^\/(v|p)\/[^/]+(\/.*)?$/.test(p) || /^\/hall\/[^/]+$/.test(p);
}

/** Eigenständige Anmeldeseiten (Login, Ersteinrichtung, Einladung) – ebenfalls ohne globalen Seitenfuß */
export function isAuthRoute(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '');
  return p === '/login' || p === '/setup-admin' || /^\/einladung\/[^/]+$/.test(p);
}

/**
 * Verwaltungsseiten in der Terminal-Hülle (Kampagnenliste, Konto, FAQ, Druck- und Linkseiten) und die
 * Nachweise: ebenfalls ein Bildschirm mit eigenem Nachweis-Hinweis – ohne globalen Seitenfuß.
 */
export function isShellRoute(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '');
  // P1: Club-Kalender (NTH2 2.5) und Einmal-Link zum Bestätigen (NTH2 1.5)
  if (p === '/admin/kalender' || /^\/bestaetigen\//.test(p)) return true;
  // P2: QR-Karten der Spieler (NTH2 1.4) und Sprung aus dem QR-Code des Ergebnisbogens (NTH2 1.3)
  if (/^\/admin\/c\/[^/]+\/player-cards$/.test(p) || /^\/meldung\/[^/]+\/[^/]+$/.test(p)) return true;
  // P3: Liga (NTH2 3.1) samt Ruhmeshalle je Saison, Betrieb (NTH2 6.2/6.4/7.2), Druckbogen der Order of Battle (NTH2 3.2)
  if (p === '/admin/liga' || p === '/admin/betrieb' || /^\/liga\/[^/]+$/.test(p) || /^\/admin\/c\/[^/]+\/crusade\/[^/]+$/.test(p)) return true;
  return p === '/admin' || p === '/admin/settings' || p === '/admin/faq' || p === '/admin/hilfe' || p === '/credits' || p === '/datenschutz' || p === '/impressum' || /^\/admin\/c\/[^/]+\/(player-links|print|sheets\/[^/]+|briefing\/[^/]+)$/.test(p);
}
