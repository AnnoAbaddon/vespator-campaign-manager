'use client';

import { useMemo, useState } from 'react';
import { PHASE_STEPS, SETUP_STEPS } from '@/engine/types';
import { campaignPoints } from '@/engine/board';
import { mapOf } from '@/engine/map';
import { DossierSheet } from '@/components/public/DossierSheet';
import { MoreSheet } from '@/components/MoreSheet';
import { useDocTitle } from '@/components/useDocTitle';
import { CampaignMap } from '@/components/map/CampaignMap';
import type { MapArrow } from '@/components/map/MapSvg';
import { FactionDatalist, tabKeys, useIsDesktop } from '@/components/ui';
import { GameIcon } from '@/components/icons/GameIcon';
import { BookIcon, DiceIcon, UndoIcon } from '@/components/icons';
import { CreditsLink } from '@/components/CreditsLink';
import { FadeScroll } from '@/components/FadeScroll';
import { HeaderPortal } from '@/components/HeaderPortal';
import { Motto } from '@/components/Motto';
import { MOTTO } from '@/flavor';
import { STEP_NAMES, SETUP_NAMES, stageLabel } from '@/components/stageLabel';
import { StageProgress } from '@/components/StageProgress';
import { stageTrack } from '@/components/public/stageSteps';
import { useLocale, useT } from '@/i18n/client';
import { useCmd } from './CommandProvider';
import { MapFocusCtx, opArrow } from './mapFocus';
import { CampaignInfoCtx } from './infoCtx';
import type { CampaignInfo, RevisionInfo } from './types';
import { SetupWizard } from './setup/SetupWizard';
import { PhaseCockpit } from './phase/PhaseCockpit';
import { PlanetPanel } from './phase/PlanetPanel';
import { BattlesTab } from './battles/BattlesTab';
import { PeopleTab } from './people/PeopleTab';
import { TextsTab } from './texts/TextsTab';
import { LogTab } from './log/LogTab';
import { SettingsTab } from './settings/SettingsTab';
import { SandboxBar } from './gm/SandboxTools';
import { StatsView } from '@/components/stats/StatsView';

type TabId = 'cockpit' | 'battles' | 'people' | 'texts' | 'stats' | 'log' | 'settings';

/**
 * Kommandoterminal.
 * Desktop: links Navigation und Kampagnenaufbau, Mitte die taktische Sektorkarte, rechts Auftrag bzw.
 * Planetenakte – genau ein Bildschirm, Bereiche scrollen einzeln. Andere Kapitel nutzen Mitte + rechts.
 * Mobil: eine Ansicht zur Zeit, Navigation unten.
 */
export function AdminCampaign({ revisions, snapshots, info }: { revisions: RevisionInfo[]; snapshots: { phase: number; revision: number }[]; info: CampaignInfo }) {
  const { state, diceMode, setDiceMode, undo, busy, saving, readOnly } = useCmd();
  const t = useT();
  const locale = useLocale();
  const [tab, setTab] = useState<TabId>('cockpit');
  const [selected, setSelectedRaw] = useState<string | null>(null);
  const [side, setSide] = useState<'task' | 'planet'>('task');
  const [highlight, setHighlight] = useState<string[]>([]);
  const [extraArrows, setExtraArrows] = useState<MapArrow[]>([]);
  const [showArrows, setShowArrows] = useState(true);
  const [showHeat, setShowHeat] = useState(false);
  // Planetenwahl auf der Karte öffnet die Planetenakte, Abwahl kehrt zum Auftrag zurück.
  // Markierungen aus den Panels (MapFocus) wechseln die Ansicht nicht – sonst verschwände das Formular.
  const setSelected = setSelectedRaw;
  const pickPlanet = (id: string) =>
    setSelectedRaw((s) => {
      const next = s === id ? null : id;
      setSide(next ? 'planet' : 'task');
      return next;
    });

  const phaseNo = state.stage.kind === 'PHASE' ? state.stage.phase : null;
  const arrows = useMemo<MapArrow[]>(() => {
    if (!phaseNo || !showArrows) return [];
    const step = state.stage.kind === 'PHASE' ? state.stage.step : null;
    if (!step || !['OPS', 'REVEAL', 'EDIFICES', 'BATTLES', 'PROCESS'].includes(step)) return [];
    const ph = state.phases.find((p) => p.number === phaseNo);
    if (!ph) return [];
    return ph.operations.map((o) => opArrow(state, o)).filter((a): a is MapArrow => !!a);
  }, [state, phaseNo, showArrows]);

  // Fokus: steht eine Operation im Fokus (Formular, Zeiger), treten die übrigen Routen zurück;
  // sonst bleiben bei gewähltem Planeten (z. B. aus der Schlachtenliste) nur dessen Routen kräftig.
  const mapArrows = useMemo<MapArrow[]>(() => {
    if (extraArrows.length) return [...arrows.map((a) => ({ ...a, dim: true })), ...extraArrows];
    if (selected) return arrows.map((a) => (a.from === selected || a.to === selected ? a : { ...a, dim: true }));
    return arrows;
  }, [arrows, extraArrows, selected]);

  const heat = useMemo(() => {
    const h: Record<string, number> = {};
    for (const b of state.battles) if (b.planetId) h[b.planetId] = (h[b.planetId] ?? 0) + 1;
    return h;
  }, [state.battles]);

  const livePoints = useMemo(() => {
    const p: Record<string, number> = {};
    for (const a of state.alliances) p[a.id] = campaignPoints(state, a.id);
    return p;
  }, [state]);

  const openBattles = state.battles.filter((b) => b.phaseNumber === phaseNo && (b.status === 'SCHEDULED' || (b.status === 'PLAYED' && !b.victor))).length;

  const NAV: { id: TabId; label: string; icon: string; badge?: number }[] = [
    { id: 'cockpit', label: t('Lage & Cockpit'), icon: 'ui_PLANET' },
    { id: 'battles', label: t('Schlachten'), icon: 'op_BATTLE', badge: openBattles },
    { id: 'people', label: t('Allianzen & Spieler'), icon: 'em_crown' },
    { id: 'texts', label: t('Texte & Dekrete'), icon: 'ui_SCROLL' },
    { id: 'stats', label: t('Statistik'), icon: 'ui_TROPHY' },
    { id: 'log', label: t('Log & Würfel'), icon: 'ui_DICE' },
    { id: 'settings', label: t('Einstellungen'), icon: 'ui_COG' },
  ];

  // Mobil: Karte und Aufgabe des Cockpits sind getrennte Ansichten
  const [mView, setMView] = useState<'map' | 'task'>('task');
  const [more, setMore] = useState(false);
  const desktop = useIsDesktop();
  // Seitentitel je Kapitel und Kampagne (Browser-Tab, Verlauf, Screenreader)
  const tabTitle = NAV.find((n) => n.id === tab)?.label ?? '';
  useDocTitle(`${tabTitle} · ${state.meta.name} · Vespator Front`);
  const go = (id: TabId) => {
    // Planetenauswahl gehört zum Cockpit: beim Kapitelwechsel aufheben
    if (id !== tab) {
      setSelected(null);
      setSide('task');
    }
    setTab(id);
    setMore(false);
  };

  /** Kapitel-Tasten; `idp` trennt die Kennungen von Seitenleiste und mobilem „Mehr“-Blatt */
  const navList = (ids: TabId[], idp = 'chapter') => (
    <ul className="space-y-1.5" role="tablist" aria-orientation="vertical" aria-label={t('Kapitel')} onKeyDown={tabKeys(ids, ids.includes(tab) ? tab : ids[0], go, idp !== 'chapter')}>
      {NAV.filter((n) => ids.includes(n.id)).map((n) => (
        <li key={n.id} role="presentation">
          <button
            type="button"
            onClick={() => go(n.id)}
            role="tab"
            id={`${idp}-tab-${n.id}`}
            aria-controls={tab === n.id ? 'chapter-panel' : undefined}
            aria-selected={tab === n.id}
            tabIndex={tab === n.id || (!ids.includes(tab) && n.id === ids[0]) ? 0 : -1}
            className="navkey"
          >
            <GameIcon name={n.icon} size={20} color={tab === n.id ? '#f3e2b4' : '#b3975f'} />
            <span className="flex-1 truncate">{n.label}</span>
            {n.badge ? <span className="mr-4 rounded-[2px] bg-[#dda94d] px-1.5 font-mono text-[12px] text-black">{n.badge}</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );

  const controls = (
    <div className="space-y-2">
      {info.publicEnabled && (
        <a className="btn w-full justify-start" href={info.publicUrl} target="_blank" rel="noreferrer">
          <BookIcon size={18} className="text-brass" /> {t('Leseansicht öffnen')}
        </a>
      )}
      <div className="space-y-2">
        <div className="inset flex p-0.5" role="group" aria-label={t('Würfelmodus')}>
          {(['DIGITAL', 'MANUAL'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={diceMode === m}
              className={`min-h-11 flex-1 whitespace-nowrap rounded-[2px] px-2 text-[14px] lg:min-h-9 ${diceMode === m ? 'bg-[#262b28] font-semibold text-ink shadow-[inset_0_0_0_1px_rgba(179,151,95,0.6)]' : 'text-faint hover:text-dim'}`}
              onClick={() => setDiceMode(m)}
            >
              <DiceIcon size={15} className={diceMode === m ? 'text-brass' : ''} /> {m === 'DIGITAL' ? t('digital') : t('von Hand')}
            </button>
          ))}
        </div>
        <button className="btn btn-sm w-full" onClick={() => undo()} disabled={busy || readOnly} title={t('Letzte Aktion rückgängig machen')}>
          <UndoIcon /> {t('Rückgängig')}
          {saving && <span className="lamp lamp-on" role="status" aria-label={t('speichert')} />}
        </button>
      </div>
    </div>
  );

  const title = (
    <div>
      <h1 className="text-[17px] leading-tight">{state.meta.name}</h1>
      <p className="readout mt-0.5" data-stage>
        {stageLabel(state, t)}
      </p>
      {readOnly && <p className="mt-1 text-sm text-warn">{t('Archiviert – nur lesen')}</p>}
      {info.sandbox && (
        <div className="mt-2">
          <SandboxBar compact />
        </div>
      )}
    </div>
  );
  // Mobil: eine knappe Kontextzeile (Kampagne · Kampagnenphase); der Arbeitsschritt steht im Cockpit selbst.
  // Der volle Name bleibt im h1 (nur optisch gekürzt) und als Tooltip erhalten.
  const mobileTitle = (
    <div className="mb-3 flex min-w-0 items-baseline gap-2">
      <h1 className="min-w-0 flex-1 truncate text-[15px] leading-6" title={state.meta.name}>
        {state.meta.name}
      </h1>
      <span className="readout shrink-0 text-[14px]" data-stage>
        {state.stage.kind === 'PHASE' ? t('Phase {n}/{m}', { n: state.stage.phase, m: state.meta.phaseCount }) : state.stage.kind === 'SETUP' ? t('Setup') : stageLabel(state, t)}
      </span>
      {readOnly && <span className="shrink-0 text-[13px] text-warn">{t('nur lesen')}</span>}
    </div>
  );

  const map = (
    <CampaignMap
      fit
      state={state}
      selected={selected}
      highlight={highlight}
      arrows={mapArrows}
      heat={showHeat ? heat : undefined}
      points={state.pointsHistory.length ? state.pointsHistory[state.pointsHistory.length - 1].points : null}
      onPlanet={pickPlanet}
    />
  );

  /** Leiste unter der Karte: Filter und Punkte je Allianz (echte Daten) */
  const mapBar = (
    <div className="no-print flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pt-2 text-[14px] text-dim">
      <label className="touch-label inline-flex items-center gap-1.5">
        <input type="checkbox" className="accent-[#dda94d]" checked={showArrows} onChange={(e) => setShowArrows(e.target.checked)} /> {t('Operationen')}
      </label>
      <label className="touch-label inline-flex items-center gap-1.5">
        <input type="checkbox" className="accent-[#dda94d]" checked={showHeat} onChange={(e) => setShowHeat(e.target.checked)} /> {t('Umkämpft')}
      </label>
      <span className="ml-auto flex flex-wrap items-center gap-3" aria-label={t('Kampagnenpunkte')}>
        {state.alliances.map((a) => (
          <span key={a.id} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full shadow-[0_0_6px_currentColor]" style={{ background: a.color, color: a.color }} />
            <span className="text-ink">{a.name}</span> <b className="font-mono text-[15px] text-ink">{livePoints[a.id]}</b>
          </span>
        ))}
      </span>
    </div>
  );

  const task = state.stage.kind === 'SETUP' ? <SetupWizard /> : <PhaseCockpit />;

  /** Rechte Spalte: Auftrag oder Planetenakte */
  const sidePanel = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="tabbar mb-3" role="tablist" aria-label={t('Rechte Spalte')}>
        <button type="button" role="tab" aria-selected={side === 'task'} className="tabkey" onClick={() => setSide('task')}>
          <GameIcon name="ui_SCROLL" size={16} color="#b3975f" /> {t('Auftrag')}
        </button>
        <button type="button" role="tab" aria-selected={side === 'planet'} className="tabkey" onClick={() => setSide('planet')} disabled={!selected} title={selected ? undefined : t('Planet auf der Karte wählen')}>
          <GameIcon name="ui_PLANET" size={16} color="#b3975f" /> {t('Planetenakte')}
        </button>
      </div>
      <FadeScroll className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" tabIndex={0} role="region" aria-label={side === 'planet' ? t('Planetenakte') : t('Aufgabe')}>
        {side === 'planet' && selected ? <PlanetPanel planetId={selected} onClose={() => pickPlanet(selected)} /> : task}
      </FadeScroll>
    </div>
  );

  return (
    <CampaignInfoCtx.Provider value={info}>
      <MapFocusCtx.Provider value={{ selected, setSelected, highlight, setHighlight, extraArrows, setExtraArrows, openChapter: go }}>
        <FactionDatalist />
        {desktop && (
          <HeaderPortal>
            <HeaderStatus />
          </HeaderPortal>
        )}
        <FadeScroll
          className={`bay-grid ${tab === 'cockpit' ? 'bay-3' : ''} mx-auto h-[calc(100dvh-var(--hdr)-var(--mnav))] max-w-[1920px] overflow-y-auto px-2 pb-3 pt-3 sm:px-4 lg:grid lg:h-[calc(100dvh-var(--hdr))] lg:overflow-visible lg:grid-cols-[250px_minmax(0,1fr)_440px] lg:grid-rows-[minmax(0,1fr)] lg:gap-[var(--gap)] lg:px-[var(--gap)] lg:pb-[var(--gap)] lg:pt-[calc(var(--gap)+4px)] 2xl:grid-cols-[260px_minmax(0,1fr)_460px]`}
        >
          {/* Linke Leiste: Navigation, Kampagnenaufbau, Steuerung, Kathedrale */}
          <aside className="no-print hidden min-h-0 lg:block">
            <nav tabIndex={-1} className="hud frame flex h-full flex-col gap-3 overflow-hidden p-3 pt-4" aria-label={t('Kampagne')}>
              <div className="relative z-[1] shrink-0 space-y-4">
                {title}
                {navList(NAV.map((n) => n.id))}
              </div>
              {/* nur die Schrittfolge scrollt bei Platzmangel – Steuerung bleibt immer sichtbar */}
              <FadeScroll className="relative z-[1] min-h-0 shrink overflow-y-auto pr-0.5" tabIndex={0} role="region" aria-label={t('Schrittfolge')}>
                <StepList />
              </FadeScroll>
              <div className="relative z-[1] shrink-0">{controls}</div>
              {/* Kathedrale füllt nur freien Platz und verdrängt nichts */}
              <div
                aria-hidden
                className="pointer-events-none relative -mx-3 -mb-3 min-h-0 flex-1 bg-[url('/ui/cathedral.webp')] bg-[length:100%_auto] bg-bottom bg-no-repeat opacity-80 [mask-image:linear-gradient(180deg,transparent,#000_35%)]"
              />
              <CreditsLink locale={locale} className="relative z-[1] -mt-2 text-center" />
            </nav>
          </aside>

          <main
            id="chapter-panel"
            role="tabpanel"
            aria-labelledby={`chapter-tab-${tab}`}
            className={`flex min-h-full min-w-0 flex-col lg:col-span-2 lg:min-h-0 ${tab === 'cockpit' ? 'lg:grid lg:grid-cols-subgrid lg:grid-rows-[minmax(0,1fr)] lg:gap-[var(--gap)] lg:overflow-visible' : 'lg:block lg:overflow-visible'}`}
          >
            {!desktop && (
              <div className="lg:hidden">
                {mobileTitle}
                {info.sandbox && (
                  <div className="mb-3">
                    <SandboxBar compact />
                  </div>
                )}
              </div>
            )}
            {tab === 'cockpit' && (
              <>
                <section
                  className={`hud frame flex-col p-2 pt-6 sm:p-3 sm:pt-6 lg:flex lg:h-full lg:min-h-0 ${mView === 'map' ? 'flex h-[calc(100dvh-var(--hdr)-var(--mnav)-90px)]' : 'hidden'}`}
                  aria-label={t('Taktische Sektorkarte')}
                >
                  <span className="plate plate-head hidden lg:inline-flex">{t('Taktische Sektorkarte')}</span>
                  <Motto text={MOTTO.map} />
                  <div className="screen min-h-0 flex-1">
                    <SectorDecor name={mapOf(state).name} phase={stageLabel(state, t)} planets={mapOf(state).planets.length} />
                    {map}
                  </div>
                  {mapBar}
                </section>
                {desktop ? (
                  <section className="hud frame relative flex min-h-0 flex-col p-3 pt-6">
                    <span className="plate plate-head">{side === 'planet' && selected ? t('Planetenakte') : t('Auftrag')}</span>
                    <Motto text={MOTTO.orders} />
                    {sidePanel}
                  </section>
                ) : (
                  // Mobil: Aufgabe im selben Außengehäuse wie die übrigen Kapitel, bis zur unteren Leiste
                  <section className={`hud frame admin-flat mt-4 min-w-0 flex-1 p-2 pt-7 sm:p-3 sm:pt-7 ${mView === 'task' ? '' : 'hidden'}`} aria-label={t('Aufgabe')}>
                    <span className="plate plate-head max-w-[calc(100%-40px)] truncate">{t('Aufgabe')}</span>
                    <div className="relative z-[1] min-w-0 space-y-3">{task}</div>
                  </section>
                )}
              </>
            )}
            {tab !== 'cockpit' && (
              <section className="hud frame admin-flat mt-4 flex-1 p-2 pt-7 sm:p-3 sm:pt-7 lg:mt-0 lg:flex lg:h-full lg:flex-col lg:p-5 lg:pt-7">
                {/* Schild auf der Gehäusekante (auch mobil: Kapiteltitel, v. a. unter „Mehr“); der Inhalt scrollt darunter.
                    Mobil reicht das Gehäuse bis zur unteren Leiste. */}
                <span className="plate plate-head max-w-[calc(100%-40px)] truncate">{NAV.find((n) => n.id === tab)?.label}</span>
                <span className="emblem-watermark" aria-hidden />
                <FadeScroll className="relative z-[1] space-y-4 lg:-mr-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
                  {tab === 'battles' && <BattlesTab />}
                  {tab === 'people' && <PeopleTab />}
                  {tab === 'texts' && <TextsTab />}
                  {tab === 'stats' && <StatsView state={state} />}
                  {tab === 'log' && <LogTab revisions={revisions} snapshots={snapshots} />}
                  {tab === 'settings' && <SettingsTab info={info} />}
                </FadeScroll>
              </section>
            )}
          </main>
        </FadeScroll>

        {/* Mobil: Planetenakte als Blatt über der Leiste */}
        {selected && side === 'planet' && !desktop && tab === 'cockpit' && !more && (
          <DossierSheet planetId={selected} onClose={() => pickPlanet(selected)}>
            {/* Kopf (Name, Siegel, Schließen) liefert das Blatt */}
            <PlanetPanel planetId={selected} onClose={() => pickPlanet(selected)} head={false} />
          </DossierSheet>
        )}

        {/* Mobil: „Mehr“-Blatt mit restlichen Kapiteln, Schritten und Steuerung */}
        {more && !desktop && (
          <MoreSheet title={t('Weitere Kapitel')} onClose={() => setMore(false)}>
            <div className="space-y-5">
              {navList(['texts', 'stats', 'log', 'settings'], 'chapter-m')}
              <StepList />
              {controls}
              <CreditsLink locale={locale} className="border-t border-line/60 pt-3" />
            </div>
          </MoreSheet>
        )}

        <nav className="no-print fixed inset-x-0 bottom-0 z-50 grid h-[var(--mnav)] grid-cols-5 border-t border-brass/40 bg-[#0d1110] shadow-[0_-1px_0_#050707] lg:hidden" aria-label={t('Kampagne (mobil)')}>
          {(
            [
              [
                t('Karte'),
                'ui_PLANET',
                tab === 'cockpit' && mView === 'map' && !more,
                () => {
                  go('cockpit');
                  setMView('map');
                },
                0,
              ],
              [
                t('Aufgabe'),
                'ui_SCROLL',
                tab === 'cockpit' && mView === 'task' && !more,
                () => {
                  go('cockpit');
                  setMView('task');
                },
                0,
              ],
              [t('Schlachten'), 'op_BATTLE', tab === 'battles' && !more, () => go('battles'), openBattles],
              [t('Spieler'), 'em_crown', tab === 'people' && !more, () => go('people'), 0],
              [t('Mehr'), 'ui_COG', more || ['texts', 'stats', 'log', 'settings'].includes(tab), () => setMore((m) => !m), 0],
            ] as const
          ).map(([label, icon, on, act, badge]) => (
            <button
              key={label}
              type="button"
              onClick={act}
              aria-current={on ? 'page' : undefined}
              aria-expanded={icon === 'ui_COG' ? more : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 text-[12px] ${on ? 'text-accent' : 'text-dim'}`}
            >
              <GameIcon name={icon} size={22} color={on ? '#dda94d' : '#b3975f'} />
              {label}
              {on && <span className="absolute inset-x-5 top-0 h-0.5 bg-accent shadow-[0_0_6px_#dda94d]" aria-hidden />}
              {badge ? <span className="absolute right-3 top-1.5 rounded-[2px] bg-warn px-1 font-mono text-[10px] text-black">{badge}</span> : null}
            </button>
          ))}
        </nav>
      </MapFocusCtx.Provider>
    </CampaignInfoCtx.Provider>
  );
}

/** Dezente Kartenornamente und echte Kenndaten (keine Maus-/Touchereignisse) */
function SectorDecor({ name, phase, planets }: { name: string; phase: string; planets: number }) {
  const t = useT();
  return (
    <div aria-hidden className="sector-decor pointer-events-none absolute inset-0 z-0 hidden select-none lg:block">
      <div className="absolute left-5 top-5 h-[64px] w-[150px] bg-[url('/ui/emblem-winged.webp')] bg-contain bg-no-repeat opacity-[0.12] [filter:sepia(1)_hue-rotate(110deg)_saturate(2)]" />
      <svg className="absolute bottom-5 right-6 h-24 w-24 opacity-25" viewBox="-50 -50 100 100">
        <g fill="none" stroke="#5fa08c" strokeWidth="1">
          <circle r="30" />
          <circle r="22" strokeDasharray="2 3" />
          <path d="M0 -46 L6 -6 L0 0 L-6 -6 Z M0 46 L6 6 L0 0 L-6 6 Z M-46 0 L-6 -6 L0 0 L-6 6 Z M46 0 L6 -6 L0 0 L6 6 Z" fill="#37685b" fillOpacity="0.5" />
        </g>
      </svg>
      <div className="absolute bottom-4 left-5 font-mono text-[12px] leading-5 text-[#6fa593]">
        <div>{t('Sektor: {name}', { name })}</div>
        <div>{phase}</div>
        <div>{t('Welten: {n}', { n: planets })}</div>
        <div>{t('Zugriff: autorisiert')}</div>
      </div>
    </div>
  );
}

/** Datenabhängiger Kampagnenstatus in der Kopfzeile: Kampagnenphase und Schritt getrennt */
function HeaderStatus() {
  const { state } = useCmd();
  const t = useT();
  const locale = useLocale();
  return <StageProgress track={stageTrack(state, t)} locale={locale} />;
}

/** Setup- bzw. Phasenschritte als nummerierte Schrittfolge mit echtem Fortschritt */
function StepList() {
  const { state } = useCmd();
  const t = useT();
  let title: string;
  let items: { key: string; label: string; status: 'done' | 'current' | 'open' }[];
  if (state.stage.kind === 'SETUP') {
    const cur = SETUP_STEPS.indexOf(state.stage.step);
    title = t('Kampagnenaufbau');
    items = SETUP_STEPS.map((s, i) => ({ key: s, label: t(SETUP_NAMES[s]), status: i < cur ? 'done' : i === cur ? 'current' : 'open' }));
  } else if (state.stage.kind === 'PHASE') {
    const n = state.stage.phase;
    const ph = state.phases.find((p) => p.number === n)!;
    const cur = PHASE_STEPS.indexOf(state.stage.step);
    title = t('Schritte der Phase {n}', { n });
    items = PHASE_STEPS.map((s, i) => ({ key: s, label: t(STEP_NAMES[s]), status: i === cur ? 'current' : ph.stepStatus[s] === 'DONE' || i < cur ? 'done' : 'open' }));
  } else return null;
  return (
    <div>
      <p className="section-title">{title}</p>
      <ol className="space-y-0.5">
        {items.map((it, i) => (
          <li key={it.key} className={`flex items-center gap-2.5 text-[15px] ${it.status === 'current' ? 'font-semibold text-ink' : it.status === 'done' ? 'text-dim' : 'text-faint'}`}>
            <span
              aria-hidden
              className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full font-display text-[12px] font-bold ${
                it.status === 'current'
                  ? 'bg-[radial-gradient(circle_at_35%_35%,#ffe9b5,#dda94d_60%,#7a5418)] text-black shadow-[0_0_10px_rgba(221,169,77,0.7),0_0_0_2px_#b3975f]'
                  : it.status === 'done'
                    ? 'bg-[#1d2220] text-brass shadow-[inset_0_0_0_1px_#b3975f]'
                    : 'bg-[#121514] text-faint shadow-[inset_0_0_0_1px_#3a3a33]'
              }`}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
            {it.status === 'done' && <span className="sr-only">{t('(erledigt)')}</span>}
            {it.status === 'current' && <span className="sr-only">{t('(aktueller Schritt)')}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
