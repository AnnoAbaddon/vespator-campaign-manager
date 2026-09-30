'use client';

import { THEATRES, twistIndex } from '@/engine/data/vespator';
import { sizeDef } from '@/engine/campaignRules';
import { computeVictor, theatreForRoll } from '@/engine/phase';
import { missionLabel } from '@/engine/missions';
import type { Battle, CampaignState, ResultDraft } from '@/engine/types';
import { useIntlLocale, useMsg, useT } from '@/i18n/client';
import { decisionLabel, describeDecision } from './outcomeText';
import { playerNames } from './common';

const dt = (iso: string, tz: string, il: string) => new Date(iso).toLocaleString(il, { timeZone: tz, dateStyle: 'short', timeStyle: 'short' });

/**
 * Vollständiger Ergebnis-Entwurf (N1.2) als Zusammenfassung: VP bzw. Einzelspiele mit Battle Ready, Sieger,
 * Datum, Größe, Mission, Theatre/Twist, Teilnehmer, Bericht und die Outcome-Entscheidungen des Siegers.
 * Die Gegenseite sieht so vor „Bestätigen“ alles, was mit der Bestätigung übernommen wird.
 */
export function DraftSummary({ state, battle: b, draft }: { state: CampaignState; battle: Battle; draft: ResultDraft }) {
  const t = useT();
  const msg = useMsg();
  const il = useIntlLocale();
  const tz = state.meta.timezone;
  const u = draft.update;
  const br = (on: boolean | undefined) => (on ? ' (+10 Battle Ready)' : '');
  // Probe-Schlacht mit dem Entwurf: Sieger nach denselben Regeln wie beim Übernehmen
  const probe: Battle = {
    ...b,
    ...(u.games?.length ? { games: u.games, vp: null } : { vp: u.vp ?? b.vp, battleReady: u.battleReady ?? b.battleReady }),
  };
  const v = computeVictor(probe);
  const winner = v === 'DRAW' ? t('Unentschieden') : v ? (state.alliances.find((a) => a.id === (v === 'ATTACKER' ? b.attackerAllianceId : b.defenderAllianceId))?.name ?? '?') : '–';
  const games = u.games ?? [];
  const sum = games.reduce((s, g) => ({ a: s.a + (g.vp?.attacker ?? 0) + (g.battleReady.attacker ? 10 : 0), d: s.d + (g.vp?.defender ?? 0) + (g.battleReady.defender ? 10 : 0) }), { a: 0, d: 0 });
  const rolled = u.theatreRoll && b.planetId ? theatreForRoll(b.planetId, u.theatreRoll) : null;
  const theatre = rolled ?? u.theatre ?? b.theatre;
  const rows: [string, React.ReactNode][] = [];
  if (games.length) {
    rows.push([
      t('Einzelspiele'),
      <ul key="g" className="space-y-0.5">
        {games.map((g, i) => (
          <li key={g.id}>
            {t('Spiel {n}', { n: i + 1 })}: <b>{g.vp?.attacker ?? '–'}</b>
            {br(g.battleReady.attacker)} : <b>{g.vp?.defender ?? '–'}</b>
            {br(g.battleReady.defender)}
          </li>
        ))}
        <li>
          {t('Summe inkl. Battle Ready')}: <b>{sum.a}</b> : <b>{sum.d}</b> VP
        </li>
      </ul>,
    ]);
  } else if (u.vp) {
    rows.push([
      'VP',
      <span key="vp">
        <b>{u.vp.attacker}</b>
        {br(u.battleReady?.attacker)} : <b>{u.vp.defender}</b>
        {br(u.battleReady?.defender)}
      </span>,
    ]);
  }
  rows.push([t('Sieger'), <b key="w">{winner}</b>]);
  if (u.attackers?.length) rows.push([t('Angreifer'), playerNames(state, u.attackers)]);
  if (u.defenders?.length) rows.push([t('Verteidiger'), playerNames(state, u.defenders)]);
  if (u.playedAt) rows.push([t('Gespielt am'), dt(u.playedAt, tz, il)]);
  if (u.size) rows.push([t('Größe'), sizeDef(state, u.size)?.name ?? u.size]);
  if (u.mission) rows.push(['Mission', msg(missionLabel(state, { ...b, mission: u.mission }))]);
  if (rolled) rows.push(['Theatre', `${THEATRES[rolled].name} (${t('W6 {n}', { n: u.theatreRoll! })})`]);
  else if (u.theatre) rows.push(['Theatre', THEATRES[u.theatre].name]);
  if (u.twistRoll && theatre) rows.push(['Twist', `${THEATRES[theatre].twists[twistIndex(u.twistRoll)]} (${t('W6 {n}', { n: u.twistRoll })})`]);
  if (u.photos && u.photos.length > b.photos.length) rows.push([t('Fotos'), t('{n} neu', { n: u.photos.length - b.photos.length })]);
  const decisions = Object.entries(draft.decisions);
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        {rows.map(([k, val]) => (
          <div key={k} className="contents">
            <dt className="text-dim">{k}</dt>
            <dd className="min-w-0">{val}</dd>
          </div>
        ))}
      </dl>
      {u.report?.trim() && (
        <div>
          <p className="text-dim">{t('Bericht')}</p>
          <p className="inset max-h-32 overflow-y-auto whitespace-pre-wrap p-2 text-[14px]">{u.report}</p>
        </div>
      )}
      {decisions.length > 0 && (
        <div>
          <p className="text-dim">{t('Outcome-Entscheidungen des Siegers')}</p>
          <ul className="space-y-1">
            {decisions.map(([opId, d]) => (
              <li key={opId} className="border-l-2 border-line pl-2">
                <b>{decisionLabel(b.attackType, d.type, t)}</b>
                {b.operationIds.length > 1 && <span className="text-faint"> · {t('Operation {n}', { n: b.operationIds.indexOf(opId) + 1 })}</span>}
                <span className="block text-[14px]">{describeDecision(state, b, d, t).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
