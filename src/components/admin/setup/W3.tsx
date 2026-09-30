'use client';

import { useState } from 'react';
import { BUILDABLE_TYPES, INFRA, type InfraType } from '@/engine/data/vespator';
import { AllianceTag, Panel, PlanetSelect, planetName } from '@/components/ui';
import { ArrowRightIcon } from '@/components/icons';
import { InfraBadge } from '@/components/map/icons';
import { useCmd } from '../CommandProvider';
import { AllianceSwitch, Messages, StepHeader, useHighlight } from './common';
import { mapOf, planetIds } from '@/engine/map';
import { useT } from '@/i18n/client';

type Row = { type: InfraType; planetId: string | null };

export function W3() {
  const { state, run, busy, revision } = useCmd();
  const su = state.setup;
  const [active, setActive] = useState(state.alliances[0]?.id ?? '');
  const t = useT();
  const need = state.toggles.setupInfraCount;
  const complete = (aid: string) => {
    const items = su.infra.filter((i) => i.allianceId === aid);
    return items.length === need && items.every((i) => i.built || i.planetId);
  };
  const allDone = state.alliances.every((a) => complete(a.id));

  if (su.infraRevealed) {
    return (
      <Panel>
        <StepHeader title={t('W3 · Start-Infrastruktur aufgedeckt')}>{t('Alle Stücke sind gebaut und auf der Karte sichtbar.')}</StepHeader>
        <ul className="mb-3 space-y-1 text-[15px]">
          {state.alliances.map((a) => (
            <li key={a.id}>
              <AllianceTag alliance={a} />:{' '}
              {su.infra
                .filter((i) => i.allianceId === a.id)
                .map((i) => `${INFRA[i.type].name} (${planetName(i.planetId)})`)
                .join(', ')}
            </li>
          ))}
        </ul>
        <button className="btn btn-primary" disabled={busy} onClick={() => run({ type: 'SETUP_W3_DONE' })}>
          {t('Weiter')} <ArrowRightIcon />
        </button>
      </Panel>
    );
  }

  return (
    <div className="space-y-3">
      <Panel>
        <StepHeader title={t('W3 · Start-Infrastruktur')}>
          {t(
            'Jede Allianz wählt verdeckt {n} Infrastrukturen (kein Stronghold) und je einen Planeten. Übersteigen die Wünsche auf einem Planeten die freien Slots, wird ausgelost; die übrigen Stücke müssen neu platziert werden.',
            { n: need },
          )}
        </StepHeader>
        <Messages messages={su.messages} />
        <div className="mt-3">
          <AllianceSwitch state={state} value={active} onChange={setActive} done={complete} />
        </div>
      </Panel>
      {active && <AllianceInfra key={`${active}-${revision}`} allianceId={active} />}
      <SlotOverview />
      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" disabled={busy || !allDone} onClick={() => run({ type: 'SETUP_REVEAL_INFRA' })}>
            {t('Aufdecken')}
          </button>
          {!allDone && <span className="text-[15px] text-dim">{t('Erst für alle Allianzen alle Stücke mit Planet eintragen.')}</span>}
        </div>
      </Panel>
    </div>
  );
}

function freeSlots(state: ReturnType<typeof useCmd>['state'], pid: string) {
  return state.planets.find((p) => p.id === pid)!.slots.filter((s) => !s.destroyed && !s.infra).length;
}

function builtCount(state: ReturnType<typeof useCmd>['state'], aid: string, t: InfraType) {
  let n = 0;
  for (const p of state.planets) for (const s of p.slots) if (!s.destroyed && s.infra?.type === t && s.infra.allianceId === aid) n++;
  return n;
}

function AllianceInfra({ allianceId }: { allianceId: string }) {
  const { state, run, busy } = useCmd();
  const su = state.setup;
  const need = state.toggles.setupInfraCount;
  const items = su.infra.filter((i) => i.allianceId === allianceId);
  const built = items.filter((i) => i.built);
  const bounced = items.filter((i) => !i.built && i.bounced);
  const laurelBlock = su.laurel?.planetId && su.laurel.allianceId !== allianceId ? su.laurel.planetId : null;
  const options = planetIds(state).filter((id) => id !== laurelBlock);
  const [rows, setRows] = useState<Row[]>(() => {
    const pending = items.filter((i) => !i.built && !i.bounced).map((i) => ({ type: i.type, planetId: i.planetId }));
    while (built.length + pending.length < need) pending.push({ type: 'FORTIFICATION_LINE', planetId: null });
    return pending;
  });
  const [re, setRe] = useState<Record<string, string>>({});
  useHighlight([...built.map((i) => i.planetId!), ...rows.map((r) => r.planetId).filter(Boolean)] as string[]);
  const al = state.alliances.find((a) => a.id === allianceId);
  const t = useT();

  const typeOver = (ty: InfraType) => builtCount(state, allianceId, ty) + rows.filter((r) => r.type === ty).length > INFRA[ty].max;

  return (
    <Panel title={<AllianceTag alliance={al} />}>
      {built.length > 0 && (
        <p className="mb-2 text-[15px]">
          {t('Bereits gebaut:')} {built.map((i) => `${INFRA[i.type].name} (${planetName(i.planetId)})`).join(', ')}
        </p>
      )}
      {bounced.length > 0 ? (
        <div className="space-y-2">
          <p className="notice">{t('Zurückgewiesen – neuen Planeten wählen:')}</p>
          {bounced.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-2">
              <InfraBadge type={i.type} color={al?.color ?? '#999'} />
              <span className="w-36 text-[15px]">{INFRA[i.type].name}</span>
              <PlanetSelect value={re[i.id] ?? ''} onChange={(v) => setRe((x) => ({ ...x, [i.id]: v }))} options={options.filter((id) => freeSlots(state, id) > 0)} className="max-w-52" />
              <button
                className="btn btn-sm btn-primary"
                disabled={busy || !re[i.id]}
                onClick={() =>
                  run({
                    type: 'SETUP_INFRA_RECHOOSE',
                    itemId: i.id,
                    planetId: re[i.id],
                  })
                }
              >
                {t('Übernehmen')}
              </button>
            </div>
          ))}
          {items
            .filter((i) => !i.built && !i.bounced && i.planetId)
            .map((i) => (
              <p key={i.id} className="flex items-center gap-2 text-[15px] text-ok">
                <span className="lamp lamp-ok" aria-hidden /> {INFRA[i.type].name} → {planetName(i.planetId)}
              </p>
            ))}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {rows.map((r, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2">
                <InfraBadge type={r.type} color={al?.color ?? '#999'} />
                <select
                  className="select max-w-48"
                  value={r.type}
                  aria-label={t('Infrastruktur {n}', { n: idx + 1 })}
                  onChange={(e) => setRows((x) => x.map((y, j) => (j === idx ? { ...y, type: e.target.value as InfraType } : y)))}
                >
                  {BUILDABLE_TYPES.map((ty) => (
                    <option key={ty} value={ty}>
                      {INFRA[ty].name} {t('(max. {n})', { n: INFRA[ty].max })}
                    </option>
                  ))}
                </select>
                <PlanetSelect value={r.planetId} onChange={(v) => setRows((x) => x.map((y, j) => (j === idx ? { ...y, planetId: v || null } : y)))} options={options} className="max-w-52" />
                {r.planetId && <span className="chip">{t('{n} frei', { n: freeSlots(state, r.planetId) })}</span>}
                {typeOver(r.type) && <span className="text-[13px] text-danger">{t('Limit überschritten')}</span>}
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn btn-primary" disabled={busy || BUILDABLE_TYPES.some(typeOver)} onClick={() => run({ type: 'SETUP_INFRA', allianceId, items: rows })}>
              {t('Speichern (verdeckt)')}
            </button>
          </div>
        </>
      )}
    </Panel>
  );
}

function SlotOverview() {
  const { state } = useCmd();
  const t = useT();
  const pending = (pid: string) => state.setup.infra.filter((i) => !i.built && i.planetId === pid).length;
  return (
    <Panel title={t('Belegung (nur SL)')}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[15px] @lg:grid-cols-3">
        {mapOf(state).planets.map((p) => {
          const free = freeSlots(state, p.id);
          const want = pending(p.id);
          return (
            <div key={p.id} className="flex justify-between gap-2">
              <span>{p.name}</span>
              <span className={`font-mono ${want > free ? 'text-danger' : want ? 'text-warn' : 'text-dim'}`}>{t('{want}/{free} frei', { want, free })}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
