import 'server-only';
import crypto from 'node:crypto';
import { db } from './db';
import { currentState } from './campaigns';
import { activeTokenHash, runAsPlayer } from './players';
import type { RunResult } from './campaigns';
import type { Battle, CampaignState, Player, ResultDraft } from '@/engine/types';
import { sideOf } from '@/engine/playerActions';

/**
 * Bestätigen per Einmal-Link (NTH2 1.5). Der Link steht in der Benachrichtigung „Ergebnis bestätigen“ und
 * berechtigt nur zu genau einer Aktion: Bestätigen oder Widersprechen dieses Entwurfs durch diesen Spieler.
 * Signiert (HMAC) über Kampagne, Schlacht, Spieler, Stempel des Entwurfs, Ablauf und den gültigen Spielerlink; ungültig
 * nach Ablauf, nach einmaliger Benutzung, sobald sich der Entwurf ändert oder der Spielerlink gesperrt bzw. erneuert wird.
 * Den Spielerlink selbst enthält der Einmal-Link nicht.
 */

/** Gültigkeit: 7 Tage (länger wartet kein Entwurf – nach 48 h entscheidet ohnehin der Warmaster) */
export const CONFIRM_LINK_TTL_MS = 7 * 86400_000;

function secret(): string {
  const row = db().prepare("SELECT value FROM settings WHERE key = 'confirmSecret'").get() as { value: string } | undefined;
  if (row) return row.value;
  db().prepare("INSERT OR IGNORE INTO settings(key, value) VALUES('confirmSecret', ?)").run(crypto.randomBytes(32).toString('base64url'));
  return (db().prepare("SELECT value FROM settings WHERE key = 'confirmSecret'").get() as { value: string }).value;
}

/**
 * Signatur über Kampagne, Schlacht, Spieler, Stempel des Entwurfs, Ablauf und den Hash des gültigen Spielerlinks
 * (F13): Sperren oder Erneuern des Spielerlinks macht auch die Einmal-Links ungültig.
 */
const sign = (cid: string, bid: string, pid: string, stamp: string, exp: string, tokenHash: string) =>
  crypto.createHmac('sha256', secret()).update(`confirm2|${cid}|${bid}|${pid}|${stamp}|${exp}|${tokenHash}`).digest('base64url').slice(0, 32);

/** Stempel eines Entwurfs im Link (Millisekunden seit 1970, Basis 36) */
export const draftStamp = (draftAt: string) => {
  const ms = Date.parse(draftAt);
  return Number.isFinite(ms) ? ms.toString(36) : '0';
};

export interface ConfirmLinkParts {
  cid: string;
  bid: string;
  pid: string;
  /** Stempel des Entwurfs, für den der Link gilt */
  stamp: string;
  exp: string;
  sig: string;
}

/** Pfad des Einmal-Links (relativ; die Nachricht setzt die Basis-URL davor); ohne gültigen Spielerlink kein Link */
export function confirmLinkPath(cid: string, bid: string, pid: string, draftAt: string, now = Date.now()): string {
  const th = activeTokenHash(cid, pid);
  const exp = Math.floor((now + CONFIRM_LINK_TTL_MS) / 1000).toString(36);
  const stamp = draftStamp(draftAt);
  // ohne gültigen Spielerlink: Signatur über einen Zufallswert – der Link ist nie gültig
  return `/bestaetigen/${cid}/${bid}/${pid}/${stamp}/${exp}/${sign(cid, bid, pid, stamp, exp, th ?? crypto.randomBytes(16).toString('hex'))}`;
}

/** Nur die Form des Links prüfen (keine Signatur, kein Zustand) */
export function parseConfirmLink(segments: string[]): ConfirmLinkParts | null {
  if (!Array.isArray(segments) || segments.length !== 6) return null;
  let parts: string[];
  try {
    parts = segments.map((s) => decodeURIComponent(String(s)));
  } catch {
    return null;
  }
  const [cid, bid, pid, stamp, exp, sig] = parts;
  if (![cid, bid, pid, sig].every((s) => /^[\w-]{1,64}$/.test(s)) || !/^[0-9a-z]{1,12}$/.test(stamp) || !/^[0-9a-z]{1,10}$/.test(exp)) return null;
  return { cid, bid, pid, stamp, exp, sig };
}

const validSig = (p: ConfirmLinkParts): boolean => {
  const th = activeTokenHash(p.cid, p.pid);
  if (!th) return false;
  const expected = sign(p.cid, p.bid, p.pid, p.stamp, p.exp, th);
  return expected.length === p.sig.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(p.sig));
};

/**
 * Form und Signatur prüfen – ohne den Kampagnenzustand zu laden (S5/F7). Ungültige Links liefern einheitlich null,
 * gleich ob es zur Schlacht eine Meldung gibt oder nicht.
 */
export function verifyConfirmLink(segments: string[]): ConfirmLinkParts | null {
  const p = parseConfirmLink(segments);
  return p && validSig(p) ? p : null;
}

export type ConfirmLinkError = 'INVALID' | 'EXPIRED' | 'USED' | 'CHANGED';

export const CONFIRM_LINK_ERRORS: Record<ConfirmLinkError, string> = {
  INVALID: 'Dieser Link ist ungültig.',
  EXPIRED: 'Dieser Link ist abgelaufen.',
  USED: 'Dieser Link wurde bereits benutzt.',
  CHANGED: 'Das Ergebnis wurde inzwischen geändert oder schon entschieden – dieser Link gilt nicht mehr.',
};

export type ConfirmLinkCheck = { ok: true; state: CampaignState; player: Player; battle: Battle; draft: ResultDraft; archived: boolean } | { ok: false; error: ConfirmLinkError; player?: Player; state?: CampaignState };

const usedKey = (p: ConfirmLinkParts) => `confirm:${p.sig}`;

export function checkConfirmLink(p: ConfirmLinkParts, now = Date.now()): ConfirmLinkCheck {
  // Signatur zuerst und ohne Zustand: ein fremder oder manipulierter Link verrät nichts über die Schlacht
  if (!validSig(p)) return { ok: false, error: 'INVALID' };
  if (parseInt(p.exp, 36) * 1000 < now) return { ok: false, error: 'EXPIRED' };
  if (db().prepare('SELECT 1 FROM used_link WHERE key = ?').get(usedKey(p))) return { ok: false, error: 'USED' };
  let st: CampaignState;
  let archived = false;
  try {
    const cur = currentState(p.cid);
    st = cur.state;
    archived = !!cur.row.archived;
  } catch {
    return { ok: false, error: 'INVALID' };
  }
  const player = st.players.find((x) => x.id === p.pid);
  const battle = st.battles.find((x) => x.id === p.bid);
  if (!player || !battle) return { ok: false, error: 'INVALID' };
  const draft = battle.draft;
  if (!draft || draft.status !== 'PENDING' || draftStamp(draft.at) !== p.stamp) return { ok: false, error: 'CHANGED', player, state: st };
  // der Link gilt nur für die Gegenseite der Meldung
  const mine = sideOf(st, battle, p.pid);
  if (!mine || mine === sideOf(st, battle, draft.byPlayerId)) return { ok: false, error: 'INVALID', player, state: st };
  return { ok: true, state: st, player, battle, draft, archived };
}

/** Führt die eine erlaubte Aktion aus und verbraucht den Link (nur bei Erfolg) */
export function redeemConfirmLink(p: ConfirmLinkParts, action: 'CONFIRM' | 'DISPUTE', reason: string, now = Date.now()): RunResult {
  const c = checkConfirmLink(p, now);
  if (!c.ok) return { ok: false, kind: 'error', error: CONFIRM_LINK_ERRORS[c.error] };
  const text = reason.trim().slice(0, 1000);
  if (action === 'DISPUTE' && !text) return { ok: false, kind: 'error', error: 'Bitte einen Grund angeben' };
  const r = runAsPlayer(
    { campaignId: p.cid, state: c.state, player: c.player, archived: c.archived },
    action === 'CONFIRM' ? { type: 'RESULT_DRAFT_CONFIRM', battleId: p.bid, playerId: p.pid, draftAt: c.draft.at } : { type: 'RESULT_DRAFT_DISPUTE', battleId: p.bid, playerId: p.pid, reason: text, draftAt: c.draft.at },
    `confirm:${p.sig}`,
  );
  if (r.ok) db().prepare('INSERT OR IGNORE INTO used_link(key, used_at) VALUES(?, ?)').run(usedKey(p), new Date(now).toISOString());
  return r;
}
