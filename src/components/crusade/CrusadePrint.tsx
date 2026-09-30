import { rosterExport } from '@/engine/crusade';
import type { CampaignState, Player } from '@/engine/types';
import { makeT, translateMessage, type Locale } from '@/i18n/core';

/** Druckbogen der Order of Battle (NTH2 3.2): Kopf, Einheiten mit XP/Rang/Honours/Scars, Einsätze */
export function CrusadePrint({ state, player, locale }: { state: CampaignState; player: Player; locale: Locale }) {
  const t = makeT(locale);
  const ex = rosterExport(state, player);
  if (!ex) return <p className="p-6 text-[15px]">{t('{name} hat keine Order of Battle.', { name: player.nickname })}</p>;
  const o = ex.orderOfBattle;
  const RES = { WIN: t('Sieg'), DRAW: t('Unentschieden'), LOSS: t('Niederlage') };
  return (
    <main className="space-y-4 p-4 text-ink sm:p-6 print:bg-white print:p-0 print:text-black">
      <header>
        <p className="text-[14px] text-dim print:text-black">
          {ex.campaign} · {ex.player}
        </p>
        <h1 className="font-display text-[22px] font-bold print:text-black">Order of Battle: {o.name}</h1>
        <p className="text-[15px] print:text-black">{[o.faction, `Supply Limit ${o.supplyUsed}/${o.supplyLimit}`, `Requisition Points ${o.requisition}`].filter(Boolean).join(' · ')}</p>
        {o.notes && <p className="mt-1 whitespace-pre-line text-[14px] print:text-black">{o.notes}</p>}
      </header>
      <table className="table w-full text-[14px] print:text-black">
        <thead>
          <tr>
            <th>{t('Einheit')}</th>
            <th className="text-right">{t('Punkte')}</th>
            <th className="text-right">XP</th>
            <th>{t('Rang')}</th>
            <th className="text-right">{t('Schlachten')}</th>
            <th>Battle Honours</th>
            <th>Battle Scars</th>
          </tr>
        </thead>
        <tbody>
          {o.units.map((u, i) => (
            <tr key={i} className={u.retired ? 'opacity-60' : ''}>
              <td>
                {u.name}
                {u.kind && <span className="block text-[12px]">{u.kind}</span>}
                {u.retired && <span className="block text-[12px]">{t('ausgeschieden')}</span>}
              </td>
              <td className="text-right font-mono">{u.points}</td>
              <td className="text-right font-mono">{u.xp}</td>
              <td>{u.rank}</td>
              <td className="text-right font-mono">{u.battles}</td>
              <td>{u.honours.join(', ')}</td>
              <td>{u.scars.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {ex.battles.length > 0 && (
        <section>
          <h2 className="font-display text-[16px] font-bold print:text-black">{t('Einsätze und Crusade-XP')}</h2>
          <ul className="mt-1 space-y-0.5 text-[14px] print:text-black">
            {ex.battles.map((b, i) => (
              <li key={i}>
                P{b.phase} · {translateMessage(locale, b.where)} · {RES[b.result]} · {t('{n} XP je Einheit', { n: b.xpPerUnit })}: {b.units.join(', ') || '–'}
                {b.markedForGreatness ? ` · Marked for Greatness: ${b.markedForGreatness}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
