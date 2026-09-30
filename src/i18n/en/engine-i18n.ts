/**
 * Englische Muster für Server- und Engine-Meldungen aus dem i18n-Review (Kampagnenübernahme, HEIC, Web-Push,
 * Passwort-Hashing, Zustandsprüfung, Großschlacht). Eingebunden in EN_PATTERNS (engine.ts).
 */
export const I18N_PATTERNS: [string, string][] = [
  // i18n-Review: Server-Meldungen, Etiketten, Großschlacht
  ['{0} Spieler und {1} Medaillen aus „{2}“ übernommen', '{0} players and {1} medals taken over from “{2}”'],
  ['HEIC-Umwandlung hat zu lange gedauert', 'HEIC conversion took too long'],
  ['Nachricht zu groß für Web-Push', 'Message too large for Web Push'],
  ['Ungültiges Trennbyte', 'Invalid delimiter byte'],
  ['Node.js ≥ 24.7 mit crypto.argon2 erforderlich', 'Node.js ≥ 24.7 with crypto.argon2 required'],
  ['(Wurzel): {0}', '(root): {0}'],
  ['Großschlacht', 'Grand Battle'],
  // Schrittnamen als Platzhalter (z. B. „Phase {0}: weiter zu {1}“)
  ['Setup', 'Setup'],
  ['Schlachten', 'Battles'],
  ['Punkte & Events', 'Points & events'],
  ['Infrastruktur bauen', 'Build infrastructure'],
  ['Flotten bewegen', 'Move fleets'],
  ['Ergebnisse verarbeiten', 'Process results'],
  ['Operationen wählen', 'Choose operations'],
  // i18n-Review: neue Server-Texte (Sicherheitskorrekturen)
  ['Bild ist zu groß', 'Image is too large'],
];
