'use client';

import { useState } from 'react';
import { ATTACK_TYPES, THEATRES, type AttackType, type TheatreId } from '@/engine/data/vespator';
import { allMissions } from '@/engine/missions';
import { POOL_MAX } from '@/engine/missionPool';
import { ALL_THEATRES } from '@/engine/map';
import type { TerrainLayout } from '@/engine/types';
import { Field, Panel, UploadButton, uploadUrl } from '@/components/ui';
import { CloseIcon } from '@/components/icons';
import { GameIcon } from '@/components/icons/GameIcon';
import { useMsg, useT } from '@/i18n/client';
import { useCmd } from '../CommandProvider';

/**
 * Missions-Pool je Angriffsart (A1) und Gelände-Layouts je Theatre/Mission (A8). Leerer Pool = Regelbuch
 * (Vespator-Mission der Angriffsart). Die Campaign Outcomes bleiben immer die der Angriffsart.
 */
export function MissionPoolPanel() {
  const { state, run, busy, campaignId } = useCmd();
  const t = useT();
  const msg = useMsg();
  const missions = allMissions(state);
  const [pool, setPool] = useState<Partial<Record<AttackType, string[]>>>(() => structuredClone(state.meta.missionPool ?? {}));
  const [layouts, setLayouts] = useState<TerrainLayout[]>(() => structuredClone(state.meta.terrainLayouts ?? []));
  const poolDirty = JSON.stringify(pool) !== JSON.stringify(state.meta.missionPool ?? {});
  const layoutsDirty = JSON.stringify(layouts) !== JSON.stringify(state.meta.terrainLayouts ?? []);
  const types = (Object.keys(ATTACK_TYPES) as AttackType[]).filter((a) => state.toggles.operations.attackTypes[a]);
  const setSlot = (a: AttackType, i: number, id: string) =>
    setPool((p) => {
      const list = [...(p[a] ?? [])];
      if (id) list[i] = id;
      else list.splice(i, 1);
      const next = { ...p, [a]: [...new Set(list.filter(Boolean))] };
      // leerer Pool = Regelbuch (wie gespeichert: ohne Eintrag)
      if (!next[a]!.length) delete next[a];
      return next;
    });
  const upd = (i: number, patch: Partial<TerrainLayout>) => setLayouts((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const save = async () => {
    if (poolDirty && !(await run({ type: 'MISSION_POOL_SET', pool }))) return;
    if (layoutsDirty) await run({ type: 'TERRAIN_LAYOUTS_SET', layouts });
  };

  return (
    <Panel title={t('Missions-Pool & Gelände')} icon={<GameIcon name="op_BATTLE" size={18} />}>
      <p className="text-[14px] text-dim">
        {t('Je Angriffsart 1–3 Missionen. Beim Ansetzen schlägt die App die am seltensten gespielte vor, nie die zuletzt gespielte derselben Allianz. Die Campaign Outcomes bleiben die der Angriffsart.')}
      </p>
      <ul className="mt-2 space-y-2">
        {types.map((a) => {
          const list = pool[a] ?? [];
          const options = missions.filter((m) => !m.attackTypes.length || m.attackTypes.includes(a));
          return (
            <li key={a} className="grid gap-1.5 @lg:grid-cols-[10rem_minmax(0,1fr)] @lg:items-center">
              <span className="text-[15px] font-semibold text-ink">{ATTACK_TYPES[a].name}</span>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: Math.min(POOL_MAX, list.length + 1) }, (_, i) => (
                  <select
                    key={i}
                    className="select w-auto max-w-full"
                    value={list[i] ?? ''}
                    aria-label={t('{type}: Mission {n}', { type: ATTACK_TYPES[a].name, n: i + 1 })}
                    onChange={(e) => setSlot(a, i, e.target.value)}
                  >
                    <option value="">{i === 0 && !list.length ? t('Regelbuch (Vespator)') : t('– keine –')}</option>
                    {options
                      .filter((m) => m.id === list[i] || !list.includes(m.id))
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {msg(m.name)}
                        </option>
                      ))}
                  </select>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="section-title mt-4">{t('Gelände-Layouts')}</p>
      <p className="text-[14px] text-dim">{t('Bild, Link oder Beschreibung je Theatre und/oder Mission – erscheint im Briefing der passenden Schlachten.')}</p>
      <div className="mt-2 space-y-2">
        {layouts.map((l, i) => (
          <div key={l.id} className="slab grid gap-2 p-2.5 @lg:grid-cols-2">
            <Field label="Theatre">
              <select className="select" value={l.theatre ?? ''} onChange={(e) => upd(i, { theatre: (e.target.value || null) as TheatreId | null })}>
                <option value="">{t('alle Theatres')}</option>
                {ALL_THEATRES.map((th) => (
                  <option key={th} value={th}>
                    {THEATRES[th].name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('Mission')}>
              <select className="select" value={l.missionId ?? ''} onChange={(e) => upd(i, { missionId: e.target.value || null })}>
                <option value="">{t('alle Missionen')}</option>
                {missions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {msg(m.name)}
                  </option>
                ))}
              </select>
            </Field>
            <input className="input" value={l.title} placeholder={t('Titel (optional)')} aria-label={t('Titel des Layouts')} onChange={(e) => upd(i, { title: e.target.value })} />
            <input className="input" value={l.link} placeholder="https://…" aria-label={t('Link zum Layout')} onChange={(e) => upd(i, { link: e.target.value })} />
            <textarea
              className="textarea @lg:col-span-2"
              rows={2}
              value={l.note}
              placeholder={t('Beschreibung (z. B. Geländestücke, Aufstellung)')}
              aria-label={t('Beschreibung des Layouts')}
              onChange={(e) => upd(i, { note: e.target.value })}
            />
            <div className="flex flex-wrap items-center gap-2 @lg:col-span-2">
              {l.image ? (
                <span className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={uploadUrl(l.image, true)!} alt={t('Layout-Bild')} className="h-16 w-24 border border-line object-cover" />
                  <button type="button" className="btn btn-sm absolute right-0 top-0 min-h-0 px-1 py-0.5" aria-label={t('Bild entfernen')} onClick={() => upd(i, { image: null })}>
                    <CloseIcon size={14} />
                  </button>
                </span>
              ) : (
                <UploadButton kind="LORE_IMAGE" campaignId={campaignId} label={t('+ Layout-Bild')} onUploaded={(id) => upd(i, { image: id })} />
              )}
              <button type="button" className="btn btn-sm btn-danger ml-auto" onClick={() => setLayouts((x) => x.filter((_, j) => j !== i))}>
                {t('entfernen')}
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => setLayouts((x) => [...x, { id: `tl-${Date.now().toString(36)}`, theatre: ALL_THEATRES[0], missionId: null, title: '', image: null, link: '', note: '' }])}
        >
          {t('Layout hinzufügen')}
        </button>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          className="btn btn-sm"
          disabled={!poolDirty && !layoutsDirty}
          onClick={() => {
            setPool(structuredClone(state.meta.missionPool ?? {}));
            setLayouts(structuredClone(state.meta.terrainLayouts ?? []));
          }}
        >
          {t('Zurücksetzen')}
        </button>
        <button type="button" className="btn btn-primary" disabled={(!poolDirty && !layoutsDirty) || busy} onClick={save}>
          {t('Speichern')}
        </button>
      </div>
    </Panel>
  );
}
