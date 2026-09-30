import type { Battle, CampaignState } from '@/engine/types';

/** Dauer, in der eine angesetzte Schlacht als „läuft gerade“ gilt */
const RUNNING_MS = 5 * 3600_000;

/** Kalendertag in der Zeitzone der Kampagne (YYYY-MM-DD) */
const dayIn = (ms: number, tz: string) => new Date(ms).toLocaleDateString('en-CA', { timeZone: tz });

export interface BattleGroups {
  /** begonnen (Termin erreicht), noch ohne Ergebnis */
  running: Battle[];
  /** heute angesetzt, noch nicht begonnen */
  today: Battle[];
  /** später angesetzt, danach die ohne Termin */
  next: Battle[];
}

/**
 * Präsentationsmodus (N3.3): laufende und angesetzte Schlachten – heute bzw. als Nächstes.
 * Kampagnenschlachten, Nebengefechte und die Entscheidungsschlacht, ohne Obergrenze.
 * Ohne `now` (Server-Render) landet alles unter „als Nächstes“.
 */
export function groupBattles(state: Pick<CampaignState, 'battles' | 'meta'>, now: number | null): BattleGroups {
  const tz = state.meta.timezone || 'Europe/Berlin';
  const open = state.battles.filter((b) => (b.status === 'SCHEDULED' || b.status === 'PLAYED') && !b.vp && !b.games?.some((g) => g.vp));
  const at = (b: Battle) => (b.scheduledAt ? new Date(b.scheduledAt).getTime() : null);
  const byTime = (a: Battle, b: Battle) => (at(a) ?? Infinity) - (at(b) ?? Infinity) || a.createdSeq - b.createdSeq;
  const g: BattleGroups = { running: [], today: [], next: [] };
  const today = now === null ? null : dayIn(now, tz);
  for (const b of [...open].sort(byTime)) {
    const t = at(b);
    if (now !== null && t !== null && t <= now && now - t < RUNNING_MS) g.running.push(b);
    else if (now !== null && t !== null && t > now && dayIn(t, tz) === today) g.today.push(b);
    else if (now === null || t === null || t > now) g.next.push(b);
    // Termin lange vorbei, aber noch ohne Ergebnis: erscheint nicht mehr als „angesetzt“
  }
  return g;
}
