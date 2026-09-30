import { calendarAccess, can } from '@/server/authz';
import { currentState } from '@/server/campaigns';
import { planetName, withMap } from '@/engine/map';
import { sideOf } from '@/engine/playerActions';
import { contextLocale, tFor } from '@/i18n/server';
import { battleKindName } from '@/components/battleName';
import { icsEscape as esc, icsStamp as stamp } from '@/server/ics';
import { eventWindow } from '@/engine/logTime';

export const dynamic = 'force-dynamic';

/**
 * Abonnierbarer Kalender mit den bestätigten Schlachtterminen des Spielers (N1.5).
 * Eigener Nur-Lese-Schlüssel – der Spielerlink selbst gelangt so nie zu Kalenderdiensten.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ cid: string; pid: string; key: string }> }) {
  const { cid, pid, key } = await params;
  const k = key.replace(/\.ics$/, '');
  if (can(calendarAccess(cid, pid, k), 'calendar.read', { campaignId: cid })) return new Response('Nicht gefunden', { status: 404 });
  let state;
  try {
    state = currentState(cid).state;
  } catch {
    return new Response('Nicht gefunden', { status: 404 });
  }
  const player = state.players.find((p) => p.id === pid);
  if (!player) return new Response('Nicht gefunden', { status: 404 });
  const s = { player, playerId: pid };
  const t = tFor(contextLocale(player.locale, state.meta.locale));
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Vespator Front//Kampagne//DE', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(`${state.meta.name} – ${s.player.nickname}`)}`];
  for (const b of state.battles) {
    if (!b.scheduledAt || b.status === 'VOID' || !sideOf(state, b, s.playerId)) continue;
    // F1: ungültige Termine überspringen statt den Feed scheitern zu lassen
    const w = eventWindow(b.scheduledAt);
    if (!w) continue;
    const what = battleKindName(b, t);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${b.id}@vespator-front`,
      `DTSTAMP:${stamp(new Date().toISOString())}`,
      `DTSTART:${stamp(w.start)}`,
      `DTEND:${stamp(w.end)}`,
      // S6: Planetenname aus der Karte dieser Kampagne
      `SUMMARY:${esc(`${what} · ${b.planetId ? withMap(state, () => planetName(b.planetId)) : ''} (${state.meta.name})`)}`,
      `DESCRIPTION:${esc(t('Phase {n}', { n: b.phaseNumber }))}`,
      // NTH2 2.5: Spieltisch als Ort
      ...(b.table ? [`LOCATION:${esc(b.table.name)}`] : []),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return new Response(lines.join('\r\n') + '\r\n', { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' } });
}
