'use client';

import { useState } from 'react';
import { BUILDABLE_TYPES, INFRA, type InfraType } from '@/engine/data/vespator';
import { connectedPlanets, connectedFor } from '@/engine/graph';
import { bombardSlots, decisionTypesFor, defaultDecision, DRAW_SUMMARY, effectiveVictor, OUTCOME_SUMMARY, powerSources } from '@/engine/outcomes';
import type { Battle, CampaignState, OutcomeDecision, PowerShift } from '@/engine/types';
import { AllianceTag, PlanetSelect, planetName } from '@/components/ui';
import { CloseIcon } from '@/components/icons';
import { useCmd } from '../CommandProvider';
import { planetIds } from '@/engine/map';
import { house } from '@/engine/houseRules';
import { countInfra } from '@/engine/board';
import { useMsg, useT } from '@/i18n/client';
import type { T } from '@/i18n/core';
import { decisionLabel } from './outcomeText';

// Standard ohne Übersetzung (deutsche Texte mit eingesetzten Platzhaltern)
const deT: T = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : text);

export function slotLabel(state: CampaignState, planetId: string, i: number, t: T = deT) {
  const s = state.planets.find((p) => p.id === planetId)?.slots[i];
  if (!s) return `Location ${i + 1}`;
  if (s.destroyed) return t('Location {n}: zerstört', { n: i + 1 });
  if (!s.infra) return t('Location {n}: frei', { n: i + 1 });
  const a = state.alliances.find((x) => x.id === s.infra!.allianceId);
  return `Location ${i + 1}: ${INFRA[s.infra.type].name} (${a?.name ?? '?'})`;
}

function TypeSelect({ value, onChange, allowed = BUILDABLE_TYPES, none = '– kein Bau –' }: { value: InfraType | null; onChange: (t: InfraType | null) => void; allowed?: InfraType[]; none?: string }) {
  const tr = useT();
  return (
    // Aufrufer umschließen die Auswahl mit einem <label> (sichtbare Beschriftung)
    <select className="select" value={value ?? ''} onChange={(e) => onChange((e.target.value || null) as InfraType | null)}>
      <option value="">{tr(none)}</option>
      {allowed.map((t) => (
        <option key={t} value={t}>
          {INFRA[t].name}
        </option>
      ))}
    </select>
  );
}

/**
 * Outcome-Entscheidungen einer Operation. Mit `onDraft` (Ergebnis-Entwurf eines Spielers) wird jede Änderung
 * sofort an den Entwurf gemeldet und mit dem Ergebnis gesendet – ohne eigenen Speichern-Knopf (nichts geht verloren).
 */
export function OutcomeEditor(props: { battle: Battle; opId: string; onDraft?: (d: OutcomeDecision) => void }) {
  const v = effectiveVictor(props.battle);
  const k = JSON.stringify([props.onDraft ? null : (props.battle.decisions[props.opId] ?? null), v, props.battle.status]);
  return <OutcomeEditorInner key={k} {...props} />;
}

function OutcomeEditorInner({ battle, opId, onDraft }: { battle: Battle; opId: string; onDraft?: (d: OutcomeDecision) => void }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const msg = useMsg();
  const v = effectiveVictor(battle);
  const type = v ? decisionTypesFor(battle.attackType, v) : null;
  const stored = battle.decisions[opId];
  const [d, setDState] = useState<OutcomeDecision | null>(stored && stored.type === type ? stored : type ? defaultDecision(type) : null);
  const setD = (x: OutcomeDecision) => {
    setDState(x);
    onDraft?.(x);
  };

  if (!v || !type || !d || !battle.planetId || !battle.attackType) return null;
  const P = battle.planetId;
  const A = battle.attackerAllianceId;
  const D = battle.defenderAllianceId;
  const phase = battle.phaseNumber;
  const plOf = (al: string, p = P) => state.planets.find((x) => x.id === p)?.power[al] ?? 0;
  const winnerSide = v === 'DEFENDER' ? 'DEFENDER' : 'ATTACKER';
  const winner = winnerSide === 'ATTACKER' ? A : D;
  const sources = v === 'DRAW' ? [] : powerSources(state, battle, winnerSide).outcome;
  const shift = d.type === 'DRAW' ? 0 : d.shift;
  const ePL = plOf(winner) + shift;
  const conn = (al: string) => connectedPlanets(state, al, P, phase).filter((id) => !state.planets.find((p) => p.id === id)?.destroyed);
  const processed = battle.status === 'PROCESSED';
  const set = (patch: Partial<OutcomeDecision>) => setD({ ...d, ...patch } as OutcomeDecision);
  const al = (id: string) => state.alliances.find((a) => a.id === id);
  const summary = v === 'DRAW' ? DRAW_SUMMARY : OUTCOME_SUMMARY[battle.attackType][v === 'ATTACKER' ? 'A' : 'D'];

  let form: React.ReactNode = null;
  switch (d.type) {
    case 'DRAW':
    case 'PURGE_A':
    case 'ORBITAL_A':
      form = <p className="text-[15px] text-dim">{t('Keine weiteren Entscheidungen nötig.')}</p>;
      break;
    case 'SEIZE_A': {
      const dSlots = (state.planets.find((p) => p.id === P)?.slots ?? []).map((s, i) => ({ s, i })).filter(({ s }) => !s.destroyed && s.infra && s.infra.allianceId === D && s.infra.type !== 'STRONGHOLD');
      form = (
        <div className="space-y-2">
          {dSlots.length ? (
            <label className="block">
              <span className="label">{t('Infrastruktur des Verteidigers übernehmen')}</span>
              <select className="select" value={d.captureSlot ?? ''} onChange={(e) => set({ captureSlot: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">{t('– wählen –')}</option>
                {dSlots.map(({ i }) => (
                  <option key={i} value={i}>
                    {slotLabel(state, P, i)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block">
              <span className="label">{t('Keine Verteidiger-Infrastruktur – stattdessen bauen')}</span>
              <TypeSelect value={d.fallbackType} onChange={(ty) => set({ fallbackType: ty })} />
            </label>
          )}
          <label className="block">
            <span className="label">{t('Zusatzbau (nur bei effektivem PL ≥ 3, aktuell {pl})', { pl: ePL })}</span>
            <TypeSelect value={d.bonusType} onChange={(ty) => set({ bonusType: ty })} />
          </label>
        </div>
      );
      break;
    }
    case 'SEIZE_D': {
      // B12: Typen am Limit nicht anbieten (eine bereits getroffene Wahl bleibt sichtbar)
      const types = (ePL >= 3 ? (['FORTIFICATION_LINE', 'STAGING_GROUNDS'] as InfraType[]) : (['FORTIFICATION_LINE'] as InfraType[])).filter((ty) => countInfra(state, D, ty) < INFRA[ty].max || d.build?.type === ty);
      form = (
        <div className="grid gap-2 @lg:grid-cols-2">
          <label className="block">
            <span className="label">{t('Bau (optional)')}</span>
            <TypeSelect value={d.build?.type ?? null} allowed={types} onChange={(ty) => set({ build: ty ? { type: ty, planetId: d.build?.planetId ?? P } : null })} />
          </label>
          {d.build && (
            <label className="block">
              <span className="label">{t('Ort')}</span>
              <PlanetSelect value={d.build.planetId} options={[P, ...conn(D)]} onChange={(p) => set({ build: { ...d.build!, planetId: p || P } })} />
            </label>
          )}
        </div>
      );
      break;
    }
    case 'PURGE_D': {
      const options = conn(D);
      form = (
        <div className="space-y-2">
          <p className="text-[15px] text-dim">{t('Umverteilung: je Eintrag −1 PL auf {planet} und +1 PL auf dem gewählten verbundenen Planeten (aktuell PL {pl}).', { planet: planetName(P), pl: plOf(D) })}</p>
          {d.redistributions.map((to, i) => (
            <div key={i} className="flex gap-2">
              <PlanetSelect value={to} options={options} placeholder={t('– Umverteilung {n} –', { n: i + 1 })} onChange={(p) => set({ redistributions: d.redistributions.map((x, j) => (j === i ? p : x)) })} />
              <button type="button" className="btn btn-sm" aria-label={t('Umverteilung {n} entfernen', { n: i + 1 })} onClick={() => set({ redistributions: d.redistributions.filter((_, j) => j !== i) })}>
                <CloseIcon />
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-sm" onClick={() => set({ redistributions: [...d.redistributions, options[0] ?? ''] })} disabled={!options.length}>
            {t('+ Umverteilung')}
          </button>
          <label className="block">
            <span className="label">{t('+1 PL auf verbundenem Planeten')}</span>
            <PlanetSelect value={d.bonusPlanetId} options={options} onChange={(p) => set({ bonusPlanetId: p || null })} />
          </label>
        </div>
      );
      break;
    }
    case 'ORBITAL_D': {
      const options = conn(D);
      const from = d.direction === 'OUT' ? P : d.otherPlanetId;
      // B12: mit Hausregel F-13 zieht der Stronghold nicht mit um – gar nicht erst anbieten
      const own = from
        ? (state.planets.find((p) => p.id === from)?.slots ?? [])
            .map((s, i) => ({ s, i }))
            .filter(({ s }) => !s.destroyed && s.infra?.allianceId === D && !(s.infra.type === 'STRONGHOLD' && house(state, 'F13_STRONGHOLD_FIXED')))
        : [];
      form = (
        <div className="space-y-2">
          <div className="grid gap-2 @lg:grid-cols-2">
            <label className="block">
              <span className="label">{t('Verbundener Planet (optional)')}</span>
              <PlanetSelect value={d.otherPlanetId} options={options} onChange={(p) => set({ otherPlanetId: p || null, slots: [] })} />
            </label>
            <label className="block">
              <span className="label">{t('Richtung')}</span>
              <select className="select" value={d.direction} onChange={(e) => set({ direction: e.target.value as 'OUT' | 'IN', slots: [] })}>
                <option value="OUT">{t('von {planet} weg', { planet: planetName(P) })}</option>
                <option value="IN">{t('nach {planet} hin', { planet: planetName(P) })}</option>
              </select>
            </label>
          </div>
          {d.otherPlanetId && (
            <div>
              <span className="label">{t('Eigene Infrastruktur verlegen')}</span>
              {own.length ? (
                own.map(({ i }) => (
                  <label key={i} className="flex items-center gap-2 py-1 text-[15px]">
                    <input type="checkbox" checked={d.slots.includes(i)} onChange={(e) => set({ slots: e.target.checked ? [...d.slots, i] : d.slots.filter((x) => x !== i) })} />
                    {slotLabel(state, from!, i, t)}
                  </label>
                ))
              ) : (
                <p className="text-[15px] text-faint">{t('Keine eigene Infrastruktur auf {planet}.', { planet: planetName(from) })}</p>
              )}
            </div>
          )}
        </div>
      );
      break;
    }
    case 'BOMBARD_A': {
      const valid = bombardSlots(state, P, (s) => !s.infra || s.infra.allianceId === D);
      form = (
        <label className="block">
          <span className="label">{ePL >= 3 ? t('Ziel-Location (W6 +1 beim Verarbeiten, 3+ zerstört)') : t('Ziel-Location (W6 beim Verarbeiten, 3+ zerstört)')}</span>
          <select className="select" value={d.slot ?? ''} onChange={(e) => set({ slot: e.target.value === '' ? null : Number(e.target.value) })}>
            <option value="">{t('– wählen –')}</option>
            {valid.map((i) => (
              <option key={i} value={i}>
                {slotLabel(state, P, i)}
              </option>
            ))}
          </select>
        </label>
      );
      break;
    }
    case 'BOMBARD_D': {
      const options = conn(D);
      const max = ePL >= 3 ? 2 : 1;
      const valid = d.planetId ? bombardSlots(state, d.planetId, () => true) : [];
      form = (
        <div className="space-y-2">
          <label className="block">
            <span className="label">{t('Gegenschlag auf verbundenen Planeten')}</span>
            <PlanetSelect value={d.planetId} options={options} onChange={(p) => set({ planetId: p || null, strikes: [] })} />
          </label>
          {d.planetId &&
            Array.from({ length: max }, (_, k) =>
              k > d.strikes.length ? null : (
                <label key={k} className="block">
                  <span className="label">
                    {t('Schlag {n}', { n: k + 1 })} {k === 1 ? '(PL ≥ 3)' : ''} – {t('W6: 4–5 Infrastruktur, 6 Location zerstört')}
                  </span>
                  <select
                    className="select"
                    value={d.strikes[k]?.slot ?? ''}
                    onChange={(e) => {
                      const strikes = [...d.strikes];
                      if (e.target.value === '') strikes.splice(k, 1);
                      else strikes[k] = { slot: Number(e.target.value), roll: null };
                      set({ strikes: strikes.filter(Boolean) });
                    }}
                  >
                    <option value="">{t('– kein Schlag –')}</option>
                    {/* jede Location nur einmal: ein zweiter Schlag auf dieselbe Location ist nicht wählbar */}
                    {valid
                      .filter((i) => !d.strikes.some((s, j) => j !== k && s.slot === i))
                      .map((i) => (
                        <option key={i} value={i}>
                          {slotLabel(state, d.planetId!, i, t)}
                        </option>
                      ))}
                  </select>
                </label>
              ),
            )}
        </div>
      );
      break;
    }
    case 'RAID_A': {
      const options = [P, ...conn(A)];
      const max = ePL >= 3 ? 2 : 1;
      form = (
        <div className="space-y-2">
          {Array.from({ length: max }, (_, k) => (
            <label key={k} className="block">
              <span className="label">{t('Versuch {n} (W6 4+: Verteidiger −1 PL)', { n: k + 1 })}</span>
              <PlanetSelect
                value={d.strikes[k]?.planetId}
                options={options}
                placeholder={t('– kein Versuch –')}
                onChange={(p) => {
                  const strikes = [...d.strikes];
                  if (!p) strikes.splice(k, 1);
                  else strikes[k] = { planetId: p, roll: null };
                  set({ strikes: strikes.filter(Boolean) });
                }}
              />
            </label>
          ))}
        </div>
      );
      break;
    }
    case 'RAID_D': {
      const options = ePL >= 3 ? [P, ...conn(D)] : [P];
      form = (
        <label className="block">
          <span className="label">{t('Angreifer −1 PL auf')}</span>
          <PlanetSelect value={d.reducePlanetId ?? P} options={options} onChange={(p) => set({ reducePlanetId: p || null })} />
        </label>
      );
      break;
    }
    case 'BOARDING_A': {
      const targets = state.fleets.filter((f) => f.allianceId === D && f.planetId === P);
      const hop1 = planetIds(state).filter((id) => connectedFor(state, D, P, id, phase, 'move'));
      const hop2 = d.path[0] ? planetIds(state).filter((id) => connectedFor(state, D, d.path[0], id, phase, 'move')) : [];
      form = (
        <div className="space-y-2">
          <label className="block">
            <span className="label">{t('Verteidiger-Flotte vertreiben')}</span>
            <select className="select" value={d.targetFleetId ?? ''} onChange={(e) => set({ targetFleetId: e.target.value || null, path: [] })}>
              <option value="">{t('– keine –')}</option>
              {targets.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          {!targets.length && <p className="notice">{t('Keine Flotte des Verteidigers auf {planet}.', { planet: planetName(P) })}</p>}
          {d.targetFleetId && (
            <div className="grid gap-2 @lg:grid-cols-2">
              <label className="block">
                <span className="label">{t('1. Bewegung')}</span>
                <PlanetSelect value={d.path[0]} options={hop1} placeholder={t('– bleibt –')} onChange={(p) => set({ path: p ? [p] : [] })} />
              </label>
              {d.path[0] && (
                <label className="block">
                  <span className="label">{t('2. Bewegung (optional)')}</span>
                  <PlanetSelect value={d.path[1]} options={hop2} placeholder={t('– keine –')} onChange={(p) => set({ path: p ? [d.path[0], p] : [d.path[0]] })} />
                </label>
              )}
            </div>
          )}
        </div>
      );
      break;
    }
    case 'BOARDING_D': {
      const own = state.fleets.filter((f) => f.allianceId === D && f.planetId === P);
      const options = planetIds(state).filter((id) => connectedFor(state, D, P, id, phase, 'move'));
      form = (
        <div className="space-y-2">
          <p className="text-[15px] text-dim">{t('Die angreifende Flotte darf in Schritt 4 dieser Phase nicht ziehen.')}</p>
          <div className="grid gap-2 @lg:grid-cols-2">
            <label className="block">
              <span className="label">{t('Eigene Flotte bewegen (optional)')}</span>
              <select className="select" value={d.ownFleetId ?? ''} onChange={(e) => set({ ownFleetId: e.target.value || null })}>
                <option value="">{t('– keine –')}</option>
                {own.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            {d.ownFleetId && (
              <label className="block">
                <span className="label">{t('Ziel')}</span>
                <PlanetSelect value={d.toPlanetId} options={options} onChange={(p) => set({ toPlanetId: p || null })} />
              </label>
            )}
          </div>
        </div>
      );
      break;
    }
  }

  const dirty = JSON.stringify(d) !== JSON.stringify(stored ?? defaultDecision(type));
  return (
    <div className="inset space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-2 text-[15px]">
        <span className="hud-title">Campaign Outcome</span>
        <span className="chip">{decisionLabel(battle.attackType, type, t)}</span>
        <span className="text-dim">
          PL {planetName(P)}: <AllianceTag alliance={al(A)} /> {plOf(A)} · <AllianceTag alliance={al(D)} /> {plOf(D)}
        </span>
      </div>
      <p className="text-[15px]">{msg(summary)}</p>
      {d.type !== 'DRAW' && sources.length > 0 && (
        <label className="block max-w-xs">
          <span className="label">{t('PL des Siegers behandeln als ({sources})', { sources: sources.join(', ') })}</span>
          <select className="select" value={shift} onChange={(e) => set({ shift: Number(e.target.value) as PowerShift })} disabled={processed}>
            {house(state, 'F15_TREAT_STACKS') && sources.length > 1 && <option value={-2}>−2 ({plOf(winner) - 2})</option>}
            <option value={-1}>−1 ({plOf(winner) - 1})</option>
            <option value={0}>{t('real ({pl})', { pl: plOf(winner) })}</option>
            <option value={1}>+1 ({plOf(winner) + 1})</option>
            {house(state, 'F15_TREAT_STACKS') && sources.length > 1 && <option value={2}>+2 ({plOf(winner) + 2})</option>}
          </select>
        </label>
      )}
      <fieldset disabled={processed} className="space-y-2">
        {form}
      </fieldset>
      {processed ? (
        <p className="notice notice-ok">{t('Verarbeitet.')}</p>
      ) : onDraft ? (
        <p className="text-[13px] text-dim">{t('Wird mit dem Ergebnis gesendet.')}</p>
      ) : (
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-sm btn-primary" disabled={busy || !dirty} onClick={() => run({ type: 'BATTLE_DECISION', battleId: battle.id, opId, decision: d })}>
            {t('Entscheidung speichern')}
          </button>
          {dirty && <span className="text-[13px] text-warn">{t('ungespeichert')}</span>}
        </div>
      )}
    </div>
  );
}
