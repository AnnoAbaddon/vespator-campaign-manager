import type { CampaignState } from '@/engine/types';
import { TENDENCY_LABEL } from '@/engine/fog';
import { END_SCORING_LABEL, grandEnabled, grandPlacement, scoresDeviate } from '@/engine/finale';
import { rivalries } from '@/engine/narrative';
import type { PhaseObjective } from '@/engine/narrative';
import { AllianceTag } from '@/components/ui';
import { GameIcon } from '@/components/icons/GameIcon';
import { planetName } from '@/components/public/fmt';
import { intlLocale, makeT, translateMessage, type Locale, type T } from '@/i18n/core';

/**
 * Öffentliche Bausteine des Blocks R2 (ohne Client-Hooks, serverseitig und in der Spielerseite nutzbar):
 * Nebel über dem Punktestand (C1), Sonderziele (C3), Großschlacht (C6), Endwertung (C2), Rivalitäten (C5).
 */

/** Rangfolge und Tendenz statt Punkten (C1) */
export function FogStandings({ state, locale, compact = false }: { state: CampaignState; locale: Locale; compact?: boolean }) {
  const t = makeT(locale);
  const fog = state.fog;
  if (!fog) return null;
  const ranking = [...state.alliances].sort((a, b) => fog.rank[a.id] - fog.rank[b.id]);
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-4 gap-y-1 ${compact ? '' : 'text-[15px]'}`} aria-label={t('Rangfolge (Nebel über dem Punktestand)')}>
      {ranking.map((a) => (
        <span key={a.id} className="inline-flex items-baseline gap-1.5">
          <b className="font-mono text-ink">{fog.rank[a.id]}.</b>
          <AllianceTag alliance={a} />
          <span className="text-dim">{t(TENDENCY_LABEL[fog.tendency[a.id]])}</span>
        </span>
      ))}
    </span>
  );
}

export const fogNote = (t: T) => t('Nebel über dem Punktestand (Hausregel): Die genauen Punkte werden am Kampagnenende aufgedeckt.');

export function objectiveReward(o: PhaseObjective, t: T): string {
  const r = o.reward;
  const extra = r.text && r.kind !== 'HONOR' ? ` – ${r.text}` : '';
  if (r.kind === 'PL') return t('+{n} PL auf {planet}', { n: r.value, planet: planetName(r.planetId) }) + extra;
  if (r.kind === 'END_POINTS') return t('+{n} Punkte für die Endwertung', { n: r.value }) + extra;
  if (r.kind === 'HONOR') return t('Ehrung: {title}', { title: r.text || o.title });
  return r.text || t('nur erzählerisch');
}

/** Sonderziele einer Phase (C3) */
export function ObjectivesList({ state, phase, locale }: { state: CampaignState; phase: number | null; locale: Locale }) {
  const t = makeT(locale);
  const list = (state.objectives ?? []).filter((o) => phase === null || o.phaseNumber === phase);
  if (!list.length) return null;
  const al = (id: string | null) => state.alliances.find((a) => a.id === id) ?? null;
  return (
    <ul className="space-y-2 text-[15px]">
      {list.map((o) => (
        <li key={o.id} className="border-l-2 pl-3" style={{ borderColor: o.status === 'MET' ? '#6fa56f' : o.status === 'FAILED' ? '#6b6556' : '#dda94d' }}>
          <p className="flex flex-wrap items-center gap-x-2">
            <b className="text-ink">{o.title}</b>
            {phase === null && <span className="chip">{t('Phase {n}', { n: o.phaseNumber })}</span>}
            <span className={`chip ${o.status === 'MET' ? 'border-ok text-ok' : o.status === 'OPEN' ? 'border-accent text-accent' : ''}`}>
              {o.status === 'MET' ? t('erfüllt') : o.status === 'FAILED' ? t('nicht erfüllt') : t('offen')}
            </span>
          </p>
          <p className="text-[14px] text-dim">
            {o.allianceId ? <AllianceTag alliance={al(o.allianceId)} /> : t('alle Allianzen')} · {o.check === 'HOLD_PLANET' ? t('{planet} halten', { planet: planetName(o.planetId) }) : t('Warmaster entscheidet')} ·{' '}
            {objectiveReward(o, t)}
          </p>
          {o.text && <p className="whitespace-pre-wrap text-[14px]">{o.text}</p>}
          {o.status === 'MET' && (
            <p className="text-[14px] text-ok">
              {o.achievedBy.map((a) => al(a)?.name ?? '?').join(', ')}
              {o.reason ? ` · ${translateMessage(locale, o.reason)}` : ''}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Großschlacht (C6): Format, Termin, Teilnehmer und Ergebnis */
export function GrandBattleView({ state, locale }: { state: CampaignState; locale: Locale }) {
  const t = makeT(locale);
  const g = state.grandBattle;
  if (!g || (!grandEnabled(state) && !g.done)) return null;
  const place = grandPlacement(state);
  const nick = (id: string) => state.players.find((p) => p.id === id)?.nickname ?? '?';
  const bonus = state.toggles.grandFinale?.bonus ?? [];
  return (
    <div className="space-y-2 text-[15px]">
      <p>
        <b className="text-ink">{g.name === 'Großschlacht' ? t('Großschlacht') : g.name}</b>
        {g.mission && <span className="text-dim"> · {g.mission}</span>}
        {g.scheduledAt && (
          <span className="font-mono text-[14px] text-dim"> · {new Date(g.scheduledAt).toLocaleString(intlLocale(locale), { timeZone: state.meta.timezone, dateStyle: 'short', timeStyle: 'short' })}</span>
        )}
      </p>
      <ul className="space-y-1">
        {state.alliances.map((a) => (
          <li key={a.id}>
            <AllianceTag alliance={a} /> <span className="text-dim">{(g.participants[a.id] ?? []).map(nick).join(', ') || t('noch niemand gemeldet')}</span>
            {g.done && place && (
              <span className="ml-2 font-mono text-ink">
                {t('Platz {n}', { n: place[a.id] })}
                {bonus[place[a.id] - 1] ? ` (+${bonus[place[a.id] - 1]})` : ''}
              </span>
            )}
          </li>
        ))}
      </ul>
      {g.tables.some((x) => x.winnerAllianceId) && <p className="text-[14px] text-dim">{g.tables.map((x) => `${x.label}: ${state.alliances.find((a) => a.id === x.winnerAllianceId)?.name ?? t('offen')}`).join(' · ')}</p>}
      {g.report && <p className="whitespace-pre-wrap text-[14px]">{g.report}</p>}
    </div>
  );
}

/** Endwertung, wenn sie vom Buch abweicht (C2/C6) */
export function FinalScoresView({ state, locale }: { state: CampaignState; locale: Locale }) {
  const t = makeT(locale);
  const s = state.result?.scores;
  if (!s || !scoresDeviate(s)) return null;
  return (
    <div className="text-left text-[14px]">
      <p className="text-dim">{t('Endwertung (Hausregel): {mode}', { mode: t(END_SCORING_LABEL[s.mode]) })}</p>
      <table className="table mx-auto w-auto">
        <thead>
          <tr>
            <th>{t('Allianz')}</th>
            <th className="text-right">{t('Grundwert')}</th>
            <th className="text-right">{t('Boni')}</th>
            <th className="text-right">{t('Summe')}</th>
          </tr>
        </thead>
        <tbody>
          {[...state.alliances]
            .sort((a, b) => (s.total[b.id] ?? 0) - (s.total[a.id] ?? 0))
            .map((a) => (
              <tr key={a.id}>
                <td>
                  <AllianceTag alliance={a} />
                </td>
                <td className="text-right font-mono">{s.base[a.id] ?? 0}</td>
                <td className="text-right font-mono">{s.bonus[a.id] ? `+${s.bonus[a.id]}` : '–'}</td>
                <td className="text-right font-mono text-ink">{s.total[a.id] ?? 0}</td>
              </tr>
            ))}
        </tbody>
      </table>
      {s.items.length > 0 && <p className="mt-1 text-faint">{s.items.map((i) => `${state.alliances.find((a) => a.id === i.allianceId)?.name ?? '?'} +${i.points} (${translateMessage(locale, i.reason)})`).join(' · ')}</p>}
    </div>
  );
}

/** Rivalitäten eines Spielers (C5): Bilanz je Gegner und Höhepunkte */
export function RivalryView({ state, playerId, locale }: { state: CampaignState; playerId: string; locale: Locale }) {
  const t = makeT(locale);
  const r = rivalries(state, playerId);
  const me = state.players.find((p) => p.id === playerId);
  const nick = (id: string) => state.players.find((p) => p.id === id)?.nickname ?? '?';
  const nem = me?.nemesisId ? state.players.find((p) => p.id === me.nemesisId) : null;
  const nemRow = nem ? r.rows.find((x) => x.opponentId === nem.id) : null;
  const rec = (x: { wins: number; draws: number; losses: number }) => `${x.wins}–${x.draws}–${x.losses}`;
  const highlights: [string, (typeof r)['mostPlayed']][] = [
    ['Häufigster Gegner', r.mostPlayed],
    ['Meiste Siege gegen', r.mostBeaten],
    ['Meiste Niederlagen gegen', r.mostLostTo],
    ['Knappste Bilanz', r.closest],
  ];
  return (
    <div className="space-y-2 text-[15px]">
      {nem && (
        <p>
          <GameIcon name="ui_SKULL" size={16} color="#c9453b" className="mr-1 inline-block align-[-3px]" />
          {t('Nemesis: {name}', { name: nem.nickname })} <span className="text-dim">· {nemRow ? t('Bilanz {rec} (S–U–N)', { rec: rec(nemRow) }) : t('noch kein Duell')}</span>
        </p>
      )}
      {r.rows.length ? (
        <>
          <ul className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
            {highlights
              .filter(([, x]) => x)
              .map(([label, x]) => (
                <li key={label}>
                  <span className="text-dim">{t(label)}:</span> {nick(x!.opponentId)} <span className="font-mono text-[14px] text-faint">{rec(x!)}</span>
                </li>
              ))}
          </ul>
          <table className="table">
            <thead>
              <tr>
                <th>{t('Gegner')}</th>
                <th className="text-right">{t('Spiele')}</th>
                <th className="text-right">{t('S–U–N')}</th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((x) => (
                <tr key={x.opponentId}>
                  <td>{nick(x.opponentId)}</td>
                  <td className="text-right font-mono">{x.games}</td>
                  <td className="text-right font-mono">{rec(x)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="text-faint">{t('Noch keine gewertete Schlacht.')}</p>
      )}
    </div>
  );
}
