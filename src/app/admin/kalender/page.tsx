import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { allowed, authorizePage, campaignScope, sessionPrincipal } from '@/server/authz';
import { calendarEntries, clubCalendarKey, clubTables } from '@/server/club';
import { publicOrigin } from '@/server/origin';
import { adminLocale, tFor } from '@/i18n/server';
import { AdminShell } from '@/components/admin/AdminShell';
import { CalendarMain, CalendarProvider, CalendarSide } from '@/components/club/ClubCalendar';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: tFor(await adminLocale())('Club-Kalender') };
}

/**
 * Club-Kalender (NTH2 2.5): alle vereinbarten Schlachten aller laufenden Kampagnen (Co-Warmaster: ihre
 * freigegebenen), Wochen-, Monats- und Tischansicht, Kollisionen je Tisch. Tische und .ics-Abo verwalten Admins.
 */
export default async function ClubCalendarPage() {
  const admin = await authorizePage('account.self');
  const locale = await adminLocale();
  const t = tFor(locale);
  const owner = allowed(await sessionPrincipal(), 'instance.manage');
  const scope = campaignScope(admin);
  const origin = publicOrigin(await headers());
  const entries = calendarEntries(t, scope);
  return (
    <CalendarProvider entries={entries} tables={clubTables()}>
      <AdminShell
        locale={locale}
        active="calendar"
        user={t('Angemeldet als {name} · {role}', { name: admin.username, role: owner ? 'Admin' : 'Co-Warmaster' })}
        title={t('Club-Kalender')}
        icon="op_BATTLE"
        sideTitle={t('Termin und Abo')}
        sideIcon="ui_SCROLL"
        side={<CalendarSide icsUrl={owner ? `${origin}/kalender/club/${clubCalendarKey()}.ics` : null} owner={owner} accessible={scope} />}
      >
        <CalendarMain />
      </AdminShell>
    </CalendarProvider>
  );
}
