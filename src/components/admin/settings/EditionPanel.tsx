'use client';

import { useState } from 'react';
import { ATTACK_TYPES, type AttackType } from '@/engine/data/vespator';
import { battleSizes, DEFAULT_BATTLE_SIZES, edition } from '@/engine/campaignRules';
import type { BattleSizeDef, MissionDef } from '@/engine/types';
import { MISSION_TEMPLATES } from '@/engine/missions';
import { Field, Panel } from '@/components/ui';
import { useCmd } from '../CommandProvider';
import { BookIcon } from '@/components/icons';
import { useMsg, useT } from '@/i18n/client';

/** Edition, Spielgrößen und Regel-Anmerkungen je Angriffsart (N2.6) */
export function EditionPanel() {
  const { state, run, busy } = useCmd();
  const t = useT();
  const msg = useMsg();
  const [ed, setEd] = useState(edition(state));
  const [sizes, setSizes] = useState<BattleSizeDef[]>(() => structuredClone(battleSizes(state)));
  const [notes, setNotes] = useState<Partial<Record<AttackType, string>>>(() => ({ ...state.meta.attackNotes }));
  const [missions, setMissions] = useState<MissionDef[]>(() => structuredClone(state.meta.missions ?? []));

  const dirty =
    ed !== edition(state) ||
    JSON.stringify(sizes) !== JSON.stringify(battleSizes(state)) ||
    JSON.stringify(notes) !== JSON.stringify(state.meta.attackNotes ?? {}) ||
    JSON.stringify(missions) !== JSON.stringify(state.meta.missions ?? []);
  const upd = (i: number, patch: Partial<BattleSizeDef>) => setSizes((l) => l.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <Panel title={t('Edition & Anpassungen')} icon={<BookIcon size={18} />}>
      <Field label={t('Edition')}>
        <select className="select w-40" value={ed} onChange={(e) => setEd(e.target.value as '10' | '11')}>
          <option value="10">{t('10. Edition')}</option>
          <option value="11">{t('11. Edition')}</option>
        </select>
      </Field>

      <p className="section-title mt-4">{t('Spielgrößen')}</p>
      <div className="inset overflow-x-auto px-1">
        <table className="table">
          <thead>
            <tr>
              <th>{t('Name')}</th>
              <th>{t('Punkte')}</th>
              <th>{t('Dauer')}</th>
              <th>{t('Reserves-Limit')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sizes.map((s, i) => (
              <tr key={s.id}>
                <td>
                  <input className="input min-w-28" value={s.name} onChange={(e) => upd(i, { name: e.target.value })} aria-label={t('Name der Spielgröße')} />
                </td>
                <td>
                  <input className="input w-24" type="number" min={1} value={s.points} onChange={(e) => upd(i, { points: Number(e.target.value) })} aria-label={t('Punkte')} />
                </td>
                <td>
                  <input className="input w-24" value={s.duration} onChange={(e) => upd(i, { duration: e.target.value })} aria-label={t('Dauer')} />
                </td>
                <td>
                  <input className="input w-24" type="number" min={0} value={s.reserves} onChange={(e) => upd(i, { reserves: Number(e.target.value) })} aria-label={t('Strategic-Reserves-Limit')} />
                </td>
                <td>
                  <button className="btn btn-sm btn-danger" disabled={sizes.length <= 1} onClick={() => setSizes((l) => l.filter((_, j) => j !== i))}>
                    {t('entfernen')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex gap-2">
        <button className="btn btn-sm btn-ghost" onClick={() => setSizes((l) => [...l, { id: `size-${Date.now().toString(36)}`, name: t('Neue Größe'), points: 1500, duration: '2 h', reserves: 750 }])}>
          {t('Spielgröße hinzufügen')}
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => setSizes(structuredClone(DEFAULT_BATTLE_SIZES))}>
          {t('Standard wiederherstellen')}
        </button>
      </div>
      <details className="fold mt-3">
        <summary>{t('Missionsliste ({n} Vorlagen + {m} eigene)', { n: MISSION_TEMPLATES.length, m: missions.length })}</summary>
        <p className="mt-1 text-[13px] text-faint">
          {t('Standard ist die Vespator-Mission der Angriffsart. Spielen die Spieler mit Zustimmung eine andere Mission, wählt der Warmaster sie in der Schlacht aus dieser Liste.')}
        </p>
        <p className="mt-2 text-[13px] text-dim">
          {t('Vorlagen:')} {MISSION_TEMPLATES.map((m) => msg(m.name)).join(' · ')}
        </p>
        <div className="mt-2 space-y-2">
          {missions.map((m, i) => (
            <div key={m.id} className="slab grid gap-2 p-2.5 @lg:grid-cols-2">
              <input className="input" value={m.name} placeholder={t('Name')} aria-label={t('Name der Mission')} onChange={(e) => setMissions((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input
                className="input"
                value={m.source}
                placeholder={t('Quelle (z. B. eigene)')}
                aria-label={t('Quelle')}
                onChange={(e) => setMissions((l) => l.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)))}
              />
              <input
                className="input @lg:col-span-2"
                value={m.note}
                placeholder={t('Notiz')}
                aria-label={t('Notiz')}
                onChange={(e) => setMissions((l) => l.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
              />
              <div className="flex flex-wrap items-center gap-2 text-[14px] @lg:col-span-2">
                <span className="text-dim">{t('zulässig für:')}</span>
                {(Object.keys(ATTACK_TYPES) as AttackType[]).map((a) => (
                  <label key={a} className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={m.attackTypes.includes(a)}
                      onChange={(e) => setMissions((l) => l.map((x, j) => (j === i ? { ...x, attackTypes: e.target.checked ? [...x.attackTypes, a] : x.attackTypes.filter((y) => y !== a) } : x)))}
                    />
                    {ATTACK_TYPES[a].name}
                  </label>
                ))}
                <span className="text-faint">{t('(keine = alle)')}</span>
                <button className="btn btn-sm btn-danger ml-auto" onClick={() => setMissions((l) => l.filter((_, j) => j !== i))}>
                  {t('entfernen')}
                </button>
              </div>
            </div>
          ))}
          <button className="btn btn-sm btn-ghost" onClick={() => setMissions((l) => [...l, { id: `m-${Date.now().toString(36)}`, name: '', source: t('eigene'), note: '', attackTypes: [] }])}>
            {t('Mission hinzufügen')}
          </button>
        </div>
      </details>

      <details className="fold mt-3">
        <summary>{t('Regel-Anmerkungen je Angriffsart ({n})', { n: Object.values(notes).filter((x) => x?.trim()).length })}</summary>
        <p className="mt-1 text-[13px] text-faint">{t('Markdown, erscheint im Briefing der Schlacht – z. B. Anpassungen an die 11. Edition.')}</p>
        <div className="mt-2 space-y-2">
          {(Object.keys(ATTACK_TYPES) as AttackType[]).map((a) => (
            <Field key={a} label={ATTACK_TYPES[a].name}>
              <textarea className="textarea" rows={2} value={notes[a] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [a]: e.target.value }))} />
            </Field>
          ))}
        </div>
      </details>

      <div className="mt-3 flex justify-end">
        <button className="btn btn-primary" disabled={!dirty || busy} onClick={() => run({ type: 'META_UPDATE', edition: ed, battleSizes: sizes, attackNotes: notes, missions })}>
          {t('Speichern')}
        </button>
      </div>
    </Panel>
  );
}
