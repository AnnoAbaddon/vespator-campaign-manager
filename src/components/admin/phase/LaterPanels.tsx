'use client';

import { useState } from 'react';
import { INFRA, type InfraType } from '@/engine/data/vespator';
import { campaignPoints, canBuild, powerSum } from '@/engine/board';
import { dominating, trailing } from '@/engine/events';
import { connectedFor } from '@/engine/graph';
import { buildablePlanets, moveOptions } from '@/engine/phase';
import type { Phase } from '@/engine/types';
import { AllianceTag, Empty, Panel, PlanetSelect, planetName } from '@/components/ui';
import { useMsg, useT } from '@/i18n/client';
import { useCmd } from '../CommandProvider';
import { useMapFocus } from '../mapFocus';
import { EventEditor } from '../events/EventEditor';
import { CustomEventTools } from '../gm/CustomEventTools';
import { RuleHint } from './StepPanels';
import { planetIds } from '@/engine/map';
import { GameIcon } from '@/components/icons/GameIcon';
import { buildOptions } from '@/components/buildOptions';
import { house } from '@/engine/houseRules';

export function PointsTable({ phase }: { phase: Phase }) {
  const { state } = useCmd();
  const t = useT();
  const entry = state.pointsHistory.find((p) => p.phaseNumber === phase.number);
  const prev = [...state.pointsHistory].filter((p) => p.phaseNumber < phase.number).pop();
  return (
    <table className="table">
      <thead>
        <tr>
          <th>{t('Allianz')}</th>
          <th>Σ PL</th>
          <th>Stronghold</th>
          <th>{t('Punkte')}</th>
          <th>Δ</th>
        </tr>
      </thead>
      <tbody>
        {state.alliances.map((a) => {
          const pts = entry?.points[a.id] ?? campaignPoints(state, a.id);
          const d = prev ? pts - prev.points[a.id] : null;
          return (
            <tr key={a.id}>
              <td>
                <AllianceTag alliance={a} />
              </td>
              <td>{entry?.powerSum[a.id] ?? powerSum(state, a.id)}</td>
              <td>{a.strongholdDestroyed ? <span className="text-danger">{t('zerstört')}</span> : '+3'}</td>
              <td className="font-semibold">
                {pts}
                {!entry && <span className="ml-1 text-[13px] text-faint">{t('(vorläufig)')}</span>}
              </td>
              <td className={d === null ? '' : d > 0 ? 'text-ok' : d < 0 ? 'text-danger' : 'text-faint'}>{d === null ? '–' : d > 0 ? `+${d}` : d}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function ResultsPanel({ phase }: { phase: Phase }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const last = phase.number >= state.meta.phaseCount;
  const entry = state.pointsHistory.find((p) => p.phaseNumber === phase.number);
  const events = state.events.filter((e) => e.phaseNumber === phase.number);
  const ev = state.toggles.events;
  // D2: eingeplante eigene Ereignisse brauchen das Generieren auch ohne Regelbuch-Events
  const anyEvents = ev.fortunesOfWar || ev.perilsOfPower || ev.desperateMeasures || (state.customEvents ?? []).some((d) => d.phase === phase.number);
  const dom = entry ? dominating(entry.points) : null;
  const trail = entry ? trailing(entry.points) : null;
  const name = (id: string | null) => state.alliances.find((a) => a.id === id)?.name;
  return (
    <div className="space-y-3">
      <Panel
        title={`3 · ${t('Punkte')}`}
        icon={<GameIcon name="ui_TROPHY" size={18} />}
        actions={
          <button className={`btn ${phase.flags.scored ? '' : 'btn-primary'}`} disabled={busy || phase.flags.eventsGenerated} onClick={() => run({ type: 'SCORE' })}>
            {phase.flags.scored ? t('Neu berechnen') : t('Punkte berechnen')}
          </button>
        }
      >
        <PointsTable phase={phase} />
        {entry && (dom || trail) && (
          <p className="notice mt-2">
            {dom && `${t('{name} dominiert (> 5 Punkte vorn).', { name: name(dom) })} `}
            {trail && t('{name} liegt zurück (> 5 Punkte hinten).', { name: name(trail) })}
          </p>
        )}
      </Panel>
      {last ? (
        <Panel title={t('Letzte Phase')} icon={<GameIcon name="me_LAUREL" size={18} />}>
          <p className="mb-3 text-[15px]">{t('Nach dem Festschreiben der Punkte endet die Kampagne. Es gibt keine Events und keine Schritte 4/5.')}</p>
          <button
            className={`btn ${phase.flags.scored ? 'btn-primary' : ''}`}
            disabled={busy || !phase.flags.scored}
            onClick={() => run({ type: 'CAMPAIGN_END' }, { confirm: t('Kampagne jetzt beenden? Sieger und Medaillen werden festgestellt (Undo bleibt möglich).') })}
          >
            {t('Kampagne beenden')}
          </button>
        </Panel>
      ) : (
        <Panel
          title="Vespator Front Events"
          icon={<GameIcon name="ui_DICE" size={18} />}
          actions={
            anyEvents &&
            !phase.flags.eventsGenerated && (
              <button className={`btn ${phase.flags.scored ? 'btn-primary' : ''}`} disabled={busy || !phase.flags.scored} onClick={() => run({ type: 'EVENTS_GENERATE' })}>
                {t('Events generieren')}
              </button>
            )
          }
        >
          {!anyEvents && <p className="text-[15px] text-dim">{t('Events sind in dieser Kampagne deaktiviert.')}</p>}
          {anyEvents && !phase.flags.eventsGenerated && <RuleHint>
              {house(state, 'A6_HANDICAP_NO_TEST')
                ? t('Reihenfolge: Perils of Power (dominierend, ohne Würfeltest – Hausregel A6), Desperate Measures (zurückliegend, ohne Würfeltest), Fortunes of War (4+, ab Phase 4 +1).')
                : t('Reihenfolge: Perils of Power (dominierend, 4+), Desperate Measures (zurückliegend, 4+), Fortunes of War (4+, ab Phase 4 +1).')}
            </RuleHint>}
          {phase.flags.eventsGenerated && !events.length && <Empty>{t('Keine Events in dieser Phase.')}</Empty>}
          <div className="space-y-3">
            {events.map((e) => (
              <EventEditor key={e.id} event={e} />
            ))}
          </div>
          <CustomEventTools phase={phase} />
        </Panel>
      )}
    </div>
  );
}

export function MovePanel({ phase }: { phase: Phase }) {
  return <MovePanelInner key={JSON.stringify(phase.moves)} phase={phase} />;
}

function MovePanelInner({ phase }: { phase: Phase }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const focus = useMapFocus();
  const n = phase.number;
  const [draft, setDraft] = useState<Record<string, string[]>>(phase.moves);
  const all = planetIds(state);
  // Übersicht: wer zieht wohin, wer bleibt, wer hat noch nichts abgegeben (Kommandant der Phase)
  const fleets = state.fleets.filter((f) => f.planetId && !f.reserve);
  const moving = fleets.filter((f) => (phase.moves[f.id] ?? []).length > 0);
  const staying = fleets.filter((f) => f.id in phase.moves && !(phase.moves[f.id] ?? []).length);
  const open = fleets.filter((f) => !(f.id in phase.moves) && !phase.noMoveFleets.includes(f.id));
  const cmdName = (fid: string) => {
    const f = state.fleets.find((x) => x.id === fid);
    return state.players.find((p) => p.id === f?.commanders[String(n)])?.nickname ?? null;
  };
  return (
    <Panel
      title={`4 · ${t('Flotten bewegen')}`}
      icon={<GameIcon name="ui_FLEET" size={18} />}
      actions={
        !phase.flags.movesApplied && (
          <button className="btn btn-primary" disabled={busy} onClick={() => run({ type: 'MOVES_APPLY' })}>
            {t('Bewegungen ausführen')}
          </button>
        )
      }
    >
      <RuleHint>{t('Eingaben sind verdeckt, bis sie ausgeführt werden. Ziel: verbundener Planet (Support Facilities zählen), zerstörte Planeten erlaubt.')}</RuleHint>
      {phase.flags.movesApplied && <p className="notice notice-ok mb-2">{t('Ausgeführt.')}</p>}
      <div className="inset mb-2 space-y-1 p-2.5 text-[15px]">
        <p>
          <b>{t('{k} von {n} Flotten ziehen', { k: moving.length, n: fleets.length })}</b>
          {moving.length > 0 && `: ${moving.map((f) => `${f.name} → ${(phase.moves[f.id] ?? []).map((p) => planetName(p)).join(' → ')}`).join(' · ')}`}
        </p>
        <p className="text-dim">
          {t('{n} bleiben stehen', { n: staying.length })}
          {phase.noMoveFleets.length > 0 && ` · ${t('{n} gesperrt (Boarding Action)', { n: phase.noMoveFleets.length })}`}
        </p>
        {!phase.flags.movesApplied && (
          <p className={open.length ? 'text-warn' : 'text-ok'}>
            {open.length ? t('Noch ohne Eingabe: {list}', { list: open.map((f) => (cmdName(f.id) ? `${f.name} (${cmdName(f.id)})` : f.name)).join(', ') }) : t('Alle Bewegungen abgegeben.')}
          </p>
        )}
      </div>
      <div className="space-y-2">
        {state.fleets
          .filter((f) => f.planetId)
          .map((f) => {
            // gleiche Regeln wie die Engine (moveOptions): Sperre durch Boarding Action, zweiter Zug nur mit Star of the Voidfarer
            const mo = moveOptions(state, f.id, n);
            const blocked = !mo.allowed;
            const star = mo.maxHops === 2;
            const path = draft[f.id] ?? [];
            const hop1 = mo.firstHops;
            const hop2 = path[0] ? all.filter((id) => connectedFor(state, f.allianceId, path[0], id, n, 'move')) : [];
            const save = async (p: string[]) => {
              const before = draft[f.id];
              setDraft((d) => ({ ...d, [f.id]: p }));
              // bei Ablehnung durch die Engine den Entwurf zurücksetzen
              if (!(await run({ type: 'MOVE_SET', fleetId: f.id, path: p }, { silent: true }))) setDraft((d) => ({ ...d, [f.id]: before ?? phase.moves[f.id] ?? [] }));
            };
            return (
              <div key={f.id} className="slab flex flex-wrap items-center gap-2 p-2.5 text-[15px]">
                <span className="min-w-40 flex-1 basis-40">
                  <span className={`lamp mr-1.5 inline-block align-middle ${f.id in phase.moves || blocked ? 'lamp-ok' : ''}`} aria-hidden />
                  <b>{f.name}</b> <span className="text-faint">@ {planetName(f.planetId)}</span>
                  <span className="sr-only">{f.id in phase.moves ? t('abgegeben') : t('offen')}</span>
                </span>
                <AllianceTag alliance={state.alliances.find((a) => a.id === f.allianceId)} />
                {blocked ? (
                  <span className="chip border-danger text-danger">{t('darf nicht ziehen (Boarding Action)')}</span>
                ) : (
                  <span className="flex flex-1 flex-wrap gap-2" onFocus={() => focus.setHighlight(hop1)}>
                    <PlanetSelect value={path[0]} options={hop1} placeholder={t('– bleibt –')} className="w-auto min-w-40 flex-1" disabled={phase.flags.movesApplied || busy} onChange={(p) => save(p ? [p] : [])} />
                    {star && path[0] && (
                      <PlanetSelect
                        value={path[1]}
                        options={hop2}
                        placeholder={t('– 2. Zug (Star of the Voidfarer) –')}
                        className="w-auto min-w-40 flex-1"
                        disabled={phase.flags.movesApplied || busy}
                        onChange={(p) => save(p ? [path[0], p] : [path[0]])}
                      />
                    )}
                  </span>
                )}
              </div>
            );
          })}
      </div>
    </Panel>
  );
}

export function BuildPanel({ phase }: { phase: Phase }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const msg = useMsg();
  const [pick, setPick] = useState<Record<string, { type: InfraType | ''; planetId: string }>>({});
  const n = phase.number;
  const byPoints = house(state, 'F1_BUILD_ORDER_POINTS');
  return (
    <Panel
      title={`5 · ${t('Infrastruktur bauen')}`}
      icon={<GameIcon name="in_STRONGHOLD" size={18} />}
      actions={
        !phase.flags.buildStarted && (
          <button className="btn btn-primary" disabled={busy} onClick={() => run({ type: 'BUILD_START' })}>
            {t('Reihenfolge bestimmen')}
          </button>
        )
      }
    >
      <RuleHint>
        {byPoints
          ? t('Reihenfolge nach Kampagnenpunkten (Hausregel F-1, Roll-off bei Gleichstand). Je Allianz ein Stück (kein Stronghold) auf einem Planeten mit eigener Flotte oder verbunden.')
          : t('Reihenfolge nach Σ Power Level (Roll-off bei Gleichstand). Je Allianz ein Stück (kein Stronghold) auf einem Planeten mit eigener Flotte oder verbunden.')}
      </RuleHint>
      {phase.flags.buildStarted && (
        <ol className="space-y-2">
          {phase.buildOrder.map((aid, i) => {
            const a = state.alliances.find((x) => x.id === aid);
            const done = phase.builds[aid];
            const turn = !done && phase.buildOrder.slice(0, i).every((x) => phase.builds[x]);
            const p = pick[aid] ?? { type: '', planetId: '' };
            // nur gültige Optionen (SPEC 9.11)
            const opts = buildOptions(state, aid, buildablePlanets({ state }, aid, n), p);
            const err = p.type && p.planetId ? canBuild(state, aid, p.type, p.planetId) : null;
            return (
              <li key={aid} className="slab p-2.5" data-active={turn ? 'true' : undefined} data-done={done ? 'true' : undefined}>
                <div className="flex flex-wrap items-center gap-2 text-[15px]">
                  <span className="font-mono">{i + 1}.</span>
                  <AllianceTag alliance={a} />
                  {/* B16: mit F-1 entscheiden die Kampagnenpunkte */}
                  <span className="text-faint">{byPoints ? t('{n} Punkte', { n: campaignPoints(state, aid) }) : `Σ PL ${powerSum(state, aid)}`}</span>
                  {done && <span className="chip border-ok text-ok">{done === 'SKIP' ? t('verzichtet') : t('{infra} auf {planet}', { infra: INFRA[done.type].name, planet: planetName(done.planetId) })}</span>}
                </div>
                {turn && (
                  <div className="mt-2 grid gap-2 @lg:grid-cols-2">
                    <select
                      className="select"
                      value={p.type}
                      aria-label={t('{alliance}: Infrastruktur', { alliance: a?.name ?? '' })}
                      onChange={(e) => setPick({ ...pick, [aid]: { ...p, type: e.target.value as InfraType } })}
                    >
                      <option value="">{t('– Typ –')}</option>
                      {opts.types.map((x) => (
                        <option key={x} value={x}>
                          {INFRA[x].name}
                        </option>
                      ))}
                    </select>
                    <PlanetSelect value={p.planetId} options={opts.planets} onChange={(v) => setPick({ ...pick, [aid]: { ...p, planetId: v } })} />
                    <button
                      className="btn btn-primary"
                      disabled={busy || !p.type || !p.planetId || !!err}
                      onClick={() => run({ type: 'BUILD_SET', allianceId: aid, choice: { type: p.type as InfraType, planetId: p.planetId } })}
                    >
                      {t('Bauen')}
                    </button>
                    <button className="btn" disabled={busy} onClick={() => run({ type: 'BUILD_SET', allianceId: aid, choice: 'SKIP' })}>
                      {t('Verzichten')}
                    </button>
                    {err && <p className="notice @lg:col-span-2">{msg(err)}</p>}
                    {(opts.atLimit.length > 0 || opts.full.length > 0) && (
                      <p className="text-[13px] text-faint @lg:col-span-2">
                        {[opts.atLimit.length ? t('am Limit: {list}', { list: opts.atLimit.join(', ') }) : '', opts.full.length ? t('voll: {list}', { list: opts.full.join(', ') }) : ''].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
