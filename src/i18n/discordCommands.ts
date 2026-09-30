/**
 * Slash-Befehle des Discord-Bots (NTH2 1.2) mit Lokalisierung je Sprache. Die Grundnamen sind deutsch; Discord zeigt
 * Clients in Englisch, Französisch, Spanisch und Polnisch die lokalisierten Namen und schickt in Interactions immer
 * den Grundnamen. Texte, die auf einen Befehl verweisen („→ /bestätigen“), nehmen den Namen aus derselben Tabelle –
 * so passen Hinweis und tatsächlicher Befehl im Discord-Client zusammen. Reine Daten, auch im Browser nutzbar.
 */
import type { Locale } from './core';

export type DiscordCmd = 'lage' | 'aufgaben' | 'termin' | 'annehmen' | 'bestätigen' | 'verknüpfen' | 'trennen' | 'code';

/** Befehlsnamen je Sprache (Discord: klein geschrieben, ohne Leerzeichen, höchstens 32 Zeichen) */
export const DISCORD_CMD_NAMES: Record<Locale, Record<DiscordCmd, string>> = {
  de: { lage: 'lage', aufgaben: 'aufgaben', termin: 'termin', annehmen: 'annehmen', bestätigen: 'bestätigen', verknüpfen: 'verknüpfen', trennen: 'trennen', code: 'code' },
  en: { lage: 'situation', aufgaben: 'tasks', termin: 'schedule', annehmen: 'accept', bestätigen: 'confirm', verknüpfen: 'link', trennen: 'unlink', code: 'code' },
  fr: { lage: 'situation', aufgaben: 'tâches', termin: 'rendez-vous', annehmen: 'accepter', bestätigen: 'confirmer', verknüpfen: 'lier', trennen: 'délier', code: 'code' },
  es: { lage: 'situación', aufgaben: 'tareas', termin: 'cita', annehmen: 'aceptar', bestätigen: 'confirmar', verknüpfen: 'vincular', trennen: 'desvincular', code: 'código' },
  pl: { lage: 'sytuacja', aufgaben: 'zadania', termin: 'termin', annehmen: 'przyjmij', bestätigen: 'potwierdź', verknüpfen: 'połącz', trennen: 'rozłącz', code: 'kod' },
};

/** Beschreibungen je Sprache (Discord: höchstens 100 Zeichen) */
const DESCRIPTIONS: Record<Locale, Record<DiscordCmd, string>> = {
  de: {
    lage: 'Punkte, Phase und Schritt deiner Kampagne',
    aufgaben: 'Deine offenen Aufgaben',
    termin: 'Terminabsprache für deine Schlachten',
    annehmen: 'Einen Terminvorschlag der Gegenseite annehmen',
    bestätigen: 'Ein gemeldetes Ergebnis bestätigen',
    verknüpfen: 'Discord mit deinem Spieler verknüpfen (Code von der Spielerseite)',
    trennen: 'Verknüpfung mit deinem Spieler lösen',
    code: 'Einmal-Code von deiner Spielerseite',
  },
  en: {
    lage: 'Points, phase and step of your campaign',
    aufgaben: 'Your open tasks',
    termin: 'Scheduling for your battles',
    annehmen: 'Accept a time proposed by the other side',
    bestätigen: 'Confirm a reported result',
    verknüpfen: 'Link Discord to your player (code from the player page)',
    trennen: 'Remove the link to your player',
    code: 'One-time code from your player page',
  },
  fr: {
    lage: 'Points, phase et étape de ta campagne',
    aufgaben: 'Tes tâches en attente',
    termin: 'Planification de tes batailles',
    annehmen: 'Accepter un horaire proposé par le camp adverse',
    bestätigen: 'Confirmer un résultat déclaré',
    verknüpfen: 'Lier Discord à ton joueur (code de la page joueur)',
    trennen: 'Supprimer le lien avec ton joueur',
    code: 'Code à usage unique de ta page joueur',
  },
  es: {
    lage: 'Puntos, fase y paso de tu campaña',
    aufgaben: 'Tus tareas pendientes',
    termin: 'Planificación de tus batallas',
    annehmen: 'Aceptar una fecha propuesta por el bando contrario',
    bestätigen: 'Confirmar un resultado comunicado',
    verknüpfen: 'Vincular Discord con tu jugador (código de la página de jugador)',
    trennen: 'Eliminar el vínculo con tu jugador',
    code: 'Código de un solo uso de tu página de jugador',
  },
  pl: {
    lage: 'Punkty, faza i krok twojej kampanii',
    aufgaben: 'Twoje otwarte zadania',
    termin: 'Ustalanie terminów twoich bitew',
    annehmen: 'Przyjmij termin zaproponowany przez przeciwnika',
    bestätigen: 'Potwierdź zgłoszony wynik',
    verknüpfen: 'Połącz Discord ze swoim graczem (kod ze strony gracza)',
    trennen: 'Usuń połączenie z twoim graczem',
    code: 'Jednorazowy kod ze strony gracza',
  },
};

/** Discord-Sprachkennungen je Sprache der App (Deutsch ist der Grundname) */
const DISCORD_LOCALES: Record<Exclude<Locale, 'de'>, string[]> = { en: ['en-US', 'en-GB'], fr: ['fr'], es: ['es-ES', 'es-419'], pl: ['pl'] };

const localized = (table: Record<Locale, Record<DiscordCmd, string>>, cmd: DiscordCmd) =>
  Object.fromEntries((Object.entries(DISCORD_LOCALES) as [Exclude<Locale, 'de'>, string[]][]).flatMap(([l, ids]) => ids.map((id) => [id, table[l][cmd]])));

const entry = (cmd: DiscordCmd) => ({ name: cmd, name_localizations: localized(DISCORD_CMD_NAMES, cmd), description: DESCRIPTIONS.de[cmd], description_localizations: localized(DESCRIPTIONS, cmd) });

/** Befehl oder Option im Format der Discord-API */
export interface DiscordCommandDef {
  name: string;
  name_localizations: Record<string, string>;
  description: string;
  description_localizations: Record<string, string>;
  type: number;
  required?: boolean;
  max_length?: number;
  options?: DiscordCommandDef[];
}

/** Slash-Befehle für die Anmeldung bei Discord (globale Befehle der Anwendung) */
export const DISCORD_COMMANDS: DiscordCommandDef[] = [
  { ...entry('lage'), type: 1 },
  { ...entry('aufgaben'), type: 1 },
  { ...entry('termin'), type: 1, options: [{ ...entry('annehmen'), type: 1 }] },
  { ...entry('bestätigen'), type: 1 },
  { ...entry('verknüpfen'), type: 1, options: [{ ...entry('code'), type: 3, required: true, max_length: 20 }] },
  { ...entry('trennen'), type: 1 },
];

/**
 * Sprache der Befehlsnamen, die ein Discord-Client sieht (Interaction-Feld `locale`, z. B. „en-US“, „es-419“).
 * Clients ohne Lokalisierung sehen die deutschen Grundnamen; ohne Angabe: null.
 */
export function discordCmdLocale(discordLocale: string | null | undefined): Locale | null {
  if (!discordLocale) return null;
  for (const [l, ids] of Object.entries(DISCORD_LOCALES) as [Locale, string[]][]) if (ids.includes(discordLocale)) return l;
  return 'de';
}

/** Befehl mit Schrägstrich in der Sprache des Clients, z. B. „/termin annehmen“ oder „/schedule accept“ */
export function discordCmd(l: Locale, ...path: DiscordCmd[]): string {
  return '/' + path.map((c) => DISCORD_CMD_NAMES[l][c]).join(' ');
}

/** Die Befehle für Spieler als Aufzählung (Hinweistexte) */
export const discordPlayerCmds = (l: Locale) => [discordCmd(l, 'lage'), discordCmd(l, 'aufgaben'), discordCmd(l, 'termin', 'annehmen'), discordCmd(l, 'bestätigen')].join(', ');

/** Sprache aus der Discord-Kennung für Texte (nur die ersten Buchstaben, z. B. „es-419“ → „es“); null = unbekannt */
export function discordTextLocale(discordLocale: string | null | undefined): Locale | null {
  const l = discordCmdLocale(discordLocale);
  if (!l) return null;
  if (l !== 'de') return l;
  return discordLocale?.toLowerCase().startsWith('de') ? 'de' : null;
}
