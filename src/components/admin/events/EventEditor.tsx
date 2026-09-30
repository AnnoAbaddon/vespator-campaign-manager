'use client';

import { useState } from 'react';
import { GameIcon } from '@/components/icons/GameIcon';
import { eventIcon } from '@/components/icons/registry';
import { BUILDABLE_TYPES, INFRA, type InfraType } from '@/engine/data/vespator';
import { eventName, eventSummary, needsPlanet, needsTarget } from '@/engine/customEvents';
import { effectText } from './customEventText';
import { archeotechCandidates, cultCandidates, mergedEventInput, type EventData } from '@/engine/events';
import { buildOptions } from '@/components/buildOptions';
import { adjacent, connectedPlanets } from '@/engine/graph';
import { house } from '@/engine/houseRules';
import { campaignPoints } from '@/engine/board';
import { currentAllianceOf, allianceOf } from '@/engine/players';
import type { EventRecord } from '@/engine/types';
import { AllianceTag, PlanetSelect, planetName } from '@/components/ui';
import { useMsg, useT } from '@/i18n/client';
import { useCmd } from '../CommandProvider';
import { planetIds } from '@/engine/map';

const CAT: Record<EventRecord['category'], string> = { FORTUNES: 'Fortunes of War', PERILS: 'Perils of Power', DESPERATE: 'Desperate Measures', CUSTOM: 'Eigenes Ereignis' };

function BuildPick({
  value,
  onChange,
  types = BUILDABLE_TYPES,
  planets,
}: {
  value: { type: InfraType; planetId: string } | null | undefined;
  onChange: (v: { type: InfraType; planetId: string } | null) => void;
  types?: InfraType[];
  planets: string[];
}) {
  const t = useT();
  return (
    <div className="grid gap-2 @lg:grid-cols-2">
      <select className="select" value={value?.type ?? ''} aria-label={t('Bau')} onChange={(e) => onChange(e.target.value ? { type: e.target.value as InfraType, planetId: value?.planetId ?? '' } : null)}>
        <option value="">{t('– kein Bau –')}</option>
        {types.map((x) => (
          <option key={x} value={x}>
            {INFRA[x].name}
          </option>
        ))}
      </select>
      {value && <PlanetSelect value={value.planetId} options={planets} onChange={(p) => onChange({ ...value, planetId: p })} />}
    </div>
  );
}

/** Neu aufbauen, sobald Spieler etwas eintragen – ihre Eingaben stehen dann vorbelegt im Formular */
export function EventEditor({ event }: { event: EventRecord }) {
  return <EventEditorInner key={JSON.stringify(event.inputs ?? [])} event={event} />;
}

function EventEditorInner({ event }: { event: EventRecord }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const msg = useMsg();
  // verdeckte Spielereingaben (EVENT_INPUT) als Vorbelegung; der Warmaster kann sie vor dem Anwenden ändern
  const [data, setData] = useState<EventData>(() => (event.status === 'PENDING' ? mergedEventInput(event) : {}));
  const inputNames = [...new Set((event.inputs ?? []).map((i) => state.players.find((p) => p.id === i.playerId)?.nickname ?? '?'))];
  const n = event.phaseNumber;
  const al = state.alliances.find((a) => a.id === event.allianceId);
  const alive = planetIds(state).filter((id) => !state.planets.find((p) => p.id === id)?.destroyed);
  const set = (p: Partial<EventData>) => setData((d) => ({ ...d, ...p }));
  const applied = event.status === 'APPLIED';

  let form: React.ReactNode = <p className="text-[15px] text-dim">{t('Keine Entscheidungen nötig.')}</p>;
  if (!applied) {
    switch (event.code) {
      case 'CUSTOM': {
        // D2: Bausteine anzeigen; Ziel-Allianz und Planet wählen, soweit die Bausteine sie brauchen
        const fx = event.custom?.effects ?? [];
        form = (
          <div className="space-y-2 text-[15px]">
            <ul className="list-disc space-y-0.5 pl-5 text-dim">
              {fx.map((x, i) => (
                <li key={i}>{effectText(x, state, t)}</li>
              ))}
            </ul>
            {needsTarget(fx) && (
              <select className="select" value={data.targetAllianceId ?? event.allianceId ?? ''} aria-label={t('Ziel-Allianz')} onChange={(e) => set({ targetAllianceId: e.target.value || undefined })}>
                <option value="">{t('– Ziel-Allianz –')}</option>
                {state.alliances.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
            {needsPlanet(fx) && <PlanetSelect value={data.planetId} options={alive} placeholder={t('– Planet –')} onChange={(p) => set({ planetId: p || undefined })} />}
          </div>
        );
        break;
      }
      case 'FW_11':
        form = (
          <div className="space-y-3">
            {state.alliances.map((a) => (
              <div key={a.id} className="inset space-y-2 p-2">
                <AllianceTag alliance={a} />
                {(() => {
                  // nur gültige Bauoptionen (Limit, freie Location)
                  const cur = data.builds?.[a.id];
                  const o = buildOptions(state, a.id, alive, { type: cur?.type, planetId: cur?.planetId });
                  return <BuildPick value={cur} types={o.types} planets={o.planets} onChange={(v) => set({ builds: { ...data.builds, [a.id]: v } })} />;
                })()}
                {state.fleets
                  .filter((f) => f.allianceId === a.id && f.planetId)
                  .map((f) => (
                    <label key={f.id} className="flex flex-wrap items-center gap-2 text-[15px]">
                      <span className="w-40">{f.name}</span>
                      <PlanetSelect
                        value={data.moves?.[f.id]}
                        options={connectedPlanets(state, a.id, f.planetId!, n, 'move')}
                        placeholder={t('bleibt ({planet})', { planet: planetName(f.planetId) })}
                        className="w-auto flex-1"
                        onChange={(p) => set({ moves: { ...data.moves, [f.id]: p || null } })}
                      />
                    </label>
                  ))}
              </div>
            ))}
          </div>
        );
        break;
      case 'FW_13':
        // Tides of War: Die Allianzen verlegen in der Reihenfolge ihrer Kampagnenpunkte (höchste zuerst)
        form = (
          <div className="space-y-2">
            <p className="text-[14px] text-dim">{t('Reihenfolge nach Kampagnenpunkten (höchste zuerst, Gleichstand: Roll-off).')}</p>
            {[...state.alliances]
              .sort((x, y) => campaignPoints(state, y.id) - campaignPoints(state, x.id))
              .map((a) => {
                const cur = state.planets.find((p) => p.slots.some((s) => !s.destroyed && s.infra?.type === 'STRONGHOLD' && s.infra.allianceId === a.id))?.id;
                return (
                  <label key={a.id} className="flex flex-wrap items-center gap-2 text-[15px]">
                    <AllianceTag alliance={a} className="w-40" />
                    <span className="w-20 font-mono text-[13px] text-faint">{t('{n} Pkt.', { n: campaignPoints(state, a.id) })}</span>
                    {cur ? (
                      <PlanetSelect
                        value={data.stronghold?.[a.id]}
                        options={alive.filter((p) => p !== cur)}
                        placeholder={t('bleibt auf {planet}', { planet: planetName(cur) })}
                        className="w-auto flex-1"
                        onChange={(p) => set({ stronghold: { ...data.stronghold, [a.id]: p || null } })}
                      />
                    ) : (
                      <span className="text-faint">{t('kein intakter Stronghold')}</span>
                    )}
                  </label>
                );
              })}
          </div>
        );
        break;
      case 'FW_22': {
        const c = archeotechCandidates({ state });
        const chosen = data.planetIds ?? [];
        form = (
          <div className="space-y-2 text-[15px]">
            <p>{t('Sicher: {list}', { list: c.sure.map(planetName).join(', ') || '–' })}</p>
            {c.need > 0 && (
              <>
                <p>{t('Gleichstand – {n} wählen (leer = auslosen):', { n: c.need })}</p>
                {c.tied.map((p) => (
                  <label key={p} className="mr-3 inline-flex items-center gap-1">
                    <input type="checkbox" checked={chosen.includes(p)} onChange={(e) => set({ planetIds: e.target.checked ? [...chosen, p] : chosen.filter((x) => x !== p) })} /> {planetName(p)}
                  </label>
                ))}
              </>
            )}
          </div>
        );
        break;
      }
      case 'FW_31':
        form = (
          <div className="space-y-2">
            {state.fleets
              .filter((f) => f.planetId)
              .map((f) => (
                <label key={f.id} className="flex flex-wrap items-center gap-2 text-[15px]">
                  <span className="w-48">
                    {f.name} <span className="text-faint">({planetName(f.planetId)})</span>
                  </span>
                  <PlanetSelect
                    value={data.positions?.[f.id]}
                    options={planetIds(state).filter((p) => p !== f.planetId && !adjacent(p, f.planetId!))}
                    placeholder={t('– Pflicht –')}
                    label={t('{fleet}: neuer Planet', { fleet: f.name })}
                    className="w-auto flex-1"
                    onChange={(p) => set({ positions: { ...data.positions, [f.id]: p } })}
                  />
                </label>
              ))}
          </div>
        );
        break;
      case 'FW_32': {
        const def2 = data.defections ?? {};
        const after = (pid: string) => def2[pid] ?? currentAllianceOf(state.players.find((p) => p.id === pid)!);
        form = (
          <div className="space-y-3">
            <div>
              <p className="label">{t('Überläufer (ab Phase {n})', { n: n + 1 })}</p>
              {state.players
                .filter((p) => p.active)
                .map((p) => (
                  <label key={p.id} className="flex flex-wrap items-center gap-2 py-0.5 text-[15px]">
                    <span className="w-40">{p.nickname}</span>
                    <select
                      className="select w-auto flex-1"
                      value={def2[p.id] ?? ''}
                      onChange={(e) => {
                        const next = { ...def2 };
                        if (e.target.value) next[p.id] = e.target.value;
                        else delete next[p.id];
                        set({ defections: next });
                      }}
                    >
                      <option value="">{t('bleibt ({alliance})', { alliance: state.alliances.find((a) => a.id === allianceOf(p, n))?.name ?? '–' })}</option>
                      {state.alliances
                        .filter((a) => a.id !== allianceOf(p, n))
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            → {a.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
            </div>
            <div>
              <p className="label">{t('Flottenzuordnung ab Phase {n} (optional)', { n: n + 1 })}</p>
              {state.fleets.map((f) => (
                <label key={f.id} className="flex flex-wrap items-center gap-2 py-0.5 text-[15px]">
                  <span className="w-48">{f.name}</span>
                  <select
                    className="select w-auto flex-1"
                    value={data.fleetAssignments?.[f.id] ?? ''}
                    onChange={(e) => set({ fleetAssignments: { ...Object.fromEntries(Object.entries(data.fleetAssignments ?? {}).filter(([k]) => k !== f.id)), ...(e.target.value ? { [f.id]: e.target.value } : {}) } })}
                  >
                    <option value="">{t('automatisch')}</option>
                    {state.players
                      .filter((p) => p.active && after(p.id) === f.allianceId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nickname}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        );
        break;
      }
      case 'PP_1': {
        const cands = event.allianceId ? cultCandidates({ state }, event.allianceId) : [];
        form = <PlanetSelect value={data.planetId ?? (cands.length === 1 ? cands[0] : undefined)} options={cands} placeholder={t('– Ort des Aufstands –')} onChange={(p) => set({ planetId: p || undefined })} />;
        break;
      }
      case 'DM_1': {
        const ok = alive.filter((pid) => !state.planets.find((p) => p.id === pid)!.slots.some((s) => !s.destroyed && s.infra?.type === 'STRONGHOLD' && s.infra.allianceId !== event.allianceId));
        form = (
          <div className="grid gap-2 @lg:grid-cols-2">
            <PlanetSelect value={data.planetId} options={ok} onChange={(p) => set({ planetId: p || undefined })} />
            <select className="select" value={data.opponentId ?? ''} aria-label={t('Gegner')} onChange={(e) => set({ opponentId: e.target.value || undefined })}>
              <option value="">{t('– Gegner –')}</option>
              {state.alliances
                .filter((a) => a.id !== event.allianceId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {data.planetId ? ` (PL ${state.planets.find((p) => p.id === data.planetId)?.power[a.id]} ↔ ${state.planets.find((p) => p.id === data.planetId)?.power[event.allianceId!]})` : ''}
                  </option>
                ))}
            </select>
          </div>
        );
        break;
      }
      case 'DM_3': {
        // B12: mit Hausregel F-13 bleibt der Stronghold stehen – nicht zum Verlegen anbieten
        const fixed = house(state, 'F13_STRONGHOLD_FIXED');
        const pieces = state.planets.flatMap((p) => p.slots.map((s, i) => ({ p: p.id, i, s })).filter(({ s }) => !s.destroyed && s.infra?.allianceId === event.allianceId && !(fixed && s.infra.type === 'STRONGHOLD')));
        const rel = data.relocations ?? [];
        form = (
          <div className="space-y-3">
            <div>
              <p className="label">{t('Infrastruktur verlegen')}</p>
              {pieces.map(({ p, i, s }) => {
                const cur = rel.find((r) => r.fromPlanetId === p && r.slot === i);
                return (
                  <label key={`${p}-${i}`} className="flex flex-wrap items-center gap-2 py-0.5 text-[15px]">
                    <span className="w-56">{t('{infra} auf {planet}', { infra: INFRA[s.infra!.type].name, planet: planetName(p) })}</span>
                    <PlanetSelect
                      value={cur?.toPlanetId}
                      options={alive.filter((x) => x !== p)}
                      placeholder={t('bleibt')}
                      className="w-auto flex-1"
                      onChange={(to) => set({ relocations: [...rel.filter((r) => !(r.fromPlanetId === p && r.slot === i)), ...(to ? [{ fromPlanetId: p, slot: i, toPlanetId: to }] : [])] })}
                    />
                  </label>
                );
              })}
            </div>
            <div>
              <p className="label">{t('Zusätzlicher Bau')}</p>
              {(() => {
                // nur gültige Bauoptionen (Limit, freie Location; kein Stronghold)
                const o = buildOptions(state, event.allianceId ?? '', alive, { type: data.extra?.type, planetId: data.extra?.planetId });
                return <BuildPick value={data.extra} types={o.types} planets={o.planets} onChange={(v) => set({ extra: v })} />;
              })()}
            </div>
          </div>
        );
        break;
      }
    }
  }

  return (
    <div className={`slab border p-3 ${applied ? 'border-ok/30' : 'border-warn/50'}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="chip">{t(CAT[event.category])}</span>
        <b className="inline-flex items-center gap-1.5">
          <GameIcon name={eventIcon(event.code)} size={22} color="#e0b95c" /> {eventName(event)}
        </b>
        {event.forced && <span className="chip border-danger text-danger">{t('erzwungen (Override)')}</span>}
        {al && <AllianceTag alliance={al} />}
        <span className={`chip ml-auto ${applied ? 'border-ok text-ok' : 'border-warn text-warn'}`}>{applied ? t('angewendet') : t('offen')}</span>
      </div>
      <p className="mb-3 whitespace-pre-line text-[15px] text-dim">{msg(eventSummary(event))}</p>
      {!applied && inputNames.length > 0 && <p className="notice mb-3">{t('Eingaben der Spieler vorbelegt: {names}', { names: inputNames.join(', ') })}</p>}
      {applied ? (
        <ul className="font-mono text-[13px] text-dim">
          {event.applied.map((l, i) => (
            <li key={i}>{msg(l)}</li>
          ))}
        </ul>
      ) : (
        <div className="space-y-3">
          {form}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={busy} onClick={() => run({ type: 'EVENT_APPLY', eventId: event.id, data: cleanData(data) })}>
              {t('Anwenden')}
            </button>
            <button className="btn btn-danger" disabled={busy} onClick={() => run({ type: 'EVENT_DISCARD', eventId: event.id })}>
              {t('Verwerfen (Override)')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function cleanData(d: EventData): EventData {
  const out: EventData = { ...d };
  if (out.builds) out.builds = Object.fromEntries(Object.entries(out.builds).filter(([, v]) => v && v.planetId));
  if (out.extra && !out.extra.planetId) out.extra = null;
  if (out.planetIds && !out.planetIds.length) delete out.planetIds;
  return out;
}
