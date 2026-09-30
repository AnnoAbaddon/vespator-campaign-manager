import Link from 'next/link';
import { notFound } from 'next/navigation';
import { seasonCampaigns } from '@/server/league';
import { can, seasonAccess } from '@/server/authz';
import { seasonCampaignSummary, seasonStandings } from '@/server/leagueCompute';
import { getCampaign } from '@/server/campaigns';
import { makeT } from '@/i18n/core';
import { requestLocale } from '@/i18n/server';
import { LocaleProvider } from '@/i18n/client';
import { LangSwitch } from '@/components/LangSwitch';
import { ImperialHeader } from '@/components/ImperialHeader';
import { CreditsLink } from '@/components/CreditsLink';
import { Housing, TermAside } from '@/components/public/Terminal';
import { Panel } from '@/components/ui';
import { GameIcon } from '@/components/icons/GameIcon';
import { MedalCabinet, SeasonStandingsTable } from '@/components/league/SeasonTables';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Hall of Fame', robots: { index: false, follow: false }, referrer: 'no-referrer' };

/**
 * Ruhmeshalle einer Saison (NTH2 3.1): öffentlich über den geheimen Link, wie die Hall of Fame.
 * Rangliste und Medaillenschrank rechnen mit den öffentlichen Projektionen der Kampagnen.
 */
export default async function SeasonHall({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = seasonAccess(token);
  if (!access || can(access.principal, 'season.read') || !access.season.data.public) notFound();
  const season = access.season;
  const locale = await requestLocale();
  const t = makeT(locale);
  const campaigns = seasonCampaigns(season, true);
  const players = seasonStandings(season.data, campaigns);
  const summaries = campaigns.map(seasonCampaignSummary);
  const intro = (
    <div className="space-y-2">
      <h1 className="font-display text-[22px] font-bold uppercase leading-tight tracking-[0.05em] text-ink">{season.name}</h1>
      {season.data.note && <p className="whitespace-pre-line text-[15px] text-dim">{season.data.note}</p>}
      <p className="readout">
        {t('Kampagnen')}: {campaigns.length} · {t('Spieler')}: {players.length}
      </p>
    </div>
  );
  return (
    <LocaleProvider locale={locale}>
      <ImperialHeader href={`/liga/${token}`} subtitle="Hall of Fame" locale={locale} lang={<LangSwitch />} />
      <div className="bay-grid mx-auto h-[calc(100dvh-var(--hdr))] max-w-[1920px] px-2 pb-3 pt-3 sm:px-4 lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-[var(--gap)] lg:px-[var(--gap)] lg:pb-[var(--gap)] lg:pt-[calc(var(--gap)+4px)] 2xl:grid-cols-[260px_minmax(0,1fr)]">
        <TermAside locale={locale} label={season.name}>
          {intro}
        </TermAside>
        <main className="h-full min-w-0 lg:min-h-0">
          <Housing title={season.name}>
            <div className="space-y-4 lg:px-2">
              <div className="lg:hidden">{intro}</div>
              <Panel title={t('Rangliste')}>
                <SeasonStandingsTable players={players} locale={locale} />
              </Panel>
              <Panel title={t('Kampagnen der Saison')}>
                {summaries.length === 0 ? (
                  <p className="text-faint">{t('Noch keine Kampagne.')}</p>
                ) : (
                  <ul className="grid gap-2 md:grid-cols-2">
                    {summaries.map((c) => {
                      const row = getCampaign(c.id);
                      return (
                        <li key={c.id} className="inset flex flex-wrap items-center gap-2 p-2.5 text-[15px]">
                          <span className="min-w-0 flex-1 font-serif font-semibold text-ink">{c.name}</span>
                          {c.winner ? (
                            <span className="inline-flex items-center gap-1.5">
                              <GameIcon name="ui_TROPHY" size={18} color="#e0b95c" />
                              <span className="inline-block h-3 w-3 rounded-full" style={{ background: c.winner.color }} aria-hidden />
                              {c.winner.name}
                            </span>
                          ) : (
                            <span className="chip text-dim">{t('läuft')}</span>
                          )}
                          {row?.public_enabled ? (
                            <Link className="link basis-full text-[14px]" href={`/v/${row.public_token}`}>
                              {t('Kampagne ansehen')}
                            </Link>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
              <Panel title={t('Medaillenschrank')}>
                <MedalCabinet players={players} locale={locale} />
              </Panel>
              <CreditsLink locale={locale} className="lg:hidden" />
            </div>
          </Housing>
        </main>
      </div>
    </LocaleProvider>
  );
}
