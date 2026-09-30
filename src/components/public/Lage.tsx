import Link from 'next/link';
import { describeOp } from '@/engine/phase';
import { campaignPoints } from '@/engine/board';
import { ATTACK_TYPES, MEDALS } from '@/engine/data/vespator';
import type { CampaignState } from '@/engine/types';
import { AllianceTag, AttackIcon, Markdown, OpIcon } from '@/components/ui';
import { BoltIcon } from '@/components/icons';
import { planetName } from '@/components/public/fmt';
import { LoadStrip } from '@/components/LoadStrip';
import { WaxSeal } from '@/components/emblems';
import { SEAL_TEXT } from '@/flavor';
import { GameIcon } from '@/components/icons/GameIcon';
import { stageLabel } from '@/components/stageLabel';
import { Deadlines } from './Deadlines';
import { FinalScoresView, FogStandings, GrandBattleView, ObjectivesList, fogNote } from './R2Public';
import { grandEnabled } from '@/engine/finale';
import { intlLocale, makeT, translateMessage, type Locale } from '@/i18n/core';
import { dispatchText } from '@/engine/contentLang';
import { LangNote } from '@/components/LangNote';

/**
 * Lagebericht (Leseansicht und Spielerseite, N1.3): Dekrete, Kampagnenpunkte, Befehle der Phase,
 * Spiellast, Schlachten der Phase und aktive Effekte. Auf der Spielerseite mit der Projektion inkl.
 * der verdeckten Daten der eigenen Allianz.
 */
export function LageReport({
  state,
  current: currentIn,
  viewingPhase = null,
  locale,
  battleHref,
  briefingHref,
  title,
  extra,
}: {
  state: CampaignState;
  /** Kampagnenname im Lagekopf (nur mobil, auf dem Desktop steht er in der linken Leiste) */
  title?: string;
  /** Zusatz am Ende des Lagekopfs (z. B. Auswahl der Archivstände) */
  extra?: React.ReactNode;
  /** aktueller Stand (bei Archivansicht abweichend von state) */
  current?: CampaignState;
  viewingPhase?: number | null;
  locale: Locale;
  battleHref: (id: string) => string;
  briefingHref: (id: string) => string;
}) {
  const current = currentIn ?? state;
  const t = makeT(locale);
  const msg = (m: string) => translateMessage(locale, m);
  const tz = state.meta.timezone || 'Europe/Berlin';
  const al = (id: string | null | undefined) => state.alliances.find((a) => a.id === id) ?? null;
  const phaseNo = state.stage.kind === 'PHASE' ? state.stage.phase : null;
  const ph = phaseNo ? state.phases.find((p) => p.number === phaseNo) : null;
  const last = state.pointsHistory[state.pointsHistory.length - 1];
  const live = Object.fromEntries(state.alliances.map((a) => [a.id, campaignPoints(state, a.id)]));
  const pinned = state.dispatches.filter((d) => d.pinned).sort((a, b) => b.at.localeCompare(a.at));
  const battlesNow = phaseNo ? state.battles.filter((b) => b.phaseNumber === phaseNo && b.kind === 'CAMPAIGN' && b.status !== 'VOID') : [];
  const player = (id: string) => state.players.find((p) => p.id === id)?.nickname ?? '?';
  const ranking = [...state.alliances].sort((a, b) => (last?.points[b.id] ?? 0) - (last?.points[a.id] ?? 0));
  const archived = !!viewingPhase;
  const deadlineItems =
    !archived && ph && state.stage.kind === 'PHASE'
      ? [
          ...(state.stage.step === 'OPS' ? [{ label: t('Befehle bis'), at: ph.opsDeadline }] : []),
          ...(['OPS', 'REVEAL', 'EDIFICES', 'BATTLES'].includes(state.stage.step) ? [{ label: t('Schlachten bis'), at: ph.battlesDeadline }] : []),
        ]
      : [];
  const fleets = state.fleets.filter((f) => !f.reserve);
  // A5: Standardoperation wegen Abwesenheit zählt als erteilt
  const ordered = (fid: string) => !!ph?.operations.some((o) => o.fleetId === fid && (!o.isDefault || o.absence));
  const given = fleets.filter((f) => ordered(f.id)).length;
  return (
    <>
      {/* Lagekopf: Phase, Fristen, Punktestand und Befehlsstand auf einen Blick */}
      <section className="hud min-w-0 p-3" aria-label={t('Lage')}>
        <div className="relative z-[1] space-y-2.5">
          {title && <h1 className="font-display text-[17px] font-bold uppercase leading-tight text-ink lg:hidden">{title}</h1>}
          <p className="readout" data-stage>
            {archived ? t('Archivansicht: Ende von Phase {n}', { n: viewingPhase! }) : stageLabel(state, t)}
          </p>
          {deadlineItems.length > 0 && <Deadlines items={deadlineItems} timeZone={tz} />}
          <div className="border-t border-line/60 pt-2">
            <h2 className="mb-1 flex items-center gap-2 font-display text-[14px] font-bold uppercase tracking-[0.06em] text-ink">
              <GameIcon name="ui_TROPHY" size={16} color="#b3975f" /> {t('Kampagnenpunkte')}
            </h2>
            {/* C1: Nebel über dem Punktestand – Rangfolge und Tendenz statt Punkten */}
            {state.fog ? (
              <>
                <FogStandings state={state} locale={locale} />
                <p className="mt-1 text-[13px] text-dim">{fogNote(t)}</p>
              </>
            ) : (
              <>
                <ul className="flex flex-wrap gap-x-5 gap-y-1">
                  {ranking.map((a) => (
                    <li key={a.id} className="inline-flex flex-wrap items-baseline gap-x-1.5">
                      <AllianceTag alliance={a} className="text-[15px]" />
                      <b className="font-mono text-[18px] text-ink">{last?.points[a.id] ?? '–'}</b>
                      {state.publishedAfterResistance && !archived && live[a.id] !== last?.points[a.id] && (
                        <span className="whitespace-nowrap text-[13px] text-dim">
                          ({t('vorläufig')} {live[a.id]})
                        </span>
                      )}
                      {a.strongholdDestroyed && <span className="text-[13px] text-danger">{t('Stronghold zerstört')}</span>}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[13px] text-dim">
                  {t('Summe aller Power Level + 3 für einen intakten Stronghold. Stand: {when}', { when: last ? (last.phaseNumber ? t('Ende Phase {n}', { n: last.phaseNumber }) : t('Kampagnenstart')) : '–' })}
                </p>
              </>
            )}
          </div>
          {ph && fleets.length > 0 && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line/60 pt-2 text-[15px]">
              <span className="font-display text-[14px] font-bold uppercase tracking-[0.06em] text-ink">{t('Befehle')}</span>
              <span className="flex items-center gap-1" aria-hidden>
                {fleets.map((f) => (
                  <span key={f.id} className={`lamp ${ordered(f.id) ? 'lamp-ok' : ''}`} />
                ))}
              </span>
              <span className="whitespace-nowrap">
                <b className="font-mono">{given}</b> {t('von {n} erteilt', { n: fleets.length })}
                {given < fleets.length && <span className="text-warn"> · {t('{n} offen', { n: fleets.length - given })}</span>}
              </span>
            </p>
          )}
          {extra}
        </div>
      </section>

      {/* R2: Sonderziele der Phase (C3) und Großschlacht (C6) */}
      {!archived && ph && (state.objectives ?? []).some((o) => o.phaseNumber === ph.number) && (
        <Block icon={<GameIcon name="ui_TROPHY" size={18} color="#b3975f" />} title={t('Sonderziele der Phase')}>
          <ObjectivesList state={state} phase={ph.number} locale={locale} />
        </Block>
      )}
      {!archived && state.stage.kind === 'PHASE' && state.grandBattle && grandEnabled(state) && (
        <Block icon={<GameIcon name="op_BATTLE" size={18} color="#b3975f" />} title={t('Finale „Großschlacht“')}>
          <GrandBattleView state={state} locale={locale} />
        </Block>
      )}

      {/* Dekrete: kompakte Vorschau, volle Fassung auf Wunsch (ohne Skript, per details) */}
      {pinned.map((raw) => {
        // NTH2 7.3: Fassung in der Sprache des Lesers, sonst Original mit Sprachhinweis
        const tr = dispatchText(state, raw, locale);
        const d = { id: raw.id, ...tr.value };
        return (
          <details key={d.id} className="decree parchment group" lang={tr.lang}>
            <WaxSeal size={30} className="absolute -top-3 right-3" text={SEAL_TEXT.decree} />
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1 basis-[12rem]">
                <span className="hud-title block text-[13px]">{t('Dekret des Warmasters')}</span>
                <span className="block font-display text-[17px] font-bold leading-tight text-[#6d1a12]">{d.title}</span>
              </span>
              <span className="decree-key order-last sm:order-none">
                <span className="group-open:hidden">{t('Dekret öffnen')}</span>
                <span className="hidden group-open:inline">{t('Einklappen')}</span>
              </span>
              {/* Vorschau steht in der Zusammenfassung, denn details blendet alles andere im geschlossenen Zustand aus */}
              <span className="line-clamp-2 basis-full text-[15px] group-open:hidden">{plain(d.body)}</span>
            </summary>
            <div className="mt-2">
              {tr.fallback && <LangNote lang={tr.lang} locale={locale} className="mb-1.5" />}
              <Markdown text={d.body} />
            </div>
          </details>
        );
      })}

      {current.stage.kind === 'ENDED' && current.result?.winnerAllianceId && !viewingPhase && (
        <section className="hud border-warn p-5 text-center">
          <p className="hud-title text-warn">{t('Kampagne beendet')}</p>
          <p className="mt-2 text-2xl font-semibold">
            <GameIcon name="ui_TROPHY" size={26} color="#e0b95c" className="inline-block align-[-4px]" /> <AllianceTag alliance={al(current.result.winnerAllianceId)} /> {t('hat die Vespator Front erobert')}
          </p>
          {current.result.tiebreak === 'FINAL_BATTLE' &&
            (() => {
              const tb = current.battles.find((b) => b.kind === 'FINAL_TIEBREAK' && b.vp);
              return <p className="mt-2 text-[16px] text-warn">{tb?.vp ? t('Sieg per Entscheidungsschlacht {a} : {d}', { a: tb.vp.attacker, d: tb.vp.defender }) : t('Sieg per Entscheidungsschlacht')}</p>;
            })()}
          {current.result.tiebreak === 'STRONGHOLD' && <p className="mt-2 text-[16px] text-warn">{t('Gleichstand – entschieden durch den einzigen intakten Stronghold')}</p>}
          {current.medals.length > 0 && <p className="mt-2 text-[15px] text-dim">{current.medals.map((m) => `${MEDALS[m.medal].name}: ${al(m.allianceId)?.name}`).join(' · ')}</p>}
          <div className="mt-3">
            <FinalScoresView state={current} locale={locale} />
          </div>
          {current.pointsHistory.length > 1 && (
            <div className="mt-3 overflow-x-auto text-left">
              <table className="table mx-auto w-auto text-[14px]" aria-label={t('Punkteverlauf')}>
                <thead>
                  <tr>
                    <th>{t('Punkteverlauf')}</th>
                    {current.pointsHistory.map((h) => (
                      <th key={h.phaseNumber} className="text-right font-mono">
                        {h.phaseNumber === 0 ? t('Start') : `P${h.phaseNumber}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {current.alliances.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <AllianceTag alliance={a} />
                      </td>
                      {current.pointsHistory.map((h) => (
                        <td key={h.phaseNumber} className="text-right font-mono">
                          {h.points[a.id] ?? '–'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {current.stage.kind === 'TIEBREAK' && !viewingPhase && (
        <Block icon={<GameIcon name="ui_SKULL" size={18} color="#b3975f" />} title={t('Gleichstand')}>
          {t('Eine Entscheidungsschlacht bestimmt den Sieger.')}
        </Block>
      )}

      {ph && (
        <Block icon={<GameIcon name="ui_FLEET" size={18} color="#b3975f" />} title={t('Befehle in Phase {n}', { n: ph.number })}>
          {/* je Allianz zuerst der Befehlsstand, darunter die einzelnen Flotten */}
          <div className="space-y-3">
            {state.alliances.map((a) => {
              const own = fleets.filter((f) => f.allianceId === a.id);
              if (!own.length) return null;
              const n = own.filter((f) => ordered(f.id)).length;
              return (
                <div key={a.id}>
                  <p className="flex items-baseline justify-between gap-2 border-b border-line/50 pb-1 text-[15px]">
                    <AllianceTag alliance={a} className="font-semibold" />
                    <span className={`whitespace-nowrap ${n === own.length ? 'text-ok' : 'text-dim'}`}>{t('{n} von {m} erteilt', { n, m: own.length })}</span>
                  </p>
                  <ul className="mt-1.5 space-y-1.5 text-[15px]">
                    {own.map((f) => {
                      const ops = ph.operations.filter((o) => o.fleetId === f.id);
                      const cmd = f.commanders[String(ph.number)];
                      return (
                        <li key={f.id} className="flex items-start gap-2">
                          <span className={`lamp mt-1.5 shrink-0 ${ordered(f.id) ? 'lamp-ok' : ''}`} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-baseline gap-x-2">
                              <span className="font-medium">{f.name}</span>
                              <span className="text-[14px] text-dim">
                                {planetName(f.planetId)}
                                {cmd ? ` · ${player(cmd)}` : ''}
                              </span>
                            </span>
                            <span className="block text-[14px]">
                              {ops.length === 0 ? (
                                <span className="text-faint">{t('Befehl ausstehend')}</span>
                              ) : (
                                ops.map((o) => (
                                  <span key={o.id} className="mr-2">
                                    {o.hidden ? (
                                      <span className="text-ok">{t('Befehl erteilt')}</span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1">
                                        <OpIcon op={o} /> {msg(describeOp({ state }, o))}
                                      </span>
                                    )}
                                  </span>
                                ))
                              )}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </Block>
      )}

      {ph && battlesNow.length > 0 && (
        <Block icon={<GameIcon name="ui_DICE" size={18} color="#b3975f" />} title={t('Spiellast dieser Phase')}>
          <LoadStrip state={state} phase={ph.number} locale={locale} />
        </Block>
      )}
      {battlesNow.length > 0 && (
        <Block icon={<GameIcon name="op_BATTLE" size={18} color="#b3975f" />} title={t('Schlachten dieser Phase')}>
          <ul className="space-y-2 text-[15px]">
            {battlesNow.map((b) => (
              <li key={b.id} className="border-b border-line/50 pb-2">
                <Link className="link" href={battleHref(b.id)}>
                  <AttackIcon type={b.attackType} /> {ATTACK_TYPES[b.attackType!].name} · {planetName(b.planetId)}
                </Link>
                <span className="ml-2 text-[14px] text-dim">
                  {al(b.attackerAllianceId)?.name} → {al(b.defenderAllianceId)?.name}
                </span>
                {b.scheduledAt && !b.victor && (
                  <span className="ml-2 chip border-accent text-accent">
                    {t('angesetzt:')} {new Date(b.scheduledAt).toLocaleString(intlLocale(locale), { timeZone: tz, dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                )}
                <span className="ml-2 chip">{b.victor ? (b.victor === 'DRAW' ? t('Unentschieden') : b.victor === 'ATTACKER' ? t('Angreifer siegt') : t('Verteidiger siegt')) : t('offen')}</span>
                <Link className="ml-2 text-[14px] link" href={briefingHref(b.id)}>
                  Briefing
                </Link>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {state.modifiers.filter((m) => phaseNo && m.phaseNumber >= phaseNo).length > 0 && (
        <Block icon={<BoltIcon size={18} />} title={t('Aktive Effekte')}>
          <ul className="space-y-1 text-[15px]">
            {state.modifiers
              .filter((m) => phaseNo && m.phaseNumber >= phaseNo)
              .map((m) => (
                <li key={m.id}>
                  {t('Phase {n}', { n: m.phaseNumber })}: {MOD_LABEL[m.kind] ? t(MOD_LABEL[m.kind]) : m.kind}
                  {m.allianceId ? ` (${al(m.allianceId)?.name})` : ''}
                  {m.planetIds?.length ? ` – ${m.planetIds.map(planetName).join(', ')}` : ''}
                </li>
              ))}
          </ul>
        </Block>
      )}
    </>
  );
}

/** Klartext-Vorschau eines Markdown-Texts (ohne Auszeichnung) */
function plain(md: string) {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Abschnitt im Stil der Planetenakte (Titel in Versalien mit Symbol) */
function Block({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="hud min-w-0 p-3">
      <h2 className="mb-2.5 flex items-center gap-2.5 font-display text-[15px] font-bold uppercase tracking-[0.06em] text-ink">
        <span className="text-brass">{icon}</span>
        <span className="flex-1">{title}</span>
      </h2>
      <div className="relative z-[1]">{children}</div>
    </section>
  );
}

const MOD_LABEL: Record<string, string> = {
  NO_VOID_LEAP: 'kein Void Leap',
  SUPPORT_FACILITIES_INACTIVE: 'Support Facilities wirkungslos',
  NO_LOGISTICAL_AUXILIA: 'kein Logistical Auxilia',
  RANDOM_THEATRE: 'Theatres zufällig',
  ARCHEOTECH: 'Archeotech Riches',
  COORDINATED_OPPOSITION: 'Coordinated Opposition',
  OPEN_TOME: 'An Open Tome',
  DEFIANT_ZEAL: 'Defiant Zeal (zweite Operation)',
  STAR_OF_VOIDFARER: 'Star of the Voidfarer (Flotten ziehen zweimal)',
};
