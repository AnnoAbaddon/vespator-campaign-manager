'use client';

import { useState } from 'react';
import { MEDALS, type MedalId } from '@/engine/data/vespator';
import { medalValues } from '@/engine/scoring';
import { AllianceTag, MedalIcon, Panel } from '@/components/ui';
import { useT } from '@/i18n/client';
import { useCmd } from '../CommandProvider';
import { BattleList } from '../battles/BattleList';
import { GameIcon } from '@/components/icons/GameIcon';
import { FinalScoresView } from '@/components/public/R2Public';
import { useLocale } from '@/i18n/client';

/** Endwertung nach Hausregel bzw. mit Boni (C2/C6) */
function R2FinalScores() {
  const { state } = useCmd();
  const locale = useLocale();
  return <FinalScoresView state={state} locale={locale} />;
}

function FinalStandings() {
  const { state } = useCmd();
  const t = useT();
  const last = state.pointsHistory[state.pointsHistory.length - 1];
  if (!last) return null;
  const rows = [...state.alliances].sort((a, b) => (last.points[b.id] ?? 0) - (last.points[a.id] ?? 0));
  return (
    <table className="table">
      <thead>
        <tr>
          <th>#</th>
          <th>{t('Allianz')}</th>
          <th>{t('Punkte')}</th>
          <th>Stronghold</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a, i) => (
          <tr key={a.id}>
            <td>{i + 1}</td>
            <td>
              <AllianceTag alliance={a} />
            </td>
            <td className="font-semibold">{last.points[a.id]}</td>
            <td>{a.strongholdDestroyed ? <span className="text-danger">{t('zerstört')}</span> : t('intakt')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TiebreakPanel() {
  const { state, run, busy } = useCmd();
  const t = useT();
  const tied = state.result?.tied ?? [];
  const [a, setA] = useState(tied[0] ?? '');
  const [d, setD] = useState(tied[1] ?? '');
  const battles = state.battles.filter((b) => b.kind === 'FINAL_TIEBREAK');
  const al = (id: string) => state.alliances.find((x) => x.id === id);
  return (
    <div className="space-y-3">
      <Panel title={t('Gleichstand – Entscheidungsschlacht')} icon={<GameIcon name="op_BATTLE" size={18} />}>
        <p className="mb-2 text-[15px]">
          {t('Gleichauf:')}{' '}
          {tied.map((id) => (
            <AllianceTag key={id} alliance={al(id)} className="mr-3" />
          ))}
        </p>
        <FinalStandings />
        <R2FinalScores />
      </Panel>
      <Panel title={t('Schlacht ansetzen')} icon={<GameIcon name="at_SEIZE_POWER_BASE" size={18} />}>
        <div className="grid gap-2 @lg:grid-cols-[1fr_1fr_auto]">
          <select className="select" value={a} aria-label={t('Angreifer')} onChange={(e) => setA(e.target.value)}>
            {tied.map((id) => (
              <option key={id} value={id}>
                {al(id)?.name}
              </option>
            ))}
          </select>
          <select className="select" value={d} aria-label={t('Verteidiger')} onChange={(e) => setD(e.target.value)}>
            {tied.map((id) => (
              <option key={id} value={id}>
                {al(id)?.name}
              </option>
            ))}
          </select>
          <button className="btn" disabled={busy || !a || !d || a === d} onClick={() => run({ type: 'TIEBREAK_ADD', attackerAllianceId: a, defenderAllianceId: d })}>
            {t('Ansetzen')}
          </button>
        </div>
      </Panel>
      <Panel title={t('Entscheidungsschlachten')} icon={<GameIcon name="op_BATTLE" size={18} />}>
        <BattleList battles={battles} />
      </Panel>
      <Panel title={t('Sieger festlegen')} icon={<GameIcon name="me_LAUREL" size={18} />}>
        <div className="flex flex-wrap gap-2">
          {tied.map((id) => (
            <button key={id} className="btn" disabled={busy} onClick={() => run({ type: 'TIEBREAK_DECIDE', winnerAllianceId: id })}>
              {t('{name} gewinnt', { name: al(id)?.name })}
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function EndedPanel() {
  const { state, run, busy, campaignId } = useCmd();
  const t = useT();
  const winner = state.alliances.find((a) => a.id === state.result?.winnerAllianceId);
  const vals = medalValues({ state });
  const tb = state.result?.tiebreak;
  const tbBattle = state.battles.find((b) => b.kind === 'FINAL_TIEBREAK' && b.vp);
  return (
    <div className="space-y-3">
      <Panel title={t('Kampagne beendet')} icon={<GameIcon name="me_LAUREL" size={18} />}>
        <p className="mb-1 text-[15px] text-dim">{t('Sieger der Vespator Front')}</p>
        <p className="inset mb-3 px-3 py-2 font-display text-[22px] font-bold uppercase tracking-[0.04em]">{winner ? <AllianceTag alliance={winner} /> : '–'}</p>
        {tb === 'STRONGHOLD' && <p className="mb-3 text-[15px] text-dim">{t('Gleichstand – entschieden durch den einzigen intakten Stronghold')}</p>}
        {tb === 'FINAL_BATTLE' && (
          <p className="mb-3 text-[15px] text-dim">{tbBattle?.vp ? t('Sieg per Entscheidungsschlacht {a} : {d}', { a: tbBattle.vp.attacker, d: tbBattle.vp.defender }) : t('Sieg per Entscheidungsschlacht')}</p>
        )}
        <FinalStandings />
        <R2FinalScores />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a className="btn btn-primary" href={`/admin?folge=${campaignId}`}>
            {t('Folgekampagne anlegen')}
          </a>
          <span className="text-[14px] text-dim">{t('Spieler, Allianzen und Medaillen werden übernommen.')}</span>
        </div>
      </Panel>
      <Panel title="Campaign Medals" icon={<GameIcon name="me_STAR" size={18} />}>
        {!state.toggles.medals && <p className="text-[15px] text-dim">{t('Medaillen sind deaktiviert.')}</p>}
        <div className="space-y-3">
          {(Object.keys(MEDALS) as MedalId[]).map((m) => {
            const award = state.medals.find((x) => x.medal === m);
            const v = m === 'LAUREL' ? null : vals[m];
            return (
              <div key={m} className="slab p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="inline-flex items-center gap-1.5">
                    <MedalIcon medal={m} size={22} /> {MEDALS[m].name}
                  </b>
                  <span className="ml-auto">{award ? <AllianceTag alliance={state.alliances.find((a) => a.id === award.allianceId)} /> : <span className="text-faint">{t('nicht vergeben')}</span>}</span>
                </div>
                {award?.note && <p className="text-[13px] text-dim">{award.note}</p>}
                {v && (
                  <p className="mt-1 text-[13px] text-dim">
                    {t('Werte:')} {state.alliances.map((a) => `${a.name} ${v[a.id] ?? '–'}`).join(' · ')}
                  </p>
                )}
                <select
                  className="select mt-2 w-auto"
                  value=""
                  disabled={busy}
                  aria-label={t('{medal}: Override', { medal: MEDALS[m].name })}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    run({ type: 'MEDAL_OVERRIDE', medal: m, allianceId: e.target.value === '__none' ? null : e.target.value });
                  }}
                >
                  <option value="">{t('Override…')}</option>
                  {state.alliances.map((a) => (
                    <option key={a.id} value={a.id}>
                      → {a.name}
                    </option>
                  ))}
                  <option value="__none">{t('nicht vergeben')}</option>
                </select>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
