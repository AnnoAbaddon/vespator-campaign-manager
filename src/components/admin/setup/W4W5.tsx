'use client';

import { campaignPoints, powerSum } from '@/engine/board';
import { useState } from 'react';
import { AllianceTag, Field, Panel, PlanetSelect, fromLocalInput, planetName } from '@/components/ui';
import { ArrowRightIcon } from '@/components/icons';
import { useCmd } from '../CommandProvider';
import { StepHeader, medalHolder, useHighlight } from './common';
import { useT } from '@/i18n/client';

export function W4() {
  const { state } = useCmd();
  return state.setup.fleetsRevealed ? <W4Revealed /> : <W4Choose />;
}

function W4Choose() {
  const { state, run, busy } = useCmd();
  const su = state.setup;
  const t = useT();
  const [starts, setStarts] = useState<Record<string, string>>(() => ({
    ...su.fleetStarts,
  }));
  useHighlight(Object.values(starts).filter(Boolean));
  const missing = state.fleets.filter((f) => !f.reserve && !starts[f.id]).length;
  const dirty = state.fleets.some((f) => (starts[f.id] ?? '') !== (su.fleetStarts[f.id] ?? ''));
  return (
    <Panel>
      <StepHeader title={t('W4 · Flotten-Startpositionen')}>{t('Jede Allianz wählt verdeckt einen Startplaneten je Flotte.')}</StepHeader>
      <div className="space-y-4">
        {state.alliances.map((a) => {
          const block = su.laurel?.planetId && su.laurel.allianceId !== a.id ? su.laurel.planetId : null;
          return (
            <div key={a.id}>
              <AllianceTag alliance={a} className="mb-1" />
              <div className="space-y-1">
                {state.fleets
                  .filter((f) => f.allianceId === a.id && !f.reserve)
                  .map((f) => (
                    <div key={f.id} className="flex flex-wrap items-center gap-2">
                      <span className="w-44 text-[15px]">{f.name}</span>
                      <PlanetSelect value={starts[f.id] ?? ''} onChange={(v) => setStarts((x) => ({ ...x, [f.id]: v }))} options={state.planets.map((p) => p.id).filter((id) => id !== block)} className="max-w-52" />
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          className="btn"
          disabled={busy || !dirty}
          onClick={() =>
            run({
              type: 'SETUP_FLEET_STARTS',
              starts: Object.fromEntries(Object.entries(starts).filter(([, v]) => v)),
            })
          }
        >
          {t('Speichern (verdeckt)')}
        </button>
        <button className="btn btn-primary" disabled={busy || missing > 0 || dirty} onClick={() => run({ type: 'SETUP_REVEAL_FLEETS' })}>
          {t('Aufdecken')}
        </button>
        {missing > 0 && <span className="text-[15px] text-dim">{t('{n} Flotte(n) ohne Startplanet', { n: missing })}</span>}
        {dirty && <span className="text-[15px] text-warn">{t('Ungespeicherte Änderungen')}</span>}
      </div>
    </Panel>
  );
}

function W4Revealed() {
  const { state, run, busy } = useCmd();
  const dagger = medalHolder(state, 'DAGGER');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const t = useT();
  const pl = (pid: string) => state.planets.find((p) => p.id === pid)?.power[dagger ?? ''] ?? 0;
  return (
    <div className="space-y-3">
      <Panel>
        <StepHeader title={t('W4 · Flotten aufgedeckt')} />
        <ul className="space-y-1 text-[15px]">
          {state.fleets
            .filter((f) => !f.reserve)
            .map((f) => (
              <li key={f.id}>
                <AllianceTag alliance={state.alliances.find((x) => x.id === f.allianceId)} /> {f.name} → {planetName(f.planetId)}
              </li>
            ))}
        </ul>
      </Panel>
      {dagger && (
        <Panel title="Sable Dagger">
          <p className="mb-2 text-[15px]">
            <AllianceTag alliance={state.alliances.find((x) => x.id === dagger)} /> {t('darf bis zu dreimal die eigenen Power Level zweier Planeten tauschen. Bisher: {n}/3.', { n: state.setup.daggerSwaps })}
          </p>
          {state.setup.daggerSwaps < 3 && (
            <div className="flex flex-wrap items-center gap-2">
              <PlanetSelect value={a} onChange={setA} className="max-w-52" />
              {a && <span className="chip">PL {pl(a)}</span>}
              <span>↔</span>
              <PlanetSelect value={b} onChange={setB} className="max-w-52" />
              {b && <span className="chip">PL {pl(b)}</span>}
              <button
                className="btn btn-primary"
                disabled={busy || !a || !b || a === b}
                onClick={async () => {
                  if (await run({ type: 'SETUP_DAGGER_SWAP', a, b })) {
                    setA('');
                    setB('');
                  }
                }}
              >
                {t('Tauschen')}
              </button>
            </div>
          )}
        </Panel>
      )}
      <Panel>
        <button className="btn btn-primary" disabled={busy} onClick={() => run({ type: 'SETUP_W4_DONE' })}>
          {t('Weiter')} <ArrowRightIcon />
        </button>
      </Panel>
    </div>
  );
}

export function W5() {
  const { state, run, busy } = useCmd();
  const [d, setD] = useState({
    startDate: '',
    opsDeadline: '',
    battlesDeadline: '',
    endDate: '',
  });
  const pts = (aid: string) => campaignPoints(state, aid);
  const star = medalHolder(state, 'STAR');
  const t = useT();
  return (
    <Panel>
      <StepHeader title={t('W5 · Start vorbereiten')}>{t('Prüfe die Ausgangslage und setze die Termine der ersten Phase.')}</StepHeader>
      <table className="table mb-4">
        <thead>
          <tr>
            <th>{t('Allianz')}</th>
            <th>Power Level</th>
            <th>{t('Startpunkte')}</th>
            <th>{t('Flotten')}</th>
          </tr>
        </thead>
        <tbody>
          {state.alliances.map((a) => (
            <tr key={a.id}>
              <td>
                <AllianceTag alliance={a} />
              </td>
              <td className="font-mono">{powerSum(state, a.id)}</td>
              <td className="font-mono font-bold">{pts(a.id)}</td>
              <td>{state.fleets.filter((f) => f.allianceId === a.id && !f.reserve).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {star && (
        <p className="mb-3 text-[15px]">
          Star of the Voidfarer: <AllianceTag alliance={state.alliances.find((x) => x.id === star)} /> {t('darf in Phase 1 jede Flotte bis zu zweimal bewegen.')}
        </p>
      )}
      <div className="grid gap-3 @lg:grid-cols-2">
        {(
          [
            ['startDate', 'Beginn Phase 1'],
            ['opsDeadline', 'Frist Operationen'],
            ['battlesDeadline', 'Frist Schlachten'],
            ['endDate', 'Ende Phase 1'],
          ] as const
        ).map(([k, label]) => (
          <Field key={k} label={t(label)}>
            <input className="input" type="datetime-local" value={d[k]} onChange={(e) => setD((x) => ({ ...x, [k]: e.target.value }))} />
          </Field>
        ))}
      </div>
      <button
        className="btn btn-primary mt-4"
        disabled={busy}
        onClick={() =>
          run({
            type: 'SETUP_START',
            startDate: fromLocalInput(d.startDate),
            opsDeadline: fromLocalInput(d.opsDeadline),
            battlesDeadline: fromLocalInput(d.battlesDeadline),
            endDate: fromLocalInput(d.endDate),
          })
        }
      >
        {t('Kampagne starten')}
      </button>
    </Panel>
  );
}
