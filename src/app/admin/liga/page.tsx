import Link from 'next/link';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { allowed, authorizePage, sessionPrincipal } from '@/server/authz';
import { listCampaigns } from '@/server/campaigns';
import { publicOrigin } from '@/server/origin';
import { getSeason, listSeasons, seasonStandingsFor } from '@/server/league';
import { AdminShell } from '@/components/admin/AdminShell';
import { NewSeasonForm, SeasonEditor, type CampaignChoice } from '@/components/league/SeasonEditor';
import { MedalCabinet, SeasonStandingsTable } from '@/components/league/SeasonTables';
import { Sect } from '@/components/admin/settings/AccountSections';
import { adminLocale, tFor } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: tFor(await adminLocale())('Liga') };
}

/** Liga (NTH2 3.1): Saisons aus mehreren Kampagnen – Rangliste, Medaillenschrank, Ruhmeshalle je Saison. Nur Admins. */
export default async function LeaguePage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const admin = await authorizePage('account.self');
  const locale = await adminLocale();
  const t = tFor(locale);
  const user = t('Angemeldet als {name} · {role}', { name: admin.username, role: admin.role === 'ADMIN' ? 'Admin' : 'Co-Warmaster' });
  if (!allowed(await sessionPrincipal(), 'instance.manage'))
    return (
      <AdminShell locale={locale} active="league" user={user} title={t('Liga')} icon="ui_TROPHY">
        <p className="text-[15px] text-dim">{t('Saisons verwaltet ein Admin.')}</p>
      </AdminShell>
    );
  const { s } = await searchParams;
  const seasons = listSeasons();
  const cur = (s ? getSeason(s) : null) ?? seasons[0] ?? null;
  const origin = publicOrigin(await headers());
  const campaigns: CampaignChoice[] = listCampaigns()
    .filter((c) => !c.broken && !c.state.meta.sandbox)
    .map((c) => ({ id: c.id, name: c.state.meta.name, ended: c.state.stage.kind === 'ENDED', archived: !!c.archived, public: !!c.public_enabled, players: c.state.players.map((p) => ({ id: p.id, nickname: p.nickname })) }));
  const standings = cur ? seasonStandingsFor(cur) : [];
  return (
    <AdminShell
      locale={locale}
      active="league"
      user={user}
      title={cur ? cur.name : t('Liga')}
      icon="ui_TROPHY"
      sideTitle={t('Rangliste')}
      sideIcon="ui_TROPHY"
      side={
        cur ? (
          <div className="space-y-4">
            <SeasonStandingsTable players={standings} locale={locale} compact />
            <Sect title={t('Medaillenschrank')}>
              <MedalCabinet players={standings} locale={locale} />
            </Sect>
          </div>
        ) : (
          <p className="text-[15px] text-faint">{t('Noch keine Saison.')}</p>
        )
      }
    >
      <div className="space-y-5">
        <div className="space-y-3">
          <p className="text-[15px] text-dim">{t('Eine Saison fasst mehrere Kampagnen zusammen: Rangliste über alle Spieler, Medaillenschrank und eine eigene Ruhmeshalle.')}</p>
          {seasons.length > 0 && (
            <nav className="flex flex-wrap gap-1.5" aria-label={t('Saisons')}>
              {seasons.map((x) => (
                <Link key={x.id} href={`/admin/liga?s=${x.id}`} className={`btn btn-sm font-serif text-[15px] ${x.id === cur?.id ? 'btn-primary' : ''}`} aria-current={x.id === cur?.id ? 'page' : undefined}>
                  {x.name}
                </Link>
              ))}
            </nav>
          )}
          <NewSeasonForm />
        </div>
        {cur && (
          <div className="border-t border-line/60 pt-4">
            <SeasonEditor key={`${cur.id}-${cur.updated_at}-${cur.token}`} id={cur.id} name={cur.name} data={cur.data} hallUrl={`${origin}/liga/${cur.token}`} campaigns={campaigns} standings={standings} />
          </div>
        )}
      </div>
    </AdminShell>
  );
}
