import { ATTACK_TYPES, INFRA, THEATRES } from '@/engine/data/vespator';
import { Markdown } from '@/components/ui';
import { battleSizes, edition, lastPhaseRule, sizeDef } from '@/engine/campaignRules';
import { DRAW_SUMMARY, OUTCOME_SUMMARY, powerSources } from '@/engine/outcomes';
import type { Battle, CampaignState } from '@/engine/types';
import { TheatreBadge } from '@/components/map/icons';
import { planetDef } from '@/engine/map';
import { missionLabel } from '@/engine/missions';
import { house } from '@/engine/houseRules';
import { shiftRange, shiftedValue } from './briefingValues';
import { PlanetPortrait } from '@/components/map/PlanetArt';
import { DEFAULT_LOCALE, intlLocale, makeT, translateMessage, type Locale } from '@/i18n/core';
import { RuleCard } from './RuleCard';
import { guestsOf } from '@/engine/guests';
import { planetTraits } from '@/engine/crusade';
import { PlanetTraitList } from '@/components/crusade/PlanetTraits';

function missionValues(state: CampaignState, b: Battle, plA: number, plD: number, shA: number, shD: number): { label: string; value: string }[] {
  // Incursion-Sonderwerte gelten für die kleinste Standardgröße bzw. eigene Größen bis 1000 Punkte
  const size = sizeDef(state, b.size);
  const incursion = !!size && size.points <= 1000;
  const show = (f: (x: number) => number | string, pl: number, range: number) => shiftedValue(f, pl, range);
  switch (b.attackType) {
    case 'SEIZE_POWER_BASE':
      return [
        { label: 'Asset Guards (Verteidiger, Einheiten bis)', value: show((x) => Math.max(0, x), plD, shD) },
        { label: 'Vanguard Prowlers (Angreifer, Einheiten bis)', value: show((x) => Math.max(0, x), plA, shA) },
        { label: 'Objective Marker', value: incursion ? '3' : '4 (Incursion: 3)' },
      ];
    case 'PURGE_AND_BURN':
      return [
        { label: 'Ambush Marker (Verteidiger)', value: show((x) => (x >= 3 ? 3 : 2), plD, shD) },
        { label: 'Oppression Tactics (Angreifer, Einheiten bis)', value: show((x) => Math.max(0, Math.min(3, x)), plA, shA) },
        {
          label: 'Strategic Reserves Limit Angreifer',
          value: size
            ? `${size.reserves} pts`
            : battleSizes(state)
                .map((s) => s.reserves)
                .join(' / ') + ' pts',
        },
      ];
    case 'ORBITAL_INVASION':
      return [
        { label: 'Transorbital Adaptations (Angreifer, Einheiten bis)', value: show((x) => Math.max(0, x), plA, shA) },
        { label: 'Deployment-Zonen Verteidiger', value: show((x) => Math.max(0, Math.min(3, x)), plD, shD) },
        { label: 'Beachhead-Einheiten (Angreifer)', value: incursion ? 'bis 3' : 'bis 6 (Incursion: 3)' },
      ];
    case 'PLANETARY_BOMBARDMENT':
      return [
        { label: 'Saboteur Vanguard (Angreifer, Einheiten bis)', value: show((x) => Math.max(0, Math.ceil(x / 2)), plA, shA) },
        { label: 'Restabilise Shields (Verteidiger)', value: show((x) => (x >= 3 ? '+1' : '+0'), plD, shD) },
      ];
    case 'SUPPLY_BASE_RAID':
      return [
        { label: 'Power Redirects (Verteidiger)', value: show((x) => (x >= 3 ? 3 : 2), plD, shD) },
        { label: 'Hauler Network Sabotage (Angreifer)', value: show((x) => (x >= 3 ? '+2' : '+0'), plA, shA) },
      ];
    case 'BOARDING_ACTION':
      return [{ label: 'Mission', value: 'Zufällige Boarding-Actions-Mission, kein Theatre' }];
    default:
      return [];
  }
}

/**
 * Kurzbriefing für Gefechte ohne Angriffsart (Kill-Team-Gefecht, Abfanggefecht, Entscheidungsschlacht):
 * Seiten, Termin, eigenes Regelwerk und die Wirkung auf die Kampagne – ohne 40k-Missionswerte.
 */
function SideBriefing({ state, battle: b, locale, planetImages }: { state: CampaignState; battle: Battle; locale: Locale; planetImages?: boolean }) {
  const t = makeT(locale);
  const A = state.alliances.find((a) => a.id === b.attackerAllianceId);
  const D = state.alliances.find((a) => a.id === b.defenderAllianceId);
  const def = b.planetId ? planetDef(b.planetId) : null;
  const planet = b.planetId ? state.planets.find((p) => p.id === b.planetId) : null;
  const pname = (id: string) => state.players.find((p) => p.id === id)?.nickname ?? '?';
  const where = def?.name ?? '–';
  const scheduled = b.scheduledAt
    ? new Date(b.scheduledAt).toLocaleString(intlLocale(locale), {
        timeZone: state.meta.timezone || 'Europe/Berlin',
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;
  const info =
    b.kind === 'KILL_TEAM'
      ? {
          title: t('Kill-Team-Gefecht'),
          game: t('Gespielt wird eine Partie Kill Team statt Warhammer 40,000 – Spielgröße, Battle Ready und Theatre entfallen.'),
          effect: [
            { who: t('Angreifer siegt:'), what: t('Verteidiger −1 PL auf {planet} (wie eine 5+ beim Würfeln der Kill Teams).', { planet: where }) },
            { who: t('Verteidiger siegt oder Unentschieden:'), what: t('keine Wirkung.') },
          ],
        }
      : b.kind === 'INTERCEPT'
        ? {
            title: t('Abfanggefecht'),
            game: t('Gespielt wird ein Gefecht nach Absprache (z. B. Raumkampf) – ohne Theatre und Campaign Outcome.'),
            effect: [
              { who: t('Angreifer (Abfangende) siegt:'), what: t('Der Void Leap scheitert, die Flotte bleibt stehen.') },
              { who: t('Sonst:'), what: t('Der Void Leap wird wie befohlen ausgeführt.') },
            ],
          }
        : {
            title: t('Entscheidungsschlacht'),
            game: t('Die Kampagne endet unentschieden – diese Schlacht entscheidet über den Sieg. Größe und Mission legt der Warmaster fest.'),
            effect: [{ who: t('Sieger:'), what: t('Seine Allianz gewinnt die Kampagne.') }],
          };
  return (
    <article className="hud space-y-4 p-4 print:p-0 sm:p-5">
      <header className="flex flex-wrap items-center gap-4">
        {b.planetId && <PlanetPortrait planetId={b.planetId} size={96} destroyed={planet?.destroyed} planetImages={planetImages} image={planet?.portrait} />}
        <div className="min-w-0">
          <p className="hud-title">{t('Schlacht-Briefing · Phase {n}', { n: b.phaseNumber })}</p>
          <h1 className="font-display text-[24px] font-bold uppercase leading-tight tracking-[0.04em] text-ink">{info.title}</h1>
          {def && (
            <p className="text-dim">
              {def.name} <span className="font-mono text-xs">[{def.system}]</span>
            </p>
          )}
          {scheduled && (
            <p className="mt-1 text-sm">
              {t('Termin:')} <b>{scheduled}</b>
            </p>
          )}
        </div>
      </header>
      <section className="grid gap-3 sm:grid-cols-2">
        {[
          { label: t('Angreifer'), al: A, players: b.attackers, side: 'ATTACKER' as const },
          { label: t('Verteidiger'), al: D, players: b.defenders, side: 'DEFENDER' as const },
        ].map((s) => (
          <div key={s.label} className="border border-line p-3">
            <p className="label">{s.label}</p>
            <p className="flex items-center gap-2 text-lg font-semibold">
              <span className="inline-block h-4 w-4 border border-black" style={{ background: s.al?.color }} />
              {s.al?.name ?? '?'}
            </p>
            <p className="text-sm">
              {s.players.length || guestsOf(b, s.side).length
                ? [
                    ...s.players.map((p) => `${pname(p.playerId)}${p.faction ? ` (${p.faction})` : ''}`),
                    // B3: Gastspieler ohne Konto
                    ...guestsOf(b, s.side).map((g) => `${g.name} (${[t('Gast'), g.faction].filter(Boolean).join(', ')})`),
                  ].join(', ')
                : t('Spieler noch offen')}
            </p>
            {planet && s.al && (
              <p className="mt-2 font-mono text-sm">
                {t('Power Level hier:')} <b className="text-lg">{planet.power[s.al.id] ?? 0}</b>
              </p>
            )}
          </div>
        ))}
      </section>
      <section>
        <p className="label">{t('Ablauf')}</p>
        <p className="text-sm">{info.game}</p>
      </section>
      <section>
        <p className="label">{t('Wirkung auf die Kampagne')}</p>
        <ul className="space-y-1 text-sm">
          {info.effect.map((e) => (
            <li key={e.who}>
              <b>{e.who}</b> {e.what}
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

export function Briefing({ state, battle: b, locale, planetImages }: { state: CampaignState; battle: Battle; locale?: Locale; planetImages?: boolean }) {
  const lc = locale ?? DEFAULT_LOCALE;
  const t = makeT(lc);
  const msg = (m: string) => translateMessage(lc, m);
  if (!b.planetId || !b.attackType) return <SideBriefing state={state} battle={b} locale={lc} planetImages={planetImages} />;
  const def = planetDef(b.planetId)!;
  const planet = state.planets.find((p) => p.id === b.planetId)!;
  const A = state.alliances.find((a) => a.id === b.attackerAllianceId)!;
  const D = state.alliances.find((a) => a.id === b.defenderAllianceId)!;
  const plA = planet.power[A.id] ?? 0;
  const plD = planet.power[D.id] ?? 0;
  const srcA = powerSources(state, b, 'ATTACKER');
  const srcD = powerSources(state, b, 'DEFENDER');
  const at = ATTACK_TYPES[b.attackType];
  const pname = (id: string) => state.players.find((p) => p.id === id)?.nickname ?? '?';
  const defInfra = planet.slots.filter((s) => !s.destroyed && s.infra?.allianceId === D.id).map((s) => s.infra!.type);
  const objAbilities: Record<string, string> = {
    STRONGHOLD: 'Comms Network',
    SUPPORT_FACILITY: 'Unstable Materiel Duct',
    STAGING_GROUNDS: 'Augury Fane',
    FORTIFICATION_LINE: 'Prepared Defences',
  };
  const chooser = t({ ATTACKER: 'Angreifer', DEFENDER_AUXILIA: 'Verteidiger (Logistical Auxilia)', RANDOM: 'zufällig (Sinister Omens)' }[b.theatreChosenBy ?? 'ATTACKER']);
  const rangeA = shiftRange(state, srcA.mission.length);
  const rangeD = shiftRange(state, srcD.mission.length);
  const values = missionValues(state, b, plA, plD, rangeA, rangeD);
  const rangeLabel = (n: number) => (house(state, 'F15_TREAT_STACKS') && n > 1 ? t('±{n} (Quellen stapeln, F-15)', { n }) : '±1');
  const scheduled = b.scheduledAt
    ? new Date(b.scheduledAt).toLocaleString(intlLocale(lc), { timeZone: state.meta.timezone || 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
  const sum = OUTCOME_SUMMARY[b.attackType];

  return (
    <article className="hud space-y-4 p-4 print:p-0 sm:p-5">
      <header className="flex flex-wrap items-center gap-4">
        <PlanetPortrait planetId={b.planetId} size={96} destroyed={planet.destroyed} planetImages={planetImages} image={planet.portrait} />
        <div className="min-w-0">
          <p className="hud-title">{t('Schlacht-Briefing · Phase {n}', { n: b.phaseNumber })}</p>
          <h1 className="font-display text-[24px] font-bold uppercase leading-tight tracking-[0.04em] text-ink">{at.name}</h1>
          <p className="text-dim">
            {def.name} <span className="font-mono text-xs">[{def.system}]</span>
          </p>
          {scheduled && (
            <p className="mt-1 text-sm">
              {t('Termin:')} <b>{scheduled}</b>
            </p>
          )}
        </div>
      </header>

      {/* A7/A8: Regelkarte „Diese Schlacht“ mit Gelände-Layout */}
      <RuleCard state={state} battle={b} locale={lc} />

      <section className="grid gap-3 sm:grid-cols-2">
        {[
          { label: t('Angreifer'), al: A, pl: plA, players: b.attackers, src: srcA, side: 'ATTACKER' as const },
          { label: t('Verteidiger'), al: D, pl: plD, players: b.defenders, src: srcD, side: 'DEFENDER' as const },
        ].map((s) => (
          <div key={s.label} className="border border-line p-3">
            <p className="label">{s.label}</p>
            <p className="flex items-center gap-2 text-lg font-semibold">
              <span className="inline-block h-4 w-4 border border-black" style={{ background: s.al.color }} />
              {s.al.name}
            </p>
            <p className="text-sm">
              {s.players.length || guestsOf(b, s.side).length
                ? [
                    ...s.players.map((p) => `${pname(p.playerId)}${p.faction ? ` (${p.faction})` : ''}`),
                    // B3: Gastspieler ohne Konto
                    ...guestsOf(b, s.side).map((g) => `${g.name} (${[t('Gast'), g.faction].filter(Boolean).join(', ')})`),
                  ].join(', ')
                : t('Spieler noch offen')}
            </p>
            <p className="mt-2 font-mono text-sm">
              {t('Power Level hier:')} <b className="text-lg">{s.pl}</b>
            </p>
            {s.src.mission.length > 0 && <p className="text-xs text-warn">{t('{range} für Mission Rules: {list}', { range: rangeLabel(s.src.mission.length), list: s.src.mission.map(msg).join(', ') })}</p>}
            {s.src.outcome.length > 0 && <p className="text-xs text-warn">{t('±1 für Campaign Outcomes (bei Sieg): {list}', { list: s.src.outcome.map(msg).join(', ') })}</p>}
          </div>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="label">{t('Ablauf')}</p>
          <ul className="space-y-1 text-sm">
            <li>
              {t('Erster Zug:')} {at.attackerFirst ? t('Angreifer (Rapid Strike)') : b.attackType === 'PURGE_AND_BURN' ? t('Verteidiger (Primed Garrison)') : 'Roll-off'}
            </li>
            <li>
              {t('Größe:')} {sizeDef(state, b.size) ? `${sizeDef(state, b.size)!.name} (${sizeDef(state, b.size)!.points} ${t('pts')}, ${t(sizeDef(state, b.size)!.duration)})` : t('noch offen')}
            </li>
            <li>
              {t('Mission:')} {msg(missionLabel(state, b))}
            </li>
            <li>
              {t('Edition:')} {edition(state)}.
            </li>
            {b.attackType !== 'BOARDING_ACTION' && (
              <li>
                {t('Theatre wählt:')} {chooser}
              </li>
            )}
          </ul>
        </div>
        {b.attackType !== 'BOARDING_ACTION' && (
          <div>
            <p className="label">{t('Theatres des Planeten')}</p>
            <ul className="space-y-1 text-sm">
              {def.theatres.map((th) => (
                <li key={th} className={`flex items-center gap-2 ${b.theatre === th ? 'text-accent' : ''}`}>
                  <TheatreBadge id={th} size={24} /> {THEATRES[th].name}
                  {b.theatre === th && b.twist ? ` – ${t('Twist: {name} (W6 {n})', { name: b.twist.name, n: b.twist.d6 })}` : b.theatre === th ? ` – ${t('gewählt')}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* A9: Planeten-Merkmale (Crusade) */}
      {planetTraits(state, b.planetId).length > 0 && (
        <section>
          <p className="label">{t('Planeten-Merkmale')}</p>
          <PlanetTraitList traits={planetTraits(state, b.planetId)} />
        </section>
      )}
      {state.meta.attackNotes?.[b.attackType!]?.trim() && (
        <section>
          <p className="label">{t('Anmerkungen des Warmasters')}</p>
          <Markdown text={state.meta.attackNotes[b.attackType!]!} />
        </section>
      )}
      {lastPhaseRule(state, b.phaseNumber, 'doubleGains') && <p className="text-sm text-warn">{t('Letzte Phase: PL-Gewinne des Siegers zählen doppelt.')}</p>}

      <section>
        <p className="label">{t('Mission-relevante Werte')}</p>
        <table className="table">
          <tbody>
            {values.map((v) => (
              <tr key={v.label}>
                <td>{t(v.label)}</td>
                <td className="text-right font-mono">{t(v.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {b.attackType === 'SEIZE_POWER_BASE' && (
          <p className="mt-2 text-sm">
            {t('Infrastruktur des Verteidigers:')} {defInfra.length ? defInfra.map((i) => `${INFRA[i].name} → ${objAbilities[i]}`).join(', ') : t('keine')}
          </p>
        )}
      </section>

      <section>
        <p className="label">{t('Mögliche Campaign Outcomes')}</p>
        <ul className="space-y-1 text-sm">
          <li>
            <b>{t('Angreifer siegt:')}</b> {msg(sum.A)}
          </li>
          <li>
            <b>{t('Verteidiger siegt:')}</b> {msg(sum.D)}
          </li>
          <li>
            <b>{t('Unentschieden:')}</b> {msg(DRAW_SUMMARY)}
          </li>
        </ul>
      </section>
      <p className="font-mono text-[11px] text-faint">{t('Nur Werte und Namen – Regeltexte siehe Buch (500 Worlds: Titus). Battle Ready: +10 VP bei vollständig bemalter Armee.')}</p>
    </article>
  );
}
