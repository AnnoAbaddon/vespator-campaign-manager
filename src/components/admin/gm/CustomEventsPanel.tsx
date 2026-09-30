'use client';

import { useState } from 'react';
import { BUILDABLE_TYPES, EVENTS, INFRA, type EventCode, type InfraType } from '@/engine/data/vespator';
import { ALLIANCE_MODIFIERS, CUSTOM_MODIFIERS, EFFECT_KINDS, MODIFIER_LABEL, validateCustomEvent, type CustomEffect, type CustomEventDef, type CustomModifier } from '@/engine/customEvents';
import { planetIds } from '@/engine/map';
import { Panel, planetName } from '@/components/ui';
import { GameIcon } from '@/components/icons/GameIcon';
import { CloseIcon, SaveIcon } from '@/components/icons';
import { useMsg, useT } from '@/i18n/client';
import type { T } from '@/i18n/core';
import type { CampaignState } from '@/engine/types';
import { useCmd } from '../CommandProvider';
import { EFFECT_LABEL, allianceRefText, effectText, planetRefText } from '../events/customEventText';

const ALLIANCE_REFS = ['TARGET', 'OTHERS', 'ALL', 'LEADER', 'TRAILING'] as const;
const PLANET_REFS = ['CHOSEN', 'ALL', 'STRONGHOLD'] as const;

/** Neuer Baustein mit sinnvollen Vorgaben */
function newEffect(kind: CustomEffect['kind']): CustomEffect {
  switch (kind) {
    case 'PL':
      return { kind, alliance: 'TARGET', planet: 'CHOSEN', delta: -1 };
    case 'INFRA_DESTROY':
      return { kind, alliance: 'TARGET', planet: 'CHOSEN' };
    case 'INFRA_BUILD':
      return { kind, alliance: 'TARGET', planet: 'CHOSEN', infra: 'FORTIFICATION_LINE' };
    case 'MOVE':
      return { kind, alliance: 'TARGET', planet: 'CHOSEN' };
    case 'POINTS':
      return { kind, alliance: 'TARGET', delta: 1 };
    case 'MODIFIER':
      return { kind, modifier: 'NO_VOID_LEAP', alliance: null };
  }
}

const blank = (): CustomEventDef => ({ id: '', name: '', description: '', effects: [newEffect('PL')], phase: null, replaces: null, target: null });

function AllianceRefSelect({ value, onChange, state, t, label }: { value: string; onChange: (v: string) => void; state: CampaignState; t: T; label: string }) {
  return (
    <select className="select" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      {ALLIANCE_REFS.map((r) => (
        <option key={r} value={r}>
          {allianceRefText(r, state, t)}
        </option>
      ))}
      {state.alliances.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}

function PlanetRefSelect({ value, onChange, state, t, noAll, label }: { value: string; onChange: (v: string) => void; state: CampaignState; t: T; noAll?: boolean; label: string }) {
  return (
    <select className="select" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      {PLANET_REFS.filter((r) => !(noAll && r === 'ALL')).map((r) => (
        <option key={r} value={r}>
          {planetRefText(r, t)}
        </option>
      ))}
      {planetIds(state).map((p) => (
        <option key={p} value={p}>
          {planetName(p)}
        </option>
      ))}
    </select>
  );
}

function EffectRow({ e, onChange, onRemove, state }: { e: CustomEffect; onChange: (e: CustomEffect) => void; onRemove: () => void; state: CampaignState }) {
  const t = useT();
  const set = (p: Partial<CustomEffect>) => onChange({ ...e, ...p } as CustomEffect);
  const deltas = e.kind === 'POINTS' ? [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5] : [-2, -1, 1, 2];
  return (
    <li className="inset space-y-2 p-2">
      <div className="flex items-center gap-2">
        <select className="select min-w-0 flex-1" value={e.kind} aria-label={t('Baustein')} onChange={(ev) => onChange(newEffect(ev.target.value as CustomEffect['kind']))}>
          {EFFECT_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(EFFECT_LABEL[k])}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-sm btn-ghost min-h-11 min-w-11" onClick={onRemove} aria-label={t('Baustein entfernen')} title={t('Baustein entfernen')}>
          <CloseIcon size={15} />
        </button>
      </div>
      <div className="grid gap-2 @md:grid-cols-3">
        {e.kind === 'MODIFIER' ? (
          <>
            <select
              className="select"
              value={e.modifier}
              aria-label={t('Modifikator')}
              onChange={(ev) => set({ modifier: ev.target.value as CustomModifier, alliance: ALLIANCE_MODIFIERS.has(ev.target.value as CustomModifier) ? (e.alliance ?? 'TARGET') : null })}
            >
              {CUSTOM_MODIFIERS.map((m) => (
                <option key={m} value={m}>
                  {t(MODIFIER_LABEL[m])}
                </option>
              ))}
            </select>
            {ALLIANCE_MODIFIERS.has(e.modifier) && <AllianceRefSelect value={e.alliance ?? 'TARGET'} onChange={(v) => set({ alliance: v })} state={state} t={t} label={t('Allianz')} />}
          </>
        ) : (
          <AllianceRefSelect value={e.alliance} onChange={(v) => set({ alliance: v })} state={state} t={t} label={t('Allianz')} />
        )}
        {'planet' in e && <PlanetRefSelect value={e.planet} onChange={(v) => set({ planet: v })} state={state} t={t} noAll={e.kind === 'MOVE'} label={t('Planet')} />}
        {e.kind === 'INFRA_BUILD' && (
          <select className="select" value={e.infra} aria-label={t('Infrastruktur')} onChange={(ev) => set({ infra: ev.target.value as InfraType })}>
            {BUILDABLE_TYPES.map((x) => (
              <option key={x} value={x}>
                {INFRA[x].name}
              </option>
            ))}
          </select>
        )}
        {(e.kind === 'PL' || e.kind === 'POINTS') && (
          <select className="select" value={e.delta} aria-label={t('Änderung')} onChange={(ev) => set({ delta: Number(ev.target.value) })}>
            {deltas.map((d) => (
              <option key={d} value={d}>
                {d > 0 ? `+${d}` : `−${Math.abs(d)}`}
              </option>
            ))}
          </select>
        )}
      </div>
    </li>
  );
}

/**
 * Baukasten für eigene Ereignisse (D2): Name, Text, Bausteine, Einplanung für eine Phase oder Ersatz eines
 * Tabelleneintrags. Ausgelöst und angewendet werden sie in Schritt 3 wie Regelbuch-Events.
 */
export function CustomEventsPanel() {
  const { state, run, busy } = useCmd();
  const t = useT();
  const msg = useMsg();
  const [edit, setEdit] = useState<CustomEventDef | null>(null);
  const list = state.customEvents ?? [];
  const err = edit ? validateCustomEvent(state, { ...edit, id: edit.id || 'neu' }) : null;
  const phases = Array.from({ length: Math.max(0, state.meta.phaseCount - 1) }, (_, i) => i + 1);
  const targetLabel = (v: string | null) => (v === null ? t('beim Anwenden wählen') : v === 'LEADER' || v === 'TRAILING' ? allianceRefText(v, state, t) : (state.alliances.find((a) => a.id === v)?.name ?? '?'));

  return (
    <Panel
      title={t('Eigene Ereignisse')}
      icon={<GameIcon name="ui_SCROLL" size={18} />}
      actions={
        !edit && (
          <button type="button" className="btn btn-sm" onClick={() => setEdit(blank())}>
            {t('Neues Ereignis')}
          </button>
        )
      }
    >
      <p className="text-[15px] text-dim">{t('Ereignisse aus Bausteinen: für eine Phase einplanen, einen Eintrag der Event-Tabellen ersetzen oder in Schritt 3 von Hand auslösen.')}</p>
      {!edit && !list.length && <p className="mt-2 text-[15px] text-faint">{t('Noch keine eigenen Ereignisse.')}</p>}
      {!edit && list.length > 0 && (
        <ul className="mt-2 space-y-2">
          {list.map((d) => (
            <li key={d.id} className="inset p-2 text-[15px]">
              <div className="flex flex-wrap items-center gap-2">
                <b className="min-w-0 flex-1 text-ink">{d.name}</b>
                {d.phase !== null && <span className="chip">{t('Phase {n}', { n: d.phase })}</span>}
                {d.replaces && <span className="chip">{t('statt {event}', { event: EVENTS[d.replaces].name })}</span>}
                <button type="button" className="btn btn-sm" onClick={() => setEdit(structuredClone(d))}>
                  {t('Bearbeiten')}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  disabled={busy}
                  onClick={() => run({ type: 'CUSTOM_EVENT_DELETE', id: d.id }, { confirm: t('Eigenes Ereignis „{name}“ löschen?', { name: d.name }) })}
                >
                  {t('Löschen')}
                </button>
              </div>
              <ul className="mt-1 list-disc pl-5 text-[14px] text-dim">
                {d.effects.map((e, i) => (
                  <li key={i}>{effectText(e, state, t)}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {edit && (
        <form
          className="@container mt-3 space-y-3"
          onSubmit={async (ev) => {
            ev.preventDefault();
            if (err) return;
            if (await run({ type: 'CUSTOM_EVENT_UPSERT', def: edit })) setEdit(null);
          }}
        >
          <div className="grid gap-2 @md:grid-cols-2">
            <label className="block">
              <span className="label">{t('Name')}</span>
              <input className="input" value={edit.name} maxLength={80} required onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </label>
            <label className="block">
              <span className="label">{t('Ziel-Allianz')}</span>
              <select className="select" value={edit.target ?? ''} onChange={(e) => setEdit({ ...edit, target: e.target.value || null })}>
                {[null, 'LEADER', 'TRAILING', ...state.alliances.map((a) => a.id)].map((v) => (
                  <option key={v ?? ''} value={v ?? ''}>
                    {targetLabel(v)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="label">{t('Text (für Spieler sichtbar, sobald es eintritt)')}</span>
            <textarea className="textarea" rows={2} maxLength={2000} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
          </label>
          <div className="grid gap-2 @md:grid-cols-2">
            <label className="block">
              <span className="label">{t('Einplanen für')}</span>
              <select className="select" value={edit.phase ?? ''} onChange={(e) => setEdit({ ...edit, phase: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{t('– nicht eingeplant –')}</option>
                {phases.map((n) => (
                  <option key={n} value={n}>
                    {t('Phase {n}', { n })}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">{t('Tabelleneintrag ersetzen')}</span>
              <select className="select" value={edit.replaces ?? ''} onChange={(e) => setEdit({ ...edit, replaces: (e.target.value || null) as EventCode | null })}>
                <option value="">{t('– keiner –')}</option>
                {(Object.keys(EVENTS) as EventCode[]).map((c) => (
                  <option key={c} value={c}>
                    {`${EVENTS[c].name} (${c.replace('_', ' ')})`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <p className="label">{t('Bausteine')}</p>
            <ul className="space-y-2">
              {edit.effects.map((e, i) => (
                <EffectRow
                  key={i}
                  e={e}
                  state={state}
                  onChange={(x) => setEdit({ ...edit, effects: edit.effects.map((y, j) => (j === i ? x : y)) })}
                  onRemove={() => setEdit({ ...edit, effects: edit.effects.filter((_, j) => j !== i) })}
                />
              ))}
            </ul>
            <button type="button" className="btn btn-sm mt-2" disabled={edit.effects.length >= 12} onClick={() => setEdit({ ...edit, effects: [...edit.effects, newEffect('PL')] })}>
              {t('Baustein hinzufügen')}
            </button>
          </div>
          {err && edit.name.trim() && <p className="notice notice-danger">{msg(err)}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn btn-sm" onClick={() => setEdit(null)}>
              {t('Abbrechen')}
            </button>
            <button className="btn btn-sm btn-primary" disabled={busy || !!err}>
              <SaveIcon size={15} /> {t('Ereignis speichern')}
            </button>
          </div>
        </form>
      )}
    </Panel>
  );
}
