import Link from 'next/link';
import { THEATRES } from '@/engine/data/vespator';
import { sizeDef } from '@/engine/campaignRules';
import type { Battle, CampaignState } from '@/engine/types';
import { AllianceTag, AttackIcon, FactionTag, Markdown, Panel } from '@/components/ui';
import { fmtDate, planetName, uploadUrl } from '@/components/public/fmt';
import { missionLabel } from '@/engine/missions';
import { DEFAULT_LOCALE, makeT, translateMessage, type Locale } from '@/i18n/core';
import { battleKindName } from '@/components/battleName';

export function BattleView({ state, battle: b, base, playerBase, locale }: { state: CampaignState; battle: Battle; base: string; playerBase?: string; locale?: Locale }) {
  const lc = locale ?? DEFAULT_LOCALE;
  const t = makeT(lc);
  const msg = (m: string) => translateMessage(lc, m);
  const al = (id: string) => state.alliances.find((a) => a.id === id) ?? null;
  const pl = (id: string) => state.players.find((p) => p.id === id);
  const tA = b.vp ? b.vp.attacker + (b.battleReady.attacker ? 10 : 0) : null;
  const tD = b.vp ? b.vp.defender + (b.battleReady.defender ? 10 : 0) : null;
  const side = (label: string, allianceId: string, list: Battle['attackers'], vp: number | null, ready: boolean, win: boolean) => (
    <div className={`inset p-3 ${win ? 'shadow-[inset_0_0_0_1px_#86b06a]' : ''}`}>
      <p className="label">{label}</p>
      <AllianceTag alliance={al(allianceId)} className="text-lg font-semibold" />
      <ul className="mt-1 text-[15px]">
        {list.map((p) => (
          <li key={p.playerId}>
            {playerBase ? (
              <Link className="link" href={`${playerBase}/${p.playerId}`}>
                {pl(p.playerId)?.nickname ?? '?'}
              </Link>
            ) : (
              pl(p.playerId)?.nickname
            )}
            {p.faction ? (
              <span className="text-dim">
                {' '}
                · <FactionTag name={p.faction} />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {vp !== null && (
        <p className="mt-2 font-mono text-2xl">
          {vp} VP{ready && <span className="ml-2 text-[14px] text-ok">{t('inkl. +10 Battle Ready')}</span>}
        </p>
      )}
    </div>
  );
  const winnerName = b.victor && b.victor !== 'DRAW' ? al(b.victor === 'ATTACKER' ? b.attackerAllianceId : b.defenderAllianceId)?.name : null;
  const tz = state.meta.timezone || 'Europe/Berlin';
  const names = (list: Battle['attackers']) =>
    list
      .map((p) => pl(p.playerId)?.nickname)
      .filter(Boolean)
      .join(' & ') || '–';
  const gameWinner = (g: NonNullable<Battle['games']>[number]) => {
    if (!g.vp) return t('offen');
    const a = g.vp.attacker + (g.battleReady.attacker ? 10 : 0);
    const d = g.vp.defender + (g.battleReady.defender ? 10 : 0);
    return a > d ? t('Angreifer siegt') : d > a ? t('Verteidiger siegt') : t('Unentschieden');
  };
  return (
    <div className="space-y-4">
      <div>
        <p className="hud-title">
          {t('Phase {n}', { n: b.phaseNumber })}
          {b.kind === 'FINAL_TIEBREAK' ? ` · ${t('Entscheidungsschlacht')}` : ''}
        </p>
        <h1 className="font-display text-[24px] font-bold uppercase leading-tight tracking-[0.04em] text-ink">
          <AttackIcon type={b.attackType} size={24} /> {battleKindName(b, t)} {b.planetId && <span className="text-dim">· {planetName(b.planetId)}</span>}
        </h1>
        <p className="font-mono text-[14px] text-dim">
          {b.playedAt ? t('Gespielt {date}', { date: fmtDate(b.playedAt, true, lc, tz) }) : b.status === 'UNPLAYED_RESOLVED' ? t('Nicht gespielt – regelgemäß gewertet') : t('Noch nicht gespielt')}
          {sizeDef(state, b.size) ? ` · ${sizeDef(state, b.size)!.name}` : ''}
          {` · Mission: ${msg(missionLabel(state, b))}`}
          {b.theatre ? ` · ${THEATRES[b.theatre].name}` : ''}
          {b.twist ? ` – ${b.twist.name}` : ''}
        </p>
        {b.scheduledAt && !b.playedAt && (
          <p className="text-[15px]">
            {t('Termin:')} <b>{fmtDate(b.scheduledAt, true, lc, tz)}</b>
          </p>
        )}
        {b.planetId && (
          <Link className="link text-[15px]" href={`${base}/battles/${b.id}/briefing`}>
            {t('Briefing anzeigen')}
          </Link>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {side(t('Angreifer'), b.attackerAllianceId, b.attackers, tA, b.battleReady.attacker, b.victor === 'ATTACKER')}
        {side(t('Verteidiger'), b.defenderAllianceId, b.defenders, tD, b.battleReady.defender, b.victor === 'DEFENDER')}
      </div>
      {b.victor && <p className="text-lg">{b.victor === 'DRAW' ? t('Unentschieden') : t('Sieger: {name}', { name: winnerName })}</p>}
      {b.applied.length > 0 && (
        <Panel title="Campaign Outcome">
          <ul className="list-disc space-y-0.5 pl-5 text-[15px]">
            {b.applied.map((l, i) => (
              <li key={i}>{msg(l)}</li>
            ))}
          </ul>
        </Panel>
      )}
      {(b.games ?? []).length > 0 && (
        <Panel title={t('Einzelspiele')}>
          <ol className="space-y-3">
            {b.games!.map((g, i) => (
              <li key={g.id} className="border-l-2 border-line pl-3 text-[15px]">
                <p className="font-semibold">
                  {t('Spiel {n}', { n: i + 1 })}: {t('{a} gegen {d}', { a: names(g.attackers), d: names(g.defenders) })}
                </p>
                <p className="font-mono text-[14px] text-dim">
                  {g.vp ? `${g.vp.attacker}${g.battleReady.attacker ? '+10' : ''} : ${g.vp.defender}${g.battleReady.defender ? '+10' : ''} VP · ` : ''}
                  {gameWinner(g)}
                  {g.playedAt ? ` · ${fmtDate(g.playedAt, true, lc, tz)}` : ''}
                  {sizeDef(state, g.size) ? ` · ${sizeDef(state, g.size)!.name}` : ''}
                  {g.missionName ? ` · Mission: ${g.missionName}` : ''}
                </p>
                {g.report && <Markdown text={g.report} />}
                {(g.photos ?? []).length > 0 && (
                  <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                    {g.photos!.map((p) => (
                      <a key={p} href={uploadUrl(p)!} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={uploadUrl(p, true)!} alt={t('Schlachtfoto')} className="aspect-square w-full border border-line object-cover" loading="lazy" />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </Panel>
      )}
      {b.report && (
        <Panel title={t('Schlachtbericht')}>
          <Markdown text={b.report} />
        </Panel>
      )}
      {b.photos.length > 0 && (
        <Panel title={t('Fotos')}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {b.photos.map((p) => (
              <a key={p} href={uploadUrl(p)!} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={uploadUrl(p, true)!} alt={t('Schlachtfoto')} className="aspect-square w-full border border-line object-cover" loading="lazy" />
              </a>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
