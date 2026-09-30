import { THEATRES } from '@/engine/data/vespator';
import { ruleCard } from '@/engine/ruleCard';
import { layoutsFor } from '@/engine/terrain';
import { allMissions } from '@/engine/missions';
import type { Battle, CampaignState } from '@/engine/types';
import { makeT, translateMessage, type Locale } from '@/i18n/core';

/**
 * Regelkarte „Diese Schlacht“ (A7) mit Gelände-Layout (A8): kompakt oben im Briefing, auch auf dem
 * Spielerlink und im Druck. Ohne Hooks, damit Server- und Client-Seiten sie gleich rendern.
 */
export function RuleCard({ state, battle: b, locale }: { state: CampaignState; battle: Battle; locale: Locale }) {
  const t = makeT(locale);
  const msg = (m: string) => translateMessage(locale, m);
  const card = ruleCard(state, b);
  const layouts = layoutsFor(state, b).slice(0, 3);
  const missions = allMissions(state);
  const chooser = card.theatre?.chooser ? t({ ATTACKER: 'Angreifer', DEFENDER_AUXILIA: 'Verteidiger (Logistical Auxilia)', RANDOM: 'zufällig (Sinister Omens)' }[card.theatre.chooser]) : null;
  const layoutTitle = (l: (typeof layouts)[number]) =>
    l.title || [l.theatre ? THEATRES[l.theatre].name : null, l.missionId ? msg(missions.find((m) => m.id === l.missionId)?.name ?? '') : null].filter(Boolean).join(' · ');
  return (
    <section className="inset space-y-3 p-3 print:border print:border-black" aria-labelledby={`rulecard-${b.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`rulecard-${b.id}`} className="hud-title text-[15px]">
          {t('Regelkarte: diese Schlacht')}
        </h2>
        {card.stacked && (
          <p className="notice py-1 text-[14px]" role="note">
            {t('{n} Zusatzregeln gleichzeitig aktiv – vor dem Spiel gemeinsam durchgehen', { n: card.extras.length })}
          </p>
        )}
      </div>
      <dl className="grid gap-x-4 gap-y-2 text-[15px] sm:grid-cols-2">
        <div>
          <dt className="label">{t('Mission')}</dt>
          <dd className="font-semibold text-ink">
            {msg(card.mission.name)}
            {card.mission.fromPool && <span className="ml-2 text-[13px] font-normal text-dim">{t('aus dem Missions-Pool')}</span>}
          </dd>
          {card.mission.note && <dd className="text-[14px] text-dim">{card.mission.note}</dd>}
          {card.outcomes && <dd className="text-[13px] text-faint">{t('Die Campaign Outcomes der Angriffsart gelten unabhängig von der Mission.')}</dd>}
        </div>
        {card.theatre && (
          <div>
            <dt className="label">Theatre &amp; Twist</dt>
            <dd className="font-semibold text-ink">{card.theatre.name ?? t('noch offen')}</dd>
            <dd className="text-[14px] text-dim">
              {card.theatre.twist ? t('Twist: {name}', { name: msg(card.theatre.twist) }) : t('Twist: noch nicht gewürfelt')}
              {!card.theatre.name && chooser ? ` · ${t('Theatre wählt:')} ${chooser}` : ''}
            </dd>
          </div>
        )}
      </dl>
      {card.bonuses.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {card.bonuses.map((s) => (
            <div key={s.side}>
              <p className="label">{s.side === 'ATTACKER' ? t('Boni Angreifer') : t('Boni Verteidiger')}</p>
              {s.items.length ? (
                <ul className="list-disc space-y-0.5 pl-5 text-[14px]">
                  {s.items.map((i) => (
                    <li key={i}>{msg(i)}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-[14px] text-faint">{t('keine')}</p>
              )}
            </div>
          ))}
        </div>
      )}
      {card.extras.length > 0 && (
        <div>
          <p className="label">{t('Aktive Zusatzregeln')}</p>
          <ul className="list-disc space-y-0.5 pl-5 text-[14px]">
            {card.extras.map((x) => (
              <li key={x}>{msg(x)}</li>
            ))}
          </ul>
        </div>
      )}
      {card.outcomes && (
        <div>
          <p className="label">{t('Outcomes je Ergebnis')}</p>
          <ul className="space-y-0.5 text-[14px]">
            <li>
              <b>{t('Angreifer siegt:')}</b> {msg(card.outcomes.attacker)}
            </li>
            <li>
              <b>{t('Verteidiger siegt:')}</b> {msg(card.outcomes.defender)}
            </li>
            <li>
              <b>{t('Unentschieden:')}</b> {msg(card.outcomes.draw)}
            </li>
          </ul>
        </div>
      )}
      {layouts.length > 0 && (
        <div>
          <p className="label">{b.theatre ? t('Gelände-Layout') : t('Gelände-Layouts (je nach Theatre)')}</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {layouts.map((l) => (
              <li key={l.id} className="flex gap-3 text-[14px]">
                {l.image && (
                  <a href={`/api/uploads/${l.image}`} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/uploads/${l.image}?thumb=1`} alt={t('Gelände-Layout: {name}', { name: layoutTitle(l) })} className="h-20 w-28 border border-line object-cover" loading="lazy" />
                  </a>
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{layoutTitle(l)}</p>
                  {l.note && <p className="whitespace-pre-line text-dim">{l.note}</p>}
                  {l.link && (
                    <a className="link break-all" href={l.link} target="_blank" rel="noreferrer noopener">
                      {t('Layout öffnen')}
                      <span className="sr-only"> {t('(öffnet in neuem Tab)')}</span>
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
