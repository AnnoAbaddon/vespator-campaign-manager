import 'server-only';
import crypto from 'node:crypto';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { db, getSetting } from './db';
import { adminExists, canAccess, checkInvite, currentAdmin, type Account, type Role } from './auth';
import { getCampaign, getCampaignByToken, type CampaignRow } from './campaigns';
import { activeTokenHash, checkCalendarKey, loadPlayerSession, playerTokenRow, type PlayerSession } from './players';
import { checkClubCalendarKey } from './club';
import { checkUnsubscribe } from './notify';
import { seasonByToken, type SeasonRow } from './league';
import { verifyConfirmLink, type ConfirmLinkParts } from './confirmLink';

/**
 * Zentrale Berechtigung (Architektur-Review S1). Jeder Einstieg – Server Action, Route, Seite – ermittelt hier
 * zuerst, WER fragt (Principal), und fragt dann die Richtlinie, OB diese Person das DARF (`can`). Die Prüfungen
 * für aktive Spieler, Archiv, Leseansicht und Token-Bindung stehen nur hier; Aufrufer prüfen nichts selbst.
 *
 * Capability-Links (Spielerlink, Leseansicht, Einmal-Link, Kalender, Ruhmeshalle, Liga, Abmeldelink, Einladung)
 * werden mit einer billigen Datenbank- bzw. HMAC-Prüfung verifiziert, bevor irgendein Kampagnenzustand geladen
 * wird (S5). Je Anfrage wird nur einmal aufgelöst (React cache).
 */

// ─── Principals ─────────────────────────────────────────────────────────────

/** Admin-Konto (Rolle ADMIN: Besitzer der Instanz) bzw. Co-Warmaster (nur freigegebene Kampagnen) */
export type AccountPrincipal = { kind: 'owner' | 'cowarmaster'; account: Account };
/** Persönlicher Spielerlink; `active` = Spieler ist in der Kampagne aktiv (inaktive sehen nur die Leseansicht) */
export type PlayerPrincipal = { kind: 'player'; campaignId: string; playerId: string; tokenHash: string; active: boolean; archived: boolean };
export type Principal =
  | { kind: 'anonymous' }
  | AccountPrincipal
  | PlayerPrincipal
  /** Leseansicht /v/<token> (nur bei eingeschalteter Leseansicht) */
  | { kind: 'viewer'; campaignId: string }
  /** Einmal-Link „Ergebnis bestätigen“: genau eine Schlacht, ein Spieler, gebunden an den Spielerlink */
  | { kind: 'confirm'; campaignId: string; playerId: string; battleId: string; active: boolean }
  /** Discord-Verknüpfung: gebunden an den gültigen Spielerlink */
  | { kind: 'discord'; campaignId: string; playerId: string; user: string; active: boolean }
  /** Kalender-Abo eines Spielers (gebunden an den Spielerlink) bzw. des Clubs */
  | { kind: 'calendar'; campaignId: string; playerId: string }
  | { kind: 'clubCalendar' }
  | { kind: 'hall' }
  | { kind: 'season'; seasonId: string }
  | { kind: 'unsubscribe'; campaignId: string; playerId: string }
  | { kind: 'invite'; role: Role; campaignIds: string[] };

export type PrincipalKind = Principal['kind'];

export const accountPrincipal = (a: Account): AccountPrincipal => ({ kind: a.role === 'ADMIN' ? 'owner' : 'cowarmaster', account: a });

// ─── Richtlinie ─────────────────────────────────────────────────────────────

interface Rule {
  /** erlaubte Principals */
  who: readonly PrincipalKind[];
  /** Ressource ist eine Kampagne: Konten brauchen Zugriff darauf, Links müssen an genau diese Kampagne gebunden sein */
  campaign?: boolean;
  /** Spieler-Principals nur, solange der Spieler aktiv ist */
  active?: boolean;
  /** Zweck (Dokumentation und Test) */
  note: string;
}

const ACCOUNTS = ['owner', 'cowarmaster'] as const;

/** Aktion → erlaubte Principals und Ressourcenprüfungen. Neue Einstiege brauchen hier eine Zeile. */
export const POLICY = {
  'session.login': { who: ['anonymous'], note: 'Anmelden (Rate-Limit in der Action)' },
  'session.setup': { who: ['anonymous'], note: 'Ersteinrichtung mit Setup-Token' },
  'session.logout': { who: ['anonymous', ...ACCOUNTS], note: 'Abmelden' },
  'invite.accept': { who: ['invite'], note: 'Konto über Einladung anlegen' },
  'upload.read': { who: ['anonymous'], note: 'Bild über seine zufällige ID abrufen' },

  'account.self': { who: ACCOUNTS, note: 'eigenes Konto: Passwort, Sprache, Push, Kartenvorlagen, Übersicht' },
  'instance.manage': { who: ['owner'], note: 'Konten, globale Einstellungen, SMTP, Discord-Bot, Liga, Übersetzungen, Datenschutz' },
  'campaign.create': { who: ['owner'], note: 'Kampagne anlegen oder importieren' },
  'campaign.restore': { who: ['owner'], campaign: true, note: 'Backup als neue Kampagne wiederherstellen (legt eine Kampagne an)' },
  'campaign.read': { who: ACCOUNTS, campaign: true, note: 'Verwaltung einer Kampagne ansehen, exportieren' },
  'campaign.write': { who: ACCOUNTS, campaign: true, note: 'Commands, Spielerlinks, Sandbox, Webhook, Backup' },
  'campaign.delete': { who: ['owner'], campaign: true, note: 'Kampagne löschen' },
  'campaign.upload': { who: ACCOUNTS, campaign: true, note: 'Bild für eine Kampagne hochladen' },
  'upload.global': { who: ['owner'], note: 'Bild ohne Kampagne (Vorlagen) hochladen' },
  'mail.test': { who: ['owner'], campaign: true, note: 'Test-E-Mail über den Club-SMTP an eine Adresse' },

  'player.view': { who: ['player'], campaign: true, note: 'Spielerseite (inaktiv: nur Leseansicht)' },
  'player.allianceSecrets': { who: ['player'], campaign: true, active: true, note: 'Allianz-Notizen, verdeckte Befehle, eigene Entwürfe' },
  'player.command': { who: ['player', 'confirm', 'discord'], campaign: true, active: true, note: 'Spieler-Commands (Link, Einmal-Link, Discord)' },
  'player.upload': { who: ['player'], campaign: true, active: true, note: 'Avatar/Fotos hochladen' },
  'player.devices': { who: ['player'], campaign: true, active: true, note: 'Push abonnieren, Discord-Code erzeugen' },
  'player.unlink': { who: ['player'], campaign: true, note: 'Push abbestellen, Discord trennen' },
  'player.tables': { who: ['player'], campaign: true, note: 'Spieltische zum Termin ansehen' },
  'confirm.redeem': { who: ['confirm'], campaign: true, active: true, note: 'Ergebnis per Einmal-Link bestätigen oder widersprechen' },
  'discord.interact': { who: ['discord'], campaign: true, active: true, note: 'Discord-Befehle eines verknüpften Spielers' },
  'viewer.read': { who: ['viewer'], campaign: true, note: 'Leseansicht' },
  'calendar.read': { who: ['calendar'], campaign: true, note: 'Kalender-Abo eines Spielers' },
  'club.calendar': { who: ['clubCalendar'], note: 'Club-Kalender-Abo' },
  'hall.read': { who: ['hall'], note: 'Hall of Fame' },
  'season.read': { who: ['season'], note: 'Ruhmeshalle einer Saison' },
  unsubscribe: { who: ['unsubscribe'], campaign: true, note: 'E-Mails abbestellen' },
} as const satisfies Record<string, Rule>;

export type Action = keyof typeof POLICY;
export type Resource = { campaignId?: unknown };

const isAccount = (p: Principal): p is AccountPrincipal => p.kind === 'owner' || p.kind === 'cowarmaster';
const boundCampaign = (p: Principal): string | null => ('campaignId' in p ? p.campaignId : null);

/**
 * Prüft eine Aktion; liefert null (erlaubt) oder den Grund als deutschen Übersetzungsschlüssel. Reihenfolge:
 * Principal erlaubt? → Ressource (Kampagnenzugriff bzw. Bindung des Links) → aktiver Spieler.
 */
export function can(p: Principal | null, action: Action, res: Resource = {}): string | null {
  const rule: Rule | undefined = POLICY[action];
  if (!rule) return 'Nicht erlaubt';
  const who = rule.who as readonly PrincipalKind[];
  if (!p || (p.kind === 'anonymous' && !who.includes('anonymous'))) return 'Nicht angemeldet';
  if (!who.includes(p.kind)) {
    if (p.kind === 'cowarmaster' && who.includes('owner')) return 'Nur für Admins';
    return 'Kein Zugriff';
  }
  if (rule.campaign) {
    const cid = res.campaignId;
    if (typeof cid !== 'string' || !cid || cid.length > 64) return 'Ungültige Eingabe';
    if (isAccount(p)) {
      if (!canAccess(p.account, cid)) return 'Kein Zugriff auf diese Kampagne';
    } else if (boundCampaign(p) !== cid) return 'Kein Zugriff auf diese Kampagne';
  }
  if (rule.active && 'active' in p && !p.active) return 'Dein Spielerkonto ist inaktiv';
  return null;
}

export const allowed = (p: Principal | null, action: Action, res?: Resource) => can(p, action, res) === null;

// ─── Konten (Sitzung) ───────────────────────────────────────────────────────

/** Principal der aktuellen Sitzung (null ohne Anmeldung) – je Anfrage einmal */
export const sessionPrincipal = cache(async (): Promise<AccountPrincipal | null> => {
  const a = await currentAdmin();
  return a ? accountPrincipal(a) : null;
});

/** Für Server Actions und Routen: wirft mit dem Grund, liefert sonst das Konto */
export async function authorize(action: Action, res: Resource = {}): Promise<Account> {
  const p = await sessionPrincipal();
  const denied = can(p, action, res);
  if (denied || !p) throw new Error(denied ?? 'Nicht angemeldet');
  return p.account;
}

/** Für Seiten: ohne Anmeldung zur Anmeldung, ohne Berechtigung zurück zur Übersicht */
export async function authorizePage(action: Action, res: Resource = {}): Promise<Account> {
  const p = await sessionPrincipal();
  if (!p) redirect(adminExists() ? '/login' : '/setup-admin');
  if (can(p, action, res)) redirect('/admin');
  return p.account;
}

/** Für Route Handler: 401 ohne Anmeldung, 403 ohne Berechtigung */
export async function authorizeRequest(action: Action, res: Resource = {}): Promise<{ ok: true; account: Account } | { ok: false; response: Response }> {
  const p = await sessionPrincipal();
  if (!p) return { ok: false, response: new Response('Nicht angemeldet', { status: 401 }) };
  if (can(p, action, res)) return { ok: false, response: new Response('Kein Zugriff', { status: 403 }) };
  return { ok: true, account: p.account };
}

/** Kampagnen, die ein Konto sehen darf ('ALL' für Admins) */
export function campaignScope(a: Account): string[] | 'ALL' {
  if (a.role === 'ADMIN') return 'ALL';
  return (db().prepare('SELECT campaign_id FROM campaign_access WHERE admin_id = ?').all(a.id) as { campaign_id: string }[]).map((r) => r.campaign_id);
}

/** Öffentlich erreichbare Aktion ohne Principal (Anmeldung, Ersteinrichtung, Bild-Abruf) – ausdrücklich in der Richtlinie */
export function publicAction(action: Action): void {
  if (can({ kind: 'anonymous' }, action)) throw new Error('Nicht erlaubt');
}

// ─── Spielerlink ────────────────────────────────────────────────────────────

/** Spielerlink prüfen (nur Datenbank, ohne Kampagnenzustand) */
export const playerAccess = cache((token: unknown): { campaignId: string; playerId: string; tokenHash: string } | null => (typeof token === 'string' ? playerTokenRow(token) : null));

export type PlayerContext = PlayerSession & { principal: PlayerPrincipal };

/** Zustand zu einem geprüften Spielerlink laden und den Principal bilden (aktiv, archiviert) */
function withState(a: { campaignId: string; playerId: string; tokenHash: string } | null): PlayerContext | null {
  const s = a && loadPlayerSession(a.campaignId, a.playerId);
  if (!a || !s) return null;
  return { ...s, principal: { kind: 'player', campaignId: a.campaignId, playerId: a.playerId, tokenHash: a.tokenHash, active: s.player.active !== false, archived: s.archived } };
}

/** Spielerseite laden: erst den Link prüfen (nur Datenbank), dann den Zustand – je Anfrage einmal */
export const loadPlayer = cache((token: unknown): PlayerContext | null => withState(playerAccess(token)));

/**
 * Spieler-Einstieg für Actions: Link auflösen und Aktion prüfen; liefert die Sitzung oder den Fehlertext. Ohne Cache –
 * nach einem Command soll der nächste Aufruf derselben Anfrage den neuen Stand sehen.
 */
export function playerGate(token: unknown, action: Action): { ok: true; session: PlayerContext } | { ok: false; error: string } {
  const s = withState(typeof token === 'string' ? playerTokenRow(token) : null);
  if (!s) return { ok: false, error: 'Link ungültig oder gesperrt' };
  const denied = can(s.principal, action, { campaignId: s.campaignId });
  return denied ? { ok: false, error: denied } : { ok: true, session: s };
}

/** Allianz, deren Geheimnisse die Spielerseite zeigen darf – inaktive Spieler (F3) sehen nur die Leseansicht */
export function secretAlliance(s: PlayerContext, allianceId: string | null): string | null {
  return allowed(s.principal, 'player.allianceSecrets', { campaignId: s.campaignId }) ? allianceId : null;
}

// ─── Leseansicht ────────────────────────────────────────────────────────────

/** Leseansicht prüfen (nur die Kampagnenzeile; abgeschaltete Leseansicht und Sandboxes gelten nicht) */
export const viewerAccess = cache((token: unknown): { principal: Principal; row: CampaignRow } | null => {
  if (typeof token !== 'string') return null;
  const row = getCampaignByToken(token);
  if (!row || row.sandbox_of) return null;
  return { principal: { kind: 'viewer', campaignId: row.id }, row };
});

/** Für Routen der Leseansicht: Kampagnenzeile oder null */
export function requireViewerRow(token: unknown): CampaignRow | null {
  const v = viewerAccess(token);
  return v && !can(v.principal, 'viewer.read', { campaignId: v.row.id }) ? v.row : null;
}

/** Für Seiten der Leseansicht: 404 bei ungültigem Link */
export function requireViewer(token: unknown): CampaignRow {
  return requireViewerRow(token) ?? notFound();
}

// ─── Einmal-Link (Ergebnis bestätigen) ──────────────────────────────────────

/**
 * Einmal-Link prüfen: zuerst die Signatur (ohne Kampagnenzustand, gebunden an den gültigen Spielerlink), erst danach
 * darf der Zustand geladen werden. Ungültige Links liefern null – ohne Hinweis, ob es eine Meldung gibt (F7).
 */
export function confirmAccess(segments: unknown): { parts: ConfirmLinkParts; principal: Principal } | null {
  // Schlüssel als Text: React cache vergleicht Arrays nur nach Identität
  return Array.isArray(segments) && segments.length <= 8 ? confirmAccessCached(segments.map(String).join('/')) : null;
}
const confirmAccessCached = cache((key: string): { parts: ConfirmLinkParts; principal: Principal } | null => {
  const parts = verifyConfirmLink(key.split('/'));
  if (!parts) return null;
  return { parts, principal: { kind: 'confirm', campaignId: parts.cid, playerId: parts.pid, battleId: parts.bid, active: true } };
});

// ─── Discord ────────────────────────────────────────────────────────────────

/** Verknüpften Spieler eines Discord-Nutzers prüfen – nur solange sein Spielerlink gilt (sonst wird die Verknüpfung gelöst) */
export function discordAccess(user: string): { campaignId: string; playerId: string } | null {
  const row = db().prepare('SELECT campaign_id, player_id, token_hash FROM discord_link WHERE discord_user = ?').get(user) as { campaign_id: string; player_id: string; token_hash: string } | undefined;
  if (!row) return null;
  if (activeTokenHash(row.campaign_id, row.player_id) !== row.token_hash) {
    db().prepare('DELETE FROM discord_link WHERE discord_user = ?').run(user);
    return null;
  }
  return { campaignId: row.campaign_id, playerId: row.player_id };
}

// ─── Weitere Capability-Links ───────────────────────────────────────────────

const LINK_RE = /^[A-Za-z0-9_-]{6,80}$/;
const same = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Kalender-Abo eines Spielers (HMAC über den Hash des gültigen Spielerlinks) */
export function calendarAccess(cid: unknown, pid: unknown, key: unknown): Principal | null {
  if (typeof cid !== 'string' || typeof pid !== 'string' || typeof key !== 'string' || !LINK_RE.test(cid) || !/^[\w-]{1,64}$/.test(pid)) return null;
  return checkCalendarKey(cid, pid, key) ? { kind: 'calendar', campaignId: cid, playerId: pid } : null;
}

export function clubCalendarAccess(key: unknown): Principal | null {
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{20,40}$/.test(key)) return null;
  return checkClubCalendarKey(key) ? { kind: 'clubCalendar' } : null;
}

export function hallAccess(token: unknown): Principal | null {
  const ref = getSetting('hallToken');
  if (typeof token !== 'string' || !ref || !same(ref, token)) return null;
  return { kind: 'hall' };
}

export const seasonAccess = cache((token: unknown): { principal: Principal; season: SeasonRow } | null => {
  if (typeof token !== 'string') return null;
  const season = seasonByToken(token);
  return season ? { principal: { kind: 'season', seasonId: season.id }, season } : null;
});

export function unsubscribeAccess(cid: unknown, pid: unknown, sig: unknown): Principal | null {
  if (typeof cid !== 'string' || typeof pid !== 'string' || typeof sig !== 'string') return null;
  if (!getCampaign(cid) || !checkUnsubscribe(cid, pid, sig)) return null;
  return { kind: 'unsubscribe', campaignId: cid, playerId: pid };
}

export function inviteAccess(token: unknown): (Principal & { kind: 'invite' }) | null {
  if (typeof token !== 'string') return null;
  const inv = checkInvite(token);
  return inv ? { kind: 'invite', role: inv.role, campaignIds: inv.campaignIds } : null;
}
