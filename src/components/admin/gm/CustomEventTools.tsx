'use client';

import { useState } from 'react';
import { EVENTS, type EventCode } from '@/engine/data/vespator';
import type { Phase } from '@/engine/types';
import { useT } from '@/i18n/client';
import { useCmd } from '../CommandProvider';

/**
 * Schritt 3, Events: eigenes Ereignis von Hand auslösen (D2) und – nur in einer Szenario-Sandbox – ein
 * beliebiges Ereignis erzwingen (NTH2 2.2, Override mit Begründung).
 */
export function CustomEventTools({ phase }: { phase: Phase }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const defs = state.customEvents ?? [];
  const sandbox = !!state.meta.sandbox;
  const [defId, setDefId] = useState('');
  const [target, setTarget] = useState('');
  const [force, setForce] = useState('');
  const [forceAl, setForceAl] = useState('');
  if (!defs.length && !sandbox) return null;
  const forceCode = force.startsWith('custom:') ? 'CUSTOM' : (force as EventCode | '');
  const needsAlliance = forceCode && forceCode !== 'CUSTOM' && EVENTS[forceCode].category !== 'FORTUNES';
  const allianceSelect = (value: string, onChange: (v: string) => void, label: string, empty: string) => (
    <select className="select min-w-0 flex-1" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      <option value="">{empty}</option>
      {state.alliances.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
  return (
    <div className="mt-3 space-y-3 border-t border-line/60 pt-3">
      {defs.length > 0 && (
        <div className="space-y-2">
          <p className="section-title">{t('Eigenes Ereignis auslösen')}</p>
          <div className="flex flex-wrap gap-2">
            <select className="select min-w-0 flex-1" value={defId} aria-label={t('Eigenes Ereignis')} onChange={(e) => setDefId(e.target.value)}>
              <option value="">{t('– Ereignis –')}</option>
              {defs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {allianceSelect(target, setTarget, t('Ziel-Allianz'), t('Ziel-Allianz: laut Ereignis'))}
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy || !defId}
              onClick={async () => {
                if (await run({ type: 'CUSTOM_EVENT_TRIGGER', defId, allianceId: target || null })) setDefId('');
              }}
            >
              {t('Auslösen')}
            </button>
          </div>
        </div>
      )}
      {sandbox && (
        <div className="space-y-2">
          <p className="section-title">{t('Ereignis erzwingen (nur Sandbox)')}</p>
          <p className="text-[14px] text-faint">{t('Legt das Ereignis ohne Würfeltest an – als Override mit Begründung. So lassen sich seltene Ereignisse vorab ansehen.')}</p>
          <div className="flex flex-wrap gap-2">
            <select className="select min-w-0 flex-1" value={force} aria-label={t('Ereignis')} onChange={(e) => setForce(e.target.value)}>
              <option value="">{t('– Ereignis –')}</option>
              {(Object.keys(EVENTS) as EventCode[]).map((c) => (
                <option key={c} value={c} disabled={c === 'FW_33' && state.stellarStormsUsed}>
                  {`${EVENTS[c].name} (${c.replace('_', ' ')})`}
                </option>
              ))}
              {defs.map((d) => (
                <option key={d.id} value={`custom:${d.id}`}>
                  {d.name}
                </option>
              ))}
            </select>
            {forceCode &&
              (forceCode === 'CUSTOM' || EVENTS[forceCode].category !== 'FORTUNES') &&
              allianceSelect(forceAl, setForceAl, t('Allianz'), needsAlliance ? t('– Allianz (Pflicht) –') : t('Ziel-Allianz: laut Ereignis'))}
            <button
              type="button"
              className="btn btn-sm btn-danger"
              disabled={busy || !forceCode || (!!needsAlliance && !forceAl)}
              onClick={async () => {
                const ok = await run({
                  type: 'EVENT_FORCE',
                  code: forceCode as EventCode | 'CUSTOM',
                  allianceId: forceAl || null,
                  ...(forceCode === 'CUSTOM' ? { customId: force.slice('custom:'.length) } : {}),
                });
                if (ok) setForce('');
              }}
            >
              {t('Erzwingen (Override)')}
            </button>
          </div>
          {!phase.flags.scored && <p className="text-[14px] text-warn">{t('Tipp: erst Punkte berechnen, damit dominierende und zurückliegende Allianz feststehen.')}</p>}
        </div>
      )}
    </div>
  );
}
