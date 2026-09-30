import { fail, hint, log, warn, type Ctx } from './ctx';
import { allianceName, planetName } from './board';
import { isIsoDate, neutralTime } from './logTime';
import { curPhase, findOperation, setDecision, updateBattle, type BattleUpdate } from './phase';
import { effectiveVictor } from './outcomes';
import { allianceOf, commanderOf as fleetCommander, playersOfAlliance, recordFactionChange, stagePhase } from './players';
import type { Battle, CampaignState, NotifyCategory, OutcomeDecision, Participant, Player } from './types';
import type { Command } from './commands';
import { addedParticipants, checkCap, rankDefenders } from './pairings';
import { R2_PLAYER_COMMANDS, R2_TYPES, authorizeR2, type R2Command } from './r2Commands';
import { P2_PLAYER_COMMANDS, P2_TYPES, authorizeP2, type P2Command } from './p2Commands';
import { P3_PLAYER_COMMANDS, P3_TYPES, authorizeP3, type P3Command } from './crusade';

/**
 * Spieler-Beteiligung (N1): Ergebnis-Entwürfe mit Bestätigung, Terminfindung, Allianz-Notizen, Profil
 * sowie die Berechtigungsprüfung für Commands, die ein Spieler über seinen Link auslöst.
 */

const battle = (ctx: Ctx, id: string) => {
  const b = ctx.state.battles.find((x) => x.id === id);
  if (!b) fail('Schlacht nicht gefunden');
  return b;
};
const playerName = (st: CampaignState, id: string | null | undefined) => (id ? (st.players.find((p) => p.id === id)?.nickname ?? '?') : 'Spielleiter');

/** Seite eines Spielers in einer Schlacht (Teilnehmer oder – ohne Teilnehmer – Allianzmitglied) */
export function sideOf(st: CampaignState, b: Battle, playerId: string): 'ATTACKER' | 'DEFENDER' | null {
  if (b.attackers.some((p) => p.playerId === playerId)) return 'ATTACKER';
  if (b.defenders.some((p) => p.playerId === playerId)) return 'DEFENDER';
  const p = st.players.find((x) => x.id === playerId);
  if (!p) return null;
  const al = allianceOf(p, b.phaseNumber);
  if (al === b.attackerAllianceId && b.attackers.length === 0) return 'ATTACKER';
  if (al === b.defenderAllianceId && b.defenders.length === 0) return 'DEFENDER';
  return null;
}

/** Kurzbezeichnung einer Schlacht für Log-Meldungen */
export function battleWhere(b: Battle): string {
  if (b.kind === 'FINAL_TIEBREAK') return 'Entscheidungsschlacht';
  return b.planetId ? planetName(b.planetId) : 'Schlacht';
}

const sideList = (b: Battle, side: 'ATTACKER' | 'DEFENDER') => (side === 'ATTACKER' ? b.attackers : b.defenders);
const setSideList = (b: Battle, side: 'ATTACKER' | 'DEFENDER', list: Participant[]) => {
  if (side === 'ATTACKER') b.attackers = list;
  else b.defenders = list;
};

/**
 * Trägt einen Spieler auf seiner Seite ein, solange dort noch niemand steht (R1): beim Terminvorschlag,
 * bei der Terminannahme, beim Melden und beim Bestätigen eines Ergebnisses. Einzelspiele ohne Teilnehmer
 * dieser Seite übernehmen ihn ebenfalls. Die Spiellast wird nur als Hinweis vermerkt (N1.6, nie blockierend).
 */
export function recordParticipant(ctx: Ctx, b: Battle, playerId: string, side: 'ATTACKER' | 'DEFENDER') {
  if (sideList(b, side).length) return;
  const p = ctx.state.players.find((x) => x.id === playerId);
  if (!p) return;
  const part = { playerId, faction: p.faction };
  // A4: harte Obergrenze – für Spieler nicht übergehbar, der Spielleiter bestätigt mit Begründung
  checkCap(ctx, b, [{ playerId, side }]);
  setSideList(b, side, [part]);
  for (const g of b.games ?? []) {
    if (side === 'ATTACKER' && !g.attackers.length) g.attackers = [part];
    if (side === 'DEFENDER' && !g.defenders.length) g.defenders = [part];
  }
  log(ctx, side === 'DEFENDER' ? `${p.nickname} verteidigt: ${battleWhere(b)}` : `${p.nickname} greift an: ${battleWhere(b)}`);
  hintLoad(ctx, b);
}

export type ClaimMode = 'TAKE_OVER' | 'JOIN' | 'LEAVE';

/**
 * Welche Seite darf ein Spieler in einer Schlacht selbst übernehmen (R1)? Die Verteidigung jedes Mitglied
 * der verteidigenden Allianz; den Angriff nur bei Nebengefechten und der Entscheidungsschlacht (bei
 * Kampagnenschlachten führt der Kommandant der Flotte) oder solange dort niemand steht.
 */
export function claimableSide(st: CampaignState, b: Battle, playerId: string): 'ATTACKER' | 'DEFENDER' | null {
  const p = st.players.find((x) => x.id === playerId);
  if (!p?.active) return null;
  const al = allianceOf(p, b.phaseNumber);
  if (al === b.defenderAllianceId) return 'DEFENDER';
  if (al === b.attackerAllianceId && (b.kind !== 'CAMPAIGN' || b.attackers.length === 0)) return 'ATTACKER';
  return null;
}

/** Spieler übernimmt die Verteidigung (bzw. den Angriff), verstärkt seine Seite oder tritt zurück */
export function claimSide(ctx: Ctx, battleId: string, playerId: string, mode: ClaimMode = 'TAKE_OVER') {
  const st = ctx.state;
  const b = battle(ctx, battleId);
  if (b.status !== 'SCHEDULED') fail('Teilnehmer lassen sich nur ändern, solange die Schlacht offen ist – bitte beim Spielleiter melden');
  if (b.draft) fail('Es liegt ein gemeldetes Ergebnis vor – Teilnehmer ändert jetzt nur der Spielleiter');
  const side = claimableSide(st, b, playerId);
  if (!side) fail('Nur Mitglieder der verteidigenden Allianz können die Verteidigung übernehmen');
  const p = st.players.find((x) => x.id === playerId)!;
  const list = sideList(b, side);
  const mine = list.some((x) => x.playerId === playerId);
  if (mode === 'LEAVE') {
    if (!mine) fail('Du bist in dieser Schlacht nicht eingetragen');
    setSideList(
      b,
      side,
      list.filter((x) => x.playerId !== playerId),
    );
    log(ctx, side === 'DEFENDER' ? `${p.nickname} gibt die Verteidigung ab: ${battleWhere(b)}` : `${p.nickname} gibt den Angriff ab: ${battleWhere(b)}`);
    return;
  }
  if (!mine) checkCap(ctx, b, [{ playerId, side }]);
  if (mode === 'JOIN') {
    if (mine) fail('Du bist in dieser Schlacht bereits eingetragen');
    setSideList(b, side, [...list, { playerId, faction: p.faction }]);
    log(ctx, side === 'DEFENDER' ? `${p.nickname} verstärkt die Verteidigung: ${battleWhere(b)}` : `${p.nickname} verstärkt den Angriff: ${battleWhere(b)}`);
  } else {
    if (mine && list.length === 1) fail('Du bist in dieser Schlacht bereits eingetragen');
    setSideList(b, side, [{ playerId, faction: p.faction }]);
    log(ctx, side === 'DEFENDER' ? `${p.nickname} übernimmt die Verteidigung: ${battleWhere(b)}` : `${p.nickname} übernimmt den Angriff: ${battleWhere(b)}`);
  }
  hintLoad(ctx, b);
}

// ─── Ergebnis-Entwürfe (N1.2) ──────────────────────────────────────────────

/** Felder, die ein Spieler im Ergebnis setzen darf (kein Override des Siegers, keine SL-Notizen) */
const PLAYER_FIELDS: (keyof BattleUpdate)[] = ['attackers', 'defenders', 'playedAt', 'size', 'mission', 'theatre', 'theatreRoll', 'twistRoll', 'vp', 'battleReady', 'report', 'photos', 'games'];

const closed = (b: Battle) => b.status === 'PROCESSED' || b.status === 'VOID' || b.status === 'UNPLAYED_RESOLVED';

export function submitDraft(ctx: Ctx, battleId: string, playerId: string, update: BattleUpdate, decisions: Record<string, OutcomeDecision> = {}) {
  const st = ctx.state;
  const b = battle(ctx, battleId);
  if (closed(b)) fail('Die Schlacht ist bereits abgeschlossen');
  const side = sideOf(st, b, playerId);
  if (!side) fail('Nur Teilnehmer der Schlacht können ein Ergebnis melden');
  // Offener Entwurf eines anderen Spielers wird nicht stillschweigend überschrieben
  if (b.draft?.status === 'PENDING' && b.draft.byPlayerId !== playerId) {
    if (sideOf(st, b, b.draft.byPlayerId) === side) fail('Deine Seite hat bereits ein Ergebnis gemeldet – es wartet auf Bestätigung der Gegenseite');
    fail('Die Gegenseite hat bereits ein Ergebnis gemeldet – bitte bestätigen oder widersprechen');
  }
  // Wer meldet, spielt mit: eine leere Seite übernimmt den Meldenden (R1)
  recordParticipant(ctx, b, playerId, side);
  const clean: BattleUpdate = {};
  for (const k of PLAYER_FIELDS) if (update[k] !== undefined) (clean as Record<string, unknown>)[k] = update[k];
  // leere Teilnehmerlisten würden eingetragene Spieler wieder löschen
  if (clean.attackers && !clean.attackers.length) delete clean.attackers;
  if (clean.defenders && !clean.defenders.length) delete clean.defenders;
  if (!clean.vp && !clean.games?.length) fail('Siegpunkte beider Seiten angeben');
  // Probelauf auf einer Kopie: gleiche Validierung wie beim Spielleiter
  const probe = structuredClone(b);
  const trial: Ctx = { ...ctx, log: [], warnings: [], hints: [], soft: [], state: { ...st, battles: st.battles.map((x) => (x.id === b.id ? probe : x)) } };
  updateBattle(trial, b.id, clean);
  // A4 (Review): harte Obergrenze auch für per Entwurf eingetragene Mitspieler – wie bei BATTLE_UPDATE
  checkCap(trial, probe, addedParticipants(b, probe));
  // Outcome-Entscheidungen trifft nur die Siegerseite (N1.2)
  if (Object.keys(decisions).length) {
    const v = effectiveVictor(probe);
    if (!v) fail('Erst Ergebnis eintragen');
    if (v !== 'DRAW' && sideOf(trial.state, probe, playerId) !== v) fail('Entscheidungen zum Campaign Outcome trifft nur die Siegerseite');
  }
  for (const [opId, d] of Object.entries(decisions)) setDecision(trial, b.id, opId, d);
  for (const w of trial.warnings) warn(ctx, w);
  b.draft = { byPlayerId: playerId, at: ctx.now, update: clean, decisions, status: 'PENDING' };
  log(ctx, `Ergebnis gemeldet von ${playerName(st, playerId)} – wartet auf Bestätigung der Gegenseite`);
}

/** S4 (Review): Bestätigung und Widerspruch gelten nur für den Stand der Meldung, den der Spieler gesehen hat */
export const DRAFT_CHANGED = 'Die Meldung wurde inzwischen geändert – bitte erneut prüfen';

function checkDraftVersion(d: { at: string }, draftAt: string | undefined) {
  if (draftAt !== undefined && draftAt !== d.at) fail(DRAFT_CHANGED);
}

export function confirmDraft(ctx: Ctx, battleId: string, playerId: string | null, draftAt?: string) {
  const st = ctx.state;
  const b = battle(ctx, battleId);
  const d = b.draft;
  if (!d) fail('Kein Ergebnis zur Bestätigung');
  checkDraftVersion(d, draftAt);
  if (closed(b)) fail('Die Schlacht ist bereits abgeschlossen – der Entwurf kann nur noch verworfen werden');
  if (playerId) {
    const mine = sideOf(st, b, playerId);
    const theirs = sideOf(st, b, d.byPlayerId);
    if (!mine) fail('Nur Teilnehmer der Schlacht können bestätigen');
    if (mine === theirs) fail('Bestätigen muss die Gegenseite');
    recordParticipant(ctx, b, playerId, mine);
  }
  // ältere Entwürfe: der Meldende steht noch nicht in der Schlacht
  const by = sideOf(st, b, d.byPlayerId);
  if (by) recordParticipant(ctx, b, d.byPlayerId, by);
  const upd: BattleUpdate = { ...d.update };
  if (upd.attackers && !upd.attackers.length) delete upd.attackers;
  if (upd.defenders && !upd.defenders.length) delete upd.defenders;
  const before = { attackers: [...b.attackers], defenders: [...b.defenders] };
  updateBattle(ctx, b.id, upd);
  checkCap(ctx, b, addedParticipants(before, b));
  for (const [opId, dec] of Object.entries(d.decisions)) setDecision(ctx, b.id, opId, dec);
  b.draft = null;
  log(ctx, `Ergebnis bestätigt von ${playerName(st, playerId)}`);
}

export function disputeDraft(ctx: Ctx, battleId: string, playerId: string, reason: string, draftAt?: string) {
  const st = ctx.state;
  const b = battle(ctx, battleId);
  const d = b.draft;
  if (!d) fail('Kein Ergebnis zum Widersprechen');
  checkDraftVersion(d, draftAt);
  const mine = sideOf(st, b, playerId);
  if (!mine || mine === sideOf(st, b, d.byPlayerId)) fail('Widersprechen kann nur die Gegenseite');
  if (!reason.trim()) fail('Bitte kurz begründen');
  d.status = 'DISPUTED';
  d.disputeReason = reason.trim().slice(0, 500);
  d.disputedBy = playerId;
  log(ctx, `Ergebnis angefochten von ${playerName(st, playerId)}: ${d.disputeReason} – der Spielleiter entscheidet`);
}

export function discardDraft(ctx: Ctx, battleId: string) {
  const b = battle(ctx, battleId);
  if (!b.draft) fail('Kein Entwurf vorhanden');
  b.draft = null;
  log(ctx, 'Ergebnis-Entwurf verworfen');
}

/** Entwurf, der seit mehr als 48 h unbestätigt ist (Spielleiter entscheidet) */
export function draftOverdue(b: Battle, now: number): boolean {
  return !!b.draft && b.draft.status === 'PENDING' && now - new Date(b.draft.at).getTime() > 48 * 3600_000;
}

// ─── Terminfindung (N1.5) ──────────────────────────────────────────────────

export function proposeTimes(ctx: Ctx, battleId: string, playerId: string | null, times: string[]) {
  const st = ctx.state;
  const b = battle(ctx, battleId);
  if (closed(b)) fail('Die Schlacht ist bereits abgeschlossen');
  const side = playerId ? sideOf(st, b, playerId) : 'GM';
  if (!side) fail('Nur Teilnehmer der Schlacht können Termine vorschlagen');
  // F1: nur strikt gültige ISO-Zeitpunkte (2000–2100) – sonst stürzen Kalender-Feeds ab
  const clean = [...new Set(times.filter(isIsoDate))].slice(0, 3);
  if (clean.length < 1) fail('1–3 Termine vorschlagen');
  if (playerId && side !== 'GM') recordParticipant(ctx, b, playerId, side);
  for (const t of clean) hintClashes(ctx, b, t, playerId);
  b.proposals = [...(b.proposals ?? []).filter((p) => p.side !== side), { id: ctx.newId('tp'), byPlayerId: playerId, side, times: clean, at: ctx.now }];
  log(ctx, `Terminvorschlag von ${playerName(st, playerId)}: ${clean.map((t) => neutralTime(t, st.meta.timezone)).join(', ')}`);
}

export function acceptTime(ctx: Ctx, battleId: string, playerId: string | null, time: string) {
  const st = ctx.state;
  const b = battle(ctx, battleId);
  const side = playerId ? sideOf(st, b, playerId) : 'GM';
  if (!side) fail('Nur Teilnehmer der Schlacht können Termine bestätigen');
  if (!isIsoDate(time)) fail('Ungültiger Termin');
  const prop = (b.proposals ?? []).find((p) => p.times.includes(time));
  if (!prop) fail('Termin ist nicht vorgeschlagen');
  if (side !== 'GM' && prop.side === side) fail('Den eigenen Vorschlag bestätigt die Gegenseite');
  if (playerId && side !== 'GM') recordParticipant(ctx, b, playerId, side);
  // der Vorschlagende steht damit ebenfalls fest
  if (prop.byPlayerId && prop.side !== 'GM') recordParticipant(ctx, b, prop.byPlayerId, prop.side);
  hintClashes(ctx, b, time, playerId);
  b.scheduledAt = time;
  b.proposals = [];
  log(ctx, `Termin für ${b.planetId ? planetName(b.planetId) : 'Schlacht'} bestätigt: ${neutralTime(time, st.meta.timezone)}`);
}

/** Abstand, unterhalb dessen zwei Termine eines Spielers kollidieren (±3 h) */
export const CLASH_WINDOW_MS = 3 * 3600_000;

export interface TimeClash {
  playerId: string;
  battleId: string;
  at: string;
}

/**
 * Terminkollisionen (N1.5): Spieler dieser Schlacht (und der Handelnde), die innerhalb von ±3 h bereits
 * einen bestätigten Termin in einer anderen offenen Schlacht haben.
 */
export function timeClashes(st: CampaignState, b: Battle, time: string, extraPlayerId: string | null = null): TimeClash[] {
  const t = new Date(time).getTime();
  if (Number.isNaN(t)) return [];
  const ids = new Set([...b.attackers, ...b.defenders].map((p) => p.playerId));
  if (extraPlayerId) ids.add(extraPlayerId);
  const out: TimeClash[] = [];
  for (const o of st.battles) {
    if (o.id === b.id || !o.scheduledAt || o.status === 'VOID' || o.status === 'PROCESSED' || o.status === 'UNPLAYED_RESOLVED') continue;
    if (Math.abs(new Date(o.scheduledAt).getTime() - t) >= CLASH_WINDOW_MS) continue;
    for (const p of [...o.attackers, ...o.defenders]) {
      if (ids.has(p.playerId) && !out.some((c) => c.playerId === p.playerId && c.battleId === o.id)) out.push({ playerId: p.playerId, battleId: o.id, at: o.scheduledAt });
    }
  }
  return out;
}

function hintClashes(ctx: Ctx, b: Battle, time: string, playerId: string | null) {
  const st = ctx.state;
  for (const c of timeClashes(st, b, time, playerId)) {
    const o = st.battles.find((x) => x.id === c.battleId)!;
    hint(ctx, `Terminüberschneidung: ${playerName(st, c.playerId)} spielt am ${fmtTime(st, c.at)} bereits ${battleWhere(o)}`);
  }
}

const fmtTime = (st: CampaignState, t: string) => neutralTime(t, st.meta.timezone);

// ─── Allianz-Notizen (N1.3) ────────────────────────────────────────────────

export function addNote(ctx: Ctx, allianceId: string, playerId: string | null, text: string) {
  const st = ctx.state;
  if (!st.alliances.some((a) => a.id === allianceId)) fail('Unbekannte Allianz');
  const t = text.trim();
  if (!t) fail('Leere Notiz');
  if (t.length > 2000) fail('Notiz ist zu lang (höchstens 2000 Zeichen)');
  st.allianceNotes = [...(st.allianceNotes ?? []), { id: ctx.newId('note'), allianceId, playerId, text: t, at: ctx.now }];
  log(ctx, `Allianz-Notiz für ${allianceName(st, allianceId)} von ${playerName(st, playerId)}`);
}

export function deleteNote(ctx: Ctx, id: string) {
  const st = ctx.state;
  if (!(st.allianceNotes ?? []).some((n) => n.id === id)) fail('Notiz nicht gefunden');
  st.allianceNotes = (st.allianceNotes ?? []).filter((n) => n.id !== id);
  log(ctx, 'Allianz-Notiz gelöscht');
}

// ─── Profil ────────────────────────────────────────────────────────────────

export interface ProfileUpdate {
  nickname?: string;
  faction?: string;
  subfaction?: string;
  avatar?: string | null;
  notify?: Partial<Record<NotifyCategory, boolean>>;
  locale?: 'de' | 'en' | 'fr' | 'es' | 'pl';
}

/** Upload-Kennung (Avatar, Foto, Porträt) wie von saveUpload erzeugt */
export const UPLOAD_ID_RE = /^[A-Za-z0-9_-]{8,40}$/;
const NOTIFY_KEYS: readonly NotifyCategory[] = ['PHASE', 'RESULTS', 'DEADLINES', 'PERSONAL'];

export function updateProfile(ctx: Ctx, playerId: string, u: ProfileUpdate) {
  const st = ctx.state;
  const p = st.players.find((x) => x.id === playerId);
  if (!p) fail('Spieler nicht gefunden');
  if (u.nickname !== undefined) {
    const n = singleLine(String(u.nickname)).slice(0, 40).trim();
    if (!n) fail('Nickname darf nicht leer sein');
    if (st.players.some((x) => x.id !== p.id && x.nickname.toLowerCase() === n.toLowerCase())) fail('Nickname ist schon vergeben');
    p.nickname = n;
  }
  if (u.faction !== undefined || u.subfaction !== undefined) {
    // Längen begrenzt: Fraktion und Subfraktion landen in jeder Revision (Speicherschutz)
    const faction = singleLine(String(u.faction ?? p.faction))
      .slice(0, 80)
      .trim();
    const subfaction = singleLine(String(u.subfaction ?? p.subfaction))
      .slice(0, 80)
      .trim();
    if (faction !== p.faction || subfaction !== p.subfaction) {
      const prev = { faction: p.faction, subfaction: p.subfaction };
      p.faction = faction;
      p.subfaction = subfaction;
      recordFactionChange(st, p, prev);
    }
  }
  if (u.avatar !== undefined) {
    if (u.avatar !== null && (typeof u.avatar !== 'string' || !UPLOAD_ID_RE.test(u.avatar))) fail('Ungültiges Bild');
    p.avatar = u.avatar;
  }
  if (u.notify !== undefined) {
    // nur bekannte Kategorien mit Wahrheitswerten übernehmen
    if (!u.notify || typeof u.notify !== 'object' || Array.isArray(u.notify)) fail('Ungültige Benachrichtigungseinstellung');
    const clean: Partial<Record<NotifyCategory, boolean>> = {};
    for (const k of NOTIFY_KEYS) if (typeof u.notify[k] === 'boolean') clean[k] = u.notify[k];
    p.notify = { ...p.notify, ...clean };
  }
  if (u.locale) p.locale = (['de', 'en', 'fr', 'es', 'pl'] as const).find((l) => l === u.locale) ?? 'de';
  log(ctx, `Profil von ${p.nickname} aktualisiert`);
}

// ─── Eingabeprüfung (Speicherschutz, Steuerzeichen) ────────────────────────

/** Jeder Command wird samt vollem Zustand als Revision gespeichert: Obergrenzen für die serialisierte Größe */
export const MAX_PLAYER_COMMAND_BYTES = 64 * 1024;
export const MAX_COMMAND_BYTES = 4 * 1024 * 1024;
/** längster einzelner Freitext eines Spieler-Commands (Berichte, Notizen, Begründungen) */
export const MAX_PLAYER_TEXT = 5000;
const MAX_PLAYER_ARRAY = 200;
const MAX_DEPTH = 32;

/** Steuerzeichen entfernen (außer Zeilenumbruch und Tabulator); \r fällt immer weg */
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000D\u000E-\u001F\u007F\u2028\u2029]/g;
export const stripControl = (s: string) => s.replace(CONTROL_RE, '');
/** Einzeilige Texte (Namen, Titel): zusätzlich Zeilenumbrüche und Tabulatoren zu Leerzeichen */
export const singleLine = (s: string) => stripControl(s).replace(/[\n\t]+/g, ' ');
/** Felder, die nie mehrzeilig sind */
const SINGLE_LINE_KEYS = new Set(['nickname', 'name', 'title', 'faction', 'subfaction', 'realName', 'discord', 'email', 'unit', 'caption', 'label', 'mission', 'externalName']);

/**
 * Bereinigt alle Zeichenketten eines Commands (Kopie): Steuerzeichen raus, einzeilige Felder ohne Umbrüche.
 * Betrifft nur Freitexte – IDs und Zeitstempel enthalten ohnehin keine Steuerzeichen.
 */
export function sanitizeCommand<T>(cmd: T): T {
  const walk = (v: unknown, key: string | null, depth: number): unknown => {
    if (typeof v === 'string') return key && SINGLE_LINE_KEYS.has(key) ? singleLine(v) : stripControl(v);
    if (depth > MAX_DEPTH) return v;
    if (Array.isArray(v)) return v.map((x) => walk(x, key, depth + 1));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k, depth + 1)]));
    return v;
  };
  return walk(cmd, null, 0) as T;
}

/**
 * Formale Prüfung eines Commands vor der Ausführung: Form, serialisierte Größe, Verschachtelung und – für Spieler –
 * Länge der Freitexte, Zahl der Listeneinträge und Upload-Kennungen. Liefert eine Fehlermeldung oder null.
 */
export function checkCommandInput(cmd: unknown, player: boolean): string | null {
  if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd) || typeof (cmd as { type?: unknown }).type !== 'string') return 'Ungültige Aktion';
  let size: number;
  try {
    size = new TextEncoder().encode(JSON.stringify(cmd) ?? '').length;
  } catch {
    return 'Ungültige Aktion';
  }
  if (size > (player ? MAX_PLAYER_COMMAND_BYTES : MAX_COMMAND_BYTES)) return 'Die Eingabe ist zu groß';
  let err: string | null = null;
  const walk = (v: unknown, depth: number) => {
    if (err) return;
    if (depth > MAX_DEPTH) err = 'Ungültige Aktion';
    else if (typeof v === 'string') {
      if (player && v.length > MAX_PLAYER_TEXT) err = `Text ist zu lang (höchstens ${MAX_PLAYER_TEXT} Zeichen)`;
    } else if (Array.isArray(v)) {
      if (player && v.length > MAX_PLAYER_ARRAY) err = 'Zu viele Einträge';
      else for (const x of v) walk(x, depth + 1);
    } else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x, depth + 1);
  };
  walk(cmd, 0);
  if (err || !player) return err;
  // Bild-Kennungen aus Spielerhand: nur echte Upload-IDs
  const c = cmd as Command;
  const badId = (x: unknown) => x !== null && x !== undefined && (typeof x !== 'string' || !UPLOAD_ID_RE.test(x));
  if (c.type === 'COMMANDER_UPDATE' && badId(c.portrait)) return 'Ungültiges Bild';
  if (c.type === 'PROFILE_UPDATE' && c.update && typeof c.update === 'object' && badId(c.update.avatar)) return 'Ungültiges Bild';
  if (c.type === 'RESULT_DRAFT_SUBMIT' && c.update && typeof c.update === 'object' && c.update.photos !== undefined) {
    if (!Array.isArray(c.update.photos) || c.update.photos.some((x) => x === null || badId(x))) return 'Ungültiges Bild';
  }
  return null;
}

// ─── Berechtigung ──────────────────────────────────────────────────────────

/** Commands, die ein Spieler über seinen Link auslösen darf */
export const PLAYER_COMMANDS = new Set<Command['type']>([
  'OP_SET',
  'OP_CLEAR',
  'MOVE_SET',
  'BUILD_SET',
  'RESULT_DRAFT_SUBMIT',
  'RESULT_DRAFT_CONFIRM',
  'RESULT_DRAFT_DISPUTE',
  'TIME_PROPOSE',
  'TIME_ACCEPT',
  'BATTLE_CLAIM_SIDE',
  'BATTLE_DECISION',
  'EVENT_INPUT',
  'NOTE_ADD',
  'NOTE_DELETE',
  'PROFILE_UPDATE',
  'COMMANDER_UPDATE',
  // R1: Gast eintragen (B3), freie Gefechte (B5)
  'BATTLE_GUEST_SET',
  'SKIRMISH_REPORT',
  'SKIRMISH_CONFIRM',
  'SKIRMISH_DELETE',
  // R2: Abwesenheit, Phasen-Puls, persönliche Ziele, Nemesis, Großschlacht
  ...R2_PLAYER_COMMANDS,
  // P1: Spieltisch zum vereinbarten Termin (NTH2 2.5)
  'BATTLE_TABLE_SET',
  // P2: Bild der Phase abstimmen, Bemal-Chronik
  ...P2_PLAYER_COMMANDS,
  // P3: Order of Battle (Crusade)
  ...P3_PLAYER_COMMANDS,
]);

function commanderOf(st: CampaignState, fleetId: string): string | null {
  const f = st.fleets.find((x) => x.id === fleetId);
  if (!f || st.stage.kind !== 'PHASE') return null;
  return f.commanders[String(st.stage.phase)] ?? null;
}

/**
 * Darf der Spieler für die Allianz bauen (N1.2)? Anführer vorhanden und aktives Mitglied → nur er;
 * ohne Anführer (oder wenn er nicht mehr aktiv in der Allianz ist) → jedes aktive Mitglied.
 */
export function mayBuild(st: CampaignState, allianceId: string, playerId: string): boolean {
  const phase = st.stage.kind === 'PHASE' ? st.stage.phase : undefined;
  const members = playersOfAlliance(st, allianceId, phase);
  if (!members.some((p) => p.id === playerId)) return false;
  const leader = st.alliances.find((a) => a.id === allianceId)?.leaderPlayerId;
  if (leader && members.some((p) => p.id === leader)) return leader === playerId;
  return true;
}

/**
 * Darf der Spieler diesen Command auslösen? Liefert eine Fehlermeldung oder null.
 * Die Regelprüfung selbst übernimmt danach die Engine wie beim Spielleiter.
 */
export function authorizePlayer(st: CampaignState, player: Player, cmd: Command): string | null {
  const invalid = checkCommandInput(cmd, true);
  if (invalid) return invalid;
  if (!PLAYER_COMMANDS.has(cmd.type)) return 'Diese Aktion ist dem Spielleiter vorbehalten';
  if (!player.active) return 'Dein Spielerkonto ist inaktiv';
  // B5: nach Kampagnenende gilt die Mitgliedschaft der letzten Phase
  const myAlliance = allianceOf(player, stagePhase(st));
  if (R2_TYPES.has(cmd.type as R2Command['type'])) return authorizeR2(st, player, cmd as R2Command);
  if (P2_TYPES.has(cmd.type as P2Command['type'])) return authorizeP2(st, player, cmd as P2Command);
  if (P3_TYPES.has(cmd.type as P3Command['type'])) return authorizeP3(st, player, cmd as P3Command);
  switch (cmd.type) {
    case 'OP_SET':
    case 'OP_CLEAR':
    case 'MOVE_SET':
      return commanderOf(st, cmd.fleetId) === player.id ? null : 'Befehle gibt nur der Kommandant der Flotte in dieser Phase';
    case 'BUILD_SET':
      if (cmd.allianceId !== myAlliance) return 'Nur für die eigene Allianz';
      return mayBuild(st, cmd.allianceId, player.id) ? null : 'Über den Bau entscheidet der Anführer der Allianz';
    case 'RESULT_DRAFT_CONFIRM':
    case 'RESULT_DRAFT_DISPUTE':
      // S4: Spieler bestätigen bzw. widersprechen immer einem bestimmten Stand der Meldung
      if (typeof cmd.draftAt !== 'string') return DRAFT_CHANGED;
      return cmd.playerId === player.id ? null : 'Nur im eigenen Namen';
    case 'RESULT_DRAFT_SUBMIT':
    case 'TIME_PROPOSE':
    case 'TIME_ACCEPT':
    case 'BATTLE_CLAIM_SIDE':
    case 'EVENT_INPUT':
      return cmd.playerId === player.id ? null : 'Nur im eigenen Namen';
    case 'BATTLE_DECISION': {
      // R2: Bei einer ungespielt gewerteten Schlacht entscheidet der „controlling player“ der Siegerseite
      const b = st.battles.find((x) => x.id === cmd.battleId);
      if (!b) return 'Schlacht nicht gefunden';
      if (b.status !== 'UNPLAYED_RESOLVED') return 'Entscheidungen zum Campaign Outcome schickst du mit dem Ergebnis – sonst trägt sie der Spielleiter ein';
      return mayDecideOutcome(st, b, cmd.opId, player.id) ? null : 'Über die Outcomes entscheidet der Kommandant der siegreichen Seite';
    }
    case 'NOTE_ADD':
      return cmd.playerId === player.id && cmd.allianceId === myAlliance ? null : 'Nur Notizen der eigenen Allianz';
    case 'NOTE_DELETE': {
      const n = (st.allianceNotes ?? []).find((x) => x.id === cmd.id);
      return n && n.playerId === player.id ? null : 'Nur eigene Notizen löschen';
    }
    case 'PROFILE_UPDATE':
    case 'COMMANDER_UPDATE':
      return cmd.playerId === player.id ? null : 'Nur das eigene Profil';
    case 'BATTLE_GUEST_SET':
    case 'SKIRMISH_REPORT':
    case 'SKIRMISH_CONFIRM':
    case 'SKIRMISH_DELETE':
      return cmd.playerId === player.id ? null : 'Nur im eigenen Namen';
    case 'BATTLE_TABLE_SET':
      return cmd.playerId === player.id ? null : 'Nur im eigenen Namen';
    default:
      return 'Nicht erlaubt';
  }
}

/**
 * Wer trifft die Outcome-Entscheidungen einer ungespielt gewerteten Schlacht (R2, [R] 2.3 „controlling player“)?
 * Angreifer siegt: der Kommandant der Flotte dieser Operation (ohne Kommandant: die eingetragenen Angreifer).
 * Verteidiger siegt: die eingetragenen Verteidiger, ohne Eintrag jedes Mitglied der verteidigenden Allianz.
 */
export function mayDecideOutcome(st: CampaignState, b: Battle, opId: string, playerId: string): boolean {
  const p = st.players.find((x) => x.id === playerId);
  if (!p?.active || !b.operationIds.includes(opId)) return false;
  const v = effectiveVictor(b);
  if (v === 'ATTACKER') {
    const op = findOperation(st, opId);
    const lead = op ? fleetCommander(st, op.fleetId, b.phaseNumber) : null;
    if (lead) return lead === playerId;
    if (b.attackers.length) return b.attackers.some((x) => x.playerId === playerId);
    return allianceOf(p, b.phaseNumber) === b.attackerAllianceId;
  }
  if (v === 'DEFENDER') {
    if (b.defenders.length) return b.defenders.some((x) => x.playerId === playerId);
    return allianceOf(p, b.phaseNumber) === b.defenderAllianceId;
  }
  return false;
}

/** Spiellast (N1.6): Schlachten je Spieler in einer Phase */
export function battlesPerPlayer(st: CampaignState, phaseNumber: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of st.battles) {
    if (b.phaseNumber !== phaseNumber || b.status === 'VOID') continue;
    for (const p of [...b.attackers, ...b.defenders]) out[p.playerId] = (out[p.playerId] ?? 0) + 1;
  }
  return out;
}

/**
 * Verteidiger-Vorschlag: Spieler der Allianz mit den wenigsten Schlachten dieser Phase, dann (A3) mit den
 * wenigsten bisherigen Paarungen gegen die Angreifer, dann insgesamt. Wer die harte Obergrenze (A4) erreicht
 * hat, wird nicht vorgeschlagen.
 */
export function suggestDefender(st: CampaignState, allianceId: string, phaseNumber: number, attackerIds: string[] = [], excludeBattleId?: string): string | null {
  const c = rankDefenders(st, allianceId, phaseNumber, attackerIds, excludeBattleId)[0];
  return c && !c.capped ? c.playerId : null;
}

/** Schwelle der Hausregel „max. X Schlachten je Spieler und Phase“ (N1.6); null = aus */
export function loadLimit(st: CampaignState): number | null {
  const max = st.toggles.load?.maxPerPlayer;
  return max && max > 0 ? max : null;
}

/** Spieler über der Schwelle in einer Phase (N1.6): gewarnt wird ab X + 1 Schlachten */
export function overloadedPlayers(st: CampaignState, phaseNumber: number): { playerId: string; count: number }[] {
  const max = loadLimit(st);
  if (!max) return [];
  const load = battlesPerPlayer(st, phaseNumber);
  return Object.entries(load)
    .filter(([, n]) => n > max)
    .map(([playerId, count]) => ({ playerId, count }));
}

function loadMessage(st: CampaignState, b: Battle): string | null {
  const max = loadLimit(st);
  if (!max) return null;
  const load = battlesPerPlayer(st, b.phaseNumber);
  const over = [...new Set([...b.attackers, ...b.defenders].map((p) => p.playerId))].filter((id) => (load[id] ?? 0) > max);
  return over.length ? `Spiellast: ${over.map((id) => playerName(st, id)).join(', ')} über ${max} Schlacht(en) in Phase ${b.phaseNumber}` : null;
}

/** Warnung bei Überschreitung der Spiellast, wenn der Spielleiter Teilnehmer einträgt (Override mit Begründung) */
export function warnLoad(ctx: Ctx, b: Battle) {
  const m = loadMessage(ctx.state, b);
  if (m) warn(ctx, m);
}

/** Spiellast einer ganzen Phase als Hinweis (nach dem Reveal) */
export function hintLoadPhase(ctx: Ctx, phaseNumber: number) {
  const st = ctx.state;
  const over = overloadedPlayers(st, phaseNumber);
  if (over.length) hint(ctx, `Spiellast: ${over.map((o) => playerName(st, o.playerId)).join(', ')} über ${loadLimit(st)} Schlacht(en) in Phase ${phaseNumber}`);
}

/** Dieselbe Prüfung als Hinweis, wenn sich ein Spieler selbst einträgt – Spielerlinks dürfen daran nicht scheitern */
export function hintLoad(ctx: Ctx, b: Battle) {
  const m = loadMessage(ctx.state, b);
  if (m) hint(ctx, m);
}

export { curPhase };
