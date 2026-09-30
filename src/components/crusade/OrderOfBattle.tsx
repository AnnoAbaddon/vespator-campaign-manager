'use client';

import { useMemo, useState } from 'react';
import { battleAwards, crusadeRules, rosterExport, unitXp, type BattleAward, type CrusadeUnit } from '@/engine/crusade';
import type { Player } from '@/engine/types';
import { useCmd } from '@/components/admin/CommandProvider';
import { Field } from '@/components/ui';
import { PrintIcon, SaveIcon } from '@/components/icons';
import { useMsg, useT } from '@/i18n/client';

type UnitDraft = Omit<CrusadeUnit, 'id' | 'xpAdjust'> & { id?: string };
const emptyUnit = (): UnitDraft => ({ name: '', kind: '', points: 0, xpStart: 0, honours: [], scars: [], notes: '' });
const splitList = (s: string) =>
  s
    .split(/[\n;]/)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * Order of Battle eines Spielers (NTH2 3.2): Kopf, Einheiten mit XP/Rang/Honours/Scars, Einsatz je Schlacht und
 * Export. Spielerlink (eigene Order of Battle) und Warmaster (`gm`: zusätzlich XP-Korrektur) nutzen dieselbe Ansicht.
 */
export function OrderOfBattle({ player, gm = false, printHref }: { player: Player; gm?: boolean; printHref?: string }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const msg = useMsg();
  const rules = crusadeRules(state);
  const ros = player.crusade;
  const awards = useMemo(() => battleAwards(state, player), [state, player]);
  const [head, setHead] = useState<{ name: string; faction: string; supplyLimit: number; requisition: number; notes: string } | null>(null);
  const [edit, setEdit] = useState<UnitDraft | null>(null);

  if (!rules.enabled && !gm) return null;

  const headForm = head && (
    <form
      className="grid gap-2 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run({ type: 'CRUSADE_ROSTER_SET', playerId: player.id, roster: head })) setHead(null);
      }}
    >
      <Field label={t('Name der Order of Battle')}>
        <input className="input" value={head.name} maxLength={80} required onChange={(e) => setHead({ ...head, name: e.target.value })} />
      </Field>
      <Field label={t('Armee')}>
        <input className="input" value={head.faction} maxLength={80} onChange={(e) => setHead({ ...head, faction: e.target.value })} />
      </Field>
      <Field label="Supply Limit">
        <input type="number" className="input" min={0} value={head.supplyLimit} onChange={(e) => setHead({ ...head, supplyLimit: Number(e.target.value) || 0 })} />
      </Field>
      <Field label="Requisition Points">
        <input type="number" className="input" min={0} max={99} value={head.requisition} onChange={(e) => setHead({ ...head, requisition: Number(e.target.value) || 0 })} />
      </Field>
      <div className="sm:col-span-2">
        <Field label={t('Notizen')}>
          <textarea className="textarea" rows={2} value={head.notes} maxLength={2000} onChange={(e) => setHead({ ...head, notes: e.target.value })} />
        </Field>
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn btn-sm btn-primary" disabled={busy}>
          <SaveIcon /> {t('Speichern')}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setHead(null)}>
          {t('Abbrechen')}
        </button>
      </div>
    </form>
  );

  if (!ros)
    return (
      <section className="hud space-y-2 p-3" aria-label="Order of Battle">
        <p className="section-title">Order of Battle</p>
        {!rules.enabled && <p className="text-[14px] text-warn">{t('Die Crusade-Anbindung ist in dieser Kampagne abgeschaltet (Einstellungen → Regeln).')}</p>}
        {head ? (
          headForm
        ) : (
          <>
            <p className="text-[15px] text-dim">{t('Optional: Führe deine Crusade-Armee hier mit. Schlachten der Kampagne bringen deinen Einheiten Erfahrung.')}</p>
            <button className="btn btn-sm" onClick={() => setHead({ name: '', faction: player.faction, supplyLimit: 1000, requisition: 5, notes: '' })}>
              {t('Order of Battle anlegen')}
            </button>
          </>
        )}
      </section>
    );

  const used = ros.units.filter((u) => !u.retired).reduce((s, u) => s + u.points, 0);
  const exportJson = () => {
    const data = rosterExport(state, player);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `order-of-battle-${player.nickname.replace(/[^\p{L}\p{N}]+/gu, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="hud space-y-3 p-3" aria-label="Order of Battle">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="section-title">Order of Battle</p>
          <p className="font-display text-[17px] font-bold text-ink">{ros.name}</p>
          <p className="text-[14px] text-dim">
            {[ros.faction, `Supply ${used}/${ros.supplyLimit}`, `RP ${ros.requisition}`].filter(Boolean).join(' · ')}
            {used > ros.supplyLimit && <span className="ml-2 text-warn">{t('Supply Limit überschritten')}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button className="btn btn-sm" onClick={() => setHead({ name: ros.name, faction: ros.faction, supplyLimit: ros.supplyLimit, requisition: ros.requisition, notes: ros.notes })}>
            {t('Bearbeiten')}
          </button>
          <button className="btn btn-sm" onClick={exportJson}>
            {t('JSON exportieren')}
          </button>
          {printHref && (
            <a className="btn btn-sm" href={printHref} target="_blank" rel="noopener">
              <PrintIcon /> {t('Drucken')}
            </a>
          )}
        </div>
      </div>
      {headForm}
      {!head && ros.notes && <p className="whitespace-pre-line text-[14px] text-dim">{ros.notes}</p>}

      <div className="overflow-x-auto">
        <table className="table w-full min-w-[520px] text-[14px]">
          <thead>
            <tr>
              <th>{t('Einheit')}</th>
              <th className="text-right">{t('Punkte')}</th>
              <th className="text-right">XP</th>
              <th>{t('Rang')}</th>
              <th>Battle Honours / Scars</th>
              <th className="w-0" />
            </tr>
          </thead>
          <tbody>
            {ros.units.map((u) => {
              const x = unitXp(state, player, u, awards);
              return (
                <tr key={u.id} className={u.retired ? 'text-faint' : ''}>
                  <td>
                    <span className="text-ink">{u.name}</span>
                    {u.kind && <span className="block text-[13px] text-dim">{u.kind}</span>}
                  </td>
                  <td className="text-right font-mono">{u.points}</td>
                  <td className="text-right font-mono" title={t('Start {s} + Schlachten {e} + Korrektur {a}', { s: x.start, e: x.earned, a: x.adjust })}>
                    {x.total}
                  </td>
                  <td className="whitespace-nowrap">{x.rank}</td>
                  <td>
                    <span className="flex flex-wrap gap-1">
                      {u.honours.map((h) => (
                        <span key={h} className="chip">
                          {h}
                        </span>
                      ))}
                      {u.scars.map((h) => (
                        <span key={h} className="chip text-danger">
                          {h}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-sm btn-ghost" onClick={() => setEdit({ ...u })}>
                      {t('Bearbeiten')}
                    </button>
                  </td>
                </tr>
              );
            })}
            {!ros.units.length && (
              <tr>
                <td colSpan={6} className="text-dim">
                  {t('Noch keine Einheiten.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!edit && (
        <button className="btn btn-sm" onClick={() => setEdit(emptyUnit())}>
          {t('Einheit hinzufügen')}
        </button>
      )}
      {edit && <UnitForm draft={edit} gm={gm} playerId={player.id} onDone={() => setEdit(null)} />}

      <div className="space-y-2 border-t border-line/60 pt-3">
        <p className="section-title">{t('Einsätze und Crusade-XP')}</p>
        <p className="text-[14px] text-dim">
          {t('Je gewerteter Schlacht: {p} XP je eingesetzter Einheit, Sieg +{w}, Unentschieden +{d}, Marked for Greatness +{m}.', { p: rules.xpParticipation, w: rules.xpWin, d: rules.xpDraw, m: rules.xpMarked })}
        </p>
        {awards.length === 0 && <p className="text-[14px] text-faint">{t('Noch keine gewertete Schlacht.')}</p>}
        {awards.map((a) => (
          <AwardRow key={a.battleId} award={a} player={player} units={ros.units.filter((u) => !u.retired || a.units?.includes(u.id))} label={msg(a.where)} />
        ))}
      </div>
      {gm && (ros.adjustments ?? []).length > 0 && (
        <div className="space-y-1 border-t border-line/60 pt-3 text-[14px]">
          <p className="section-title">{t('XP-Korrekturen')}</p>
          <ul className="space-y-0.5 text-dim">
            {(ros.adjustments ?? []).map((a, i) => (
              <li key={i}>
                {ros.units.find((u) => u.id === a.unitId)?.name ?? '?'}: {a.delta > 0 ? '+' : ''}
                {a.delta} · {a.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {gm && (
        <button
          className="btn btn-sm btn-danger"
          disabled={busy}
          onClick={() => run({ type: 'CRUSADE_ROSTER_SET', playerId: player.id, roster: null }, { confirm: t('Order of Battle von {name} entfernen?', { name: player.nickname }) })}
        >
          {t('Order of Battle entfernen')}
        </button>
      )}
    </section>
  );
}

function AwardRow({ award: a, player, units, label }: { award: BattleAward; player: Player; units: CrusadeUnit[]; label: string }) {
  const { run, busy } = useCmd();
  const t = useT();
  const [sel, setSel] = useState<string[]>(a.units ?? []);
  const [marked, setMarked] = useState<string | null>(a.markedUnit);
  const dirty = a.units === null || sel.join() !== (a.units ?? []).join() || marked !== a.markedUnit;
  const RES = { WIN: t('Sieg'), DRAW: t('Unentschieden'), LOSS: t('Niederlage') };
  return (
    <fieldset className="inset space-y-1.5 p-2">
      <legend className="sr-only">{label}</legend>
      <p className="flex flex-wrap items-center gap-2 text-[14px]">
        <span className="font-mono text-dim">P{a.phase}</span>
        <span className="text-ink">{label}</span>
        <span className={a.result === 'WIN' ? 'text-ok' : a.result === 'LOSS' ? 'text-danger' : 'text-dim'}>{RES[a.result]}</span>
        <span className="text-dim">{t('{n} XP je Einheit', { n: a.perUnit })}</span>
        {a.units === null && <span className="chip text-warn">{t('Einsatz offen')}</span>}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {units.map((u) => (
          <label key={u.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-[3px] border border-line px-2 text-[14px]">
            <input type="checkbox" checked={sel.includes(u.id)} onChange={(e) => setSel(e.target.checked ? [...sel, u.id] : sel.filter((x) => x !== u.id))} />
            {u.name}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Marked for Greatness">
          <select className="select w-auto" value={marked ?? ''} onChange={(e) => setMarked(e.target.value || null)}>
            <option value="">–</option>
            {units
              .filter((u) => sel.includes(u.id))
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
        </Field>
        <button
          className="btn btn-sm btn-primary"
          disabled={busy || !dirty}
          onClick={() => run({ type: 'CRUSADE_BATTLE_UNITS', playerId: player.id, battleId: a.battleId, units: sel, marked: marked && sel.includes(marked) ? marked : null })}
        >
          {t('Einsatz speichern')}
        </button>
      </div>
    </fieldset>
  );
}

function UnitForm({ draft, gm, playerId, onDone }: { draft: UnitDraft; gm: boolean; playerId: string; onDone: () => void }) {
  const { run, busy } = useCmd();
  const t = useT();
  const [u, setU] = useState(draft);
  const [honours, setHonours] = useState(draft.honours.join('\n'));
  const [scars, setScars] = useState(draft.scars.join('\n'));
  const [adj, setAdj] = useState({ delta: 0, reason: '' });
  return (
    <form
      className="inset grid gap-2 p-2 sm:grid-cols-2"
      aria-label={t('Einheit')}
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run({ type: 'CRUSADE_UNIT_UPSERT', playerId, unit: { ...u, honours: splitList(honours), scars: splitList(scars) } })) onDone();
      }}
    >
      <Field label={t('Name')}>
        <input className="input" value={u.name} maxLength={80} required onChange={(e) => setU({ ...u, name: e.target.value })} />
      </Field>
      <Field label={t('Datenblatt / Rolle')}>
        <input className="input" value={u.kind} maxLength={80} onChange={(e) => setU({ ...u, kind: e.target.value })} />
      </Field>
      <Field label={t('Punkte')}>
        <input type="number" className="input" min={0} value={u.points} onChange={(e) => setU({ ...u, points: Number(e.target.value) || 0 })} />
      </Field>
      <Field label={t('Start-XP')}>
        <input type="number" className="input" min={0} value={u.xpStart} onChange={(e) => setU({ ...u, xpStart: Number(e.target.value) || 0 })} />
      </Field>
      <Field label={t('Battle Honours (eine je Zeile)')}>
        <textarea className="textarea" rows={2} value={honours} onChange={(e) => setHonours(e.target.value)} />
      </Field>
      <Field label={t('Battle Scars (eine je Zeile)')}>
        <textarea className="textarea" rows={2} value={scars} onChange={(e) => setScars(e.target.value)} />
      </Field>
      <div className="sm:col-span-2">
        <Field label={t('Notizen')}>
          <input className="input" value={u.notes} maxLength={1000} onChange={(e) => setU({ ...u, notes: e.target.value })} />
        </Field>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-[15px]">
        <input type="checkbox" checked={!!u.retired} onChange={(e) => setU({ ...u, retired: e.target.checked })} />
        {t('Ausgeschieden (zählt nicht zum Supply)')}
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button className="btn btn-sm btn-primary" disabled={busy}>
          <SaveIcon /> {t('Einheit speichern')}
        </button>
        <button type="button" className="btn btn-sm" onClick={onDone}>
          {t('Abbrechen')}
        </button>
        {u.id && (
          <button
            type="button"
            className="btn btn-sm btn-danger ml-auto"
            disabled={busy}
            onClick={async () => (await run({ type: 'CRUSADE_UNIT_DELETE', playerId, unitId: u.id! }, { confirm: t('Einheit „{name}“ entfernen?', { name: u.name }) })) && onDone()}
          >
            {t('Entfernen')}
          </button>
        )}
      </div>
      {gm && u.id && (
        <div className="flex flex-wrap items-end gap-2 border-t border-line/60 pt-2 sm:col-span-2">
          <Field label={t('XP-Korrektur (±)')}>
            <input type="number" className="input w-24" value={adj.delta} onChange={(e) => setAdj({ ...adj, delta: Number(e.target.value) || 0 })} />
          </Field>
          <Field label={t('Begründung')}>
            <input className="input" value={adj.reason} maxLength={300} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} />
          </Field>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy || !adj.delta || !adj.reason.trim()}
            onClick={async () => {
              if (await run({ type: 'CRUSADE_XP_ADJUST', playerId, unitId: u.id!, delta: adj.delta, reason: adj.reason })) setAdj({ delta: 0, reason: '' });
            }}
          >
            {t('XP korrigieren')}
          </button>
        </div>
      )}
    </form>
  );
}

/** Spielerakte im Admin (Personen → Spieler bearbeiten): Order of Battle mit Warmaster-Rechten, nur bei eingeschalteter Anbindung */
export function CrusadeAdminSection({ player }: { player: Player }) {
  const { state, campaignId } = useCmd();
  if (!crusadeRules(state).enabled) return null;
  return <OrderOfBattle player={player} gm printHref={`/admin/c/${campaignId}/crusade/${player.id}`} />;
}
