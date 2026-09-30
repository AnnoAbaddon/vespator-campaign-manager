import type { SeasonPlayer } from '@/server/leagueCompute';
import { MedalIcon } from '@/components/ui';
import { GameIcon } from '@/components/icons/GameIcon';
import { makeT, type Locale } from '@/i18n/core';

/**
 * Rangliste einer Saison (NTH2 3.1) – ohne Hooks, für Server- und Client-Komponenten.
 * `compact`: schmale Seitenspalte – nur Rang, Spieler, Punkte, Bilanz und Medaillen.
 */
export function SeasonStandingsTable({ players, locale, compact = false }: { players: SeasonPlayer[]; locale: Locale; compact?: boolean }) {
  const t = makeT(locale);
  if (!players.length) return <p className="text-[15px] text-faint">{t('Noch keine Spieler in dieser Saison.')}</p>;
  return (
    <div className="xscroll overflow-x-auto" role="region" tabIndex={0} aria-label={t('Rangliste')}>
      <table className={`table w-full text-[14px] [&_th]:whitespace-nowrap ${compact ? '' : 'min-w-[520px]'}`}>
        <thead>
          <tr>
            <th className="w-10">#</th>
            <th>{t('Spieler')}</th>
            <th className="text-right">{t('Punkte')}</th>
            {!compact && <th className="text-right">{t('Kampagnen')}</th>}
            {!compact && <th className="text-right">{t('Schlachten')}</th>}
            <th className="text-right">
              <abbr title={t('Siege / Unentschieden / Niederlagen')}>{t('S/U/N')}</abbr>
            </th>
            <th className="text-right">{t('Medaillen')}</th>
            {!compact && <th className="text-right">{t('Kampagnensiege')}</th>}
          </tr>
        </thead>
        <tbody>
          {players.map((p, i) => (
            <tr key={p.key}>
              <td>
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-display text-[12px] font-bold ${i === 0 ? 'bg-[radial-gradient(circle_at_35%_35%,#ffe9b5,#dda94d_60%,#7a5418)] text-black' : 'text-brass shadow-[inset_0_0_0_1px_#665333]'}`}
                >
                  {i + 1}
                </span>
              </td>
              <td className="whitespace-nowrap text-ink">
                {p.name}
                {p.factions.length > 0 && <span className="block text-[12px] text-dim">{p.factions.join(', ')}</span>}
              </td>
              <td className="text-right font-mono text-ink">{p.points}</td>
              {!compact && <td className="text-right font-mono">{p.campaigns}</td>}
              {!compact && <td className="text-right font-mono">{p.battles}</td>}
              <td className="whitespace-nowrap text-right font-mono">
                {p.wins}/{p.draws}/{p.losses}
              </td>
              <td className="text-right font-mono">{p.medals || '–'}</td>
              {!compact && <td className="text-right font-mono">{p.campaignWins || '–'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Medaillenschrank je Spieler: Medaillen, Ehrungen des Kommandanten und Kampagnensiege */
export function MedalCabinet({ players, locale }: { players: SeasonPlayer[]; locale: Locale }) {
  const t = makeT(locale);
  const withItems = players.filter((p) => p.cabinet.length);
  if (!withItems.length) return <p className="text-[15px] text-faint">{t('Der Medaillenschrank ist noch leer.')}</p>;
  return (
    <ul className="grid gap-2 md:grid-cols-2">
      {withItems.map((p) => (
        <li key={p.key} className="inset space-y-1 p-2.5">
          <p className="font-display text-[15px] font-bold text-ink">{p.name}</p>
          <ul className="space-y-0.5 text-[14px]">
            {p.cabinet.map((c, i) => (
              <li key={i} className="flex items-center gap-1.5">
                {c.kind === 'MEDAL' && c.medal ? <MedalIcon medal={c.medal} /> : <GameIcon name={c.kind === 'WIN' ? 'ui_TROPHY' : 'em_crown'} size={16} color={c.kind === 'WIN' ? '#e0b95c' : '#b3975f'} />}
                <span className="text-ink">{c.kind === 'WIN' ? t('Kampagnensieg mit {name}', { name: c.title }) : c.title}</span>
                <span className="truncate text-dim">· {c.campaign}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
