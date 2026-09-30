import { ATTACK_TYPES } from '@/engine/data/vespator';
import { eventName, eventSummary } from '@/engine/customEvents';
import type { CampaignState } from '@/engine/types';
import { ATTACK_ICON, eventIcon } from '@/components/icons/registry';
import { planetDef } from '@/engine/map';
import { DEFAULT_LOCALE, makeT, translateMessage, type Locale } from '@/i18n/core';

export interface FeedItem {
  key: string;
  phase: number;
  at: string | null;
  kind: 'BATTLE' | 'EVENT' | 'DICE' | 'PHASE' | 'REINFORCEMENT';
  /** Icon-Schlüssel (game-icons) */
  icon?: string;
  title: string;
  body?: string;
  href?: string;
  color?: string;
  lines?: string[];
  photos?: string[];
}

const PLANET = (id: string | null) => (id ? (planetDef(id)?.name ?? id) : '');

/** Chronik je Phase: Schlachten, Events, Kill-Teams-Würfe, Phasenabschlüsse */
export function buildFeed(state: CampaignState, base: string, locale: Locale = DEFAULT_LOCALE): { phase: number; items: FeedItem[] }[] {
  const t = makeT(locale);
  const msg = (m: string) => translateMessage(locale, m);
  const items: FeedItem[] = [];
  const al = (id: string) => state.alliances.find((a) => a.id === id);
  const pl = (id: string) => state.players.find((p) => p.id === id)?.nickname ?? '?';
  for (const b of state.battles) {
    if (b.kind !== 'CAMPAIGN' && b.kind !== 'FINAL_TIEBREAK') continue;
    if (!b.victor || (b.status !== 'PLAYED' && b.status !== 'PROCESSED' && b.status !== 'UNPLAYED_RESOLVED')) continue;
    const A = al(b.attackerAllianceId);
    const D = al(b.defenderAllianceId);
    const winner = b.victor === 'DRAW' ? t('Unentschieden') : t('{name} siegt', { name: b.victor === 'ATTACKER' ? A?.name : D?.name });
    const what = b.kind === 'FINAL_TIEBREAK' ? t('Entscheidungsschlacht') : t('{attack} auf {planet}', { attack: ATTACK_TYPES[b.attackType!].name, planet: PLANET(b.planetId) });
    const vp = b.vp ? ` · ${b.vp.attacker + (b.battleReady.attacker ? 10 : 0)}:${b.vp.defender + (b.battleReady.defender ? 10 : 0)} VP` : '';
    items.push({
      key: b.id,
      phase: b.phaseNumber,
      at: b.playedAt,
      kind: 'BATTLE',
      icon: b.attackType ? ATTACK_ICON[b.attackType] : 'op_BATTLE',
      title: `${what} – ${winner}${vp}`,
      body:
        b.status === 'UNPLAYED_RESOLVED'
          ? t('Nicht gespielt – regelgemäß gewertet.')
          : `${b.attackers.map((p) => pl(p.playerId)).join(' & ') || A?.name} vs. ${b.defenders.map((p) => pl(p.playerId)).join(' & ') || D?.name}`,
      href: `${base}/battles/${b.id}`,
      color: b.victor === 'ATTACKER' ? A?.color : b.victor === 'DEFENDER' ? D?.color : undefined,
      lines: b.status === 'PROCESSED' ? b.applied.map(msg) : undefined,
      photos: b.photos.slice(0, 4),
    });
  }
  // Verstärkungen aus der Reserve (N2.5)
  for (const f of state.fleets) {
    if (!f.activated) continue;
    const A = al(f.allianceId);
    items.push({
      key: `reinf-${f.id}`,
      phase: f.activated.phase,
      at: null,
      kind: 'REINFORCEMENT',
      icon: 'ui_FLEET',
      title: t('Verstärkung für {alliance} bei {planet}', { alliance: A?.name, planet: PLANET(f.activated.planetId) }),
      body: t('{fleet} greift ab sofort ins Geschehen ein.', { fleet: f.name }),
      color: A?.color,
    });
  }
  for (const e of state.events) {
    items.push({
      key: e.id,
      phase: e.phaseNumber,
      at: null,
      kind: 'EVENT',
      icon: eventIcon(e.code),
      title: `Event: ${eventName(e)}${e.allianceId ? ` (${al(e.allianceId)?.name})` : ''}`,
      body: msg(eventSummary(e)),
      lines: e.status === 'APPLIED' ? e.applied.map(msg) : [t('Wird gerade ausgewertet…')],
    });
  }
  const kt = state.dice.filter((d) => d.public && d.context.startsWith('Kill Teams'));
  for (const d of kt) {
    const phase = d.phaseNumber ?? state.phases.find((p) => p.operations.some((o) => o.type === 'KILL_TEAMS' && d.context.includes(o.killTeamPlanetId ? PLANET(o.killTeamPlanetId) : '###')))?.number ?? 0;
    items.push({
      key: d.id,
      phase,
      at: d.at,
      kind: 'DICE',
      icon: 'op_KILL_TEAMS',
      title: `${msg(d.context)}: ${t('W6 = {n}', { n: d.final })}${d.final >= 5 ? t(' → Erfolg (−1 PL bzw. Fortification Line)') : t(' → ohne Wirkung')}`,
    });
  }
  for (const h of state.pointsHistory) {
    if (h.phaseNumber === 0) continue;
    items.push({
      key: `pts${h.phaseNumber}`,
      phase: h.phaseNumber,
      at: null,
      kind: 'PHASE',
      icon: 'ui_TROPHY',
      title: t('Kampagnenpunkte nach Phase {n}', { n: h.phaseNumber }),
      body: state.alliances.map((a) => `${a.name} ${h.points[a.id]}`).join(' · '),
    });
  }
  const phases = [...new Set(items.map((i) => i.phase))].sort((a, b) => b - a);
  return phases.map((phase) => ({
    phase,
    items: items
      .filter((i) => i.phase === phase)
      .sort((a, b) => {
        const ka = a.kind === 'PHASE' ? 3 : a.kind === 'EVENT' ? 2 : 0;
        const kb = b.kind === 'PHASE' ? 3 : b.kind === 'EVENT' ? 2 : 0;
        if (ka !== kb) return kb - ka;
        return (b.at ?? '').localeCompare(a.at ?? '');
      }),
  }));
}
