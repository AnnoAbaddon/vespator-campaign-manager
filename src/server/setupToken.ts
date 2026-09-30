import 'server-only';
import crypto from 'node:crypto';
import { db, getSetting, setSetting } from './db';
import { appUrl } from './origin';

/**
 * Einmal-Token für die Ersteinrichtung (ASVS 6.3.2/6.4.1): Ohne Token könnte jeder, der eine frisch gestartete
 * Instanz zuerst erreicht, das Admin-Konto anlegen. Quelle: Umgebungsvariable SETUP_TOKEN (mindestens 16 Zeichen),
 * sonst ein zufälliger Token, der beim Serverstart (solange kein Konto existiert) erzeugt und ins Server-Log
 * geschrieben wird. In der Datenbank steht nur sein SHA-256-Hash; nach der Einrichtung wird er gelöscht.
 */

const KEY = 'setupTokenHash';
export const MIN_ENV_TOKEN = 16;
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const g = globalThis as unknown as { __vfSetupEnvLogged?: boolean };

const noAdmin = () => !db().prepare('SELECT 1 FROM admin LIMIT 1').get();

/** SETUP_TOKEN aus der Umgebung, sofern lang genug */
export function envSetupToken(): string | null {
  const t = process.env.SETUP_TOKEN?.trim();
  return t && t.length >= MIN_ENV_TOKEN ? t : null;
}

/**
 * Stellt sicher, dass es einen Setup-Token gibt, solange kein Konto existiert. `fresh` (Serverstart) erzeugt immer
 * einen neuen Token; sonst nur, wenn noch keiner gespeichert ist (z. B. nachdem das Konto für eine
 * Passwort-Wiederherstellung gelöscht wurde). Liefert den neu erzeugten Klartext-Token (für Tests), sonst null.
 */
export function ensureSetupToken(fresh = false, log: (msg: string) => void = console.log): string | null {
  if (!noAdmin()) {
    clearSetupToken();
    return null;
  }
  if (envSetupToken()) {
    if (!g.__vfSetupEnvLogged) {
      g.__vfSetupEnvLogged = true;
      log(`[Ersteinrichtung] Setup-Token aus SETUP_TOKEN – Formular: ${appUrl()}/setup-admin`);
    }
    return null;
  }
  if (process.env.SETUP_TOKEN?.trim()) log(`[Ersteinrichtung] SETUP_TOKEN ist kürzer als ${MIN_ENV_TOKEN} Zeichen und wird ignoriert`);
  if (!fresh && getSetting(KEY)) return null;
  const token = crypto.randomBytes(24).toString('base64url');
  setSetting(KEY, sha(token));
  log(`[Ersteinrichtung] Einmal-Token: ${token} – ${appUrl()}/setup-admin?token=${token}`);
  return token;
}

/** Prüft einen eingegebenen Setup-Token zeitkonstant; ohne gültige Quelle oder mit bestehendem Konto immer false */
export function checkSetupToken(input: unknown): boolean {
  if (typeof input !== 'string' || !input.trim() || input.length > 200 || !noAdmin()) return false;
  const env = envSetupToken();
  const ref = env ? sha(env) : getSetting(KEY);
  if (!ref || !/^[0-9a-f]{64}$/.test(ref)) return false;
  return crypto.timingSafeEqual(Buffer.from(sha(input.trim()), 'hex'), Buffer.from(ref, 'hex'));
}

export function clearSetupToken() {
  db().prepare('DELETE FROM settings WHERE key = ?').run(KEY);
}
