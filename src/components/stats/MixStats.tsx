'use client';

import { useState } from 'react';
import { ATTACK_TYPES, type AttackType } from '@/engine/data/vespator';
import { missionMix } from '@/engine/missionPool';
import type { CampaignState } from '@/engine/types';
import { AllianceTag, Empty } from '@/components/ui';
import { useMsg, useT } from '@/i18n/client';

/**
 * Mix-Statistik (A2): Angriffsarten und Missionen je Phase und Allianz, Frühwarnung vor Monokultur,
 * dazu die bestätigten freien Gefechte (B5). Für Statistik (öffentlich) und Schlachten-Register (Admin).
 */
export function MixStats({ state }: { state: CampaignState }) {
  const t = useT();
  const msg = useMsg();
  const mix = missionMix(state);
  const [sel, setSel] = useState(state.alliances[0]?.id ?? '');
  const rows = mix.byAlliance[sel] ?? { 0: { types: {}, missions: {}, total: 0 } };
  const types = (Object.keys(ATTACK_TYPES) as AttackType[]).filter((a) => state.toggles.operations.attackTypes[a] || rows[0].types[a]);
  const al = (id: string) => state.alliances.find((a) => a.id === id);
  const skirmishes = (state.skirmishes ?? []).filter((s) => s.status === 'CONFIRMED');
  const sk = (id: string) => {
    const mine = skirmishes.filter((s) => s.a.allianceId === id || s.b.allianceId === id);
    const w = mine.filter((s) => s.winner !== 'DRAW' && (s.winner === 'A' ? s.a : s.b).allianceId === id).length;
    const d = mine.filter((s) => s.winner === 'DRAW').length;
    return { n: mine.length, w, d, l: mine.length - w - d };
  };
  if (!mix.phases.length && !skirmishes.length) return <Empty>{t('Noch keine angesetzten Schlachten.')}</Empty>;
  const missions = Object.entries(rows[0].missions).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-3">
      {mix.warnings.length > 0 && (
        <ul className="space-y-1 text-[14px]" aria-label={t('Frühwarnung Monokultur')}>
          {mix.warnings.map((w) => (
            <li key={`${w.allianceId}${w.kind}${w.key}`} className="flex flex-wrap items-center gap-2">
              <span className="lamp lamp-alert" aria-hidden />
              <AllianceTag alliance={al(w.allianceId)} />
              <span>{t('Monokultur: {name} in {n} von {total} Angriffen', { name: w.kind === 'TYPE' ? ATTACK_TYPES[w.key as AttackType].name : msg(mix.names[w.key] ?? w.key), n: w.count, total: w.total })}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="tabbar" role="tablist" aria-label={t('Allianz')}>
        {state.alliances.map((a) => (
          <button key={a.id} type="button" role="tab" aria-selected={sel === a.id} className="tabkey min-h-11 px-2 text-[15px]" onClick={() => setSel(a.id)}>
            <AllianceTag alliance={a} />
          </button>
        ))}
      </div>
      {mix.phases.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table w-full min-w-[320px] text-[14px]">
            <caption className="sr-only">{t('Angriffsarten je Phase')}</caption>
            <thead>
              <tr>
                <th>{t('Attack Type')}</th>
                {mix.phases.map((p) => (
                  <th key={p} className="text-right">
                    {t('P{n}', { n: p })}
                  </th>
                ))}
                <th className="text-right">Σ</th>
              </tr>
            </thead>
            <tbody>
              {types.map((ty) => (
                <tr key={ty}>
                  <td className="whitespace-nowrap text-dim">{ATTACK_TYPES[ty].name}</td>
                  {[...mix.phases, 0].map((p) => {
                    const n = rows[p]?.types[ty] ?? 0;
                    return (
                      <td key={p} className={`text-right font-mono ${n ? 'text-ink' : 'text-faint'} ${p === 0 ? 'font-semibold' : ''}`}>
                        {n}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {missions.length > 0 && (
        <div>
          <p className="label">{t('Missionen')}</p>
          <ul className="flex flex-wrap gap-1.5">
            {missions.map(([k, n]) => (
              <li key={k} className="chip">
                {msg(mix.names[k] ?? k)} · {n}
              </li>
            ))}
          </ul>
        </div>
      )}
      {skirmishes.length > 0 && (
        <div>
          <p className="label">{t('Freie Gefechte (S/U/N)')}</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
            {state.alliances.map((a) => {
              const r = sk(a.id);
              return (
                <li key={a.id} className="inline-flex items-center gap-2">
                  <AllianceTag alliance={a} />
                  <span className="font-mono">
                    {r.w}/{r.d}/{r.l}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
