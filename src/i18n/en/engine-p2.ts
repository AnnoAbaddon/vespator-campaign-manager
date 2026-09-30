/**
 * Englische Muster für die Engine-Meldungen aus Block P2 (Dekret-Baukasten, Planetenbilder, Galerie und
 * Bild der Phase, Bemal-Chronik). Eingebunden in engine.ts (EN_PATTERNS).
 */
export const P2_PATTERNS: [string, string][] = [
  // 4.1 Dekret-Baukasten
  ['Ungültige Bausteine', 'Invalid text blocks'],
  ['Höchstens {0} eigene Bausteine', 'At most {0} custom text blocks'],
  ['Unbekannte Baustein-Art', 'Unknown text block type'],
  ['Unbekannter Tonfall', 'Unknown tone'],
  ['Unbekannte Sprache', 'Unknown language'],
  ['Ein Baustein ist leer', 'A text block is empty'],
  ['Dekret-Bausteine gespeichert ({0})', 'Decree text blocks saved ({0})'],
  // 4.2 Planetenbilder
  ['Ungültige Bild-ID', 'Invalid image ID'],
  ['Bilder von {0} aktualisiert', 'Images of {0} updated'],
  // 4.3 Galerie und Bild der Phase
  ['Foto nicht gefunden', 'Photo not found'],
  ['Bild der Phase {0} entfernt', 'Picture of phase {0} removed'],
  ['Bild der Phase {0} gewählt', 'Picture of phase {0} chosen'],
  ['Abstimmung über das Bild der Phase eingeschaltet', 'Voting on the picture of the phase switched on'],
  ['Abstimmung über das Bild der Phase ausgeschaltet', 'Voting on the picture of the phase switched off'],
  ['Die Abstimmung über das Bild der Phase ist nicht aktiv', 'Voting on the picture of the phase is not active'],
  ['Diese Phase hat noch nicht begonnen', 'This phase has not started yet'],
  ['Foto gehört nicht zu dieser Phase', 'The photo does not belong to this phase'],
  ['{0} stimmt für ein Bild der Phase {1}', '{0} votes for a picture of phase {1}'],
  ['{0} zieht die Stimme für Phase {1} zurück', '{0} withdraws the vote for phase {1}'],
  // D5 Bemal-Chronik
  ['Einheit fehlt', 'Unit is missing'],
  ['Ungültiges Datum', 'Invalid date'],
  ['Ungültiger Stand', 'Invalid status'],
  ['Punkte 0–5000', 'Points 0–5000'],
  ['Höchstens {0} Einträge je Spieler', 'At most {0} entries per player'],
  ['Bemal-Chronik {0}: {1} ({2} Punkte)', 'Painting chronicle {0}: {1} ({2} points)'],
  ['Eintrag nicht gefunden', 'Entry not found'],
  ['Bemal-Chronik {0}: {1} entfernt', 'Painting chronicle {0}: {1} removed'],
];
