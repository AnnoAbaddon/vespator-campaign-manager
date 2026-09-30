import { loadPublic } from '@/server/public';
import { ATTACK_TYPES, EVENTS, type AttackType, type EventCode } from '@/engine/data/vespator';
import { Panel } from '@/components/ui';
import { activeHouseRules } from '@/engine/houseRules';
import { END_SCORING_LABEL } from '@/engine/finale';
import { battleSizes, edition } from '@/engine/campaignRules';
import { translateMessage } from '@/i18n/core';
import { publicLocale, tFor } from '@/i18n/server';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { state } = loadPublic(token);
  return { title: tFor(await publicLocale(state))('Regeln') };
}

/**
 * Kampagnenregeln der Leseansicht: Eckdaten als kurze Bezeichner-Wert-Zeilen, Hausregeln hervorgehoben,
 * Operationen und Ereignisse als Listen. Der Gruppenkopf nennt den Status einmal („alle aktiv“ bzw. „n
 * deaktiviert, übrige aktiv“); einzelne Zeilen tragen nur dann einen Status, wenn sie davon abweichen.
 */
export default async function PublicRules({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { state } = loadPublic(token);
  const t = state.toggles;
  const locale = await publicLocale(state);
  const tr = tFor(locale);
  const msg = (m: string) => translateMessage(locale, m);
  const house = activeHouseRules(state);
  const lastPhase = t.lastPhase
    ? [
        t.lastPhase.mandatoryBattle && tr('jede Allianz soll eine Battle Operation erklären'),
        t.lastPhase.doubleGains && tr('PL-Gewinne des Siegers zählen doppelt'),
        t.lastPhase.noVoidLeap && tr('kein Void Leap'),
      ].filter((x): x is string => !!x)
    : [];
  // weitere Hausregeln neben den FAQ-Schaltern: Void-Leap-Abfangen (N4.2) und Spiellast (N1.6)
  const extraRules = [
    t.voidLeapIntercept && tr('Void-Leap-Abfangen: Eine gegnerische Flotte am Zielplaneten kann ein Abfanggefecht (z. B. Raumkampf) erzwingen'),
    t.load?.maxPerPlayer && tr('Spiellast: höchstens {n} Schlachten je Spieler und Phase (Hinweis an die Spielleitung, kein Verbot)', { n: t.load.maxPerPlayer }),
    t.load?.minOnePerAlliance && tr('Spiellast: jede Allianz soll je Phase mindestens eine Battle Operation erklären'),
    // Block R1: Missions-Pool, Wiederholungssperre, harte Obergrenze, Auswürfeln, freie Gefechte
    Object.values(state.meta.missionPool ?? {}).some((l) => l?.length) && tr('Missions-Pool: je Angriffsart eine Auswahl an Missionen; die Campaign Outcomes bleiben die der Angriffsart'),
    t.missionRepeatLock && tr('Wiederholungssperre: dieselbe Allianz spielt mit derselben Angriffsart nicht zweimal hintereinander dieselbe Mission'),
    t.loadCap?.maxDefences && tr('Obergrenze: höchstens {n} Verteidigungen je Spieler und Phase', { n: t.loadCap.maxDefences }),
    t.loadCap?.maxGames && tr('Obergrenze: höchstens {n} Schlachten je Spieler und Phase', { n: t.loadCap.maxGames }),
    t.unplayedRollOff?.enabled &&
      (t.unplayedRollOff.plModifier
        ? tr('Ungespielte Schlachten werden per W6-Duell ausgewürfelt (+1 für die Seite mit höherem Power Level)')
        : tr('Ungespielte Schlachten werden per W6-Duell ausgewürfelt')),
    t.freeSkirmishes?.enabled &&
      (t.freeSkirmishes.reward === 'POINTS'
        ? tr('Freie Gefechte zwischen Allianzen: +{n} Kampagnenpunkt(e) je Sieg, höchstens {max} je Allianz', { n: t.freeSkirmishes.pointsPerWin, max: t.freeSkirmishes.maxBonus })
        : tr('Freie Gefechte zwischen Allianzen zählen für Statistik und Chronik')),
    // Block R2: Nebel über dem Punktestand, alternative Endwertung, Großschlacht
    t.fog && tr('Nebel über dem Punktestand: Die Leseansicht zeigt nur Rangfolge und Tendenz, die genauen Punkte werden am Kampagnenende aufgedeckt'),
    t.endScoring && t.endScoring.mode !== 'BOOK' && tr('Endwertung abweichend vom Buch: {mode}', { mode: tr(END_SCORING_LABEL[t.endScoring.mode]) }),
    t.grandFinale?.enabled && tr('Finale „Großschlacht“ aller Allianzen in der letzten Phase; die Platzierung bringt {list} Punkte für die Endwertung', { list: t.grandFinale.bonus.join(' / ') }),
  ].filter((x): x is string => !!x);
  const ops: [string, boolean][] = [
    ['Void Leap', t.operations.voidLeap],
    ['Raise Edifices', t.operations.raiseEdifices],
    ['Logistical Auxilia', t.operations.logisticalAuxilia],
    ['Deploy Kill Teams', t.operations.killTeams],
    ...(Object.keys(ATTACK_TYPES) as AttackType[]).map((a): [string, boolean] => [ATTACK_TYPES[a].name, t.operations.attackTypes[a]]),
  ];
  const events: [string, boolean][] = [
    ['Fortunes of War', t.events.fortunesOfWar],
    ['Perils of Power', t.events.perilsOfPower],
    ['Desperate Measures', t.events.desperateMeasures],
    ['Theatres & Twists', t.theatreTwists],
    ['Campaign Medals', t.medals],
  ];
  const disabledEvents = t.events.disabled.map((c) => EVENTS[c as EventCode]?.name ?? c);

  /** Status der Gruppe, einmal im Kopf: „alle aktiv“ ruhig mit Leuchte, sonst Zahl der deaktivierten in Rot */
  const summary = (list: [string, boolean][], extraOff = 0) => {
    const off = list.filter(([, v]) => !v).length + extraOff;
    return off ? (
      <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-danger">
        <span className="lamp lamp-alert" aria-hidden />
        {tr('{n} deaktiviert', { n: off })}
        <span className="font-normal text-dim">· {tr('übrige aktiv')}</span>
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-[14px] text-dim">
        <span className="lamp lamp-ok" aria-hidden />
        {tr('alle aktiv (Regelbuch)')}
      </span>
    );
  };
  /** Liste der Gruppe: abweichende (deaktivierte) Einträge zuerst und markiert, die übrigen ohne eigenen Status */
  const statusList = (list: [string, boolean][]) => (
    <ul className="divide-y divide-line/40 text-[15px]">
      {[...list.filter(([, v]) => !v), ...list.filter(([, v]) => v)].map(([name, v]) => (
        <li key={name} className={`flex min-h-8 items-center justify-between gap-3 py-1 ${v ? '' : '-mx-2 border-l-4 border-danger bg-[#2a1210]/60 px-2'}`}>
          <span className={v ? 'text-ink' : 'font-semibold text-ink'}>{name}</span>
          {!v && (
            <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-danger">
              <span className="lamp lamp-alert" aria-hidden />
              {tr('deaktiviert')}
            </span>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <Panel title={tr('Grundlage')}>
        <p className="max-w-[75ch] text-[15px] text-dim">
          {tr('Gespielt wird nach „War on the Vespator Front“ aus')} <i>500 Worlds: Titus</i>.{' '}
          {tr('Die Regeltexte stehen im Buch; diese Seite zeigt, welche Teile in dieser Kampagne aktiv sind. Unklare Regelfragen und unsere Entscheidungen dazu stehen im')}{' '}
          <a className="link" href={`/v/${token}/faq`}>
            {tr('Regel-FAQ')}
          </a>
          .
        </p>
        <dl className="mt-3 grid grid-cols-[minmax(9rem,auto)_minmax(0,1fr)] gap-x-5 text-[15px] @2xl:grid-cols-[minmax(9rem,auto)_minmax(0,1fr)_minmax(9rem,auto)_minmax(0,1fr)]">
          {(
            [
              [tr('Phasen'), state.meta.phaseCount],
              [tr('Allianzen'), state.meta.allianceCount],
              [tr('Start-Infrastruktur'), tr('{n} je Allianz', { n: t.setupInfraCount })],
              [tr('Edition'), tr('{n}. Edition', { n: edition(state) })],
            ] as [string, React.ReactNode][]
          ).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="border-b border-line/40 py-1.5 text-dim">{k}</dt>
              <dd className="border-b border-line/40 py-1.5 font-semibold text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <h3 className="section-title mt-4">{tr('Spielgrößen')}</h3>
        <div className="max-w-2xl overflow-x-auto">
          <table className="table text-[15px]">
            <thead>
              <tr>
                <th>{tr('Größe')}</th>
                <th className="text-right">{tr('Punkte')}</th>
                <th>{tr('Dauer')}</th>
                <th className="text-right">Reserves</th>
              </tr>
            </thead>
            <tbody>
              {battleSizes(state).map((b) => (
                <tr key={b.name}>
                  <td className="font-semibold">{b.name}</td>
                  <td className="text-right font-mono">{b.points}</td>
                  <td className="whitespace-nowrap">{msg(b.duration)}</td>
                  <td className="text-right font-mono">{b.reserves}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {lastPhase.length > 0 && (
          <div className="mt-3 border-l-4 border-accent bg-[#2a2210]/50 px-3 py-2 text-[15px]">
            <p className="font-semibold text-accent">{tr('Letzte Phase')}</p>
            <ul className="list-disc pl-5">
              {lastPhase.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}
        {extraRules.length > 0 && (
          <div className="mt-3 border-l-4 border-accent bg-[#2a2210]/50 px-3 py-2 text-[15px]">
            <p className="font-semibold text-accent">{tr('Weitere Hausregeln')}</p>
            <ul className="list-disc pl-5">
              {extraRules.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}
      </Panel>
      {house.length > 0 && (
        <section className="hud min-w-0 border-l-4 !border-l-accent p-3 sm:p-4" aria-label={tr('Abweichende Hausregeln')}>
          <h2 className="hud-title relative z-[1] mb-2 flex items-center gap-2 text-accent">
            <span className="lamp lamp-on" aria-hidden />
            {tr('Abweichende Hausregeln')} <span className="font-mono text-[14px] text-dim">({house.length})</span>
          </h2>
          <ul className="relative z-[1] divide-y divide-line/40 text-[15px]">
            {house.map((r) => (
              <li key={r.id} className="py-2">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <a className="link font-mono text-[14px]" href={`/v/${token}/faq#${r.faq.toLowerCase()}`}>
                    {r.faq}
                  </a>
                  <b className="text-ink">{msg(r.title)}</b>
                </p>
                <p className="text-ink">{msg(r.alternative)}</p>
                <p className="text-[14px] text-dim">{tr('(statt: {text})', { text: msg(r.standard) })}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title={tr('Operationen')} actions={summary(ops)}>
          {statusList(ops)}
        </Panel>
        <Panel title={tr('Events, Theatres, Medaillen')} actions={summary(events, disabledEvents.length)}>
          {statusList(events)}
          {disabledEvents.length > 0 && (
            <div className="mt-2 border-l-4 border-danger bg-[#2a1210]/60 px-2 py-1.5 text-[15px]">
              <p className="font-semibold text-danger">{tr('Einzeln deaktiviert:')}</p>
              <p className="text-ink">{disabledEvents.join(', ')}</p>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
