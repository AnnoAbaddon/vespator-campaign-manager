'use client';

import { useState } from 'react';
import { INFRA, type InfraType } from '@/engine/data/vespator';
import { eventName, eventSummary } from '@/engine/customEvents';
import { archeotechCandidates, cultCandidates, eventInputRights, type EventData } from '@/engine/events';
import { house } from '@/engine/houseRules';
import { connectedFor } from '@/engine/graph';
import { adjacent, planetIds } from '@/engine/map';
import { strongholdPlanet } from '@/engine/board';
import { allianceOf } from '@/engine/players';
import type { EventRecord, Player } from '@/engine/types';
import { PlanetSelect, planetName } from '@/components/ui';
import { buildOptions } from '@/components/buildOptions';
import { useCmd } from '@/components/admin/CommandProvider';
import { useMsg, useT } from '@/i18n/client';

/**
 * Event-Entscheidungen über den Spielerlink (EVENT_INPUT): Anführer bauen bzw. verlegen den Stronghold,
 * Kommandanten ziehen ihre Flotten (Lull) oder wählen verdeckt einen Zielplaneten (Xenobeast), jeder Spieler
 * kann einen Überläuferwunsch melden (Machinations). Wirksam erst, wenn der Warmaster das Event anwendet.
 */
export function EventInputs({ me }: { me: Player }) {
  const { state } = useCmd();
  const n = state.stage.kind === 'PHASE' && state.stage.step === 'RESULTS' ? state.stage.phase : null;
  if (!n) return null;
  const events = state.events.filter((e) => e.phaseNumber === n && e.status === 'PENDING');
  return (
    <>
      {events.map((e) => (
        <EventCard key={e.id} event={e} me={me} />
      ))}
    </>
  );
}

function EventCard({ event: e, me }: { event: EventRecord; me: Player }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const msg = useMsg();
  const r = eventInputRights(state, e.id, me.id);
  const mine = (e.inputs ?? []).find((i) => i.playerId === me.id)?.data ?? {};
  const [d, setD] = useState<EventData>(mine);
  const any = r.builds.length || r.moves.length || r.stronghold.length || r.positions.length || r.defection || r.bargain || r.smuggled || r.archeotech || r.cult;
  if (!any) return null;
  const n = e.phaseNumber;
  const alive = planetIds(state).filter((id) => !state.planets.find((p) => p.id === id)?.destroyed);
  const fleet = (id: string) => state.fleets.find((f) => f.id === id)!;
  const al = (id: string) => state.alliances.find((a) => a.id === id);
  const myAl = allianceOf(me, n);
  const send = (data: EventData) => run({ type: 'EVENT_INPUT', eventId: e.id, playerId: me.id, data });
  const sent = Object.keys(mine).length > 0;
  return (
    <section className="hud space-y-3 p-3 text-[15px]">
      <p className="section-title">{t('Event: {name}', { name: eventName(e) })}</p>
      <p className="text-dim">{msg(eventSummary(e))}</p>
      {r.builds.map((a) => {
        const cur = d.builds?.[a] ?? null;
        const o = buildOptions(state, a, alive, { type: cur?.type, planetId: cur?.planetId });
        return (
          <div key={`b-${a}`} className="grid gap-2 sm:grid-cols-2">
            <select
              className="select"
              value={cur?.type ?? ''}
              aria-label={t('Bau für {alliance}', { alliance: al(a)?.name ?? '' })}
              onChange={(ev) => setD({ ...d, builds: { ...d.builds, [a]: ev.target.value ? { type: ev.target.value as InfraType, planetId: cur?.planetId ?? '' } : null } })}
            >
              <option value="">{t('– kein Bau –')}</option>
              {o.types.map((x) => (
                <option key={x} value={x}>
                  {INFRA[x].name}
                </option>
              ))}
            </select>
            {cur && <PlanetSelect value={cur.planetId} options={o.planets} label={t('Bauplatz')} onChange={(p) => setD({ ...d, builds: { ...d.builds, [a]: { ...cur, planetId: p } } })} />}
          </div>
        );
      })}
      {r.moves.map((fid) => {
        const f = fleet(fid);
        return (
          <label key={`m-${fid}`} className="flex flex-wrap items-center gap-2">
            <span className="min-w-40">{f.name}</span>
            <PlanetSelect
              value={d.moves?.[fid]}
              options={planetIds(state).filter((id) => id !== f.planetId && connectedFor(state, f.allianceId, f.planetId!, id, n, 'move'))}
              placeholder={t('bleibt ({planet})', { planet: planetName(f.planetId) })}
              label={t('{fleet}: Zug', { fleet: f.name })}
              className="w-auto flex-1"
              onChange={(p) => setD({ ...d, moves: { ...d.moves, [fid]: p || null } })}
            />
          </label>
        );
      })}
      {r.stronghold.map((a) => (
        <label key={`s-${a}`} className="flex flex-wrap items-center gap-2">
          <span className="min-w-40">{t('Stronghold verlegen nach')}</span>
          <PlanetSelect
            value={d.stronghold?.[a]}
            options={alive.filter((id) => id !== strongholdPlanet(state, a))}
            placeholder={t('– bleibt –')}
            label={t('Stronghold verlegen nach')}
            className="w-auto flex-1"
            onChange={(p) => setD({ ...d, stronghold: { ...d.stronghold, [a]: p || null } })}
          />
        </label>
      ))}
      {r.positions.map((fid) => {
        const f = fleet(fid);
        return (
          <label key={`p-${fid}`} className="flex flex-wrap items-center gap-2">
            <span className="min-w-40">
              {f.name} <span className="text-faint">({planetName(f.planetId)})</span>
            </span>
            <PlanetSelect
              value={d.positions?.[fid]}
              options={planetIds(state).filter((p) => p !== f.planetId && !adjacent(p, f.planetId!))}
              placeholder={t('– Zielplanet (verdeckt) –')}
              label={t('{fleet}: neuer Planet', { fleet: f.name })}
              className="w-auto flex-1"
              onChange={(p) => setD({ ...d, positions: { ...d.positions, [fid]: p } })}
            />
          </label>
        );
      })}
      {r.defection && (
        <label className="flex flex-wrap items-center gap-2">
          <span className="min-w-40">{t('Überlaufen zu')}</span>
          <select className="select w-auto flex-1" value={d.defections?.[me.id] ?? ''} onChange={(ev) => setD({ ...d, defections: { ...d.defections, [me.id]: ev.target.value } })}>
            <option value="">{t('– bleibe in meiner Allianz –')}</option>
            {state.alliances
              .filter((a) => a.id !== myAl)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {r.bargain && (
        <div className="grid gap-2 sm:grid-cols-2">
          <PlanetSelect value={d.planetId} options={alive} label={t('Planet')} onChange={(p) => setD({ ...d, planetId: p || undefined })} />
          <select className="select" value={d.opponentId ?? ''} aria-label={t('Gegnerische Allianz')} onChange={(ev) => setD({ ...d, opponentId: ev.target.value || undefined })}>
            <option value="">{t('– gegnerische Allianz –')}</option>
            {state.alliances
              .filter((a) => a.id !== e.allianceId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </div>
      )}
      {r.archeotech &&
        (() => {
          // NTH2 2.3: Gleichstand an der Grenze – die schwächste Allianz wählt die fehlenden Planeten
          const c = archeotechCandidates({ state });
          const chosen = d.planetIds ?? [];
          return (
            <fieldset className="space-y-1">
              <legend className="text-dim">{t('Sicher: {list}. Wähle {n} der gleichauf liegenden Planeten:', { list: c.sure.map(planetName).join(', ') || '–', n: c.need })}</legend>
              {c.tied.map((p) => (
                <label key={p} className="mr-4 inline-flex min-h-11 items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 accent-[#dda94d]" checked={chosen.includes(p)} onChange={(ev) => setD({ ...d, planetIds: ev.target.checked ? [...chosen, p] : chosen.filter((x) => x !== p) })} /> {planetName(p)}
                </label>
              ))}
            </fieldset>
          );
        })()}
      {r.cult && e.allianceId && (
        <label className="flex flex-wrap items-center gap-2">
          <span className="min-w-40">{t('Ort des Aufstands')}</span>
          <PlanetSelect value={d.planetId} options={cultCandidates({ state }, e.allianceId)} label={t('Ort des Aufstands')} className="w-auto flex-1" onChange={(p) => setD({ ...d, planetId: p || undefined })} />
        </label>
      )}
      {r.smuggled &&
        (() => {
          // NTH2 2.3: Umzüge und Zusatzbau direkt über den Spielerlink (mit F-13 bleibt der Stronghold stehen)
          const fixed = house(state, 'F13_STRONGHOLD_FIXED');
          const pieces = state.planets.flatMap((p) => p.slots.map((s, i) => ({ p: p.id, i, s })).filter(({ s }) => !s.destroyed && s.infra?.allianceId === e.allianceId && !(fixed && s.infra.type === 'STRONGHOLD')));
          const rel = d.relocations ?? [];
          const o = buildOptions(state, e.allianceId ?? '', alive, { type: d.extra?.type, planetId: d.extra?.planetId });
          return (
            <div className="space-y-2">
              <p className="label">{t('Infrastruktur verlegen')}</p>
              {pieces.map(({ p, i, s }) => {
                const cur = rel.find((x) => x.fromPlanetId === p && x.slot === i);
                return (
                  <label key={`${p}-${i}`} className="flex flex-wrap items-center gap-2">
                    <span className="min-w-40">{t('{infra} auf {planet}', { infra: INFRA[s.infra!.type].name, planet: planetName(p) })}</span>
                    <PlanetSelect
                      value={cur?.toPlanetId}
                      options={alive.filter((x) => x !== p)}
                      placeholder={t('bleibt')}
                      label={t('{infra} auf {planet}', { infra: INFRA[s.infra!.type].name, planet: planetName(p) })}
                      className="w-auto flex-1"
                      onChange={(to) => setD({ ...d, relocations: [...rel.filter((x) => !(x.fromPlanetId === p && x.slot === i)), ...(to ? [{ fromPlanetId: p, slot: i, toPlanetId: to }] : [])] })}
                    />
                  </label>
                );
              })}
              <p className="label">{t('Zusätzlicher Bau')}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  className="select"
                  value={d.extra?.type ?? ''}
                  aria-label={t('Zusätzlicher Bau')}
                  onChange={(ev) => setD({ ...d, extra: ev.target.value ? { type: ev.target.value as InfraType, planetId: d.extra?.planetId ?? '' } : null })}
                >
                  <option value="">{t('– kein Bau –')}</option>
                  {o.types.map((x) => (
                    <option key={x} value={x}>
                      {INFRA[x].name}
                    </option>
                  ))}
                </select>
                {d.extra && <PlanetSelect value={d.extra.planetId} options={o.planets} label={t('Bauplatz')} onChange={(p) => setD({ ...d, extra: { ...d.extra!, planetId: p } })} />}
              </div>
            </div>
          );
        })()}
      {!!(r.builds.length || r.moves.length || r.stronghold.length || r.positions.length || r.defection || r.bargain || r.archeotech || r.cult || r.smuggled) && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn btn-sm btn-primary"
            disabled={busy}
            onClick={() => {
              // nur die Schlüssel senden, für die der Spieler Rechte hat; leere Bauplätze weglassen
              const data: EventData = {};
              if (r.builds.length) data.builds = Object.fromEntries(r.builds.map((a) => [a, d.builds?.[a]?.planetId ? d.builds[a] : null]));
              if (r.moves.length) data.moves = Object.fromEntries(r.moves.map((f) => [f, d.moves?.[f] ?? null]));
              if (r.stronghold.length) data.stronghold = Object.fromEntries(r.stronghold.map((a) => [a, d.stronghold?.[a] ?? null]));
              if (r.positions.length) data.positions = Object.fromEntries(r.positions.filter((f) => d.positions?.[f]).map((f) => [f, d.positions![f]]));
              if (r.defection) data.defections = { [me.id]: d.defections?.[me.id] ?? '' };
              if (r.bargain) Object.assign(data, { planetId: d.planetId, opponentId: d.opponentId });
              if (r.archeotech) data.planetIds = d.planetIds ?? [];
              if (r.cult && d.planetId) data.planetId = d.planetId;
              if (r.smuggled) Object.assign(data, { relocations: d.relocations ?? [], extra: d.extra?.planetId ? d.extra : null });
              if (data.positions && !Object.keys(data.positions).length) delete data.positions;
              send(data);
            }}
          >
            {sent ? t('Eingabe ändern (verdeckt)') : t('Eingabe senden (verdeckt)')}
          </button>
          {sent && <span className="text-[14px] text-ok">{t('Deine Eingabe liegt dem Warmaster vor.')}</span>}
        </div>
      )}
    </section>
  );
}
