import Link from 'next/link';
import { notFound } from 'next/navigation';
import { can, hallAccess } from '@/server/authz';
import { listedCampaigns } from '@/server/publicList';
import { toPublicView } from '@/engine/publicView';
import { MEDALS } from '@/engine/data/vespator';
import { AllianceTag, MedalIcon, Panel } from '@/components/ui';
import { playerStats, pct } from '@/components/stats/compute';
import { makeT } from '@/i18n/core';
import { GameIcon } from '@/components/icons/GameIcon';
import { requestLocale } from '@/i18n/server';
import { LocaleProvider } from '@/i18n/client';
import { LangSwitch } from '@/components/LangSwitch';
import { ImperialHeader } from '@/components/ImperialHeader';
import { CreditsLink } from '@/components/CreditsLink';
import { Housing, TermAside } from '@/components/public/Terminal';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Hall of Fame', robots: { index: false, follow: false } };

export default async function HallOfFame({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (can(hallAccess(token), 'hall.read')) notFound();
  // gleiche Regel wie die Liga (F5): nur Kampagnen mit Leseansicht, zwischengespeichert bis zur nächsten Änderung (F9)
  const campaigns = listedCampaigns()
    .filter((c) => c.state.stage.kind === 'ENDED')
    .map((c) => ({ row: c, state: toPublicView(c.state) }));
  // Sprache des Lesers (Wahl, Konto, Standardsprache, Browser)
  const locale = await requestLocale();
  const t = makeT(locale);

  const total = new Map<string, { name: string; battles: number; wins: number; draws: number; losses: number; medals: string[]; campaigns: number }>();
  for (const { state } of campaigns) {
    for (const s of playerStats(state)) {
      const key = s.nickname.trim().toLowerCase();
      const e = total.get(key) ?? { name: s.nickname, battles: 0, wins: 0, draws: 0, losses: 0, medals: [], campaigns: 0 };
      e.battles += s.battles;
      e.wins += s.wins;
      e.draws += s.draws;
      e.losses += s.losses;
      e.campaigns++;
      for (const m of state.medals) if (m.playerIds.includes(s.playerId)) e.medals.push(MEDALS[m.medal].name);
      total.set(key, e);
    }
  }
  const players = [...total.values()].sort((a, b) => b.medals.length - a.medals.length || b.wins - a.wins);

  const intro = (
    <div className="space-y-2">
      <h1 className="font-display text-[22px] font-bold uppercase leading-tight tracking-[0.05em] text-ink">Hall of Fame</h1>
      <p className="text-[15px] text-dim">{t('Die Veteranen der Vespator Front.')}</p>
      <p className="readout">
        {t('Kampagnen')}: {campaigns.length} · {t('Spieler')}: {players.length}
      </p>
    </div>
  );
  return (
    <LocaleProvider locale={locale}>
      <ImperialHeader href={`/hall/${token}`} subtitle="Hall of Fame" locale={locale} lang={<LangSwitch />} />
      {/* Ein Bildschirm wie das Kommandoterminal: links Einleitung und Kathedrale, rechts eine Einhausung, die innen scrollt */}
      <div className="bay-grid mx-auto h-[calc(100dvh-var(--hdr))] max-w-[1920px] px-2 pb-3 pt-3 sm:px-4 lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-[var(--gap)] lg:px-[var(--gap)] lg:pb-[var(--gap)] lg:pt-[calc(var(--gap)+4px)] 2xl:grid-cols-[260px_minmax(0,1fr)]">
        <TermAside locale={locale} label="Hall of Fame">
          {intro}
        </TermAside>
        <main className="h-full min-w-0 lg:min-h-0">
          <Housing title="Hall of Fame">
            <div className="space-y-4 lg:px-2">
              <div className="lg:hidden">{intro}</div>
              {campaigns.length === 0 && <p className="text-faint">{t('Noch keine abgeschlossene Kampagne.')}</p>}
              <div className="grid gap-4 md:grid-cols-2">
                {campaigns.map(({ row, state }) => {
                  const winner = state.alliances.find((a) => a.id === state.result?.winnerAllianceId);
                  const last = state.pointsHistory[state.pointsHistory.length - 1];
                  return (
                    <Panel key={row.id} title={state.meta.name}>
                      <p className="text-lg">
                        <GameIcon name="ui_TROPHY" size={22} color="#e0b95c" className="mr-1 align-[-3px]" /> <AllianceTag alliance={winner} />
                        {state.result?.tiebreak === 'STRONGHOLD' ? (
                          <span className="ml-2 text-[14px] text-dim">(Tiebreak: Stronghold)</span>
                        ) : state.result?.tiebreak === 'FINAL_BATTLE' ? (
                          <span className="ml-2 text-[14px] text-dim">({t('Entscheidungsschlacht')})</span>
                        ) : null}
                      </p>
                      {last && <p className="mt-1 font-mono text-[14px] text-dim">{state.alliances.map((a) => `${a.name} ${last.points[a.id]}`).join(' · ')}</p>}
                      <ul className="mt-2 space-y-1 text-[15px]">
                        {state.medals.map((m) => (
                          <li key={m.medal}>
                            <MedalIcon medal={m.medal} /> {MEDALS[m.medal].name}: <AllianceTag alliance={state.alliances.find((a) => a.id === m.allianceId)} />
                            <span className="text-[14px] text-dim">
                              {' '}
                              –{' '}
                              {m.playerIds
                                .map((id) => state.players.find((p) => p.id === id)?.nickname)
                                .filter(Boolean)
                                .join(', ')}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {row.public_enabled ? (
                        <Link className="link mt-2 inline-block text-[15px]" href={`/v/${row.public_token}`}>
                          {t('Kampagne ansehen')}
                        </Link>
                      ) : null}
                    </Panel>
                  );
                })}
              </div>
              {players.length > 0 && (
                <Panel title={t('Spieler – kampagnenübergreifend')}>
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('Spieler')}</th>
                          <th className="text-right">{t('Kampagnen')}</th>
                          <th className="text-right">{t('Schlachten')}</th>
                          <th className="text-right">{t('S/U/N')}</th>
                          <th className="text-right">{t('Quote')}</th>
                          <th>{t('Medaillen')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {players.map((p) => (
                          <tr key={p.name}>
                            <td>{p.name}</td>
                            <td className="text-right font-mono">{p.campaigns}</td>
                            <td className="text-right font-mono">{p.battles}</td>
                            <td className="text-right font-mono">
                              {p.wins}/{p.draws}/{p.losses}
                            </td>
                            <td className="text-right font-mono">{pct(p.wins, p.battles)}</td>
                            <td className="text-[14px]">{p.medals.join(', ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              )}
              <CreditsLink locale={locale} className="lg:hidden" />
            </div>
          </Housing>
        </main>
      </div>
    </LocaleProvider>
  );
}
