/**
 * Englische Muster für die Engine-Meldungen der Regelmodul-Schnittstelle (NTH2 3.3).
 * Eingebunden in EN_PATTERNS (engine.ts).
 */
export const MODULE_PATTERNS: [string, string][] = [
  ['Diese Aktion gibt es im Regelmodul {0} nicht', 'This action does not exist in the rules module {0}'],
  ['Das Regelmodul {0} kennt keine Ereignisse', 'The rules module {0} has no events'],
  ['Das Regelmodul {0} hat keine eigenen Aktionen', 'The rules module {0} has no actions of its own'],
  ['Unbekannte Angriffsart', 'Unknown attack type'],
  ['Unbekanntes Regelmodul „{0}“', 'Unknown rules module “{0}”'],
];
