'use client';

import { useEffect } from 'react';
import type { MedalId } from '@/engine/data/vespator';
import type { CampaignState } from '@/engine/types';
import { useMsg, useT } from '@/i18n/client';
import { useMapFocus } from '../mapFocus';
import { tabKeys } from '@/components/ui';

/** Allianz, der eine vererbte Medaille zugeordnet ist (nur bei aktivem Schalter) */
export function medalHolder(state: CampaignState, medal: MedalId): string | null {
  if (!state.toggles.medals) return null;
  return state.inheritedMedals.find((m) => m.medal === medal && m.assignedAllianceId)?.assignedAllianceId ?? null;
}

/** Hebt Planeten auf der Karte hervor, solange die Komponente sichtbar ist */
export function useHighlight(ids: string[]) {
  const { setHighlight } = useMapFocus();
  const key = ids.join(',');
  useEffect(() => {
    setHighlight(key ? key.split(',') : []);
    return () => setHighlight([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

export function StepHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="hud-title flex items-center gap-2.5 text-[17px]">
        <span className="lamp lamp-on" aria-hidden />
        {title}
      </h2>
      {children && <div className="mt-1.5 text-[15px] leading-relaxed text-dim">{children}</div>}
    </div>
  );
}

export function Messages({ messages }: { messages: string[] }) {
  const t = useT();
  const msg = useMsg();
  if (!messages.length) return null;
  return (
    <div className="notice flex-col items-stretch gap-1" role="alert">
      <p className="font-semibold">{t('Konflikte – bitte neu wählen')}</p>
      <ul className="list-disc pl-5">
        {messages.map((m) => (
          <li key={m}>{msg(m)}</li>
        ))}
      </ul>
    </div>
  );
}

export function AllianceSwitch({ state, value, onChange, done }: { state: CampaignState; value: string; onChange: (id: string) => void; done?: (id: string) => boolean }) {
  const t = useT();
  return (
    <div
      className="tabbar flex-wrap"
      role="tablist"
      aria-label={t('Allianz')}
      onKeyDown={tabKeys(
        state.alliances.map((a) => a.id),
        value,
        onChange,
      )}
    >
      {state.alliances.map((a) => (
        <button key={a.id} type="button" role="tab" aria-selected={value === a.id} tabIndex={value === a.id ? 0 : -1} className="tabkey min-w-36" onClick={() => onChange(a.id)}>
          <span className="inline-block h-3 w-3 rounded-full shadow-[0_0_6px_currentColor]" style={{ background: a.color, color: a.color }} />
          {a.name}
          {done &&
            (done(a.id) ? (
              <span className="lamp lamp-ok" title={t('erledigt')}>
                <span className="sr-only">{t('erledigt')}</span>
              </span>
            ) : (
              <span className="lamp" title={t('offen')}>
                <span className="sr-only">{t('offen')}</span>
              </span>
            ))}
        </button>
      ))}
    </div>
  );
}
