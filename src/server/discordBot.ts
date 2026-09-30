import 'server-only';
import crypto from 'node:crypto';
import { db, defaultLocale, getSetting, setSetting } from './db';
import { currentState } from './campaigns';
import { activeTokenHash, runAsPlayer } from './players';
import { can, discordAccess } from './authz';
import { confirmLinkPath } from './confirmLink';
import { appUrl } from './origin';
import { contextLocale } from './locale';
import { campaignPoints } from '@/engine/board';
import { fogActive, fogStandings, TENDENCY_LABEL } from '@/engine/fog';
import { planetName } from '@/engine/map';
import { sideOf } from '@/engine/playerActions';
import { computeVictor } from '@/engine/phase';
import { openBattles, playerTasks, type PlayerTask } from '@/engine/playerTasks';
import type { Battle, CampaignState, Player } from '@/engine/types';
import { stageLabel } from '@/components/stageLabel';
import { battleKindName } from '@/components/battleName';
import { intlLocale, makeT, pickLocale, translateMessage, type Locale, type T } from '@/i18n/core';
import { DISCORD_COMMANDS, discordCmd, discordCmdLocale, discordTextLocale } from '@/i18n/discordCommands';

/**
 * Discord-Bot mit Rückkanal (NTH2 1.2): HTTP-Interactions-Endpunkt ohne Gateway. Discord signiert jede
 * Anfrage mit Ed25519; geprüft wird mit dem öffentlichen Schlüssel der Anwendung (node:crypto). Befehle:
 * `/lage`, `/aufgaben`, `/termin annehmen`, `/bestätigen`, `/verknüpfen`, `/trennen`. Aktionen laufen über
 * dieselben Engine-Commands und Berechtigungen wie der Spielerlink (runAsPlayer).
 */

// ─── Einstellungen ──────────────────────────────────────────────────────────

export interface DiscordBotConfig {
  appId: string;
  publicKey: string;
  token: string;
}

export function discordBotConfig(): DiscordBotConfig | null {
  try {
    const c = JSON.parse(getSetting('discordBot') ?? 'null') as DiscordBotConfig | null;
    return c?.appId && c.publicKey ? c : null;
  } catch {
    return null;
  }
}

/** Status für die Oberfläche – der Token verlässt den Server nie */
export function discordBotStatus(): { appId: string; publicKey: string; hasToken: boolean; registeredAt: string | null } | null {
  const c = discordBotConfig();
  return c ? { appId: c.appId, publicKey: c.publicKey, hasToken: !!c.token, registeredAt: getSetting('discordBotRegistered') } : null;
}

/** Speichern: leerer Token behält den bisherigen; leere App-ID entfernt den Bot */
export function setDiscordBotConfig(input: { appId: string; publicKey: string; token: string }): string | null {
  const appId = input.appId.trim();
  const publicKey = input.publicKey.trim().toLowerCase();
  if (!appId) {
    db().prepare("DELETE FROM settings WHERE key IN ('discordBot', 'discordBotRegistered')").run();
    return null;
  }
  if (!/^\d{15,22}$/.test(appId)) return 'Die Application ID besteht aus 15–22 Ziffern';
  if (!/^[0-9a-f]{64}$/.test(publicKey)) return 'Der Public Key besteht aus 64 Hex-Zeichen';
  const token = input.token.trim() || discordBotConfig()?.token || '';
  if (token && !/^[\w.-]{50,100}$/.test(token)) return 'Das sieht nicht nach einem Bot-Token aus';
  setSetting('discordBot', JSON.stringify({ appId, publicKey, token }));
  return null;
}

// ─── Signaturprüfung ────────────────────────────────────────────────────────

/** DER-Präfix eines Ed25519-SPKI-Schlüssels (RFC 8410); dahinter folgen die 32 Byte des Rohschlüssels */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export function verifyDiscordSignature(publicKeyHex: string, signatureHex: string | null, timestamp: string | null, body: string): boolean {
  if (!signatureHex || !timestamp || !/^[0-9a-f]{128}$/i.test(signatureHex) || !/^[0-9a-f]{64}$/i.test(publicKeyHex)) return false;
  try {
    const key = crypto.createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, 'hex')]), format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.from(timestamp + body), key, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}

// ─── Befehle ────────────────────────────────────────────────────────────────

// Befehle mit Lokalisierung für alle fünf Sprachen (src/i18n/discordCommands.ts)
export { DISCORD_COMMANDS };

/** Befehle bei Discord anmelden (globale Befehle der Anwendung, ersetzt die bisherigen) */
export async function registerDiscordCommands(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const c = discordBotConfig();
  if (!c) return 'Der Discord-Bot ist nicht eingerichtet';
  if (!c.token) return 'Für das Anmelden der Befehle fehlt der Bot-Token';
  const res = await fetchImpl(`https://discord.com/api/v10/applications/${c.appId}/commands`, {
    method: 'PUT',
    headers: { Authorization: `Bot ${c.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(DISCORD_COMMANDS),
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return `Discord ${res.status}`;
  setSetting('discordBotRegistered', new Date().toISOString());
  return null;
}

// ─── Verknüpfung per Einmal-Code ────────────────────────────────────────────

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const DISCORD_CODE_TTL_MS = 15 * 60_000;
const codeHash = (code: string) =>
  crypto
    .createHash('sha256')
    .update(code.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .digest('hex');

/** Neuer Einmal-Code für einen Spieler (ältere Codes desselben Spielers verfallen) */
export function createDiscordCode(campaignId: string, playerId: string, now = Date.now()): string | null {
  const th = activeTokenHash(campaignId, playerId);
  if (!th) return null;
  const raw = Array.from(crypto.randomBytes(8), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  db().prepare('DELETE FROM discord_code WHERE (campaign_id = ? AND player_id = ?) OR expires_at < ?').run(campaignId, playerId, new Date(now).toISOString());
  db()
    .prepare('INSERT INTO discord_code(code_hash, campaign_id, player_id, token_hash, expires_at) VALUES(?,?,?,?,?)')
    .run(codeHash(raw), campaignId, playerId, th, new Date(now + DISCORD_CODE_TTL_MS).toISOString());
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** Verknüpfte Discord-Nutzer eines Spielers (für die Spielerseite) */
export function discordLinksOf(campaignId: string, playerId: string): { user: string; username: string | null }[] {
  const th = activeTokenHash(campaignId, playerId);
  return (
    db().prepare('SELECT discord_user, username, token_hash FROM discord_link WHERE campaign_id = ? AND player_id = ?').all(campaignId, playerId) as { discord_user: string; username: string | null; token_hash: string }[]
  )
    .filter((r) => r.token_hash === th)
    .map((r) => ({ user: r.discord_user, username: r.username }));
}

export function unlinkDiscord(campaignId: string, playerId: string) {
  db().prepare('DELETE FROM discord_link WHERE campaign_id = ? AND player_id = ?').run(campaignId, playerId);
}

function redeemCode(user: string, username: string | null, code: string, now: number): { campaignId: string; playerId: string } | null {
  const row = db().prepare('SELECT campaign_id, player_id, token_hash, expires_at FROM discord_code WHERE code_hash = ?').get(codeHash(code)) as
    { campaign_id: string; player_id: string; token_hash: string; expires_at: string } | undefined;
  if (!row || row.expires_at < new Date(now).toISOString() || activeTokenHash(row.campaign_id, row.player_id) !== row.token_hash) return null;
  db().prepare('DELETE FROM discord_code WHERE code_hash = ?').run(codeHash(code));
  db()
    .prepare(
      'INSERT INTO discord_link(discord_user, username, campaign_id, player_id, token_hash, created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(discord_user) DO UPDATE SET username = excluded.username, campaign_id = excluded.campaign_id, player_id = excluded.player_id, token_hash = excluded.token_hash, created_at = excluded.created_at',
    )
    .run(user, username, row.campaign_id, row.player_id, row.token_hash, new Date(now).toISOString());
  return { campaignId: row.campaign_id, playerId: row.player_id };
}

interface Linked {
  campaignId: string;
  state: CampaignState;
  player: Player;
  archived: boolean;
  locale: Locale;
  /** Sprache der Befehlsnamen im Discord-Client des Nutzers (Hinweise wie „→ /bestätigen“) */
  cmd?: Locale;
}

/** Verknüpften Spieler laden – nur solange sein Spielerlink gilt (Sperren/Erneuern löst die Verknüpfung) */
function linkedPlayer(user: string): Linked | null {
  // Bindung an den gültigen Spielerlink prüft authz (ohne Zustand); erst danach wird die Kampagne geladen
  const row = discordAccess(user);
  if (!row) return null;
  try {
    const { row: c, state } = currentState(row.campaignId);
    const player = state.players.find((p) => p.id === row.playerId);
    if (!player) return null;
    // F3: inaktive Spieler handeln nicht mehr über Discord
    if (can({ kind: 'discord', campaignId: row.campaignId, playerId: row.playerId, user, active: player.active !== false }, 'discord.interact', { campaignId: row.campaignId })) return null;
    return { campaignId: row.campaignId, state, player, archived: !!c.archived, locale: contextLocale(player.locale, state.meta.locale) };
  } catch {
    return null;
  }
}

// ─── Antworten ──────────────────────────────────────────────────────────────

interface Interaction {
  type: number;
  locale?: string;
  data?: { name?: string; options?: { name: string; type: number; value?: string; options?: { name: string; value?: string }[] }[]; custom_id?: string };
  member?: { user?: { id: string; username?: string } };
  user?: { id: string; username?: string };
}

type Component = { type: 2; style: 1 | 2 | 3 | 4 | 5; label: string; custom_id?: string; url?: string };
type Reply = { type: number; data?: { content: string; flags?: number; components?: { type: 1; components: Component[] }[] } };

const EPHEMERAL = 64;
const say = (content: string, components?: Component[]): Reply => ({ type: 4, data: { content: content.slice(0, 1900), flags: EPHEMERAL, components: rows(components) } });
const update = (content: string): Reply => ({ type: 7, data: { content: content.slice(0, 1900), components: [] } });
const rows = (list?: Component[]) => {
  if (!list?.length) return undefined;
  const out: { type: 1; components: Component[] }[] = [];
  for (let i = 0; i < Math.min(list.length, 25); i += 5) out.push({ type: 1, components: list.slice(i, i + 5) });
  return out;
};
const label = (s: string) => (s.length > 80 ? `${s.slice(0, 77)}…` : s);

/** Termin als kurzer Schlüssel für Knopf-IDs (Millisekunden seit 1970, Basis 36) */
export const timeKey = (iso: string) => new Date(iso).getTime().toString(36);
const when = (st: CampaignState, iso: string, l: Locale) => new Date(iso).toLocaleString(intlLocale(l), { timeZone: st.meta.timezone, dateStyle: 'short', timeStyle: 'short' });
const battleText = (st: CampaignState, b: Battle, t: T) => {
  const A = st.alliances.find((a) => a.id === b.attackerAllianceId)?.name ?? '?';
  const D = st.alliances.find((a) => a.id === b.defenderAllianceId)?.name ?? '?';
  return `${battleKindName(b, t)}${b.planetId ? ` · ${planetName(b.planetId)}` : ''} (${A} – ${D})`;
};

function lage(s: Linked): string {
  const t = makeT(s.locale);
  const st = s.state;
  const lines = [`**${st.meta.name}** · ${stageLabel(st, t)}`];
  if (fogActive(st)) {
    const f = fogStandings(st);
    for (const a of [...st.alliances].sort((x, y) => f.rank[x.id] - f.rank[y.id])) lines.push(`${f.rank[a.id]}. ${a.name} – ${t(TENDENCY_LABEL[f.tendency[a.id]])}`);
  } else {
    const pts = st.alliances.map((a) => ({ a, p: campaignPoints(st, a.id) })).sort((x, y) => y.p - x.p);
    for (const { a, p } of pts) lines.push(`${a.name}: ${t('{n} Kampagnenpunkte', { n: p })}`);
  }
  return lines.join('\n');
}

function taskLine(s: Linked, task: PlayerTask, t: T): string {
  const st = s.state;
  switch (task.kind) {
    case 'ORDERS':
      return t('Befehl für {fleet} geben', { fleet: task.fleetName });
    case 'MOVE':
      return t('Bewegung für {fleet} festlegen', { fleet: task.fleetName });
    case 'EVENT':
      return t('Entscheidung zu einem Event treffen');
    case 'BUILD':
      return t('Bau für deine Allianz wählen');
    case 'CONFIRM':
      return `${t('Ergebnis bestätigen:')} ${battleText(st, task.battle, t)} → ${discordCmd(s.cmd ?? s.locale, 'bestätigen')}`;
    case 'PROPOSAL':
      return `${t('Terminvorschlag annehmen:')} ${battleText(st, task.battle, t)} → ${discordCmd(s.cmd ?? s.locale, 'termin', 'annehmen')}`;
    case 'SCHEDULE':
      return `${t('Termin vorschlagen:')} ${battleText(st, task.battle, t)}`;
    case 'CLAIM':
      return `${t('Seite übernehmen:')} ${battleText(st, task.battle, t)}`;
    case 'REPORT':
      return `${t('Ergebnis melden:')} ${battleText(st, task.battle, t)}`;
  }
}

function tasks(s: Linked, now: number): string {
  const t = makeT(s.locale);
  const list = playerTasks(s.state, s.player, now);
  if (!list.length) return t('Keine offenen Aufgaben. Der Warmaster meldet sich, wenn es weitergeht.');
  return [`**${s.state.meta.name}** · ${s.player.nickname}`, ...list.map((x) => `• ${taskLine(s, x, t)}`), t('Alles Weitere auf deiner Spielerseite.')].join('\n');
}

/** Vorschläge der Gegenseite, die der Spieler annehmen kann */
function acceptableTimes(st: CampaignState, b: Battle, playerId: string): string[] {
  const side = sideOf(st, b, playerId);
  if (!side || b.scheduledAt || b.status !== 'SCHEDULED' || b.draft) return [];
  return (b.proposals ?? []).filter((p) => p.side !== side).flatMap((p) => p.times);
}

function terminList(s: Linked): Reply {
  const t = makeT(s.locale);
  const st = s.state;
  const lines: string[] = [];
  const buttons: Component[] = [];
  for (const b of openBattles(st, s.player.id)) {
    const times = acceptableTimes(st, b, s.player.id);
    if (!times.length) continue;
    lines.push(`**${battleText(st, b, t)}**`);
    // der Knopf trägt den Termin selbst (Epoche in Basis 36) – ändern sich die Vorschläge, passt er nicht mehr
    for (const time of times) buttons.push({ type: 2, style: 1, label: label(`${when(st, time, s.locale)} · ${b.planetId ? planetName(b.planetId) : battleKindName(b, t)}`), custom_id: `ta:${b.id}:${timeKey(time)}` });
  }
  if (!lines.length) return say(t('Es gibt keinen Terminvorschlag der Gegenseite, den du annehmen könntest.'));
  return say(`${t('Welchen Termin nimmst du an?')}\n${lines.join('\n')}`, buttons);
}

function confirmList(s: Linked): Reply {
  const t = makeT(s.locale);
  const st = s.state;
  const lines: string[] = [];
  const buttons: Component[] = [];
  for (const b of openBattles(st, s.player.id)) {
    const d = b.draft;
    if (!d || d.status !== 'PENDING' || sideOf(st, b, s.player.id) === sideOf(st, b, d.byPlayerId)) continue;
    const probe: Battle = { ...b, ...(d.update.games?.length ? { games: d.update.games, vp: null } : { vp: d.update.vp ?? b.vp, battleReady: d.update.battleReady ?? b.battleReady }) };
    const v = computeVictor(probe);
    const winner = v === 'DRAW' ? t('Unentschieden') : v ? (st.alliances.find((a) => a.id === (v === 'ATTACKER' ? b.attackerAllianceId : b.defenderAllianceId))?.name ?? '?') : '–';
    const by = st.players.find((p) => p.id === d.byPlayerId)?.nickname ?? '?';
    lines.push(`**${battleText(st, b, t)}** – ${t('gemeldet von {name}', { name: by })}: ${d.update.vp ? `${d.update.vp.attacker}:${d.update.vp.defender} VP · ` : ''}${t('Sieger: {name}', { name: winner })}`);
    const stamp = new Date(d.at).getTime().toString(36);
    buttons.push({ type: 2, style: 3, label: label(`${t('Bestätigen')}: ${b.planetId ? planetName(b.planetId) : battleKindName(b, t)}`), custom_id: `bc:${b.id}:${stamp}` });
    // vollständige Ansicht mit „Widersprechen“ über den Einmal-Link (NTH2 1.5)
    const url = `${appUrl()}${confirmLinkPath(s.campaignId, b.id, s.player.id, d.at)}`;
    if (url.startsWith('https://') || url.startsWith('http://')) buttons.push({ type: 2, style: 5, label: label(t('Ansehen oder widersprechen')), url });
  }
  if (!lines.length) return say(t('Kein gemeldetes Ergebnis wartet auf deine Bestätigung.'));
  return say(`${lines.join('\n')}\n${t('Mit „Bestätigen“ übernimmst du das Ergebnis vollständig (inklusive Outcome-Entscheidungen).')}`, buttons);
}

function runResult(s: Linked, r: ReturnType<typeof runAsPlayer>): string {
  const t = makeT(s.locale);
  if (r.ok) return r.log[0] ? translateMessage(s.locale, r.log[0]) : t('Erledigt');
  return `${t('Nicht möglich:')} ${translateMessage(s.locale, 'error' in r ? r.error : 'Aktion nicht möglich')}`;
}

function component(s: Linked, id: string, user: string): Reply {
  const t = makeT(s.locale);
  const st = s.state;
  const [kind, bid, arg] = id.split(':');
  const b = st.battles.find((x) => x.id === bid);
  if (!b) return update(t('Schlacht nicht gefunden'));
  if (kind === 'ta') {
    const time = acceptableTimes(st, b, s.player.id).find((x) => timeKey(x) === arg);
    if (!time) return update(t('Dieser Vorschlag gilt nicht mehr – bitte {cmd} erneut aufrufen.', { cmd: discordCmd(s.cmd ?? s.locale, 'termin', 'annehmen') }));
    return update(runResult(s, runAsPlayer(s, { type: 'TIME_ACCEPT', battleId: b.id, playerId: s.player.id, time }, `discord:${user}`)));
  }
  if (kind === 'bc') {
    if (!b.draft || new Date(b.draft.at).getTime().toString(36) !== arg)
      return update(t('Das Ergebnis wurde inzwischen geändert oder schon entschieden – bitte {cmd} erneut aufrufen.', { cmd: discordCmd(s.cmd ?? s.locale, 'bestätigen') }));
    return update(runResult(s, runAsPlayer(s, { type: 'RESULT_DRAFT_CONFIRM', battleId: b.id, playerId: s.player.id, draftAt: b.draft.at }, `discord:${user}`)));
  }
  return update('?');
}

export type InteractionResponse = { status: number; body: unknown };

/** Verarbeitet eine (bereits als Text gelesene) Interaction; prüft Signatur und Alter */
export function handleInteraction(raw: string, signature: string | null, timestamp: string | null, now = Date.now()): InteractionResponse {
  const cfg = discordBotConfig();
  if (!cfg) return { status: 404, body: { error: 'not configured' } };
  if (!verifyDiscordSignature(cfg.publicKey, signature, timestamp, raw)) return { status: 401, body: { error: 'invalid request signature' } };
  // Wiederholte alte Anfragen abweisen (Discord schickt frische Zeitstempel)
  // auch nicht numerische Zeitstempel (NaN) abweisen
  if (!(Math.abs(now / 1000 - Number(timestamp)) <= 300)) return { status: 401, body: { error: 'stale request' } };
  let i: Interaction;
  try {
    i = JSON.parse(raw) as Interaction;
  } catch {
    return { status: 400, body: { error: 'bad json' } };
  }
  if (i.type === 1) return { status: 200, body: { type: 1 } };
  const u = i.member?.user ?? i.user;
  const clientLocale = pickLocale(discordTextLocale(i.locale), defaultLocale());
  const fallback = makeT(clientLocale);
  const cmdLocale = discordCmdLocale(i.locale);
  if (!u?.id) return { status: 200, body: say(fallback('Unbekannter Discord-Nutzer')) };
  if (i.type === 2 && i.data?.name === 'verknüpfen') {
    const code = String(i.data.options?.find((o) => o.name === 'code')?.value ?? '');
    const r = redeemCode(u.id, u.username ?? null, code, now);
    if (!r) return { status: 200, body: say(fallback('Der Code ist ungültig oder abgelaufen. Erzeuge auf deiner Spielerseite unter „Profil“ einen neuen.')) };
    const s = linkedPlayer(u.id);
    const t = makeT(s?.locale ?? clientLocale);
    return { status: 200, body: say(s ? t('Verknüpft mit {name} in „{campaign}“.', { name: s.player.nickname, campaign: s.state.meta.name }) : t('Verknüpft.')) };
  }
  const s = linkedPlayer(u.id);
  if (!s)
    return {
      status: 200,
      body: say(
        fallback('Du bist noch mit keinem Spieler verknüpft. Auf deiner Spielerseite unter „Profil“ findest du „Discord verknüpfen“ mit einem Code für {cmd}.', {
          cmd: discordCmd(cmdLocale ?? clientLocale, 'verknüpfen'),
        }),
      ),
    };
  if (cmdLocale) s.cmd = cmdLocale;
  const t = makeT(s.locale);
  if (i.type === 2) {
    switch (i.data?.name) {
      case 'trennen':
        db().prepare('DELETE FROM discord_link WHERE discord_user = ?').run(u.id);
        return { status: 200, body: say(t('Verknüpfung gelöst.')) };
      case 'lage':
        return { status: 200, body: say(lage(s)) };
      case 'aufgaben':
        return { status: 200, body: say(tasks(s, now)) };
      case 'termin':
        return { status: 200, body: terminList(s) };
      case 'bestätigen':
        return { status: 200, body: confirmList(s) };
    }
    return { status: 200, body: say(t('Unbekannter Befehl')) };
  }
  if (i.type === 3 && i.data?.custom_id) return { status: 200, body: component(s, i.data.custom_id, u.id) };
  return { status: 200, body: say(t('Unbekannter Befehl')) };
}
