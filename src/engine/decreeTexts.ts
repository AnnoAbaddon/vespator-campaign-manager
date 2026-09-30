/**
 * Textbausteine des Dekret-Baukastens (NTH2 4.1): Lückentexte je Tonfall, Sprache und Baustein-Art.
 * Platzhalter in geschweiften Klammern werden aus den Fakten der Engine gefüllt (siehe SLOT_VARS in decree.ts).
 * Varianten ohne die gerade leeren Platzhalter werden bevorzugt (z. B. Ereignis ohne Allianz).
 */

export type DecreeTone = 'PROCLAMATION' | 'COMMISSAR' | 'CHRONICLER';
import { DECREE_HEADINGS_INTL, DECREE_TEXTS_INTL, DECREE_WORDS_INTL } from './decreeTextsIntl';

export type DecreeLang = 'de' | 'en' | 'fr' | 'es' | 'pl';
export const DECREE_LANGS: DecreeLang[] = ['de', 'en', 'fr', 'es', 'pl'];
export type DecreeSlot =
  | 'TITLE'
  | 'INTRO'
  | 'BATTLE_WIN'
  | 'BATTLE_DRAW'
  | 'BATTLE_UNPLAYED'
  | 'PL_GAIN'
  | 'PL_LOSS'
  | 'EVENT'
  | 'OBJECTIVE_MET'
  | 'OBJECTIVE_FAILED'
  | 'HONOR'
  | 'MEDAL'
  | 'POINTS'
  | 'STANDINGS_FOG'
  | 'LEADER'
  | 'QUIET'
  | 'OUTRO';

export type Texts = Record<DecreeSlot, string[]>;
export type DecreeHeadings = Record<'battles' | 'front' | 'events' | 'objectives' | 'honors' | 'standing', string>;
export interface DecreeWords {
  vp: string;
  noVp: string;
  and: string;
  tendency: Record<'LEAD_CLEAR' | 'LEAD' | 'EVEN' | 'BEHIND' | 'BEHIND_CLEAR', string>;
}

const DE_PROCLAMATION: Texts = {
  TITLE: ['Proklamation zur {phase}. Phase des Feldzugs', 'Imperiale Proklamation: {campaign}, Phase {phase}', 'Kund und zu wissen: Phase {phase} ist vollbracht'],
  INTRO: [
    'Im Namen des Warmasters und mit dem Segen des Goldenen Throns wird allen Streitkräften von {campaign} verkündet, was sich in Phase {phase} von {phaseCount} zugetragen hat.',
    'Höret, Diener des Imperiums! Die {phase}. Phase des Feldzugs {campaign} ist beendet, und ihre Taten werden hiermit in die Annalen eingetragen.',
    'Der Warmaster verkündet den Ausgang der {phase}. Phase. Möge jeder Kommandant daraus lernen, was Pflicht und Opfer vermögen.',
  ],
  BATTLE_WIN: [
    'Auf {planet} brach {winner} den Widerstand von {loser} ({vp}).',
    'Die Streiter von {winner} errangen auf {planet} den Sieg über {loser} ({vp}).',
    '{planet} sah {winner} triumphieren; {loser} musste weichen ({vp}).',
    'Durch die Hand von {winnerPlayers} siegte {winner} auf {planet} über {loser} ({vp}).',
  ],
  BATTLE_DRAW: ['Auf {planet} rangen {attacker} und {defender} bis zur Erschöpfung, ohne dass einer obsiegte ({vp}).', 'Die Schlacht um {planet} zwischen {attacker} und {defender} blieb unentschieden ({vp}).'],
  BATTLE_UNPLAYED: ['Auf {planet} kam es zu keinem Waffengang; der Sieg wurde {winner} zugesprochen.', 'Ohne Kampf fiel die Entscheidung über {planet} zugunsten von {winner}.'],
  PL_GAIN: ['{alliance} festigt ihren Griff um {planet} (Power Level {from} → {to}).', 'Die Macht von {alliance} auf {planet} wächst (Power Level {from} → {to}).'],
  PL_LOSS: ['{alliance} verliert an Boden auf {planet} (Power Level {from} → {to}).', 'Der Einfluss von {alliance} auf {planet} schwindet (Power Level {from} → {to}).'],
  EVENT: ['Ein Zeichen erschüttert die Front: {event}.', 'Die Chroniken verzeichnen {event}, betreffend {alliance}.', 'Das Schicksal wandte sich: {event} traf {alliance}.'],
  OBJECTIVE_MET: ['Das Sonderziel „{objective}“ wurde von {alliances} erfüllt.', '{alliances} vollbrachte, was der Warmaster verlangte: „{objective}“.'],
  OBJECTIVE_FAILED: ['Das Sonderziel „{objective}“ blieb unerfüllt.', 'Niemand vermochte „{objective}“ zu vollbringen.'],
  HONOR: ['{player} wird die Ehrung „{honor}“ zuteil.', 'Für Tapferkeit vor dem Feind erhält {player} die Ehrung „{honor}“.'],
  MEDAL: ['{medal} wird {alliance} verliehen.', 'Die Auszeichnung {medal} gebührt {alliance}.'],
  POINTS: ['Stand der Kampagnenpunkte: {standings}.', 'Die Waagschale des Krieges zeigt: {standings}.'],
  STANDINGS_FOG: ['Die Lage an der Front: {standings}.', 'Nach dem Willen des Warmasters bleibt der genaue Stand verborgen; es gilt: {standings}.'],
  LEADER: ['{leader} führt die Front an.', 'An der Spitze steht {leader}.'],
  QUIET: ['In dieser Phase schwiegen die Waffen.', 'Keine Schlacht wurde in dieser Phase geschlagen.'],
  OUTRO: ['Pflicht vor Ruhm.', 'Ave Imperator. Möge die nächste Phase noch größeren Ruhm bringen.', 'So verkündet, so verzeichnet. Pflicht vor Ruhm.'],
};

const DE_COMMISSAR: Texts = {
  TITLE: ['Frontbericht Phase {phase}', 'Kommissariat: Lagemeldung Phase {phase}', 'Frontbericht {campaign} – Phase {phase}'],
  INTRO: [
    'Lagemeldung für Phase {phase} von {phaseCount}. Kurz und ohne Beschönigung.',
    'An alle Einheiten: Bericht zur Phase {phase}. Lesen, verstehen, handeln.',
    'Das Kommissariat meldet: Phase {phase} abgeschlossen. Ergebnisse folgen.',
  ],
  BATTLE_WIN: ['{planet}: {winner} schlägt {loser} ({vp}).', '{planet} – Sieg für {winner}, {loser} geschlagen ({vp}).', '{planet}: {winnerPlayers} ({winner}) behaupten sich gegen {loser} ({vp}).'],
  BATTLE_DRAW: ['{planet}: Patt zwischen {attacker} und {defender} ({vp}).', '{planet} – keine Entscheidung, {attacker} gegen {defender} ({vp}).'],
  BATTLE_UNPLAYED: ['{planet}: nicht gekämpft. Gewertet für {winner}.', '{planet} – kampflos an {winner}. Unentschuldbar.'],
  PL_GAIN: ['{planet}: {alliance} rückt vor (PL {from} → {to}).', '{alliance} gewinnt Boden auf {planet} (PL {from} → {to}).'],
  PL_LOSS: ['{planet}: {alliance} weicht (PL {from} → {to}).', '{alliance} verliert Boden auf {planet} (PL {from} → {to}). Das wird Folgen haben.'],
  EVENT: ['Ereignis: {event}.', 'Ereignis: {event} – betrifft {alliance}.'],
  OBJECTIVE_MET: ['Sonderziel „{objective}“: erfüllt durch {alliances}.', 'Befehl „{objective}“ ausgeführt – {alliances}.'],
  OBJECTIVE_FAILED: ['Sonderziel „{objective}“: verfehlt.', 'Befehl „{objective}“ nicht ausgeführt. Enttäuschend.'],
  HONOR: ['Belobigung: {player} – „{honor}“.', '{player} ausgezeichnet: „{honor}“.'],
  MEDAL: ['{medal}: {alliance}.', 'Auszeichnung {medal} an {alliance}.'],
  POINTS: ['Punktestand: {standings}.', 'Stand: {standings}.'],
  STANDINGS_FOG: ['Lage: {standings}.', 'Genaue Zahlen unter Verschluss. Lage: {standings}.'],
  LEADER: ['Führend: {leader}.', '{leader} vorn. Die anderen: aufschließen.'],
  QUIET: ['Keine Gefechte gemeldet.', 'Keine Schlachten. Untätigkeit wird notiert.'],
  OUTRO: ['Weitermachen.', 'Für den Imperator. Wer zögert, wird ersetzt.', 'Ende der Meldung.'],
};

const DE_CHRONICLER: Texts = {
  TITLE: ['Aus der Chronik: Phase {phase}', 'Chronik des Feldzugs {campaign}, Phase {phase}', 'Die Chronik verzeichnet Phase {phase}'],
  INTRO: [
    'So ward es aufgezeichnet in den Tagen der {phase}. Phase, als die Front von {campaign} erneut in Bewegung geriet.',
    'Der Chronist schreibt nieder, was in der {phase}. Phase geschah, auf dass es nicht vergessen werde.',
    'Es war die {phase}. von {phaseCount} Phasen, und die Sterne über {campaign} brannten.',
  ],
  BATTLE_WIN: [
    'Bei {planet} maßen sich {winner} und {loser}; am Ende behielt {winner} das Feld ({vp}).',
    'Auf {planet} fiel die Entscheidung zugunsten von {winner}, und {loser} zog sich zurück ({vp}).',
    'Man erzählt, dass {winnerPlayers} auf {planet} {winner} zum Sieg über {loser} führten ({vp}).',
  ],
  BATTLE_DRAW: [
    'Bei {planet} standen {attacker} und {defender} einander gegenüber, doch keiner vermochte den anderen zu bezwingen ({vp}).',
    'Auf {planet} endete der Kampf zwischen {attacker} und {defender} ohne Sieger ({vp}).',
  ],
  BATTLE_UNPLAYED: ['Um {planet} wurde nicht gekämpft; die Chronik verzeichnet den Sieg von {winner}.', 'Die Waffen blieben bei {planet} stumm, und {winner} gewann ohne Schlacht.'],
  PL_GAIN: ['Auf {planet} wuchs die Macht von {alliance} (Power Level {from} → {to}).', '{alliance} gewann Einfluss auf {planet} (Power Level {from} → {to}).'],
  PL_LOSS: ['Auf {planet} sank der Stern von {alliance} (Power Level {from} → {to}).', '{alliance} verlor Einfluss auf {planet} (Power Level {from} → {to}).'],
  EVENT: ['In jenen Tagen geschah {event}.', 'Die Chronik verzeichnet {event}, das {alliance} betraf.'],
  OBJECTIVE_MET: ['Das Ziel „{objective}“ erfüllte sich durch {alliances}.', '{alliances} vollbrachte das Ziel „{objective}“.'],
  OBJECTIVE_FAILED: ['Das Ziel „{objective}“ blieb unerreicht.', 'Niemand erfüllte „{objective}“.'],
  HONOR: ['{player} erwarb in dieser Zeit die Ehrung „{honor}“.', 'Der Name {player} wurde mit „{honor}“ geehrt.'],
  MEDAL: ['{alliance} erhielt {medal}.', 'Die Ehre von {medal} fiel an {alliance}.'],
  POINTS: ['Am Ende der Phase stand es: {standings}.', 'Die Zählung ergab: {standings}.'],
  STANDINGS_FOG: ['Wie es um die Front stand, wussten nur wenige: {standings}.', 'Die Lage am Ende der Phase: {standings}.'],
  LEADER: ['{leader} lag in Führung.', 'Vorn lag {leader}.'],
  QUIET: ['Es war eine stille Phase; keine Schlacht wurde verzeichnet.', 'Die Chronik schweigt über Schlachten in dieser Phase.'],
  OUTRO: ['Hier endet der Eintrag des Chronisten.', 'Was folgte, erzählt die nächste Seite der Chronik.', 'So endete die Phase, und die Front wartete.'],
};

const EN_PROCLAMATION: Texts = {
  TITLE: ['Proclamation on phase {phase} of the campaign', 'Imperial Proclamation: {campaign}, phase {phase}', 'Let it be known: phase {phase} is complete'],
  INTRO: [
    'In the name of the Warmaster and with the blessing of the Golden Throne, all forces of {campaign} are hereby told what came to pass in phase {phase} of {phaseCount}.',
    'Hear this, servants of the Imperium! Phase {phase} of the {campaign} campaign has ended, and its deeds are hereby entered into the annals.',
    'The Warmaster proclaims the outcome of phase {phase}. May every commander learn from it what duty and sacrifice can achieve.',
  ],
  BATTLE_WIN: [
    'On {planet}, {winner} broke the resistance of {loser} ({vp}).',
    'The warriors of {winner} won victory over {loser} on {planet} ({vp}).',
    '{planet} saw {winner} triumph; {loser} was forced to yield ({vp}).',
    'By the hand of {winnerPlayers}, {winner} prevailed over {loser} on {planet} ({vp}).',
  ],
  BATTLE_DRAW: ['On {planet}, {attacker} and {defender} fought to exhaustion without either prevailing ({vp}).', 'The battle for {planet} between {attacker} and {defender} remained undecided ({vp}).'],
  BATTLE_UNPLAYED: ['No battle was fought on {planet}; victory was awarded to {winner}.', 'Without a fight, {planet} was decided in favour of {winner}.'],
  PL_GAIN: ['{alliance} tightens its grip on {planet} (Power Level {from} → {to}).', 'The might of {alliance} on {planet} grows (Power Level {from} → {to}).'],
  PL_LOSS: ['{alliance} loses ground on {planet} (Power Level {from} → {to}).', 'The influence of {alliance} on {planet} wanes (Power Level {from} → {to}).'],
  EVENT: ['An omen shakes the front: {event}.', 'The chronicles record {event}, concerning {alliance}.', 'Fate turned: {event} struck {alliance}.'],
  OBJECTIVE_MET: ['The special objective “{objective}” was fulfilled by {alliances}.', '{alliances} achieved what the Warmaster demanded: “{objective}”.'],
  OBJECTIVE_FAILED: ['The special objective “{objective}” remained unfulfilled.', 'None could accomplish “{objective}”.'],
  HONOR: ['{player} is granted the honour “{honor}”.', 'For valour before the foe, {player} receives the honour “{honor}”.'],
  MEDAL: ['{medal} is awarded to {alliance}.', 'The distinction {medal} belongs to {alliance}.'],
  POINTS: ['Campaign points: {standings}.', 'The scales of war show: {standings}.'],
  STANDINGS_FOG: ['The state of the front: {standings}.', 'By the Warmaster’s will the exact standing remains hidden; it reads: {standings}.'],
  LEADER: ['{leader} leads the front.', 'At the head stands {leader}.'],
  QUIET: ['In this phase the guns fell silent.', 'No battle was fought in this phase.'],
  OUTRO: ['Duty before glory.', 'Ave Imperator. May the next phase bring even greater glory.', 'So proclaimed, so recorded. Duty before glory.'],
};

const EN_COMMISSAR: Texts = {
  TITLE: ['Front report phase {phase}', 'Commissariat: situation report phase {phase}', 'Front report {campaign} – phase {phase}'],
  INTRO: [
    'Situation report for phase {phase} of {phaseCount}. Brief and without embellishment.',
    'To all units: report on phase {phase}. Read, understand, act.',
    'The Commissariat reports: phase {phase} complete. Results follow.',
  ],
  BATTLE_WIN: ['{planet}: {winner} beats {loser} ({vp}).', '{planet} – victory for {winner}, {loser} defeated ({vp}).', '{planet}: {winnerPlayers} ({winner}) held against {loser} ({vp}).'],
  BATTLE_DRAW: ['{planet}: stalemate between {attacker} and {defender} ({vp}).', '{planet} – no decision, {attacker} against {defender} ({vp}).'],
  BATTLE_UNPLAYED: ['{planet}: not fought. Scored for {winner}.', '{planet} – awarded to {winner} without a fight. Inexcusable.'],
  PL_GAIN: ['{planet}: {alliance} advances (PL {from} → {to}).', '{alliance} gains ground on {planet} (PL {from} → {to}).'],
  PL_LOSS: ['{planet}: {alliance} falls back (PL {from} → {to}).', '{alliance} loses ground on {planet} (PL {from} → {to}). There will be consequences.'],
  EVENT: ['Event: {event}.', 'Event: {event} – concerns {alliance}.'],
  OBJECTIVE_MET: ['Special objective “{objective}”: achieved by {alliances}.', 'Order “{objective}” carried out – {alliances}.'],
  OBJECTIVE_FAILED: ['Special objective “{objective}”: missed.', 'Order “{objective}” not carried out. Disappointing.'],
  HONOR: ['Commendation: {player} – “{honor}”.', '{player} decorated: “{honor}”.'],
  MEDAL: ['{medal}: {alliance}.', 'Distinction {medal} to {alliance}.'],
  POINTS: ['Score: {standings}.', 'Standing: {standings}.'],
  STANDINGS_FOG: ['Situation: {standings}.', 'Exact figures classified. Situation: {standings}.'],
  LEADER: ['Leading: {leader}.', '{leader} ahead. The rest: close the gap.'],
  QUIET: ['No engagements reported.', 'No battles. Inactivity has been noted.'],
  OUTRO: ['Carry on.', 'For the Emperor. Whoever hesitates will be replaced.', 'End of report.'],
};

const EN_CHRONICLER: Texts = {
  TITLE: ['From the chronicle: phase {phase}', 'Chronicle of the {campaign} campaign, phase {phase}', 'The chronicle records phase {phase}'],
  INTRO: [
    'Thus it was written in the days of phase {phase}, when the front of {campaign} was set in motion once more.',
    'The chronicler sets down what happened in phase {phase}, lest it be forgotten.',
    'It was phase {phase} of {phaseCount}, and the stars above {campaign} were burning.',
  ],
  BATTLE_WIN: [
    'At {planet}, {winner} and {loser} took each other’s measure; in the end {winner} held the field ({vp}).',
    'On {planet} the decision fell in favour of {winner}, and {loser} withdrew ({vp}).',
    'It is told that {winnerPlayers} led {winner} to victory over {loser} on {planet} ({vp}).',
  ],
  BATTLE_DRAW: ['At {planet}, {attacker} and {defender} faced each other, yet neither could overcome the other ({vp}).', 'On {planet} the fight between {attacker} and {defender} ended without a victor ({vp}).'],
  BATTLE_UNPLAYED: ['No one fought for {planet}; the chronicle records the victory of {winner}.', 'The guns at {planet} stayed silent, and {winner} won without a battle.'],
  PL_GAIN: ['On {planet} the power of {alliance} grew (Power Level {from} → {to}).', '{alliance} gained influence on {planet} (Power Level {from} → {to}).'],
  PL_LOSS: ['On {planet} the star of {alliance} sank (Power Level {from} → {to}).', '{alliance} lost influence on {planet} (Power Level {from} → {to}).'],
  EVENT: ['In those days came {event}.', 'The chronicle records {event}, which concerned {alliance}.'],
  OBJECTIVE_MET: ['The objective “{objective}” was fulfilled by {alliances}.', '{alliances} accomplished the objective “{objective}”.'],
  OBJECTIVE_FAILED: ['The objective “{objective}” remained out of reach.', 'No one fulfilled “{objective}”.'],
  HONOR: ['In this time {player} earned the honour “{honor}”.', 'The name {player} was honoured with “{honor}”.'],
  MEDAL: ['{alliance} received {medal}.', 'The honour of {medal} fell to {alliance}.'],
  POINTS: ['At the end of the phase the count stood: {standings}.', 'The tally showed: {standings}.'],
  STANDINGS_FOG: ['Few knew how the front truly stood: {standings}.', 'The situation at the end of the phase: {standings}.'],
  LEADER: ['{leader} was in the lead.', 'Ahead lay {leader}.'],
  QUIET: ['It was a quiet phase; no battle was recorded.', 'The chronicle is silent about battles in this phase.'],
  OUTRO: ['Here ends the chronicler’s entry.', 'What followed is told on the next page of the chronicle.', 'So the phase ended, and the front waited.'],
};

export const DECREE_TEXTS: Record<DecreeTone, Record<DecreeLang, Texts>> = {
  PROCLAMATION: { de: DE_PROCLAMATION, en: EN_PROCLAMATION, ...DECREE_TEXTS_INTL.PROCLAMATION },
  COMMISSAR: { de: DE_COMMISSAR, en: EN_COMMISSAR, ...DECREE_TEXTS_INTL.COMMISSAR },
  CHRONICLER: { de: DE_CHRONICLER, en: EN_CHRONICLER, ...DECREE_TEXTS_INTL.CHRONICLER },
};

/** Abschnittsüberschriften des Entwurfs je Sprache */
export const DECREE_HEADINGS: Record<DecreeLang, DecreeHeadings> = {
  ...DECREE_HEADINGS_INTL,
  de: { battles: 'Schlachten', front: 'Frontverlauf', events: 'Ereignisse', objectives: 'Sonderziele', honors: 'Ehrungen und Medaillen', standing: 'Stand der Front' },
  en: { battles: 'Battles', front: 'Front line', events: 'Events', objectives: 'Special objectives', honors: 'Honours and medals', standing: 'State of the front' },
};

/** Kleine Wörter, die in den Fakten stecken (Siegpunkte, Tendenzen, Aufzählung) */
export const DECREE_WORDS: Record<DecreeLang, DecreeWords> = {
  ...DECREE_WORDS_INTL,
  de: { vp: 'VP', noVp: 'ohne Siegpunkte', and: 'und', tendency: { LEAD_CLEAR: 'deutlich vorn', LEAD: 'knapp vorn', EVEN: 'gleichauf', BEHIND: 'knapp dahinter', BEHIND_CLEAR: 'deutlich zurück' } },
  en: { vp: 'VP', noVp: 'no VP recorded', and: 'and', tendency: { LEAD_CLEAR: 'clearly ahead', LEAD: 'narrowly ahead', EVEN: 'level', BEHIND: 'narrowly behind', BEHIND_CLEAR: 'clearly behind' } },
};
