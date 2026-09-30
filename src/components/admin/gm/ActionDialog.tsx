'use client';

import { useState } from 'react';
import { useModal } from '@/components/ui';
import { WarnIcon } from '@/components/icons';
import { useT } from '@/i18n/client';

export interface ActionDialogSpec {
  title: string;
  text: string;
  /** Begründung abfragen (Pflichtfeld) */
  reason?: boolean;
  confirmLabel: string;
  danger?: boolean;
}

/**
 * Rückfrage für Verwaltungsaktionen außerhalb der Commands (Sandbox übernehmen/verwerfen): Text, optional eine
 * Pflicht-Begründung. `onDone(null)` = abgebrochen, sonst die Begründung ('' ohne Begründungsfeld).
 */
export function ActionDialog({ spec, onDone }: { spec: ActionDialogSpec; onDone: (reason: string | null) => void }) {
  const t = useT();
  const [text, setText] = useState('');
  const ref = useModal(() => onDone(null));
  const ok = !spec.reason || text.trim().length > 0;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 pt-8">
      <div
        ref={ref}
        tabIndex={-1}
        className="hud frame relative flex max-h-[calc(100dvh-4rem)] w-full max-w-md flex-col px-5 pb-5 pt-9 outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="act-dlg-title"
        aria-describedby="act-dlg-desc"
      >
        <span className="plate plate-head" aria-hidden>
          {spec.danger && <WarnIcon size={15} />}
          {spec.title}
        </span>
        <form
          className="relative z-[1] min-h-0 space-y-4 overflow-y-auto"
          onSubmit={(e) => {
            e.preventDefault();
            if (ok) onDone(spec.reason ? text.trim() : '');
          }}
        >
          <h2 id="act-dlg-title" className="hud-title">
            {spec.title}
          </h2>
          <p id="act-dlg-desc" className="text-[15px] text-dim">
            {spec.text}
          </p>
          {spec.reason && (
            <div>
              <label className="label" htmlFor="act-dlg-reason">
                {t('Begründung (Pflicht, wird geloggt)')}
              </label>
              <input id="act-dlg-reason" className="input" value={text} onChange={(e) => setText(e.target.value)} autoFocus required aria-required="true" />
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn" onClick={() => onDone(null)}>
              {t('Abbrechen')}
            </button>
            <button type="submit" className={`btn ${spec.danger ? 'btn-danger' : 'btn-primary'}`} disabled={!ok}>
              {spec.confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Hook: Rückfrage als Promise (ein Dialog zur Zeit) */
export function useActionDialog() {
  const [open, setOpen] = useState<{ spec: ActionDialogSpec; resolve: (r: string | null) => void } | null>(null);
  const ask = (spec: ActionDialogSpec) => new Promise<string | null>((resolve) => setOpen({ spec, resolve }));
  const dialog = open ? (
    <ActionDialog
      spec={open.spec}
      onDone={(r) => {
        setOpen(null);
        open.resolve(r);
      }}
    />
  ) : null;
  return { ask, dialog };
}

/**
 * Läuft-Zustand für Aktionen mit Rückfrage. Bewusst ohne useTransition: Zustandsänderungen in einer
 * asynchronen Transition werden erst mit ihrem Ende sichtbar – der Dialog darin erschiene nie.
 */
export function useBusy(): [boolean, (fn: () => Promise<void>) => void] {
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<void>) => {
    setBusy(true);
    fn().finally(() => setBusy(false));
  };
  return [busy, run];
}
