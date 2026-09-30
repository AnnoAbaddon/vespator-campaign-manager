import { calendarEntries } from '@/server/club';
import { can, clubCalendarAccess } from '@/server/authz';
import { contextLocale, tFor } from '@/i18n/server';
import { icsEscape as esc, icsStamp as stamp } from '@/server/ics';
import { eventWindow } from '@/engine/logTime';

export const dynamic = 'force-dynamic';

/**
 * Club-Kalender als .ics-Abo (NTH2 2.5): alle vereinbarten Schlachttermine aller laufenden Kampagnen mit
 * Spieltisch als Ort. Nur-Lese-Schlüssel (HMAC), in der Verwaltung jederzeit neu erzeugbar.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const k = key.replace(/\.ics$/, '');
  if (can(clubCalendarAccess(k), 'club.calendar')) return new Response('Nicht gefunden', { status: 404 });
  const t = tFor(contextLocale());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Vespator Front//Club//DE', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(t('Club-Kalender'))}`];
  const now = stamp(new Date().toISOString());
  for (const e of calendarEntries(t)) {
    // F1: ein ungültiger Termin darf nie den ganzen Club-Feed scheitern lassen – Zeile überspringen
    const w = eventWindow(e.at);
    if (!w) continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.campaignId}-${e.battleId}@vespator-front`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(w.start)}`,
      `DTEND:${stamp(w.end)}`,
      `SUMMARY:${esc(`${e.title} (${e.campaignName})`)}`,
      `DESCRIPTION:${esc(`${e.attacker} – ${e.defender}${e.players.length ? `\n${e.players.join(', ')}` : ''}\n${t('Phase {n}', { n: e.phase })}`)}`,
      ...(e.tableName ? [`LOCATION:${esc(e.tableName)}`] : []),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return new Response(lines.join('\r\n') + '\r\n', { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' } });
}
