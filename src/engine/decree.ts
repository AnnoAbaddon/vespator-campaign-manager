import { fail, log, type Ctx } from './ctx';
import { MEDALS } from './data/vespator';
import { ATTACK_TYPES } from './data/vespator';
import { eventName } from './customEvents';
import { mapOf, planetName } from './map';
import { effectiveVictor } from './outcomes';
import type { CampaignState, Participant } from './types';
import { DECREE_HEADINGS, DECREE_LANGS, DECREE_TEXTS, DECREE_WORDS, type DecreeLang, type DecreeSlot, type DecreeTone } from './decreeTexts';

export type { DecreeLang, DecreeSlot, DecreeTone };
export { DECREE_LANGS };

/**
 * Dekret-Baukasten (NTH2 4.1, ohne KI): stellt aus den Fakten einer Phase einen Dekret-Entwurf aus
 * vorbereiteten Lückentexten zusammen. Die Fakten stammen ausschließlich aus der öffentlichen Projektion
 * (toPublicView) – verdeckte Befehle, SL-Notizen, private Dispatches oder geheime Ziele können so nie in
 * einen Entwurf geraten. Die Varianten wählt ein Zufallsgenerator mit Startwert („Neu würfeln“ = neuer
 * Startwert); gleicher Startwert ergibt denselben Text. Der Entwurf landet im Dispatch-Editor und wird erst
 * dort vom Warmaster bearbeitet und veröffentlicht.
 */

export const DECREE_TONES: DecreeTone[] = ['PROCLAMATION', 'COMMISSAR', 'CHRONICLER'];
export const TONE_LABEL: Record<DecreeTone, string> = { PROCLAMATION: 'Imperiale Proklamation', COMMISSAR: 'Kommissar-Frontbericht', CHRONICLER: 'Chronist' };

/** Platzhalter je Baustein-Art (für den Editor eigener Bausteine) */
export const SLOT_VARS: Record<DecreeSlot, string[]> = {
  TITLE: ['campaign', 'phase', 'phaseCount'],
  INTRO: ['campaign', 'phase', 'phaseCount'],
  BATTLE_WIN: ['planet', 'attack', 'winner', 'loser', 'vp', 'winnerPlayers', 'loserPlayers'],
  BATTLE_DRAW: ['planet', 'attack', 'attacker', 'defender', 'vp'],
  BATTLE_UNPLAYED: ['planet', 'attack', 'winner', 'loser'],
  PL_GAIN: ['alliance', 'planet', 'from', 'to'],
  PL_LOSS: ['alliance', 'planet', 'from', 'to'],
  EVENT: ['event', 'alliance'],
  OBJECTIVE_MET: ['objective', 'alliances'],
  OBJECTIVE_FAILED: ['objective'],
  HONOR: ['player', 'honor'],
  MEDAL: ['medal', 'alliance'],
  POINTS: ['standings'],
  STANDINGS_FOG: ['standings'],
  LEADER: ['leader'],
  QUIET: ['campaign', 'phase'],
  OUTRO: ['campaign', 'phase', 'phaseCount'],
};

export const DECREE_SLOTS = Object.keys(SLOT_VARS) as DecreeSlot[];

/** Anzeigenamen der Baustein-Arten (Übersetzungsschlüssel) */
export const SLOT_LABEL: Record<DecreeSlot, string> = {
  TITLE: 'Titel',
  INTRO: 'Einleitung',
  BATTLE_WIN: 'Schlacht mit Sieger',
  BATTLE_DRAW: 'Schlacht unentschieden',
  BATTLE_UNPLAYED: 'Schlacht ohne Kampf',
  PL_GAIN: 'Power Level steigt',
  PL_LOSS: 'Power Level sinkt',
  EVENT: 'Ereignis',
  OBJECTIVE_MET: 'Sonderziel erfüllt',
  OBJECTIVE_FAILED: 'Sonderziel verfehlt',
  HONOR: 'Ehrung',
  MEDAL: 'Medaille',
  POINTS: 'Punktestand',
  STANDINGS_FOG: 'Rangfolge (Nebel)',
  LEADER: 'Führende Allianz',
  QUIET: 'Phase ohne Schlacht',
  OUTRO: 'Schluss',
};

/** Eigener Textbaustein des Warmasters */
export interface DecreeBlock {
  id: string;
  slot: DecreeSlot;
  /** 'ANY' = für jeden Tonfall */
  tone: DecreeTone | 'ANY';
  lang: DecreeLang;
  text: string;
}

export const DECREE_MAX_BLOCKS = 300;

// ─── Fakten ───────────────────────────────────────────────────────────────

export interface DecreeBattleFact {
  planet: string;
  attack: string;
  attacker: string;
  defender: string;
  /** null = unentschieden */
  winner: string | null;
  loser: string | null;
  winnerPlayers: string;
  loserPlayers: string;
  /** Siegpunkte in Reihenfolge Sieger:Verlierer (bei Unentschieden Angreifer:Verteidiger); null = keine */
  vp: [number, number] | null;
  unplayed: boolean;
}

export interface DecreeFacts {
  campaign: string;
  phase: number;
  phaseCount: number;
  battles: DecreeBattleFact[];
  pl: { planet: string; alliance: string; from: number; to: number }[];
  events: { event: string; alliance: string }[];
  objectives: { objective: string; met: boolean; alliances: string[] }[];
  honors: { player: string; honor: string }[];
  medals: { medal: string; alliance: string }[];
  /** exakte Punkte (ohne Nebel) */
  points: { alliance: string; points: number }[] | null;
  /** Rang und Tendenz (Nebel über dem Punktestand, C1) */
  fog: { alliance: string; rank: number; tendency: keyof (typeof DECREE_WORDS)['de']['tendency'] }[] | null;
  leader: string | null;
}

const MAX_PL_LINES = 8;

/**
 * Fakten einer Phase aus der **öffentlichen** Projektion (Aufrufer übergeben toPublicView(state)).
 * Schlachten: Kampagnenschlachten und Entscheidungsschlacht mit Ergebnis; PL-Änderungen: Vergleich der
 * veröffentlichten Stände am Ende der Vorphase und dieser Phase (ohne Wertung: aktueller Kartenstand).
 */
export function decreeFacts(pub: CampaignState, phase: number): DecreeFacts {
  mapOf(pub);
  const al = (id: string | null | undefined) => pub.alliances.find((a) => a.id === id)?.name ?? '?';
  const names = (list: Participant[]) =>
    list
      .map((p) => pub.players.find((x) => x.id === p.playerId)?.nickname)
      .filter((n): n is string => !!n)
      .join(' & ');
  const battles: DecreeBattleFact[] = [];
  for (const b of pub.battles
    .filter((x) => x.phaseNumber === phase && (x.kind === 'CAMPAIGN' || x.kind === 'FINAL_TIEBREAK') && ['PLAYED', 'UNPLAYED_RESOLVED', 'PROCESSED'].includes(x.status))
    .sort((x, y) => (x.playedAt ?? '').localeCompare(y.playedAt ?? '') || x.createdSeq - y.createdSeq)) {
    const v = effectiveVictor(b);
    if (!v) continue;
    const unplayed = b.status === 'UNPLAYED_RESOLVED' || (b.status === 'PROCESSED' && !!b.unplayedResolution && b.unplayedResolution !== 'POSTPONED');
    const aw = v === 'ATTACKER';
    const base = {
      planet: b.planetId ? planetName(b.planetId) : '–',
      attack: b.kind === 'FINAL_TIEBREAK' ? 'Final Battle' : b.attackType ? ATTACK_TYPES[b.attackType].name : '–',
      attacker: al(b.attackerAllianceId),
      defender: al(b.defenderAllianceId),
      unplayed,
    };
    if (v === 'DRAW') battles.push({ ...base, winner: null, loser: null, winnerPlayers: '', loserPlayers: '', vp: b.vp ? [b.vp.attacker, b.vp.defender] : null });
    else
      battles.push({
        ...base,
        winner: aw ? base.attacker : base.defender,
        loser: aw ? base.defender : base.attacker,
        winnerPlayers: names(aw ? b.attackers : b.defenders),
        loserPlayers: names(aw ? b.defenders : b.attackers),
        vp: b.vp ? (aw ? [b.vp.attacker, b.vp.defender] : [b.vp.defender, b.vp.attacker]) : null,
      });
  }

  // Power-Level-Änderungen: Stand Ende der Vorphase → Ende dieser Phase (bzw. aktueller Stand)
  const prev = pub.pointsHistory.find((h) => h.phaseNumber === phase - 1)?.planets;
  const scored = pub.pointsHistory.find((h) => h.phaseNumber === phase)?.planets;
  const cur = scored ?? (pub.stage.kind === 'PHASE' && pub.stage.phase === phase ? Object.fromEntries(pub.planets.map((p) => [p.id, p.power])) : undefined);
  const pl: DecreeFacts['pl'] = [];
  if (prev && cur) {
    for (const d of mapOf(pub).planets)
      for (const a of pub.alliances) {
        const from = prev[d.id]?.[a.id] ?? 0;
        const to = cur[d.id]?.[a.id] ?? 0;
        if (from !== to) pl.push({ planet: d.name, alliance: a.name, from, to });
      }
    pl.sort((x, y) => Math.abs(y.to - y.from) - Math.abs(x.to - x.from));
  }

  const events = pub.events.filter((e) => e.phaseNumber === phase && e.status === 'APPLIED').map((e) => ({ event: eventName(e), alliance: e.allianceId ? al(e.allianceId) : '' }));
  const objectives = (pub.objectives ?? []).filter((o) => o.phaseNumber === phase && o.status !== 'OPEN').map((o) => ({ objective: o.title, met: o.status === 'MET', alliances: o.achievedBy.map((id) => al(id)) }));
  const honors = pub.players.flatMap((p) => (p.honors ?? []).filter((h) => h.phase === phase).map((h) => ({ player: p.nickname, honor: h.title })));
  const final = phase >= pub.meta.phaseCount && pub.stage.kind === 'ENDED';
  const medals = final ? pub.medals.map((m) => ({ medal: MEDALS[m.medal].name, alliance: al(m.allianceId) })) : [];

  let points: DecreeFacts['points'] = null;
  let fog: DecreeFacts['fog'] = null;
  let leader: string | null = null;
  if (pub.fog) {
    const f = pub.fog;
    fog = [...pub.alliances].sort((a, b) => f.rank[a.id] - f.rank[b.id]).map((a) => ({ alliance: a.name, rank: f.rank[a.id], tendency: f.tendency[a.id] }));
    const top = fog.filter((x) => x.rank === 1);
    leader = top.length === 1 ? top[0].alliance : null;
  } else {
    const h = pub.pointsHistory.find((x) => x.phaseNumber === phase);
    if (h) {
      points = [...pub.alliances].map((a) => ({ alliance: a.name, points: h.points[a.id] ?? 0 })).sort((a, b) => b.points - a.points);
      leader = points.length > 1 && points[0].points > points[1].points ? points[0].alliance : null;
    }
  }
  return { campaign: pub.meta.name, phase, phaseCount: pub.meta.phaseCount, battles, pl: pl.slice(0, MAX_PL_LINES), events, objectives, honors, medals, points, fog, leader };
}

// ─── Zusammenbau ──────────────────────────────────────────────────────────

/** Deterministischer Zufall (mulberry32) */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Neuer Startwert für „Neu würfeln“ */
export const newDecreeSeed = () => Math.floor(Math.random() * 2 ** 31);

const fill = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
const usedVars = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

export interface DecreeOptions {
  tone: DecreeTone;
  lang: DecreeLang;
  seed: number;
  /** eigene Bausteine des Warmasters (ergänzen die vorbereiteten) */
  blocks?: DecreeBlock[];
  /** nur eigene Bausteine verwenden, sofern es für eine Art welche gibt */
  ownFirst?: boolean;
}

/** Alle Varianten für eine Baustein-Art (vorbereitete plus eigene passende) */
export function variantsFor(slot: DecreeSlot, o: Pick<DecreeOptions, 'tone' | 'lang' | 'blocks' | 'ownFirst'>): string[] {
  const own = (o.blocks ?? []).filter((b) => b.slot === slot && b.lang === o.lang && (b.tone === 'ANY' || b.tone === o.tone) && b.text.trim()).map((b) => b.text.trim());
  if (o.ownFirst && own.length) return own;
  return [...DECREE_TEXTS[o.tone][o.lang][slot], ...own];
}

/**
 * Baut den Entwurf (Titel + Markdown-Text). Je Baustein-Art wird ein zufälliger Einstieg in die Varianten
 * gewählt und bei mehreren Zeilen (z. B. Schlachten) weitergezählt – so wiederholt sich kein Satz direkt.
 * Varianten, deren Platzhalter gerade leer wären, werden übersprungen.
 */
export function buildDecree(f: DecreeFacts, o: DecreeOptions): { title: string; body: string } {
  const rnd = seededRandom(o.seed);
  const words = DECREE_WORDS[o.lang];
  const H = DECREE_HEADINGS[o.lang];
  const base = { campaign: f.campaign, phase: String(f.phase), phaseCount: String(f.phaseCount) };
  const starts = new Map<DecreeSlot, number>();
  const pick = (slot: DecreeSlot, vars: Record<string, string>, i = 0): string => {
    const all = variantsFor(slot, o);
    if (!all.length) return '';
    const ok = all.filter((t) => usedVars(t).every((k) => (vars[k] ?? '').trim() !== ''));
    const list = ok.length ? ok : all;
    if (!starts.has(slot)) starts.set(slot, Math.floor(rnd() * list.length));
    return fill(list[(starts.get(slot)! + i) % list.length], vars);
  };
  const vp = (v: [number, number] | null) => (v ? `${v[0]} : ${v[1]} ${words.vp}` : words.noVp);
  const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${words.and} ${xs.at(-1)}`);

  const title = pick('TITLE', base);
  const parts: string[] = [pick('INTRO', base)];
  const section = (head: string, lines: string[]) => {
    if (lines.length) parts.push(`**${head}**\n\n${lines.map((l) => `- ${l}`).join('\n')}`);
  };

  if (!f.battles.length) parts.push(pick('QUIET', base));
  section(
    H.battles,
    f.battles.map((b, i) => {
      const vars = {
        ...base,
        planet: b.planet,
        attack: b.attack,
        attacker: b.attacker,
        defender: b.defender,
        vp: vp(b.vp),
        winner: b.winner ?? '',
        loser: b.loser ?? '',
        winnerPlayers: b.winnerPlayers,
        loserPlayers: b.loserPlayers,
      };
      if (!b.winner) return pick('BATTLE_DRAW', vars, i);
      return b.unplayed ? pick('BATTLE_UNPLAYED', vars, i) : pick('BATTLE_WIN', vars, i);
    }),
  );
  section(
    H.front,
    f.pl.map((p, i) => pick(p.to > p.from ? 'PL_GAIN' : 'PL_LOSS', { ...base, alliance: p.alliance, planet: p.planet, from: String(p.from), to: String(p.to) }, i)),
  );
  section(
    H.events,
    f.events.map((e, i) => pick('EVENT', { ...base, event: e.event, alliance: e.alliance }, i)),
  );
  section(
    H.objectives,
    f.objectives.map((ob, i) => (ob.met ? pick('OBJECTIVE_MET', { ...base, objective: ob.objective, alliances: list(ob.alliances) }, i) : pick('OBJECTIVE_FAILED', { ...base, objective: ob.objective }, i))),
  );
  section(H.honors, [...f.honors.map((h, i) => pick('HONOR', { ...base, player: h.player, honor: h.honor }, i)), ...f.medals.map((m, i) => pick('MEDAL', { ...base, medal: m.medal, alliance: m.alliance }, i))]);
  const standing: string[] = [];
  if (f.points) standing.push(pick('POINTS', { ...base, standings: f.points.map((p) => `${p.alliance} ${p.points}`).join(' · ') }));
  if (f.fog) standing.push(pick('STANDINGS_FOG', { ...base, standings: f.fog.map((x) => `${x.rank}. ${x.alliance} (${words.tendency[x.tendency]})`).join(' · ') }));
  if (f.leader) standing.push(pick('LEADER', { ...base, leader: f.leader }));
  if (standing.length) parts.push(`**${H.standing}**\n\n${standing.join(' ')}`);
  parts.push(`_${pick('OUTRO', base)}_`);
  return { title, body: parts.filter((p) => p.trim()).join('\n\n') };
}

// ─── Eigene Bausteine (Command) ────────────────────────────────────────────

export function setDecreeBlocks(ctx: Ctx, blocks: DecreeBlock[]) {
  if (!Array.isArray(blocks)) fail('Ungültige Bausteine');
  if (blocks.length > DECREE_MAX_BLOCKS) fail(`Höchstens ${DECREE_MAX_BLOCKS} eigene Bausteine`);
  const ids = new Set<string>();
  const out: DecreeBlock[] = [];
  for (const b of blocks) {
    if (!DECREE_SLOTS.includes(b.slot)) fail('Unbekannte Baustein-Art');
    if (b.tone !== 'ANY' && !DECREE_TONES.includes(b.tone)) fail('Unbekannter Tonfall');
    if (!DECREE_LANGS.includes(b.lang)) fail('Unbekannte Sprache');
    const text = String(b.text ?? '')
      .trim()
      .slice(0, 600);
    if (!text) fail('Ein Baustein ist leer');
    const id = b.id && !ids.has(b.id) ? b.id : ctx.newId('db');
    ids.add(id);
    out.push({ id, slot: b.slot, tone: b.tone, lang: b.lang, text });
  }
  ctx.state.decreeBlocks = out;
  log(ctx, `Dekret-Bausteine gespeichert (${out.length})`);
}

/** Unbekannte Platzhalter eines Bausteins (Hinweis im Editor) */
export function unknownVars(slot: DecreeSlot, text: string): string[] {
  return [...new Set(usedVars(text).filter((k) => !SLOT_VARS[slot].includes(k)))];
}
