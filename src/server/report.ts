import 'server-only';
import { ATTACK_TYPES, INFRA, MEDALS, type InfraType } from '@/engine/data/vespator';
import { eventName, eventSummary } from '@/engine/customEvents';
import { describeOp } from '@/engine/phase';
import type { CampaignState } from '@/engine/types';
import { planetDef } from '@/engine/map';
import { intlLocale, makeT, translateMessage, type Locale } from '@/i18n/core';
import { contextLocale } from './locale';
import { guestsOf } from '@/engine/guests';
import { photoOfPhase } from '@/engine/gallery';

const pn = (id: string | null | undefined) => (id ? (planetDef(id)?.name ?? id) : '–');

const MOD: Record<string, string> = {
  NO_VOID_LEAP: 'kein Void Leap',
  SUPPORT_FACILITIES_INACTIVE: 'Support Facilities wirkungslos',
  NO_LOGISTICAL_AUXILIA: 'kein Logistical Auxilia',
  RANDOM_THEATRE: 'Theatres zufällig',
  ARCHEOTECH: 'Archeotech Riches',
  COORDINATED_OPPOSITION: 'Coordinated Opposition',
  OPEN_TOME: 'An Open Tome',
  DEFIANT_ZEAL: 'Defiant Zeal',
  STAR_OF_VOIDFARER: 'Star of the Voidfarer',
};

/**
 * Phasenbericht als Markdown (SPEC 18.2), aus der öffentlichen Projektion erzeugen.
 * Sprache: `locale` (Standard der Kampagne); Datumsangaben im Format der Sprache und in der Zeitzone der Kampagne.
 */
export function phaseReport(state: CampaignState, phase: number, opts: { emoji?: boolean; publicUrl?: string; locale?: Locale; origin?: string } = {}): string {
  const locale: Locale = opts.locale ?? contextLocale(state.meta.locale);
  const t = makeT(locale);
  const m = (s: string) => translateMessage(locale, s);
  const intl = intlLocale(locale);
  const tz = state.meta.timezone || 'Europe/Berlin';
  const e = (s: string) => (opts.emoji === false ? '' : s);
  const ph = state.phases.find((p) => p.number === phase);
  if (!ph) return t('Phase {n} existiert nicht.', { n: phase });
  const al = (id: string | null | undefined) => state.alliances.find((a) => a.id === id)?.name ?? '?';
  const pl = (id: string) => state.players.find((p) => p.id === id)?.nickname ?? '?';
  const out: string[] = [];
  out.push(`# ${e('⚔️ ')}${state.meta.name} – Phase ${phase}/${state.meta.phaseCount}`);
  if (ph.startDate || ph.endDate) {
    const d = (x: string | null) => (x ? new Date(x).toLocaleDateString(intl, { timeZone: tz }) : '?');
    out.push(`_${d(ph.startDate)} – ${d(ph.endDate)}_`);
  }
  out.push('');
  out.push(`## ${e('📜 ')}${t('Operationen')}`);
  for (const a of state.alliances) {
    const ops = ph.operations.filter((o) => o.allianceId === a.id);
    if (!ops.length) continue;
    out.push(`**${a.name}**`);
    for (const o of ops) {
      const f = state.fleets.find((x) => x.id === o.fleetId);
      out.push(`- ${f?.name ?? '?'}: ${o.hidden ? t('Befehl erteilt (verdeckt)') : m(describeOp({ state }, o))}${o.status === 'CANCELLED' ? ` – ${t('annulliert')}` : ''}`);
    }
  }
  out.push('');
  const battles = state.battles.filter((b) => b.phaseNumber === phase && b.kind === 'CAMPAIGN');
  if (battles.length) {
    out.push(`## ${e('💥 ')}${t('Schlachten')}`);
    for (const b of battles) {
      const at = ATTACK_TYPES[b.attackType!].name;
      // ungespielt gewertet bleibt auch nach der Verarbeitung erkennbar (unplayedResolution)
      const unplayed = !!b.unplayedResolution && b.unplayedResolution !== 'POSTPONED' && b.unplayedResolution !== 'VOID';
      const res =
        b.status === 'VOID'
          ? b.unplayedResolution === 'POSTPONED'
            ? t('in die nächste Phase verschoben')
            : t('verfallen (nicht gespielt)')
          : !b.victor
            ? t('offen')
            : b.victor === 'DRAW'
              ? t('Unentschieden')
              : t('{alliance} siegt', { alliance: al(b.victor === 'ATTACKER' ? b.attackerAllianceId : b.defenderAllianceId) });
      const vp = b.vp && !unplayed ? ` (${b.vp.attacker + (b.battleReady.attacker ? 10 : 0)}:${b.vp.defender + (b.battleReady.defender ? 10 : 0)} VP)` : '';
      // B3: Gastspieler mit Kennzeichnung
      const side = (list: typeof b.attackers, sd: 'ATTACKER' | 'DEFENDER') => [...list.map((p) => pl(p.playerId)), ...guestsOf(b, sd).map((g) => `${g.name} (${t('Gast')})`)].join(' & ');
      const who = `${side(b.attackers, 'ATTACKER') || al(b.attackerAllianceId)} vs. ${side(b.defenders, 'DEFENDER') || al(b.defenderAllianceId)}`;
      // B1: per W6-Duell entschieden
      const note = b.unplayedRoll ? ` _(${t('ausgewürfelt {a}:{d}', { a: b.unplayedRoll.attacker, d: b.unplayedRoll.defender })})_` : unplayed ? ` _(${t('nicht gespielt, gewertet')})_` : '';
      out.push(`- **${t('{type} auf {planet}', { type: at, planet: pn(b.planetId) })}** – ${who}: ${res}${vp}${note}`);
      for (const l of b.applied.slice(1)) out.push(`  - ${m(l)}`);
    }
    out.push('');
  }
  // NTH2 4.3/D1: Bild der Phase (Uploads sind über ihre ID abrufbar, wie in der Leseansicht)
  const photo = photoOfPhase(state, phase);
  if (photo && opts.origin) {
    out.push(`## ${e('📷 ')}${t('Bild der Phase')}`);
    out.push(`![${photo.caption || t('Bild der Phase')}](${opts.origin}/api/uploads/${photo.uploadId})`);
    if (photo.caption) out.push(`_${photo.caption}_`);
    out.push('');
  }
  // B5: bestätigte freie Gefechte der Phase
  const skirmishes = (state.skirmishes ?? []).filter((x) => x.phaseNumber === phase && x.status === 'CONFIRMED');
  if (skirmishes.length) {
    out.push(`## ${t('Freie Gefechte')}`);
    for (const x of skirmishes) {
      const names = (l: typeof x.a.players) => l.map((p) => pl(p.playerId)).join(' & ');
      const res = x.winner === 'DRAW' ? t('Unentschieden') : t('{alliance} siegt', { alliance: al((x.winner === 'A' ? x.a : x.b).allianceId) });
      const vp = x.vp ? ` (${x.vp.a}:${x.vp.b} VP)` : '';
      out.push(`- ${al(x.a.allianceId)} (${names(x.a.players)}) vs. ${al(x.b.allianceId)} (${names(x.b.players)}): ${res}${vp}${x.mission ? ` – ${x.mission}` : ''}`);
    }
    out.push('');
  }
  // Archeotech Riches: Auswertung am Ende von 2.4
  const arche = state.modifiers.find((x) => x.kind === 'ARCHEOTECH' && x.phaseNumber === phase);
  if (arche?.planetIds?.length) {
    out.push(`## ${e('💎 ')}Archeotech Riches`);
    const res = ph.archeotechResults;
    for (const pid of arche.planetIds) {
      const r = res?.find((x) => x.planetId === pid);
      const line = !ph.archeotechResolved
        ? t('noch nicht ausgewertet')
        : r?.allianceId
          ? t('gesichert durch {alliance}', { alliance: al(r.allianceId) }) + (r.increments.length ? ` (+1 ${r.increments.map(pn).join(', ')})` : ` (${t('ohne Erhöhung')})`)
          : t('niemand gesichert');
      out.push(`- ${pn(pid)}: ${line}`);
    }
    out.push('');
  }
  const kt = state.dice.filter(
    (d) =>
      d.public &&
      d.context.startsWith('Kill Teams') &&
      (d.phaseNumber !== undefined && d.phaseNumber !== null ? d.phaseNumber === phase : ph.operations.some((o) => o.type === 'KILL_TEAMS' && o.killTeamPlanetId && d.context.includes(pn(o.killTeamPlanetId)))),
  );
  if (kt.length) {
    out.push(`## ${e('🗡️ ')}Kill Teams`);
    for (const d of kt) out.push(`- ${m(d.context)}: ${d.final}${d.final >= 5 ? ` → ${t('Erfolg')}` : ` → ${t('ohne Wirkung')}`}`);
    out.push('');
  }
  const decided = Object.entries(ph.builds) as [string, { allianceId: string; type: InfraType; planetId: string } | 'SKIP'][];
  if (decided.length) {
    out.push(`## ${e('🏗️ ')}${t('Infrastruktur')}`);
    // in Bau-Reihenfolge, Verzicht ausdrücklich nennen
    const order = [...ph.buildOrder, ...decided.map(([a]) => a).filter((a) => !ph.buildOrder.includes(a))];
    for (const a of order) {
      const b = ph.builds[a];
      if (!b) continue;
      out.push(`- ${al(a)}: ${b === 'SKIP' ? t('verzichtet auf den Bau') : t('{type} auf {planet}', { type: INFRA[b.type].name, planet: pn(b.planetId) })}`);
    }
    out.push('');
  }
  const h = state.pointsHistory.find((x) => x.phaseNumber === phase);
  const prev = state.pointsHistory.find((x) => x.phaseNumber === phase - 1);
  if (h) {
    out.push(`## ${e('🏆 ')}${t('Kampagnenpunkte')}`);
    out.push(`| ${t('Allianz')} | ${t('Punkte')} | Δ |`);
    out.push('|---|---:|---:|');
    for (const a of [...state.alliances].sort((x, y) => h.points[y.id] - h.points[x.id])) {
      const d = prev ? h.points[a.id] - prev.points[a.id] : 0;
      out.push(`| ${a.name} | ${h.points[a.id]} | ${d > 0 ? '+' : ''}${d} |`);
    }
    out.push('');
  }
  const evs = state.events.filter((x) => x.phaseNumber === phase);
  if (evs.length) {
    out.push(`## ${e('🌌 ')}Vespator Front Events`);
    for (const ev of evs) out.push(`- **${eventName(ev)}**${ev.allianceId ? ` (${al(ev.allianceId)})` : ''}: ${m(eventSummary(ev))}`);
    out.push('');
  }
  const mods = state.modifiers.filter((x) => x.phaseNumber === phase + 1);
  if (mods.length) {
    out.push(`## ${e('⚠️ ')}${t('Nächste Phase')}`);
    for (const x of mods) out.push(`- ${MOD[x.kind] ? t(MOD[x.kind]) : x.kind}${x.allianceId ? ` (${al(x.allianceId)})` : ''}${x.planetIds?.length ? `: ${x.planetIds.map(pn).join(', ')}` : ''}`);
    out.push('');
  }
  const next = state.phases.find((p) => p.number === phase + 1);
  if (next && (next.opsDeadline || next.battlesDeadline)) {
    const dt = (x: string) => new Date(x).toLocaleString(intl, { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' });
    out.push(`## ${e('📅 ')}${t('Termine Phase {n}', { n: phase + 1 })}`);
    if (next.opsDeadline) out.push(`- ${t('Befehle bis {date}', { date: dt(next.opsDeadline) })}`);
    if (next.battlesDeadline) out.push(`- ${t('Schlachten bis {date}', { date: dt(next.battlesDeadline) })}`);
    out.push('');
  }
  // Kampagnenende (letzte Phase): Endstand, Entscheidungsschlacht(en), Sieger, Medaillen
  if (phase === state.meta.phaseCount && (state.stage.kind === 'ENDED' || state.stage.kind === 'TIEBREAK')) {
    out.push(`## ${e('👑 ')}${t('Kampagnenende')}`);
    if (h)
      out.push(
        `- ${t('Endstand')}: ${[...state.alliances]
          .sort((x, y) => h.points[y.id] - h.points[x.id])
          .map((a) => `${a.name} ${h.points[a.id]}`)
          .join(' · ')}`,
      );
    const r = state.result;
    if (r?.tied.length) out.push(`- ${t('Gleichstand zwischen {alliances}', { alliances: r.tied.map(al).join(', ') })}`);
    for (const b of state.battles.filter((x) => x.kind === 'FINAL_TIEBREAK')) {
      const who = `${b.attackers.map((p) => pl(p.playerId)).join(' & ') || al(b.attackerAllianceId)} vs. ${b.defenders.map((p) => pl(p.playerId)).join(' & ') || al(b.defenderAllianceId)}`;
      const vp = b.vp ? ` (${b.vp.attacker + (b.battleReady.attacker ? 10 : 0)}:${b.vp.defender + (b.battleReady.defender ? 10 : 0)} VP)` : '';
      const res = !b.victor
        ? b.status === 'VOID'
          ? t('nicht gespielt')
          : t('offen')
        : b.victor === 'DRAW'
          ? t('Unentschieden')
          : t('{alliance} siegt', { alliance: al(b.victor === 'ATTACKER' ? b.attackerAllianceId : b.defenderAllianceId) });
      out.push(`- **${t('Entscheidungsschlacht')}** – ${who}: ${res}${vp}`);
    }
    if (r?.winnerAllianceId) {
      const how = r.tiebreak === 'STRONGHOLD' ? ` (${t('Tiebreak: Stronghold')})` : r.tiebreak === 'FINAL_BATTLE' ? ` (${t('Entscheidungsschlacht')})` : '';
      out.push(`- ${e('🏆 ')}**${t('Sieger: {alliance}', { alliance: al(r.winnerAllianceId) })}**${how}`);
    } else out.push(`- ${t('Der Sieger steht noch nicht fest')}`);
    for (const md of state.medals) out.push(`- ${t('Medaille {medal}: {alliance}', { medal: MEDALS[md.medal].name, alliance: al(md.allianceId) })}`);
    out.push('');
  }
  if (opts.publicUrl) out.push(`${e('🗺️ ')}${t('Karte & Details:')} ${opts.publicUrl}`);
  return out.join('\n');
}
