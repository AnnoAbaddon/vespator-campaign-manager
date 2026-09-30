'use client';

import { Motto } from '@/components/Motto';
import { MOTTO } from '@/flavor';
import { createContext, useContext, useMemo, useState } from 'react';
import Link from 'next/link';
import { ATTACK_TYPES, INFRA, MEDALS, OP_TYPES, type AttackType, type InfraType } from '@/engine/data/vespator';
import { describeOp, buildablePlanets, moveOptions } from '@/engine/phase';
import { connectedFor, modifierActive, selfOrConnected } from '@/engine/graph';
import { planetIds } from '@/engine/map';
import { allianceOf, factionFromPhase, playersOfAlliance, stagePhase } from '@/engine/players';
import { profileRecord } from '@/components/stats/compute';
import { battleSizes, isLastPhase } from '@/engine/campaignRules';
import { claimableSide, draftOverdue, mayBuild as mayBuildFor, mayDecideOutcome, sideOf, timeClashes } from '@/engine/playerActions';
import { aggregateGames } from '@/engine/missions';
import { computeVictor, theatreForRoll, type BattleUpdate, type OpInput } from '@/engine/phase';
import type { Battle, BattleGame, CampaignState, NotifyCategory, Operation, OutcomeDecision, Player } from '@/engine/types';
import { CampaignMap } from '@/components/map/CampaignMap';
import type { MapArrow } from '@/components/map/MapSvg';
import { AllianceTag, Field, FactionDatalist, planetName, PlanetSelect, tabKeys, toLocalInput, useIsDesktop } from '@/components/ui';
import { allMissions } from '@/engine/missions';
import { THEATRES, twistIndex, type TheatreId } from '@/engine/data/vespator';
import { planetDef } from '@/engine/map';
import { HeaderPortal } from '@/components/HeaderPortal';
import { usePlanetImages } from '@/components/map/planetImages';
import { mapOf } from '@/engine/map';
import { BookIcon, UndoIcon } from '@/components/icons';
import { stageLabel } from '@/components/stageLabel';
import { PlanetDossier } from '@/components/public/PlanetDossier';
import { DossierSheet } from '@/components/public/DossierSheet';
import { Deadlines } from '@/components/public/Deadlines';
import { stageTrack } from '@/components/public/stageSteps';
import { Housing, MOBILE_KEY_CLASS, MOBILE_NAV_CLASS, MobileKey, PointsBar, SectorDecor, StageStatus, StepTrack, TERM_GRID, TermAside } from '@/components/public/Terminal';
import { useNow } from '@/components/public/useNow';
import { GameIcon } from '@/components/icons/GameIcon';
import { useCmd } from '@/components/admin/CommandProvider';
import { OutcomeEditor } from '@/components/admin/battles/OutcomeEditor';
import { DraftSummary } from '@/components/admin/battles/DraftSummary';
import { playerUploadAction } from '@/app/actions/player';
import { CommanderCard } from '@/components/CommanderCard';
import { buildOptions, edificeTypes } from '@/components/buildOptions';
import { canBuild } from '@/engine/board';
import { EventInputs } from './EventInputs';
import { R2ProfileSections, r2TaskItems } from './R2Player';
import { HobbyReadyHint, HobbySection, PhasePhotoCard, PhotoVoteSection, hobbyReady, useBattleAnchor } from './P2Player';
import { FinalScoresView } from '@/components/public/R2Public';
import { PublicDiceLog } from '@/components/public/PublicDiceLog';
import { GuestSlot } from './GuestSlot';
import { P1ProfileSection, type P1ProfileData } from './P1Profile';
import { TablePick } from '@/components/club/TablePick';
import { SkirmishPlayer } from './SkirmishPlayer';
import { guestsOf } from '@/engine/guests';
import { BoardingTarget } from '@/components/admin/phase/BoardingTarget';
import { eventInputRights } from '@/engine/events';
import { useIntlLocale, useLocale, useMsg, useT } from '@/i18n/client';
import { setLangCookie } from '@/components/LangSwitch';
import { LOCALES, LOCALE_NAMES, type Locale, type T } from '@/i18n/core';
import { OrderOfBattle } from '@/components/crusade/OrderOfBattle';

type Tab = 'lage' | 'tasks' | 'battles' | 'alliance' | 'profile';

export interface PlayerAppProps {
  token: string;
  me: Player;
  allianceId: string | null;
  /** Link zur öffentlichen Leseansicht (null, wenn sie abgeschaltet ist) */
  publicUrl: string | null;
  calendarUrl: string;
  /** Kampagne (für den QR-Code der Ergebnisbögen merkt sich das Gerät den eigenen Link, NTH2 1.3) */
  campaignId?: string;
  /** Schlacht aus dem QR-Code des Ergebnisbogens (Anker ?battle=), vom PlayerApp gesetzt */
  anchor?: { battleId: string | null; foreign: boolean };
  /** P1: Web-Push und Discord-Verknüpfung (NTH2 1.1/1.2) */
  p1?: P1ProfileData;
  /** Lagebericht (serverseitig gerendert, wie in der Leseansicht plus verdeckte Daten der eigenen Allianz) */
  lage?: React.ReactNode;
}

const dt = (iso: string | null | undefined, tz: string, il: string) => (iso ? new Date(iso).toLocaleString(il, { timeZone: tz, dateStyle: 'short', timeStyle: 'short' }) : '–');

/** Datum einer Notiz (wie fmtDate, aber im Format der Sprache und in der Zeitzone der Kampagne) */
const fmtNoteDate = (iso: string, il: string, tz: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(il, { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** Name der Schlacht: Angriffsart, Kill-Team-Gefecht, Abfanggefecht oder Entscheidungsschlacht */
const battleName = (b: Battle, t: T) => (b.attackType ? ATTACK_TYPES[b.attackType].name : b.kind === 'KILL_TEAM' ? t('Kill-Team-Gefecht') : b.kind === 'INTERCEPT' ? t('Abfanggefecht') : t('Entscheidungsschlacht'));

export function PlayerApp(props: PlayerAppProps) {
  const { state } = useCmd();
  const t = useT();
  const locale = useLocale();
  const planetImages = usePlanetImages();
  // NTH2 1.3: QR-Code des Ergebnisbogens – Schlacht-Anker öffnet die Schlachten mit dem Meldeformular
  const anchor = useBattleAnchor(state, props.campaignId ?? null, props.token, (b) => myBattles(state, props.me).some((x) => x.id === b.id));
  const [chosenView, setViewRaw] = useState<Tab | null>(null);
  const view: Tab = chosenView ?? (anchor.battleId || anchor.foreign ? 'battles' : 'tasks');
  // mobil: Karte als eigene Ansicht
  const [mMap, setMMap] = useState(false);
  const [selected, setSelectedRaw] = useState<string | null>(null);
  const [side, setSide] = useState<'content' | 'planet'>('content');
  const desktop = useIsDesktop();
  const phase = state.stage.kind === 'PHASE' ? state.stage.phase : null;
  const ph = phase ? state.phases.find((p) => p.number === phase) : null;
  const al = state.alliances.find((a) => a.id === props.allianceId) ?? null;
  const tz = state.meta.timezone;
  const track = stageTrack(state, t);
  const setView = (v: Tab) => {
    setViewRaw(v);
    setMMap(false);
    setSide('content');
  };
  const select = (id: string | null) => {
    setSelectedRaw(id);
    setSide(id ? 'planet' : 'content');
  };

  const arrows = useMemo<MapArrow[]>(() => {
    if (!ph) return [];
    const out: MapArrow[] = [];
    for (const o of ph.operations) {
      if (o.hidden || !o.originPlanetId) continue;
      const a = state.alliances.find((x) => x.id === o.allianceId);
      if (!a) continue;
      const dashed = !o.revealed;
      if (o.type === 'BATTLE' && o.targetPlanetId) out.push({ from: o.originPlanetId, to: o.targetPlanetId, color: a.color, label: ATTACK_TYPES[o.attackType!].name, dashed });
      if (o.type === 'VOID_LEAP' && o.destinationPlanetId && o.status === 'PLANNED') out.push({ from: o.originPlanetId, to: o.destinationPlanetId, color: a.color, label: 'Void Leap', dashed: true });
      if (o.type === 'KILL_TEAMS' && o.killTeamPlanetId && o.status === 'PLANNED') out.push({ from: o.originPlanetId, to: o.killTeamPlanetId, color: a.color, label: 'Kill Teams', dashed: true });
    }
    return out;
  }, [state, ph]);

  const tabs: [Tab, string, string][] = [
    ['tasks', t('Aufgaben'), 'ui_SCROLL'],
    ['lage', t('Lage'), 'ui_TROPHY'],
    ['battles', t('Schlachten'), 'op_BATTLE'],
    ['alliance', t('Allianz'), 'em_crown'],
    ['profile', t('Profil'), 'ui_COG'],
  ];
  const cur = tabs.find(([k]) => k === view)!;
  const label = cur[1];
  // Aufgaben, Lage und Schlachten zeigen die Karte in der Mitte; Allianz und Profil nutzen die ganze Breite
  const withMap = view === 'tasks' || view === 'lage' || view === 'battles';
  const openBattles = myBattles(state, props.me).length;

  const identity = (
    <div>
      <p className="font-display text-[20px] font-bold uppercase leading-tight tracking-[0.04em] text-ink lg:text-[18px]">{props.me.nickname}</p>
      <p className="mt-1 text-[15px]">{al ? <AllianceTag alliance={al} /> : <span className="text-faint">{t('ohne Allianz')}</span>}</p>
      <p className="readout mt-1" data-stage>
        {state.meta.name}
        {phase ? ` · ${t('Phase {n}/{m}', { n: phase, m: state.meta.phaseCount })}` : ''}
      </p>
    </div>
  );
  // Fristen gehören zum Aufgabenregister (die Planetenakte beginnt direkt mit dem Planeten)
  const deadlines = ph && state.stage.kind === 'PHASE' && ['OPS', 'REVEAL', 'EDIFICES', 'BATTLES'].includes(state.stage.step) && (
    <div className="inset px-3 py-2">
      <Deadlines items={[...(state.stage.step === 'OPS' ? [{ label: t('Befehle bis'), at: ph.opsDeadline }] : []), { label: t('Schlachten bis'), at: ph.battlesDeadline }]} timeZone={tz} />
    </div>
  );

  const content = (
    <>
      {view === 'tasks' && <Tasks {...props} />}
      {view === 'lage' && (
        <div className="space-y-3">
          {/* NTH2 4.3/D1: Bild der Phase und (falls eingeschaltet) Abstimmung */}
          <PhasePhotoCard state={state} />
          {props.lage}
          <PhotoVoteSection me={props.me} />
          {/* D3: öffentliches Würfelprotokoll */}
          <PublicDiceLog dice={state.dice} timeZone={state.meta.timezone} compact />
          {props.publicUrl && (
            <p className="text-[15px]">
              <a className="link" href={props.publicUrl}>
                {t('Öffentliche Leseansicht mit Chronik und Statistik')}
              </a>
            </p>
          )}
        </div>
      )}
      {view === 'battles' && <Battles {...props} anchor={anchor} />}
      {view === 'alliance' && <AllianceRoom {...props} />}
      {view === 'profile' && <Profile {...props} />}
    </>
  );
  const dossier = selected && <PlanetDossier state={state} planetId={selected} locale={locale} planetImages={planetImages} base={`/p/${props.token}`} onClose={() => select(null)} />;
  const showPlanet = desktop && side === 'planet' && !!selected && withMap;

  /** Rechte Spalte (bzw. große Einhausung): Kopf, bei gewähltem Planeten Reiter zur Planetenakte, Bereich */
  const panel = (
    <Housing title={showPlanet ? t('Planetenakte') : label} label={showPlanet ? t('Planetenakte') : label}>
      <div className="space-y-3">
        {!desktop && identity}
        {view === 'tasks' && !showPlanet && deadlines}
        {desktop && selected && withMap && (
          <div className="tabbar" role="tablist" aria-label={t('Rechte Spalte')}>
            <button type="button" role="tab" aria-selected={!showPlanet} className="tabkey" onClick={() => setSide('content')}>
              <GameIcon name={cur[2]} size={16} color="#b3975f" /> {label}
            </button>
            <button type="button" role="tab" aria-selected={showPlanet} className="tabkey" onClick={() => setSide('planet')}>
              <GameIcon name="ui_PLANET" size={16} color="#b3975f" /> {t('Planetenakte')}
            </button>
          </div>
        )}
        <div className={showPlanet ? 'hidden' : 'space-y-3'} id="player-panel" role="tabpanel" aria-labelledby={`player-tab-${view}`}>
          {content}
        </div>
        {showPlanet && dossier}
      </div>
    </Housing>
  );

  return (
    <RulesHrefCtx.Provider value={props.publicUrl ? `${props.publicUrl}/rules` : null}>
      <FactionDatalist />
      <HeaderPortal>
        <StageStatus track={track} locale={locale} />
      </HeaderPortal>
      <div className={`${TERM_GRID} ${withMap ? 'bay-3' : ''}`}>
        <TermAside locale={locale} label={t('Spielerbereich')} steps={track.items.length ? <StepTrack track={track} /> : undefined}>
          {identity}
          <ul
            className="space-y-1.5"
            role="tablist"
            aria-orientation="vertical"
            aria-label={t('Bereiche')}
            onKeyDown={tabKeys(
              tabs.map(([k]) => k),
              view,
              setView,
            )}
          >
            {tabs.map(([k, name, icon]) => (
              <li key={k} role="presentation">
                <button
                  type="button"
                  role="tab"
                  id={`player-tab-${k}`}
                  aria-controls={view === k ? 'player-panel' : undefined}
                  tabIndex={view === k ? 0 : -1}
                  aria-selected={view === k}
                  className="navkey"
                  onClick={() => setView(k)}
                >
                  <GameIcon name={icon} size={20} color={view === k ? '#f3e2b4' : '#b3975f'} />
                  <span className="flex-1 truncate">{name}</span>
                  {k === 'battles' && openBattles > 0 ? <span className="mr-4 rounded-[2px] bg-[#dda94d] px-1.5 font-mono text-[12px] text-black">{openBattles}</span> : null}
                </button>
              </li>
            ))}
          </ul>
          {props.publicUrl && (
            <a className="btn w-full justify-start" href={props.publicUrl}>
              <BookIcon size={18} className="text-brass" /> {t('Leseansicht öffnen')}
            </a>
          )}
        </TermAside>

        <main className={`h-full min-w-0 lg:col-span-2 lg:min-h-0 ${withMap ? 'lg:grid lg:grid-cols-subgrid lg:grid-rows-[minmax(0,1fr)] lg:gap-[var(--gap)]' : ''}`}>
          {withMap && (
            <section className={`hud frame flex-col p-2 pt-6 sm:p-3 sm:pt-6 lg:flex lg:h-full lg:min-h-0 ${mMap ? 'flex h-full' : 'hidden'}`} aria-label={t('Taktische Sektorkarte')}>
              <span className="plate plate-head hidden lg:inline-flex">{t('Taktische Sektorkarte')}</span>
              <Motto text={MOTTO.map} />
              <div className="screen relative min-h-0 flex-1">
                <SectorDecor name={mapOf(state).name} stage={stageLabel(state, t)} planets={mapOf(state).planets.length} locale={locale} />
                <CampaignMap fit state={state} arrows={arrows} selected={selected} points={state.pointsHistory.at(-1)?.points ?? null} onPlanet={(id) => select(selected === id ? null : id)} />
              </div>
              <PointsBar state={state} locale={locale}>
                <span className="font-mono text-[13px] text-faint">{selected ? t('Gewählt: {name}', { name: planetDef(selected)?.name ?? selected }) : t('Planet wählen für die Planetenakte')}</span>
              </PointsBar>
            </section>
          )}
          <div className={`h-full min-h-0 ${mMap ? 'hidden lg:block' : ''}`}>{panel}</div>
        </main>
      </div>

      {/* Mobil: Planetenakte als Blatt über der Leiste (fester Aktenkopf, Karte abgedunkelt) */}
      {!desktop && selected && mMap && (
        <DossierSheet planetId={selected} onClose={() => select(null)}>
          {/* Kopf (Name, Schließen) liefert das Blatt */}
          <PlanetDossier state={state} planetId={selected} locale={locale} planetImages={planetImages} base={`/p/${props.token}`} head={false} />
        </DossierSheet>
      )}

      {!desktop && (
        <nav className={`${MOBILE_NAV_CLASS} grid-cols-6`} aria-label={t('Bereiche (mobil)')}>
          <button type="button" onClick={() => setMMap(true)} aria-current={mMap ? 'page' : undefined} className={`${MOBILE_KEY_CLASS} ${mMap ? 'text-accent' : 'text-dim'}`}>
            <MobileKey label={t('Karte')} on={mMap} icon={<GameIcon name="ui_PLANET" size={22} color={mMap ? '#dda94d' : '#b3975f'} />} />
          </button>
          {tabs.map(([k, name, icon]) => {
            const on = !mMap && view === k;
            return (
              <button key={k} type="button" onClick={() => setView(k)} aria-current={on ? 'page' : undefined} className={`${MOBILE_KEY_CLASS} ${on ? 'text-accent' : 'text-dim'}`}>
                <MobileKey label={name} on={on} badge={k === 'battles' ? openBattles : 0} icon={<GameIcon name={icon} size={22} color={on ? '#dda94d' : '#b3975f'} />} />
              </button>
            );
          })}
        </nav>
      )}
    </RulesHrefCtx.Provider>
  );
}

/** Kampagnenregeln der Leseansicht (Hilfe-Link im Befehlsformular); null ohne Leseansicht */
const RulesHrefCtx = createContext<string | null>(null);

// ─── Aufgaben ──────────────────────────────────────────────────────────────

function myFleets(state: CampaignState, me: Player) {
  const phase = state.stage.kind === 'PHASE' ? state.stage.phase : null;
  if (!phase) return [];
  return state.fleets.filter((f) => !f.reserve && f.planetId && f.commanders[String(phase)] === me.id);
}

function myBattles(state: CampaignState, me: Player) {
  // nach Kampagnenende ist nichts mehr offen (auch nicht die gespielte Entscheidungsschlacht)
  if (state.stage.kind === 'ENDED') return [];
  return state.battles.filter((b) => b.status !== 'VOID' && b.status !== 'PROCESSED' && b.status !== 'UNPLAYED_RESOLVED' && sideOf(state, b, me.id));
}

/** Gespielte bzw. gewertete Schlachten des Spielers (nach Kampagnenende auch die Entscheidungsschlacht) */
function doneBattles(state: CampaignState, me: Player) {
  const ended = state.stage.kind === 'ENDED';
  return state.battles.filter((b) => (b.status === 'PROCESSED' || b.status === 'UNPLAYED_RESOLVED' || (ended && b.status === 'PLAYED')) && [...b.attackers, ...b.defenders].some((p) => p.playerId === me.id));
}

/** Hinweis im Bauschritt (5) für alle, die gerade nicht selbst bauen */
function buildNotice(state: CampaignState, alId: string | null, me: Player, t: T): string | null {
  if (state.stage.kind !== 'PHASE' || state.stage.step !== 'BUILD' || !alId) return null;
  const n = state.stage.phase;
  const ph = state.phases.find((p) => p.number === n);
  if (!ph) return null;
  const name = (id: string) => state.alliances.find((a) => a.id === id)?.name ?? '?';
  const done = ph.builds[alId];
  if (done) return done === 'SKIP' ? t('Eure Allianz verzichtet in dieser Phase auf den Bau.') : t('Eure Allianz baut {infra} auf {planet}.', { infra: INFRA[done.type].name, planet: planetName(done.planetId) });
  if (!ph.flags.buildStarted) return t('Der Warmaster legt die Bau-Reihenfolge fest.');
  const before = ph.buildOrder.slice(0, Math.max(0, ph.buildOrder.indexOf(alId))).filter((a) => !ph.builds[a]);
  if (before.length) return t('{alliance} baut zuerst – danach ist eure Allianz dran.', { alliance: before.map(name).join(', ') });
  if (mayBuildFor(state, alId, me.id)) return null;
  const members = playersOfAlliance(state, alId, n);
  const leader = state.alliances.find((a) => a.id === alId)?.leaderPlayerId;
  const builder = members.find((p) => p.id === leader);
  return builder ? t('{name} baut für eure Allianz.', { name: builder.nickname }) : t('Eure Allianz baut jetzt.');
}

function Tasks(props: PlayerAppProps) {
  const { state } = useCmd();
  const t = useT();
  const { me } = props;
  const step = state.stage.kind === 'PHASE' ? state.stage.step : null;
  const phase = state.stage.kind === 'PHASE' ? state.stage.phase : null;
  const ph = phase ? state.phases.find((p) => p.number === phase) : null;
  const fleets = myFleets(state, me);
  const battles = myBattles(state, me);
  const toConfirm = battles.filter((b) => b.draft && b.draft.status === 'PENDING' && sideOf(state, b, me.id) !== sideOf(state, b, b.draft.byPlayerId));
  const proposals = battles.filter((b) => !b.scheduledAt && (b.proposals ?? []).some((p) => p.side !== sideOf(state, b, me.id)));
  const alId = props.allianceId;
  const buildTurn = step === 'BUILD' && ph && alId && ph.flags.buildStarted && !ph.builds[alId] && ph.buildOrder.slice(0, ph.buildOrder.indexOf(alId)).every((a) => ph.builds[a]);
  // gleiche Regel wie in der Engine: Anführer (falls aktiv), sonst jedes Mitglied
  const mayBuild = !!buildTurn && !!alId && mayBuildFor(state, alId, me.id);

  const items: React.ReactNode[] = [];
  const ended = state.stage.kind === 'ENDED';
  if (ended) items.push(<CampaignEnd key="end" me={me} />);
  // R2: Abwesenheit, Phasen-Puls, Sonderziele, geheimes Ziel, Großschlacht
  items.push(...r2TaskItems(state, me, alId));
  const notice = buildNotice(state, alId, me, t);
  if (notice)
    items.push(
      <p key="build-notice" className="hud flex items-start gap-2 p-4 text-[15px]">
        <span className="lamp lamp-on mt-1.5 shrink-0" aria-hidden />
        {notice}
      </p>,
    );
  if (step === 'OPS') for (const f of fleets) items.push(<FleetOrders key={`o-${f.id}`} fleetId={f.id} />);
  if (step === 'MOVE') for (const f of fleets) items.push(<FleetMove key={`m-${f.id}`} fleetId={f.id} />);
  // Event-Entscheidungen (Lull, Tides, Xenobeast, Machinations …) für Anführer und Kommandanten
  if (step === 'RESULTS' && state.events.some((e) => e.phaseNumber === phase && e.status === 'PENDING' && Object.values(eventInputRights(state, e.id, me.id)).some((v) => (Array.isArray(v) ? v.length > 0 : v))))
    items.push(<EventInputs key="events" me={me} />);
  if (mayBuild) items.push(<BuildChoice key="build" allianceId={alId!} />);
  for (const b of toConfirm) items.push(<BattleCard key={`c-${b.id}`} battle={b} {...props} />);
  for (const b of proposals) if (!toConfirm.includes(b)) items.push(<BattleCard key={`p-${b.id}`} battle={b} {...props} />);
  // R1: Schlachten, deren Seite noch niemand übernommen hat (z. B. Verteidigung) – mit „Ich übernehme …“
  const unclaimed = battles.filter(
    (b) =>
      !toConfirm.includes(b) &&
      !proposals.includes(b) &&
      b.status === 'SCHEDULED' &&
      !b.draft &&
      claimableSide(state, b, me.id) === sideOf(state, b, me.id) &&
      !(sideOf(state, b, me.id) === 'ATTACKER' ? b.attackers : b.defenders).length,
  );
  for (const b of unclaimed) items.push(<BattleCard key={`u-${b.id}`} battle={b} {...props} />);
  // R2: ungespielt gewertete Schlacht – der Kommandant der Siegerseite trifft die Outcome-Entscheidungen selbst
  for (const b of state.battles.filter((x) => x.status === 'UNPLAYED_RESOLVED' && x.kind === 'CAMPAIGN' && x.operationIds.some((o) => mayDecideOutcome(state, x, o, me.id))))
    items.push(<UnplayedDecisions key={`d-${b.id}`} battle={b} me={me} />);
  // Anstehende Schlachten (N1.3): Gegner, Planet, Termin und Briefing – ausführlich im Reiter „Schlachten“
  const upcoming = battles.filter((b) => !toConfirm.includes(b) && !proposals.includes(b) && !unclaimed.includes(b) && b.status === 'SCHEDULED').sort((a, b) => (a.scheduledAt ?? '9').localeCompare(b.scheduledAt ?? '9'));

  return (
    <div className="space-y-3">
      {items.length || upcoming.length ? items : <p className="hud p-4 text-[15px] text-dim">{t('Keine offenen Aufgaben. Der Warmaster meldet sich, wenn es weitergeht.')}</p>}
      {upcoming.length > 0 && <UpcomingBattles battles={upcoming} me={me} token={props.token} />}
      {step && step !== 'OPS' && fleets.length > 0 && (
        <section className="hud p-3 text-[15px]">
          <p className="section-title">{t('Deine Flotten')}</p>
          <ul className="space-y-1">
            {fleets.map((f) => (
              <li key={f.id}>
                {f.name} @ {planetName(f.planetId)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Ungespielt gewertete Schlacht (R2): Outcome-Entscheidungen des „controlling player“ der Siegerseite */
function UnplayedDecisions({ battle: b, me }: { battle: Battle; me: Player }) {
  const { state } = useCmd();
  const t = useT();
  const v = b.victor;
  const winner = state.alliances.find((a) => a.id === (v === 'DEFENDER' ? b.defenderAllianceId : b.attackerAllianceId));
  return (
    <section className="hud space-y-2 p-3 text-[15px]">
      <p className="section-title">
        {battleName(b, t)} · {planetName(b.planetId)}
      </p>
      <p>
        {t('Ungespielt gewertet:')} <AllianceTag alliance={winner} /> {t('siegt')}. {t('Du entscheidest über die Campaign Outcomes – bis der Warmaster die Schlacht verarbeitet.')}
      </p>
      {b.operationIds
        .filter((o) => mayDecideOutcome(state, b, o, me.id))
        .map((o) => (
          <OutcomeEditor key={o} battle={b} opId={o} />
        ))}
    </section>
  );
}

/** Endstand nach Kampagnenende: Sieger, Punkte, Entscheidungsschlacht und eigene Medaillen */
function CampaignEnd({ me }: { me: Player }) {
  const { state } = useCmd();
  const t = useT();
  const locale = useLocale();
  const r = state.result;
  const winner = state.alliances.find((a) => a.id === r?.winnerAllianceId);
  const pts = state.pointsHistory.at(-1)?.points ?? {};
  const tb = state.battles.find((b) => b.kind === 'FINAL_TIEBREAK' && b.vp);
  const mine = state.medals.filter((m) => m.playerIds.includes(me.id));
  const myAl = state.alliances.find((a) => a.id === allianceOf(me, state.meta.phaseCount));
  return (
    <section className="hud space-y-2 p-4 text-[15px]">
      <p className="section-title">{t('Kampagne beendet')}</p>
      <p className="text-[17px]">
        {winner ? (
          <>
            {t('Sieger:')} <AllianceTag alliance={winner} />
            {myAl && winner.id === myAl.id && <span className="ml-2 text-ok">{t('eure Allianz hat gewonnen')}</span>}
          </>
        ) : (
          t('Kein Sieger festgelegt.')
        )}
      </p>
      {r?.tiebreak === 'FINAL_BATTLE' && tb?.vp && <p className="text-dim">{t('Sieg per Entscheidungsschlacht {a} : {d}', { a: tb.vp.attacker, d: tb.vp.defender })}</p>}
      {r?.tiebreak === 'STRONGHOLD' && <p className="text-dim">{t('Gleichstand – entschieden durch den einzigen intakten Stronghold')}</p>}
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {[...state.alliances]
          .sort((a, b) => (pts[b.id] ?? 0) - (pts[a.id] ?? 0))
          .map((a) => (
            <li key={a.id}>
              <AllianceTag alliance={a} /> <b className="font-mono">{pts[a.id] ?? '–'}</b>
            </li>
          ))}
      </ul>
      {mine.length > 0 && <p>{t('Deine Medaillen: {list}', { list: mine.map((m) => MEDALS[m.medal].name).join(', ') })}</p>}
      <FinalScoresView state={state} locale={locale} />
    </section>
  );
}

// ─── Befehle ───────────────────────────────────────────────────────────────

function FleetOrders({ fleetId }: { fleetId: string }) {
  const { state } = useCmd();
  const t = useT();
  const f = state.fleets.find((x) => x.id === fleetId)!;
  const n = state.stage.kind === 'PHASE' ? state.stage.phase : 0;
  const zeal = modifierActive(state, 'DEFIANT_ZEAL', n, f.allianceId);
  const slots: (1 | 2)[] = zeal ? [1, 2] : [1];
  return (
    <section className="hud space-y-3 p-3">
      <p className="section-title">{t('Befehl für {fleet} @ {planet}', { fleet: f.name, planet: planetName(f.planetId) })}</p>
      {slots.map((slot) => (
        <OrderSlot key={slot} fleetId={f.id} slot={slot} />
      ))}
    </section>
  );
}

/**
 * Ein Befehlsplatz: Ist bereits ein Befehl erteilt, steht er mit „Ändern“ und „Zurückziehen“ vorn; das Formular
 * öffnet sich erst beim Ändern, vorbelegt mit dem bestehenden Befehl („Änderung speichern“). Ohne Befehl gleich
 * das Formular mit „Befehl erteilen (verdeckt)“.
 */
function OrderSlot({ fleetId, slot }: { fleetId: string; slot: 1 | 2 }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const msg = useMsg();
  const [editing, setEditing] = useState(false);
  const n = state.stage.kind === 'PHASE' ? state.stage.phase : 0;
  const ph = state.phases.find((p) => p.number === n)!;
  const op = ph.operations.find((o) => o.fleetId === fleetId && o.slot === slot && !o.isDefault);
  return (
    <div className="space-y-2">
      {slot === 2 && <p className="text-[14px] text-accent">{t('Defiant Zeal: zweite Operation')}</p>}
      {op && (
        <div className="inset flex flex-wrap items-center gap-x-3 gap-y-2 p-2.5">
          <p className="flex min-w-0 flex-1 basis-[14rem] items-start gap-2 text-[15px]">
            <span className="lamp lamp-ok mt-1.5 shrink-0" aria-hidden />
            <span className="min-w-0">
              <span className="block text-[13px] text-dim">{editing ? t('Bisheriger Befehl') : t('Erteilter Befehl (verdeckt)')}</span>
              <span className="text-ink">{msg(describeOp({ state }, op))}</span>
            </span>
          </p>
          {!editing && (
            <span className="flex shrink-0 gap-2">
              <button type="button" className="btn btn-sm min-h-11 lg:min-h-9" disabled={busy} onClick={() => setEditing(true)}>
                {t('Ändern')}
              </button>
              <button type="button" className="btn btn-sm min-h-11 lg:min-h-9" disabled={busy} onClick={() => run({ type: 'OP_CLEAR', fleetId, slot })}>
                <UndoIcon size={15} /> {t('Zurückziehen')}
              </button>
            </span>
          )}
        </div>
      )}
      {(!op || editing) && <OpForm fleetId={fleetId} slot={slot} key={`${op?.id ?? 'new'}-${editing}`} initial={op ? opInput(op) : undefined} onDone={op ? () => setEditing(false) : undefined} />}
    </div>
  );
}

/** Bestehende Operation als Formularwerte */
function opInput(o: Operation): OpInput {
  return {
    type: o.type as OpInput['type'],
    attackType: o.attackType,
    targetPlanetId: o.targetPlanetId,
    targetAllianceId: o.targetAllianceId,
    targetFleetId: o.targetFleetId,
    destinationPlanetId: o.destinationPlanetId,
    infraType: o.infraType,
    killTeamPlanetId: o.killTeamPlanetId,
    killTeamMode: o.killTeamMode,
  };
}

function OpForm({ fleetId, slot, initial, onDone }: { fleetId: string; slot: 1 | 2; initial?: OpInput; onDone?: () => void }) {
  const { state, run, busy } = useCmd();
  const msg = useMsg();
  const f = state.fleets.find((x) => x.id === fleetId)!;
  const n = state.stage.kind === 'PHASE' ? state.stage.phase : 0;
  const t = useT();
  const tg = state.toggles.operations;
  // keine Vorauswahl: die Operation wird bewusst gewählt, erteilen erst mit vollständigen Angaben
  const [d, setD] = useState<Partial<OpInput>>(initial ?? {});
  const rulesHref = useContext(RulesHrefCtx);
  const valid = opValid(d);
  const help = d.type ? OP_HELP[d.type] : null;
  const alive = (id: string) => !state.planets.find((p) => p.id === id)?.destroyed;
  const reach = selfOrConnected(state, f.allianceId, f.planetId!, n).filter(alive);
  const opts = (Object.keys(OP_TYPES) as OpInput['type'][]).filter((o) => {
    if (o === 'VOID_LEAP') return tg.voidLeap && !modifierActive(state, 'NO_VOID_LEAP', n) && !(isLastPhase(state, n) && state.toggles.lastPhase?.noVoidLeap);
    if (o === 'RAISE_EDIFICES') return tg.raiseEdifices;
    if (o === 'LOGISTICAL_AUXILIA') return tg.logisticalAuxilia && !modifierActive(state, 'NO_LOGISTICAL_AUXILIA', n);
    if (o === 'KILL_TEAMS') return tg.killTeams;
    return true;
  });
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <OpField label={t('Operation')}>
        <select className="select" value={d.type ?? ''} onChange={(e) => setD({ type: e.target.value as OpInput['type'] })} aria-label={t('Operation')}>
          <option value="" disabled>
            {t('– Operation wählen –')}
          </option>
          {opts.map((o) => (
            <option key={o} value={o}>
              {OP_TYPES[o as keyof typeof OP_TYPES]?.name ?? (OP_LABEL[o] ? t(OP_LABEL[o]) : o)}
            </option>
          ))}
        </select>
      </OpField>
      {help && (
        <p className="text-[14px] leading-snug text-dim sm:col-span-2">
          {t(help)}{' '}
          {rulesHref && (
            <a className="link" href={rulesHref} target="_blank" rel="noopener">
              {t('Mehr in den Kampagnenregeln')}
            </a>
          )}
        </p>
      )}
      {d.type === 'BATTLE' && (
        <>
          <OpField label={t('Attack Type')}>
            <select className="select" value={d.attackType ?? ''} onChange={(e) => setD({ ...d, attackType: (e.target.value || undefined) as AttackType })} aria-label={t('Attack Type')}>
              <option value="">{t('– Angriffsart –')}</option>
              {(Object.keys(ATTACK_TYPES) as AttackType[])
                .filter((a) => tg.attackTypes[a])
                .map((a) => (
                  <option key={a} value={a}>
                    {ATTACK_TYPES[a].name}
                  </option>
                ))}
            </select>
          </OpField>
          <OpField label={t('Zielplanet')}>
            <PlanetSelect value={d.targetPlanetId} options={reach} placeholder={t('– Zielplanet –')} onChange={(p) => setD({ ...d, targetPlanetId: p || undefined })} />
          </OpField>
          <OpField label={t('Gegner')}>
            <select className="select" value={d.targetAllianceId ?? ''} onChange={(e) => setD({ ...d, targetAllianceId: e.target.value || undefined })} aria-label={t('Gegner')}>
              <option value="">{t('– Gegner –')}</option>
              {state.alliances
                .filter((a) => a.id !== f.allianceId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </OpField>
          {/* R4: Zielflotte schon beim Befehl wählen (Flotte der angegriffenen Allianz auf dem Zielplaneten) */}
          {d.attackType === 'BOARDING_ACTION' && d.targetPlanetId && d.targetAllianceId && (
            <BoardingTarget value={d.targetFleetId} planetId={d.targetPlanetId} allianceId={d.targetAllianceId} onChange={(id) => setD({ ...d, targetFleetId: id })} className="sm:col-span-2" />
          )}
        </>
      )}
      {d.type === 'VOID_LEAP' && (
        <OpField label={t('Ziel')}>
          <PlanetSelect value={d.destinationPlanetId} options={planetIds(state).filter(alive)} placeholder={t('– Ziel –')} onChange={(p) => setD({ ...d, destinationPlanetId: p || undefined })} />
        </OpField>
      )}
      {d.type === 'KILL_TEAMS' && (
        <OpField label={t('Planet')}>
          <PlanetSelect value={d.killTeamPlanetId} options={reach} placeholder={t('– Planet –')} onChange={(p) => setD({ ...d, killTeamPlanetId: p || undefined })} />
        </OpField>
      )}
      {d.type === 'KILL_TEAMS' && (
        <OpField label={t('Kill-Team-Modus')}>
          <select className="select" value={d.killTeamMode ?? 'DICE'} onChange={(e) => setD({ ...d, killTeamMode: e.target.value as 'DICE' | 'GAME' })} aria-label={t('Kill-Team-Modus')}>
            <option value="DICE">{t('Würfeln (Regel)')}</option>
            <option value="GAME">{t('Kill-Team-Spiel')}</option>
          </select>
        </OpField>
      )}
      {d.type === 'RAISE_EDIFICES' && (
        <OpField label={t('Infrastruktur')}>
          <select className="select" value={d.infraType ?? ''} onChange={(e) => setD({ ...d, infraType: (e.target.value || undefined) as InfraType })} aria-label={t('Infrastruktur')}>
            <option value="">{t('– Bauwerk –')}</option>
            {edificeTypes(state, f.allianceId, f.planetId).map((x) => (
              <option key={x} value={x}>
                {INFRA[x].name}
              </option>
            ))}
          </select>
        </OpField>
      )}
      {/* FAQ F-7: erlaubt, scheitert aber in 2.2, wenn der Planet voll oder das Limit erreicht ist */}
      {d.type === 'RAISE_EDIFICES' && d.infraType && canBuild(state, f.allianceId, d.infraType, f.planetId!) && (
        <p className="text-[14px] text-warn sm:col-span-2">{t('Wird voraussichtlich scheitern: {error}', { error: msg(canBuild(state, f.allianceId, d.infraType, f.planetId!)!) })}</p>
      )}
      {onDone ? (
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button
            type="button"
            className="btn btn-sm btn-primary min-h-11 flex-1 lg:min-h-9"
            disabled={busy || !valid}
            onClick={async () => {
              if (await run({ type: 'OP_SET', fleetId, slot, op: d as OpInput })) onDone();
            }}
          >
            {t('Änderung speichern')}
          </button>
          <button type="button" className="btn btn-sm min-h-11 lg:min-h-9" disabled={busy} onClick={onDone}>
            {t('Abbrechen')}
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-sm btn-primary min-h-11 sm:col-span-2 lg:min-h-9" disabled={busy || !valid} onClick={() => run({ type: 'OP_SET', fleetId, slot, op: d as OpInput })}>
          {t('Befehl erteilen (verdeckt)')}
        </button>
      )}
    </div>
  );
}

/** Sichtbare Beschriftung eines Felds im Befehlsformular (Zugangsname bleibt das aria-label des Felds) */
function OpField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="text-[14px] font-semibold text-dim">{label}</span>
      {children}
    </label>
  );
}

/** Befehl vollständig? (dieselben Pflichtangaben wie die Engine, ohne deren Lageprüfungen) */
function opValid(d: Partial<OpInput>): boolean {
  switch (d.type) {
    case 'BATTLE':
      return !!(d.attackType && d.targetPlanetId && d.targetAllianceId);
    case 'VOID_LEAP':
      return !!d.destinationPlanetId;
    case 'RAISE_EDIFICES':
      return !!d.infraType;
    case 'KILL_TEAMS':
      return !!d.killTeamPlanetId;
    case 'LOGISTICAL_AUXILIA':
    case 'NONE':
      return true;
    default:
      return false;
  }
}

/** Einzeilige Hilfe je Operation (Details: Kampagnenregeln der Leseansicht) */
const OP_HELP: Record<string, string> = {
  BATTLE: 'Angriff auf den Flottenplaneten oder einen verbundenen Planeten – daraus entsteht eine Schlacht gegen die gewählte Allianz.',
  VOID_LEAP: 'Die Flotte springt zu einem beliebigen Planeten, auch ohne Verbindung.',
  RAISE_EDIFICES: 'Errichtet auf dem Flottenplaneten ein Bauwerk (Fortification Line, Support Facility oder Staging Grounds).',
  LOGISTICAL_AUXILIA: 'Unterstützt die Verteidigung: Greift der Gegner hier oder auf einem verbundenen Planeten an, wählt deine Allianz das Theatre. Gilt auch ohne Befehl.',
  KILL_TEAMS: 'Kill Teams auf den Flottenplaneten oder einen verbundenen Planeten entsenden – ausgewürfelt oder als Kill-Team-Spiel.',
};

const OP_LABEL: Record<string, string> = {
  BATTLE: 'Battle Operation',
  VOID_LEAP: 'Void Leap',
  RAISE_EDIFICES: 'Raise Edifices',
  LOGISTICAL_AUXILIA: 'Logistical Auxilia',
  KILL_TEAMS: 'Deploy Kill Teams',
  NONE: 'keine Operation',
};

function FleetMove({ fleetId }: { fleetId: string }) {
  const { state, run, busy } = useCmd();
  const f = state.fleets.find((x) => x.id === fleetId)!;
  const n = state.stage.kind === 'PHASE' ? state.stage.phase : 0;
  const ph = state.phases.find((p) => p.number === n)!;
  const t = useT();
  const msg = useMsg();
  const cur = ph.moves[f.id] ?? [];
  const [path, setPath] = useState<string[]>(cur);
  const all = planetIds(state);
  // wie die Engine (moveOptions): zwei Schritte nur mit Star of the Voidfarer, gesperrte Flotten (Boarding Action) ziehen nicht
  const mo = moveOptions(state, f.id, n);
  const twoHops = mo.maxHops === 2;
  const locked = !mo.allowed;
  const hop1 = mo.firstHops;
  const hop2 = twoHops && path[0] ? all.filter((id) => connectedFor(state, f.allianceId, path[0], id, n, 'move')) : [];
  if (ph.flags.movesApplied) return null;
  const title = <p className="section-title">{t('Bewegung für {fleet} @ {planet}', { fleet: f.name, planet: planetName(f.planetId) })}</p>;
  if (locked)
    return (
      <section className="hud space-y-2 p-3">
        {title}
        <p className="text-[15px] text-dim">{mo.reason ? msg(mo.reason) : t('{fleet} darf in dieser Phase nicht ziehen (Boarding Action).', { fleet: f.name })}</p>
      </section>
    );
  return (
    <section className="hud space-y-2 p-3">
      {title}
      <div className="grid gap-2 sm:grid-cols-2">
        <PlanetSelect value={path[0]} options={hop1} placeholder={t('– bleibt –')} onChange={(p) => setPath(p ? [p] : [])} />
        {twoHops && path[0] && <PlanetSelect value={path[1]} options={hop2} placeholder={t('– kein zweiter Schritt –')} onChange={(p) => setPath(p ? [path[0], p] : [path[0]])} />}
      </div>
      {twoHops && <p className="text-[14px] text-accent">{t('Star of the Voidfarer: bis zu zwei Schritte')}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-sm btn-primary" disabled={busy || (f.id in ph.moves && JSON.stringify(path) === JSON.stringify(cur))} onClick={() => run({ type: 'MOVE_SET', fleetId, path })}>
          {t('Bewegung festlegen (verdeckt)')}
        </button>
        {f.id in ph.moves && (
          <span className="text-[14px] text-dim">
            <span className="lamp lamp-ok mr-1.5 inline-block align-middle" aria-hidden />
            {cur.length ? t('Festgelegt: {path}', { path: cur.map((p) => planetName(p)).join(' → ') }) : t('Festgelegt: bleibt stehen')}
          </span>
        )}
      </div>
    </section>
  );
}

function BuildChoice({ allianceId }: { allianceId: string }) {
  const { state, run, busy } = useCmd();
  const n = state.stage.kind === 'PHASE' ? state.stage.phase : 0;
  const t = useT();
  const [type, setType] = useState<InfraType | ''>('');
  const [planet, setPlanet] = useState('');
  // nur gültige Optionen (SPEC 9.11): Typen am Limit und volle Planeten fallen weg
  const opts = buildOptions(state, allianceId, buildablePlanets({ state }, allianceId, n), { type, planetId: planet });
  return (
    <section className="hud space-y-2 p-3">
      <p className="section-title">{t('Deine Allianz baut jetzt')}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <select className="select" value={type} onChange={(e) => setType(e.target.value as InfraType)} aria-label={t('Bauwerk')}>
          <option value="">{t('– Bauwerk –')}</option>
          {opts.types.map((x) => (
            <option key={x} value={x}>
              {INFRA[x].name}
            </option>
          ))}
        </select>
        <PlanetSelect value={planet} options={opts.planets} placeholder={t('– Planet –')} onChange={setPlanet} />
      </div>
      {(opts.atLimit.length > 0 || opts.full.length > 0) && (
        <p className="text-[14px] text-faint">
          {[opts.atLimit.length ? t('am Limit: {list}', { list: opts.atLimit.join(', ') }) : '', opts.full.length ? t('voll: {list}', { list: opts.full.join(', ') }) : ''].filter(Boolean).join(' · ')}
        </p>
      )}
      {!opts.types.length && <p className="text-[15px] text-warn">{t('Kein gültiger Bau möglich – bitte verzichten.')}</p>}
      <div className="flex gap-2">
        <button className="btn btn-sm btn-primary" disabled={busy || !type || !planet} onClick={() => run({ type: 'BUILD_SET', allianceId, choice: { type: type as InfraType, planetId: planet } })}>
          {t('Bauen')}
        </button>
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => run({ type: 'BUILD_SET', allianceId, choice: 'SKIP' })}>
          {t('Verzichten')}
        </button>
      </div>
    </section>
  );
}

// ─── Schlachten ────────────────────────────────────────────────────────────

/** Kompakte Liste der anstehenden Schlachten für „Meine Aufgaben“ */
function UpcomingBattles({ battles, me, token }: { battles: Battle[]; me: Player; token: string }) {
  const { state } = useCmd();
  const t = useT();
  const il = useIntlLocale();
  const nick = (id: string) => state.players.find((p) => p.id === id)?.nickname;
  return (
    <section className="hud p-3 text-[15px]">
      <p className="section-title">{t('Anstehende Schlachten')}</p>
      <ul className="space-y-2">
        {battles.map((b) => {
          const side = sideOf(state, b, me.id);
          // B3: Gäste der Gegenseite gehören zu den Gegnern
          const opp = [...(side === 'ATTACKER' ? b.defenders : b.attackers).map((p) => nick(p.playerId)), ...guestsOf(b, side === 'ATTACKER' ? 'DEFENDER' : 'ATTACKER').map((g) => `${g.name} (${t('Gast')})`)].filter(
            Boolean,
          );
          const oppAlliance = state.alliances.find((a) => a.id === (side === 'ATTACKER' ? b.defenderAllianceId : b.attackerAllianceId));
          return (
            <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-x-3 border-l-2 border-line pl-2">
              <span>
                <b>{battleName(b, t)}</b> · {planetName(b.planetId)}
                <span className="block text-[14px] text-dim">
                  {t('Gegner: {names}', { names: opp.length ? opp.join(' & ') : (oppAlliance?.name ?? '–') })} ·{' '}
                  {b.scheduledAt ? t('Termin: {date}', { date: dt(b.scheduledAt, state.meta.timezone, il) }) : t('noch kein Termin')}
                </span>
              </span>
              <Link className="link text-[14px]" href={`/p/${token}/battles/${b.id}`}>
                Briefing
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Battles(props: PlayerAppProps) {
  const { state } = useCmd();
  const t = useT();
  const open = myBattles(state, props.me);
  const done = doneBattles(state, props.me);
  return (
    <div className="space-y-3">
      {props.anchor?.foreign && <p className="notice text-[15px]">{t('Der QR-Code gehört zu einer Schlacht, an der du nicht beteiligt bist – melden können nur die Teilnehmer.')}</p>}
      {open.length === 0 && <p className="hud p-4 text-[15px] text-dim">{t('Keine anstehenden Schlachten.')}</p>}
      {open.map((b) => (
        <BattleCard key={b.id} battle={b} {...props} />
      ))}
      <AllyBattles me={props.me} allianceId={props.allianceId} />
      <SkirmishPlayer me={props.me} allianceId={props.allianceId} />
      {done.length > 0 && (
        <section className="hud p-3 text-[15px]">
          <p className="section-title">{t('Gespielt')}</p>
          <ul className="space-y-1">
            {done.map((b) => (
              <li key={b.id}>
                {t('Phase {n}', { n: b.phaseNumber })}: {battleName(b, t)} · {planetName(b.planetId)} –{' '}
                {b.victor === 'DRAW' ? t('Unentschieden') : (b.victor === 'ATTACKER') === (sideOf(state, b, props.me.id) === 'ATTACKER') ? t('Sieg') : t('Niederlage')}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * Offene Schlachten der eigenen Allianz, in denen andere Mitglieder kämpfen: wer verteidigt bzw. angreift,
 * dazu „Übernehmen“ oder „Mit verteidigen“ (R1, BATTLE_CLAIM_SIDE).
 */
function AllyBattles({ me, allianceId }: { me: Player; allianceId: string | null }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  if (!allianceId || state.stage.kind === 'ENDED') return null;
  const list = state.battles.filter((b) => b.status === 'SCHEDULED' && !sideOf(state, b, me.id) && (b.attackerAllianceId === allianceId || b.defenderAllianceId === allianceId));
  if (!list.length) return null;
  const nick = (id: string) => state.players.find((p) => p.id === id)?.nickname ?? '?';
  return (
    <section className="hud p-3 text-[15px]">
      <p className="section-title">{t('Schlachten deiner Allianz')}</p>
      <ul className="space-y-2">
        {list.map((b) => {
          const side = b.defenderAllianceId === allianceId ? 'DEFENDER' : 'ATTACKER';
          const who = (side === 'DEFENDER' ? b.defenders : b.attackers).map((p) => nick(p.playerId)).join(' & ');
          const can = !b.draft && claimableSide(state, b, me.id) === side;
          return (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-l-2 border-line pl-2">
              <span className="min-w-0">
                <b>{battleName(b, t)}</b> · {planetName(b.planetId)}
                <span className="block text-[14px] text-dim">{side === 'DEFENDER' ? t('{names} verteidigt.', { names: who || '–' }) : t('{names} greift an.', { names: who || '–' })}</span>
              </span>
              {can && (
                <span className="flex flex-wrap gap-2">
                  <button className="btn btn-sm" disabled={busy} onClick={() => run({ type: 'BATTLE_CLAIM_SIDE', battleId: b.id, playerId: me.id, mode: 'TAKE_OVER' })}>
                    {t('Übernehmen')}
                  </button>
                  <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => run({ type: 'BATTLE_CLAIM_SIDE', battleId: b.id, playerId: me.id, mode: 'JOIN' })}>
                    {side === 'DEFENDER' ? t('Mit verteidigen') : t('Mit angreifen')}
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function BattleCard({ battle: b, token, me, anchor }: { battle: Battle } & PlayerAppProps) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const il = useIntlLocale();
  const side = sideOf(state, b, me.id)!;
  const A = state.alliances.find((a) => a.id === b.attackerAllianceId);
  const D = state.alliances.find((a) => a.id === b.defenderAllianceId);
  const nick = (id: string) => state.players.find((x) => x.id === id)?.nickname;
  // B3: Gäste der Gegenseite gehören zu den Gegnern
  const opp = [...(side === 'ATTACKER' ? b.defenders : b.attackers).map((p) => nick(p.playerId)), ...guestsOf(b, side === 'ATTACKER' ? 'DEFENDER' : 'ATTACKER').map((g) => `${g.name} (${t('Gast')})`)].filter(Boolean);
  const ownSide = side === 'ATTACKER' ? b.attackers : b.defenders;
  const iAmIn = ownSide.some((p) => p.playerId === me.id);
  const tz = state.meta.timezone;
  const draft = b.draft;
  const draftSide = draft ? sideOf(state, b, draft.byPlayerId) : null;
  const [reason, setReason] = useState('');
  // R1: Teilnahme selbst übernehmen, solange die Schlacht offen ist und kein Ergebnis vorliegt
  const claimable = b.status === 'SCHEDULED' && !draft && claimableSide(state, b, me.id) === side;
  // erst nach dem Laden im Browser bekannt – vermeidet Abweichungen zwischen Server- und Client-Render
  const now = useNow();
  // Satzbau je Sprache: Platzhalter {a}/{d} werden durch die Allianz-Tags ersetzt
  const vs = t('{a} greift {d} an').split(/\{[ad]\}/);
  return (
    <section id={`battle-${b.id}`} className="hud scroll-mt-3 space-y-3 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-accent">
          {battleName(b, t)} · {planetName(b.planetId)}
        </p>
        <Link className="link text-[15px]" href={`/p/${token}/battles/${b.id}`}>
          Briefing
        </Link>
      </div>
      <p className="text-[15px]">
        {vs[0]}
        <AllianceTag alliance={A} />
        {vs[1]}
        <AllianceTag alliance={D} />
        {vs[2]}
        {opp.length ? ` · ${t('Gegner: {names}', { names: opp.join(' & ') })}` : ''}
      </p>
      {/* Wer kämpft für die eigene Seite? Ohne Eintrag: klare Übernahme statt „du bist Verteidiger“ für alle */}
      <div className="flex flex-wrap items-center gap-2 text-[15px]">
        {ownSide.length ? (
          <span>
            <span className="lamp lamp-ok mr-1.5 inline-block align-middle" aria-hidden />
            {side === 'DEFENDER'
              ? iAmIn
                ? ownSide.length > 1
                  ? t('Du verteidigst mit {names}.', {
                      names: ownSide
                        .filter((p) => p.playerId !== me.id)
                        .map((p) => nick(p.playerId))
                        .join(' & '),
                    })
                  : t('Du verteidigst.')
                : t('{names} verteidigt.', { names: ownSide.map((p) => nick(p.playerId)).join(' & ') })
              : iAmIn
                ? t('Du führst den Angriff.')
                : t('{names} greift an.', { names: ownSide.map((p) => nick(p.playerId)).join(' & ') })}
          </span>
        ) : guestsOf(b, side).length ? (
          <span>
            <span className="lamp lamp-ok mr-1.5 inline-block align-middle" aria-hidden />
            {t('Ein Gast kämpft für eure Seite.')}
          </span>
        ) : (
          <span className="text-warn">
            <span className="lamp lamp-alert mr-1.5 inline-block align-middle" aria-hidden />
            {side === 'DEFENDER' ? t('Noch niemand hat die Verteidigung übernommen.') : t('Noch niemand führt den Angriff.')}
          </span>
        )}
        {claimable && !ownSide.length && (
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => run({ type: 'BATTLE_CLAIM_SIDE', battleId: b.id, playerId: me.id, mode: 'TAKE_OVER' })}>
            {side === 'DEFENDER' ? t('Ich übernehme die Verteidigung') : t('Ich übernehme den Angriff')}
          </button>
        )}
        {claimable && iAmIn && (
          <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => run({ type: 'BATTLE_CLAIM_SIDE', battleId: b.id, playerId: me.id, mode: 'LEAVE' })}>
            {side === 'DEFENDER' ? t('Verteidigung abgeben') : t('Angriff abgeben')}
          </button>
        )}
      </div>
      <GuestSlot battle={b} me={me} side={side} />
      <ClashNotice battle={b} me={me} />
      {b.status === 'SCHEDULED' && !draft ? (
        <Schedule battle={b} side={side} me={me} />
      ) : (
        b.scheduledAt && (
          <p className="text-[15px]">
            {t('Termin:')} <b>{dt(b.scheduledAt, tz, il)}</b>
          </p>
        )
      )}
      {/* NTH2 2.5: Spieltisch zum vereinbarten Termin */}
      {b.scheduledAt && (b.status === 'SCHEDULED' || b.status === 'PLAYED') && <TablePick battle={b} access={{ token }} playerId={me.id} />}
      {draft ? (
        <div className="space-y-2 border-l-2 border-accent pl-3 text-[15px]">
          <p>
            {t('Gemeldetes Ergebnis ({name}, {date}):', { name: nick(draft.byPlayerId), date: dt(draft.at, tz, il) })}
            {draft.status === 'DISPUTED' && <span className="ml-2 text-danger">{t('angefochten – der Warmaster entscheidet')}</span>}
            {now !== null && draftOverdue(b, now) && draft.status === 'PENDING' && <span className="ml-2 text-warn">{t('seit über 48 h offen – der Warmaster entscheidet')}</span>}
          </p>
          <DraftSummary state={state} battle={b} draft={draft} />
          {draftSide !== side && draft.status === 'PENDING' && (
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => run({ type: 'RESULT_DRAFT_CONFIRM', battleId: b.id, playerId: me.id, draftAt: draft.at })}>
                {t('Bestätigen')}
              </button>
              <input className="input w-56" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('Grund für Widerspruch')} aria-label={t('Grund für Widerspruch')} />
              <button className="btn btn-sm" disabled={busy || !reason.trim()} onClick={() => run({ type: 'RESULT_DRAFT_DISPUTE', battleId: b.id, playerId: me.id, reason, draftAt: draft.at })}>
                {t('Widersprechen')}
              </button>
            </div>
          )}
          {draftSide === side && <p className="text-faint">{t('Wartet auf Bestätigung der Gegenseite.')}</p>}
        </div>
      ) : (
        b.vp === null && ['SCHEDULED', 'PLAYED'].includes(b.status) && <ResultForm battle={b} me={me} token={token} autoOpen={anchor?.battleId === b.id} />
      )}
    </section>
  );
}

/** Terminüberschneidungen der Beteiligten (±3 h) als Klartext */
function clashText(state: CampaignState, b: Battle, time: string, me: Player, t: T, il: string): string[] {
  return timeClashes(state, b, time, me.id).map((c) => {
    const o = state.battles.find((x) => x.id === c.battleId);
    const who = c.playerId === me.id ? t('Du spielst') : t('{name} spielt', { name: state.players.find((p) => p.id === c.playerId)?.nickname ?? '?' });
    return t('{who} am {date} bereits {battle}', { who, date: dt(c.at, state.meta.timezone, il), battle: o ? `${battleName(o, t)}${o.planetId ? ` · ${planetName(o.planetId)}` : ''}` : '?' });
  });
}

/** Hinweis bei bestätigtem Termin, der mit einer anderen Schlacht eines Beteiligten kollidiert */
function ClashNotice({ battle: b, me }: { battle: Battle; me: Player }) {
  const { state } = useCmd();
  const t = useT();
  const il = useIntlLocale();
  if (!b.scheduledAt || b.status !== 'SCHEDULED') return null;
  const list = clashText(state, b, b.scheduledAt, me, t, il);
  if (!list.length) return null;
  return (
    <p className="notice text-[14px]">
      {t('Terminüberschneidung:')} {list.join(' · ')}
    </p>
  );
}

function Schedule({ battle: b, side, me }: { battle: Battle; side: 'ATTACKER' | 'DEFENDER'; me: Player }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const il = useIntlLocale();
  const [times, setTimes] = useState<string[]>(['']);
  const tz = state.meta.timezone;
  const theirs = (b.proposals ?? []).filter((p) => p.side !== side);
  const mine = (b.proposals ?? []).find((p) => p.side === side);
  if (b.scheduledAt)
    return (
      <p className="text-[15px]">
        {t('Termin:')} <b>{dt(b.scheduledAt, tz, il)}</b>
      </p>
    );
  return (
    <div className="space-y-2 text-[15px]">
      {theirs.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center gap-2">
          <span className="text-dim">{t('Vorschlag der Gegenseite:')}</span>
          {p.times.map((time) => {
            const clash = clashText(state, b, time, me, t, il);
            return (
              <button
                key={time}
                className={`btn btn-sm ${clash.length ? 'border-warn' : ''}`}
                disabled={busy}
                title={clash.length ? clash.join(' · ') : undefined}
                onClick={() => run({ type: 'TIME_ACCEPT', battleId: b.id, playerId: me.id, time })}
              >
                {t('{date} annehmen', { date: dt(time, tz, il) })}
                {clash.length > 0 && <span className="text-warn"> ({t('Überschneidung')})</span>}
              </button>
            );
          })}
        </div>
      ))}
      {mine && <p className="text-faint">{t('Dein Vorschlag: {dates}', { dates: mine.times.map((x) => dt(x, tz, il)).join(', ') })}</p>}
      <details>
        <summary className="cursor-pointer text-dim">{mine ? t('Andere Termine vorschlagen') : t('Termine vorschlagen')}</summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {times.map((v, i) => (
            <input key={i} className="input w-auto" type="datetime-local" value={v} aria-label={t('Termin {n}', { n: i + 1 })} onChange={(e) => setTimes((l) => l.map((x, j) => (j === i ? e.target.value : x)))} />
          ))}
          {times.length < 3 && (
            <button className="btn btn-sm btn-ghost" onClick={() => setTimes((l) => [...l, ''])}>
              {t('+ Termin')}
            </button>
          )}
          <button
            className="btn btn-sm btn-primary"
            disabled={busy || !times.some(Boolean)}
            onClick={() => run({ type: 'TIME_PROPOSE', battleId: b.id, playerId: me.id, times: times.filter(Boolean).map((t) => new Date(t).toISOString()) })}
          >
            {t('Vorschlagen')}
          </button>
        </div>
      </details>
    </div>
  );
}

/**
 * Ergebnis melden (N1.2): Das Formular wird erst beim Aufklappen erzeugt – so hängen Vorbelegungen wie das
 * lokale Datum nur vom Browser ab (keine Abweichung zum Server-Render).
 */
function ResultForm({ autoOpen = false, ...props }: { battle: Battle; me: Player; token: string; autoOpen?: boolean }) {
  const t = useT();
  const [opened, setOpened] = useState(autoOpen);
  return (
    <details
      className="text-[15px]"
      open={autoOpen || undefined}
      // NTH2 1.3: aus dem QR-Code geöffnet – Formular aufklappen und ins Bild holen
      ref={(el) => {
        if (autoOpen && el && !el.dataset.anchored) {
          el.dataset.anchored = '1';
          el.closest('section')?.scrollIntoView({ block: 'start' });
        }
      }}
      onToggle={(e) => e.currentTarget.open && setOpened(true)}
    >
      <summary className="cursor-pointer text-accent">{t('Ergebnis melden')}</summary>
      {opened && <ResultFormBody {...props} />}
    </details>
  );
}

/** „Vespator“ = Standardmission der Angriffsart, sonst ein Eintrag der Missionsliste oder Freitext (N2.2) */
type MissionChoice = { source: 'VESPATOR' | 'LIST' | 'EXTERNAL'; missionId: string; name: string };

function ResultFormBody({ battle: b, me, token }: { battle: Battle; me: Player; token: string }) {
  const cmd = useCmd();
  const { state, run, busy } = cmd;
  const t = useT();
  const msg = useMsg();
  const [vpA, setVpA] = useState('');
  const [vpD, setVpD] = useState('');
  // D5: Bemal-Chronik schlägt „Battle Ready“ für die eigene Seite vor
  const hobby = hobbyReady(state, b, me);
  const [brA, setBrA] = useState(hobby?.side === 'ATTACKER' && hobby.suggest);
  const [brD, setBrD] = useState(hobby?.side === 'DEFENDER' && hobby.suggest);
  // bestätigter Termin als Vorschlag, in der lokalen Zeit des Browsers (wie das Eingabefeld)
  const [playedAt, setPlayedAt] = useState(() => toLocalInput(b.scheduledAt));
  const [mission, setMission] = useState<MissionChoice>(() => ({
    source: b.mission.source === 'LIST' ? 'LIST' : b.mission.source === 'EXTERNAL' ? 'EXTERNAL' : 'VESPATOR',
    missionId: b.mission.missionId ?? '',
    name: b.mission.source === 'EXTERNAL' ? b.mission.externalName : '',
  }));
  const [theatre, setTheatre] = useState<TheatreId | ''>(b.theatre ?? '');
  const [twist, setTwist] = useState('');
  // B7/R2: Sinister Omens – das Theatre wird ausgewürfelt (W6 von Hand eintragen), nicht frei gewählt
  const [theatreRoll, setTheatreRoll] = useState('');
  const randomTheatre = b.theatreChosenBy === 'RANDOM';
  // Theatre und Twist gibt es nur bei Kampagnenschlachten mit Theatre (nicht bei Boarding Actions)
  const withTheatre = b.kind === 'CAMPAIGN' && !!b.planetId && b.attackType !== 'BOARDING_ACTION';
  const theatres = withTheatre ? (planetDef(b.planetId!)?.theatres ?? []) : [];
  // die Vespator-Mission der eigenen Angriffsart steht schon als erste Option – nicht doppelt anbieten
  const missions = allMissions(state).filter(
    (m) => (!m.attackTypes.length || (b.attackType && m.attackTypes.includes(b.attackType))) && !(m.source === 'Vespator' && b.attackType && m.attackTypes.includes(b.attackType)),
  );
  // Kill-Team- und Abfanggefechte: eigenes Regelwerk, ohne Battle Ready, Größe, Missionswahl und Einzelspiele
  const fortyK = b.kind === 'CAMPAIGN' || b.kind === 'FINAL_TIEBREAK';
  const [size, setSize] = useState(b.size ?? '');
  const [report, setReport] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [decisions, setDecisions] = useState<Record<string, OutcomeDecision>>({});
  // Einzelspiele (N2.3): jede Zeile ein Spiel mit VP und Battle Ready; Teilnehmer = die der Schlacht
  const [games, setGames] = useState<{ vpA: string; vpD: string; brA: boolean; brD: boolean }[]>([]);
  const multi = games.length > 0;
  const gamesOk = multi && games.every((g) => g.vpA !== '' && g.vpD !== '');
  const vpOk = multi ? gamesOk : vpA !== '' && vpD !== '';
  const gameList: BattleGame[] = games.map((g, i) => ({
    id: `g${i + 1}`,
    attackers: b.attackers,
    defenders: b.defenders,
    playedAt: playedAt ? new Date(playedAt).toISOString() : null,
    size: size || null,
    missionName: '',
    vp: g.vpA !== '' && g.vpD !== '' ? { attacker: Number(g.vpA), defender: Number(g.vpD) } : null,
    battleReady: { attacker: g.brA, defender: g.brD },
    report: '',
  }));
  const update: BattleUpdate = multi
    ? { games: gameList, playedAt: playedAt ? new Date(playedAt).toISOString() : null, size: size || null, report }
    : { vp: vpOk ? { attacker: Number(vpA), defender: Number(vpD) } : undefined, battleReady: { attacker: brA, defender: brD }, playedAt: playedAt ? new Date(playedAt).toISOString() : null, size: size || null, report };
  if (photos.length) update.photos = [...b.photos, ...photos];
  // Missionsvorschlag: nur senden, wenn er vom bisherigen Stand abweicht; der Warmaster gibt ihn mit dem Ergebnis frei
  const missionUpd: Battle['mission'] | null =
    mission.source === 'VESPATOR'
      ? b.mission.source === 'VESPATOR'
        ? null
        : { source: 'VESPATOR', externalName: '' }
      : mission.source === 'LIST'
        ? mission.missionId
          ? { source: 'LIST', externalName: '', missionId: mission.missionId }
          : null
        : mission.name.trim()
          ? { source: 'EXTERNAL', externalName: mission.name.trim() }
          : null;
  if (missionUpd && JSON.stringify(missionUpd) !== JSON.stringify(b.mission)) update.mission = missionUpd;
  const rolledTheatre = withTheatre && randomTheatre && !b.theatre && theatreRoll ? theatreForRoll(b.planetId!, Number(theatreRoll)) : null;
  if (rolledTheatre) update.theatreRoll = Number(theatreRoll);
  else if (withTheatre && !randomTheatre && theatre && theatre !== b.theatre) update.theatre = theatre;
  if (withTheatre && state.toggles.theatreTwists && twist && (rolledTheatre || theatre || b.theatre)) update.twistRoll = Number(twist);
  // Probe-Schlacht mit dem gemeldeten Ergebnis, damit der Sieger seine Entscheidungen vorbereiten kann
  const probe: Battle | null = vpOk
    ? multi
      ? { ...b, games: gameList, vp: aggregateGames(gameList).vp, battleReady: { attacker: false, defender: false }, decisions }
      : { ...b, vp: update.vp!, battleReady: update.battleReady!, decisions }
    : null;
  if (probe) probe.victor = computeVictor(probe);
  const setGame = (i: number, p: Partial<(typeof games)[number]>) => setGames((l) => l.map((g, j) => (j === i ? { ...g, ...p } : g)));
  const mySide = sideOf(state, b, me.id);
  const iWon = probe && ((probe.victor === 'ATTACKER' && mySide === 'ATTACKER') || (probe.victor === 'DEFENDER' && mySide === 'DEFENDER'));
  const twistTheatre = (rolledTheatre || (randomTheatre ? b.theatre : theatre || b.theatre) || '') as TheatreId | '';
  return (
    <>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {!multi && (
          <>
            <Field label={t('VP Angreifer')}>
              <input className="input" type="number" min={0} value={vpA} onChange={(e) => setVpA(e.target.value)} />
            </Field>
            <Field label={t('VP Verteidiger')}>
              <input className="input" type="number" min={0} value={vpD} onChange={(e) => setVpD(e.target.value)} />
            </Field>
            {fortyK && (
              <>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={brA} onChange={(e) => setBrA(e.target.checked)} /> {t('Battle Ready Angreifer (+10)')}
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={brD} onChange={(e) => setBrD(e.target.checked)} /> {t('Battle Ready Verteidiger (+10)')}
                </label>
                <HobbyReadyHint hint={hobby} />
              </>
            )}
          </>
        )}
        {games.map((g, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <span className="text-dim">{t('Spiel {n}', { n: i + 1 })}</span>
            <input className="input w-20" type="number" min={0} value={g.vpA} aria-label={t('VP Angreifer')} placeholder={t('VP A')} onChange={(e) => setGame(i, { vpA: e.target.value })} />
            <input className="input w-20" type="number" min={0} value={g.vpD} aria-label={t('VP Verteidiger')} placeholder={t('VP V')} onChange={(e) => setGame(i, { vpD: e.target.value })} />
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={g.brA} onChange={(e) => setGame(i, { brA: e.target.checked })} /> {t('BR A')}
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={g.brD} onChange={(e) => setGame(i, { brD: e.target.checked })} /> {t('BR V')}
            </label>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setGames((l) => l.filter((_, j) => j !== i))}>
              {t('Entfernen')}
            </button>
          </div>
        ))}
        {fortyK && (
          <div className="sm:col-span-2">
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setGames((l) => [...l, { vpA: '', vpD: '', brA: false, brD: false }])}>
              {multi ? t('+ Einzelspiel') : t('Mehrere Einzelspiele melden')}
            </button>
          </div>
        )}
        <Field label={t('Gespielt am')}>
          <input className="input" type="datetime-local" value={playedAt} onChange={(e) => setPlayedAt(e.target.value)} />
        </Field>
        {!fortyK && (
          <p className="self-end text-[14px] text-faint">{b.kind === 'KILL_TEAM' ? t('Kill-Team-Gefecht: nur Siegpunkte und Datum – Größe und Battle Ready entfallen.') : t('Nebengefecht: nur Siegpunkte und Datum.')}</p>
        )}
        {fortyK && (
          <Field label={t('Größe')}>
            <select className="select" value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="">–</option>
              {battleSizes(state).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {fortyK && (
          <Field label={t('Mission (Vorschlag)')}>
            <select
              className="select"
              value={mission.source === 'LIST' ? `list:${mission.missionId}` : mission.source}
              onChange={(e) => {
                const v = e.target.value;
                setMission(v.startsWith('list:') ? { source: 'LIST', missionId: v.slice(5), name: '' } : { source: v as MissionChoice['source'], missionId: '', name: mission.name });
              }}
            >
              <option value="VESPATOR">{b.attackType ? t('Vespator-Mission ({name})', { name: ATTACK_TYPES[b.attackType].name }) : t('Standardmission')}</option>
              {missions.map((m) => (
                <option key={m.id} value={`list:${m.id}`}>
                  {m.name} ({m.source})
                </option>
              ))}
              <option value="EXTERNAL">{t('andere (Freitext)')}</option>
            </select>
          </Field>
        )}
        {fortyK &&
          (mission.source === 'EXTERNAL' ? (
            <Field label={t('Name der Mission')}>
              <input className="input" value={mission.name} onChange={(e) => setMission({ ...mission, name: e.target.value })} />
            </Field>
          ) : (
            <p className="self-end text-[14px] text-faint">{t('Eine andere Mission gibt der Warmaster mit dem Ergebnis frei.')}</p>
          ))}
        {withTheatre && theatres.length > 0 && randomTheatre && (
          <Field label={b.theatre ? 'Theatre' : t('Theatre-Wurf (W6)')} hint={b.theatre ? undefined : t('Sinister Omens: Das Theatre wird ausgewürfelt – W6 werfen und eintragen.')}>
            {b.theatre ? (
              <p className="py-1.5 text-[15px]">
                {THEATRES[b.theatre].name} <span className="text-faint">({t('ausgewürfelt')})</span>
              </p>
            ) : (
              <select className="select" value={theatreRoll} onChange={(e) => setTheatreRoll(e.target.value)}>
                <option value="">–</option>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} – {THEATRES[theatreForRoll(b.planetId!, n)!].name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {withTheatre && theatres.length > 0 && !randomTheatre && (
          <Field label="Theatre">
            <select className="select" value={theatre} onChange={(e) => setTheatre(e.target.value as TheatreId | '')}>
              <option value="">–</option>
              {theatres.map((th) => (
                <option key={th} value={th}>
                  {THEATRES[th].name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {withTheatre && state.toggles.theatreTwists && !b.twist && (
          <Field label={t('Twist (W6)')}>
            <select className="select" value={twist} disabled={!twistTheatre} onChange={(e) => setTwist(e.target.value)}>
              <option value="">–</option>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                  {twistTheatre ? ` – ${THEATRES[twistTheatre].twists[twistIndex(n)]}` : ''}
                </option>
              ))}
            </select>
          </Field>
        )}
        {b.twist && <p className="self-end text-[14px] text-dim">{t('Twist: {name} (W6 {n})', { name: b.twist.name, n: b.twist.d6 })}</p>}
        <div className="sm:col-span-2">
          <Field label={t('Bericht (optional)')}>
            <textarea className="textarea" rows={3} value={report} onChange={(e) => setReport(e.target.value)} />
          </Field>
        </div>
        <label className="text-dim sm:col-span-2">
          {t('Fotos')}{' '}
          <input
            type="file"
            accept="image/*"
            multiple
            className="text-[14px]"
            disabled={busy}
            onChange={async (e) => {
              for (const file of Array.from(e.target.files ?? [])) {
                const fd = new FormData();
                fd.set('file', file);
                fd.set('kind', 'BATTLE_PHOTO');
                const r = await playerUploadAction(token, fd);
                if (r.ok) setPhotos((p) => [...p, r.id]);
                else cmd.toast('error', msg(r.error));
              }
            }}
          />
          {photos.length > 0 && <span className="ml-2 text-ok">{t('{n} hochgeladen', { n: photos.length })}</span>}
        </label>
      </div>
      {probe && iWon && probe.victor !== 'DRAW' && (
        <div className="mt-3 space-y-2">
          <p className="text-[14px] text-dim">{t('Als Sieger kannst du deine Campaign-Outcome-Entscheidungen gleich mitschicken – deine Auswahl wird automatisch mit dem Ergebnis gesendet.')}</p>
          {probe.operationIds.map((opId) => (
            // Entscheidungen landen sofort im Entwurf (kein eigenes Speichern, nichts geht beim Senden verloren)
            <OutcomeEditor key={opId} battle={probe} opId={opId} onDraft={(dec) => setDecisions((d) => ({ ...d, [opId]: dec }))} />
          ))}
        </div>
      )}
      <button
        className="btn btn-sm btn-primary mt-3"
        disabled={busy || !vpOk}
        // Entscheidungen nur mitsenden, wenn sie zum gemeldeten Sieger passen (Sieg gedreht → verworfen)
        onClick={() => run({ type: 'RESULT_DRAFT_SUBMIT', battleId: b.id, playerId: me.id, update, decisions: iWon && probe?.victor !== 'DRAW' ? decisions : {} })}
      >
        {t('Ergebnis zur Bestätigung senden')}
      </button>
    </>
  );
}

// ─── Allianz ───────────────────────────────────────────────────────────────

function AllianceRoom(props: PlayerAppProps) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const msg = useMsg();
  const il = useIntlLocale();
  const [text, setText] = useState('');
  const alId = props.allianceId;
  const phase = state.stage.kind === 'PHASE' ? state.stage.phase : null;
  const ph = phase ? state.phases.find((p) => p.number === phase) : null;
  if (!alId) return <p className="hud p-4 text-[15px] text-dim">{t('Du bist aktuell keiner Allianz zugeordnet.')}</p>;
  const notes = [...(state.allianceNotes ?? [])].sort((a, b) => b.at.localeCompare(a.at));
  const fleets = state.fleets.filter((f) => f.allianceId === alId && !f.reserve);
  return (
    <div className="grid items-start gap-3 xl:grid-cols-2">
      {ph && (
        <section className="hud p-3 text-[15px]">
          <p className="section-title">{t('Befehle der Allianz (Phase {n})', { n: ph.number })}</p>
          <ul className="space-y-1">
            {fleets.map((f) => {
              const ops = ph.operations.filter((o) => o.fleetId === f.id);
              const cmd = state.players.find((p) => p.id === f.commanders[String(ph.number)]);
              return (
                <li key={f.id}>
                  <b>{f.name}</b>{' '}
                  <span className="text-dim">
                    @ {planetName(f.planetId)}
                    {cmd ? ` · ${cmd.nickname}` : ''}
                  </span>
                  <span className="block pl-3">{ops.length ? ops.map((o) => msg(describeOp({ state }, o))).join(' · ') : <span className="text-faint">{t('noch kein Befehl')}</span>}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <section className="hud space-y-2 p-3 text-[15px]">
        <p className="section-title">{t('Allianz-Notizen')}</p>
        <div className="flex gap-2">
          <textarea className="textarea" rows={2} value={text} onChange={(e) => setText(e.target.value)} aria-label={t('Neue Notiz')} placeholder={t('Nur für deine Allianz sichtbar')} />
          <button
            className="btn btn-sm btn-primary self-end"
            disabled={busy || !text.trim()}
            onClick={async () => {
              if (await run({ type: 'NOTE_ADD', allianceId: alId, playerId: props.me.id, text })) setText('');
            }}
          >
            {t('Posten')}
          </button>
        </div>
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="border-l-2 border-line pl-3">
              <p className="whitespace-pre-wrap">{n.text}</p>
              <p className="text-[14px] text-faint">
                {n.playerId ? (state.players.find((p) => p.id === n.playerId)?.nickname ?? '?') : 'Warmaster'} · {fmtNoteDate(n.at, il, state.meta.timezone)}
                {n.playerId === props.me.id && (
                  <button className="ml-2 underline" disabled={busy} onClick={() => run({ type: 'NOTE_DELETE', id: n.id })}>
                    {t('löschen')}
                  </button>
                )}
              </p>
            </li>
          ))}
          {notes.length === 0 && <li className="text-faint">{t('Noch keine Notizen.')}</li>}
        </ul>
      </section>
    </div>
  );
}

// ─── Profil ────────────────────────────────────────────────────────────────

const NOTIFY: [NotifyCategory, string][] = [
  ['PHASE', 'Neue Phase und aufgedeckte Operationen'],
  ['RESULTS', 'Ergebnisse, Events, Kampagnenende'],
  ['DEADLINES', 'Erinnerungen an Deadlines (48 h / 12 h)'],
  ['PERSONAL', 'Persönliches: Angriffe, Bestätigungen, Terminvorschläge'],
];

function Profile(props: PlayerAppProps) {
  const cmd = useCmd();
  const { state, run, busy } = cmd;
  const me = state.players.find((p) => p.id === props.me.id) ?? props.me;
  const t = useT();
  const msg = useMsg();
  const locale = useLocale();
  const [nick, setNick] = useState(me.nickname);
  const [faction, setFaction] = useState(me.faction);
  const [sub, setSub] = useState(me.subfaction);
  // B5: nach Kampagnenende gilt die Mitgliedschaft der letzten Phase (Überläufer bleiben in der neuen Allianz)
  const phaseNow = stagePhase(state);
  const factionFrom = factionFromPhase(state);
  // B8/R4: Bilanz wie in der Statistik – ungespielt gewertete Schlachten zählen nicht
  const rec = profileRecord(state, me.id);
  const medals = state.medals.filter((m) => m.playerIds.includes(me.id));
  return (
    <div className="grid items-start gap-3 xl:grid-cols-2">
      <section className="hud space-y-2 p-3">
        <p className="section-title">{t('Profil')}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label={t('Nickname')}>
            <input className="input" value={nick} onChange={(e) => setNick(e.target.value)} />
          </Field>
          <Field label={t('Armee')}>
            <input className="input" list="faction-list" value={faction} onChange={(e) => setFaction(e.target.value)} />
          </Field>
          <Field label={t('Unterfraktion')}>
            <input className="input" value={sub} onChange={(e) => setSub(e.target.value)} />
          </Field>
          <label className="text-[15px] text-dim">
            {t('Avatar')}{' '}
            <input
              type="file"
              accept="image/*"
              className="text-[14px]"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const fd = new FormData();
                fd.set('file', file);
                fd.set('kind', 'AVATAR');
                const r = await playerUploadAction(props.token, fd);
                if (r.ok) run({ type: 'PROFILE_UPDATE', playerId: me.id, update: { avatar: r.id } });
                else cmd.toast('error', msg(r.error));
              }}
            />
          </label>
        </div>
        <button
          className="btn btn-sm btn-primary"
          disabled={busy || (nick === me.nickname && faction === me.faction && sub === me.subfaction)}
          onClick={() => run({ type: 'PROFILE_UPDATE', playerId: me.id, update: { nickname: nick, faction, subfaction: sub } })}
        >
          {t('Speichern')}
        </button>
        {factionFrom > 0 && factionFrom <= state.meta.phaseCount && <p className="text-[14px] text-faint">{t('Ein Armeewechsel gilt ab Phase {n}.', { n: factionFrom })}</p>}
        <Field label={t('Sprache')}>
          <select
            className="select"
            value={locale}
            disabled={busy}
            onChange={(e) => {
              // Profil und Sprach-Cookie gemeinsam ändern (das Cookie hat Vorrang vor der Profileinstellung)
              setLangCookie(e.target.value as Locale);
              run({ type: 'PROFILE_UPDATE', playerId: me.id, update: { locale: e.target.value as Locale } });
            }}
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_NAMES[l]}
              </option>
            ))}
          </select>
        </Field>
      </section>
      <CommanderSection token={props.token} me={me} locale={locale} />
      <R2ProfileSections me={me} />
      {/* D5: Bemal-Chronik */}
      <HobbySection token={props.token} me={me} />
      {/* P3: Order of Battle (Crusade-Anbindung, nur wenn eingeschaltet) */}
      <OrderOfBattle player={me} printHref={`/p/${props.token}/crusade`} />
      <section className="hud space-y-1 p-3 text-[15px]">
        <p className="section-title">{t('Benachrichtigungen')}</p>
        {NOTIFY.map(([k, label]) => (
          <label key={k} className="flex items-center gap-2">
            <input type="checkbox" checked={me.notify?.[k] !== false} disabled={busy} onChange={(e) => run({ type: 'PROFILE_UPDATE', playerId: me.id, update: { notify: { [k]: e.target.checked } } }, { silent: true })} />
            {t(label)}
          </label>
        ))}
        <p className="pt-2 text-[14px] text-faint">
          {t('Kalender mit deinen Schlachtterminen abonnieren:')}{' '}
          <a className="link break-all" href={props.calendarUrl}>
            {props.calendarUrl}
          </a>
        </p>
        <p className="text-[14px] text-warn">{t('Dein Link ist wie ein Passwort – nicht weitergeben.')}</p>
        {props.p1 && <P1ProfileSection token={props.token} data={props.p1} />}
      </section>
      <section className="hud p-3 text-[15px]">
        <p className="section-title">{t('Bilanz')}</p>
        <p>{t('{n} Schlachten · {won} Siege · {draws} Unentschieden · {lost} Niederlagen', { n: rec.battles, won: rec.wins, draws: rec.draws, lost: rec.losses })}</p>
        {medals.length > 0 && <p className="mt-1">{t('Medaillen: {list}', { list: medals.map((m) => MEDALS[m.medal].name).join(', ') })}</p>}
        {(me.factionHistory ?? []).length > 0 && (
          <p className="mt-1 text-dim">
            {t('Armeen:')}{' '}
            {(me.factionHistory ?? [])
              .map((h) => `${h.faction}${h.subfaction ? ` (${h.subfaction})` : ''} ${!h.fromPhase ? t('ab Start') : h.fromPhase > state.meta.phaseCount ? t('nach Kampagnenende') : t('ab Phase {n}', { n: h.fromPhase })}`)
              .join(' → ')}
          </p>
        )}
        <p className="mt-1 text-dim">
          {t('Allianzen:')} {me.memberships.map((m) => `${state.alliances.find((a) => a.id === m.allianceId)?.name ?? '?'} (${t('Phase {n}', { n: m.fromPhase })}${m.toPhase ? `–${m.toPhase}` : '+'})`).join(', ') || '–'}
        </p>
        <p className="mt-1 text-faint">{t('aktuelle Allianz: {name}', { name: state.alliances.find((a) => a.id === allianceOf(me, phaseNow))?.name ?? '–' })}</p>
      </section>
    </div>
  );
}

function CommanderSection({ token, me, locale }: { token: string; me: Player; locale: Locale }) {
  const cmd = useCmd();
  const { state, run, busy } = cmd;
  const t = useT();
  const msg = useMsg();
  const [name, setName] = useState(me.commander?.name ?? '');
  const [title, setTitle] = useState(me.commander?.title ?? '');
  return (
    <section className="hud space-y-2 p-3">
      <p className="section-title">{t('Kommandant')}</p>
      <CommanderCard state={state} player={me} locale={locale} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label={t('Titel')}>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('z. B. Lord-Castellan')} />
        </Field>
        <Field label={t('Name')}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-sm" disabled={busy} onClick={() => run({ type: 'COMMANDER_UPDATE', playerId: me.id, name, title, portrait: me.commander?.portrait ?? null })}>
          {t('Speichern')}
        </button>
        <label className="text-[14px] text-dim">
          {t('Portrait')}{' '}
          <input
            type="file"
            accept="image/*"
            className="text-[14px]"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const fd = new FormData();
              fd.set('file', file);
              fd.set('kind', 'AVATAR');
              const r = await playerUploadAction(token, fd);
              if (r.ok) run({ type: 'COMMANDER_UPDATE', playerId: me.id, name, title, portrait: r.id });
              else cmd.toast('error', msg(r.error));
            }}
          />
        </label>
      </div>
      <p className="text-[14px] text-faint">{t('Ehrungen und Narben vergibt der Warmaster; vier Ehrungen verleiht die Kampagne automatisch.')}</p>
    </section>
  );
}
