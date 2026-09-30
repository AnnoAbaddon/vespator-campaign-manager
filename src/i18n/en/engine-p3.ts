/**
 * Englische Muster für die Engine-Meldungen des Blocks P3 (Crusade-Anbindung, Planeten-Merkmale,
 * Karten-Generator). Eingebunden in EN_PATTERNS (engine.ts).
 */
export const P3_PATTERNS: [string, string][] = [
  ['Die Crusade-Anbindung ist in dieser Kampagne abgeschaltet', 'The Crusade link is switched off in this campaign'],
  ['{0}: ganze Zahl von {1} bis {2}', '{0}: whole number from {1} to {2}'],
  ['{0} hat keine Order of Battle', '{0} has no Order of Battle'],
  ['Crusade-Anbindung: an (Teilnahme {0} XP, Sieg +{1}, Unentschieden +{2}, Marked for Greatness +{3})', 'Crusade link: on (participation {0} XP, win +{1}, draw +{2}, Marked for Greatness +{3})'],
  ['Crusade-Anbindung: aus', 'Crusade link: off'],
  ['Order of Battle von {0} entfernt', 'Order of Battle of {0} removed'],
  ['Bitte einen Namen für die Order of Battle angeben', 'Please enter a name for the Order of Battle'],
  ['Order of Battle „{0}“ von {1} angelegt', 'Order of Battle “{0}” of {1} created'],
  ['Order of Battle von {0} aktualisiert', 'Order of Battle of {0} updated'],
  ['Bitte einen Namen für die Einheit angeben', 'Please enter a name for the unit'],
  ['Einheit nicht gefunden', 'Unit not found'],
  ['Höchstens 60 Einheiten je Order of Battle', 'At most 60 units per Order of Battle'],
  ['{0}: Einheit „{1}“ aufgenommen', '{0}: unit “{1}” added'],
  ['{0}: Einheit „{1}“ aktualisiert', '{0}: unit “{1}” updated'],
  ['{0}: Einheit „{1}“ entfernt', '{0}: unit “{1}” removed'],
  ['{0} hat an dieser Schlacht nicht teilgenommen', '{0} did not take part in this battle'],
  ['Marked for Greatness muss eine eingesetzte Einheit sein', 'Marked for Greatness must be a deployed unit'],
  ['{0}: {1} Einheit(en) in der Schlacht auf {2} eingesetzt', '{0}: {1} unit(s) deployed in the battle on {2}'],
  ['XP-Korrektur {0}/{1}: {2} ({3})', 'XP correction {0}/{1}: {2} ({3})'],
  ['Höchstens 8 Merkmale je Planet', 'At most 8 traits per planet'],
  ['Planeten-Merkmale {0}: {1}', 'Planet traits {0}: {1}'],
  ['Karten-Generator: keine gültige Karte ({0})', 'Map generator: no valid map ({0})'],
];
