/**
 * Englische Muster für die Meldungen des Blocks P1 (Spieltische, Einmal-Links, Discord-Bot, Web-Push).
 * Eingebunden in EN_PATTERNS (engine.ts); server-seitige Fehlermeldungen laufen ebenfalls über msg().
 */
export const P1_PATTERNS: [string, string][] = [
  // Spieltisch (NTH2 2.5)
  ['Einen Spieltisch gibt es nur für offene Schlachten', 'A game table can only be set for open battles'],
  ['Nur Teilnehmer der Schlacht können den Spieltisch wählen', 'Only participants of the battle can choose the game table'],
  ['Kein Spieltisch eingetragen', 'No game table assigned'],
  ['Ungültiger Spieltisch', 'Invalid game table'],
  ['Spieltisch für {0} freigegeben', 'Game table for {0} released'],
  ['Spieltisch für {0}: {1}', 'Game table for {0}: {1}'],
  ['Unbekannter Spieltisch', 'Unknown game table'],
  ['{0} ist zu dieser Zeit belegt: {1}', '{0} is taken at that time: {1}'],
  // Einmal-Link (NTH2 1.5)
  ['Dieser Link ist ungültig.', 'This link is invalid.'],
  ['Dieser Link ist abgelaufen.', 'This link has expired.'],
  ['Dieser Link wurde bereits benutzt.', 'This link has already been used.'],
  ['Das Ergebnis wurde inzwischen geändert oder schon entschieden – dieser Link gilt nicht mehr.', 'The result has changed or has been decided since, so this link is no longer valid.'],
  // Web-Push (NTH2 1.1)
  ['Ungültiges Push-Abonnement', 'Invalid push subscription'],
  ['Push-Dienst {0}', 'Push service {0}'],
  ['Push-Abonnement abgelaufen – entfernt', 'Push subscription expired and was removed'],
  ['Push-Abonnement nicht mehr vorhanden – übersprungen', 'Push subscription no longer exists, skipped'],
  // Eingabeprüfung der Commands (Speicherschutz) und Push-Probe
  ['Ungültiges Bild', 'Invalid image'],
  ['Ungültige Benachrichtigungseinstellung', 'Invalid notification setting'],
  ['Ungültige Aktion', 'Invalid action'],
  ['Die Eingabe ist zu groß', 'The input is too large'],
  ['Text ist zu lang (höchstens {0} Zeichen)', 'Text is too long (at most {0} characters)'],
  ['Zu viele Einträge', 'Too many entries'],
  ['Der Push-Dienst hat die Nachricht nicht angenommen', 'The push service did not accept the message'],
  ['Push-Dienst nicht erreichbar', 'Push service not reachable'],
];
