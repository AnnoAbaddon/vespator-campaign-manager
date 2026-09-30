'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { runCommandAction, undoAction } from '@/app/actions/campaign';
import type { Command } from '@/engine/commands';
import { isOverrideCommand } from './overrideCommand';
import type { CampaignState } from '@/engine/types';
import { mapOf } from '@/engine/map';
import { MapIdsCtx, useModal, useOnline } from '@/components/ui';
import { useMsg, useT } from '@/i18n/client';
import { DiceIcon, WarnIcon } from '@/components/icons';
import { commandLabel, readableSummary } from '@/components/admin/log/commandLabels';

type Toast = { id: number; kind: 'ok' | 'error' | 'info'; text: string; undo?: boolean };

interface Ctx {
  campaignId: string;
  revision: number;
  state: CampaignState;
  readOnly: boolean;
  diceMode: 'DIGITAL' | 'MANUAL';
  setDiceMode: (m: 'DIGITAL' | 'MANUAL') => void;
  /** true, solange gespeichert wird oder der Browser offline ist – Aktionsknöpfe sind dann gesperrt */
  busy: boolean;
  /** true nur während eine Aktion läuft (Anzeige „speichert“) */
  saving?: boolean;
  /** false, wenn der Browser offline ist */
  online?: boolean;
  /**
   * Führt einen Command aus. Liefert true bei Erfolg. `reasonTitle`: vorher eine Begründung abfragen (Pflichtfeld,
   * z. B. „ungespielt werten“, SPEC 9.5); Overrides fragen immer nach einer Begründung (SPEC 14.1).
   * `confirm`: vorher mit diesem Text rückfragen.
   */
  run: (cmd: Command, opts?: { reason?: string; silent?: boolean; reasonTitle?: string; confirm?: string }) => Promise<boolean>;
  undo: () => Promise<void>;
  toast: (kind: Toast['kind'], text: string) => void;
}

export const CommandCtx = createContext<Ctx | null>(null);
export type CommandContextValue = Ctx;

export function useCmd() {
  const c = useContext(CommandCtx);
  if (!c) throw new Error('CommandProvider fehlt');
  return c;
}

type Dialog =
  | { kind: 'confirm'; warnings: string[]; noReason?: boolean; resolve: (reason: string | null) => void }
  | { kind: 'reason'; title: string; resolve: (reason: string | null) => void }
  | { kind: 'dice'; die: 'D3' | 'D6'; context: string; resolve: (v: number | null) => void };

export function CommandProvider({ campaignId, revision, state, readOnly, children }: { campaignId: string; revision: number; state: CampaignState; readOnly: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const t = useT();
  const msg = useMsg();
  const [busy, setBusy] = useState(false);
  const online = useOnline();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [diceMode, setDiceModeState] = useState<'DIGITAL' | 'MANUAL'>('DIGITAL');
  const revRef = useRef(revision);
  useEffect(() => {
    revRef.current = revision;
  }, [revision]);
  useEffect(() => {
    try {
      const m = localStorage.getItem('vf-dice-mode');
      // eslint-disable-next-line react-hooks/set-state-in-effect -- einmalige Übernahme der Browser-Einstellung nach der Hydration
      if (m === 'MANUAL' || m === 'DIGITAL') setDiceModeState(m);
    } catch {}
  }, []);
  const setDiceMode = (m: 'DIGITAL' | 'MANUAL') => {
    setDiceModeState(m);
    try {
      localStorage.setItem('vf-dice-mode', m);
    } catch {}
  };

  const toast = useCallback((kind: Toast['kind'], text: string, undo = false) => {
    const id = Date.now() + Math.random();
    // Serienaktionen: gleiche Meldung ersetzt die alte, höchstens drei Meldungen gleichzeitig
    setToasts((t) => [...t.filter((x) => x.text !== text).slice(-2), { id, kind, text, undo }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 9000 : 6000);
  }, []);

  const askConfirm = (warnings: string[], noReason = false) => new Promise<string | null>((resolve) => setDialog({ kind: 'confirm', warnings, noReason, resolve }));
  const askReason = (title: string) => new Promise<string | null>((resolve) => setDialog({ kind: 'reason', title, resolve }));
  const askDice = (die: 'D3' | 'D6', context: string) => new Promise<number | null>((resolve) => setDialog({ kind: 'dice', die, context, resolve }));

  const offlineText = t('Keine Verbindung – Aktion nicht ausgeführt');
  /** Fehler der Server-Action (Netz weg, Server nicht erreichbar) als Meldung statt stillem Abbruch */
  const failed = useCallback(
    (e: unknown) => {
      console.error(e);
      toast('error', !navigator.onLine ? offlineText : t('Server nicht erreichbar – Aktion nicht ausgeführt'));
    },
    [toast, offlineText, t],
  );

  const run = useCallback(
    async (cmd: Command, opts: { reason?: string; silent?: boolean; reasonTitle?: string; confirm?: string } = {}) => {
      if (readOnly) {
        toast('error', t('Kampagne ist schreibgeschützt (archiviert)'));
        return false;
      }
      if (!navigator.onLine) {
        toast('error', offlineText);
        return false;
      }
      // Rückfrage vor folgenreichen Schritten (z. B. „Kampagne beenden“)
      if (opts.confirm && (await askConfirm([opts.confirm], true)) === null) return false;
      let reason = opts.reason;
      if ((isOverrideCommand(cmd) || opts.reasonTitle) && !reason?.trim()) {
        const r = await askReason(opts.reasonTitle ?? t('Begründung für den Override'));
        if (!r) return false;
        reason = r;
      }
      let force = false;
      const manual: number[] = [];
      setBusy(true);
      try {
        for (let guard = 0; guard < 100; guard++) {
          const res = await runCommandAction(campaignId, revRef.current, cmd, { force, reason, diceMode, manualDice: manual });
          if (res.ok) {
            revRef.current = res.revision;
            // ohne Logzeile (z. B. Setup-Schritt abgeschlossen): lesbare Bezeichnung des Befehls statt „Gespeichert“
            if (!opts.silent) toast('ok', res.log.slice(0, 3).map(msg).join(' · ') || t(commandLabel(cmd.type)));
            // nicht blockierende Hinweise der Engine (z. B. Terminüberschneidung, Spiellast, regelkonforme Folgen)
            if (res.hints?.length) toast('info', res.hints.map(msg).join(' · '));
            router.refresh();
            return true;
          }
          if (res.kind === 'confirm') {
            // Begründung nur, wenn echte Warnungen übergangen werden (SPEC 14.1); sonst schlichte Bestätigung
            const r = await askConfirm(res.warnings, !res.needsReason);
            if (r === null) return false;
            force = true;
            if (r) reason = reason ? `${reason} | ${r}` : r;
            continue;
          }
          if (res.kind === 'dice') {
            const v = await askDice(res.dice.kind, res.dice.context);
            if (v === null) return false;
            manual.push(v);
            continue;
          }
          if (res.kind === 'stale') {
            toast('error', msg(res.error));
            router.refresh();
            return false;
          }
          toast('error', msg(res.error));
          return false;
        }
        return false;
      } catch (e) {
        failed(e);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [campaignId, diceMode, readOnly, router, toast, t, msg, offlineText, failed],
  );

  const undo = useCallback(async () => {
    if (!navigator.onLine) {
      toast('error', offlineText);
      return;
    }
    setBusy(true);
    try {
      let r = await undoAction(campaignId, revRef.current);
      if (!r.ok && r.confirm) {
        setBusy(false);
        // Zusammenfassung der Revision getrennt übersetzen (Kennung → Befehlsname, sonst Engine-Meldung)
        const sum = r.confirmSummary !== undefined ? readableSummary(r.confirmSummary, '') : null;
        const text = sum ? t('Diese Aktion überschreitet eine Phasengrenze: „{summary}“. Wirklich rückgängig machen?', { summary: sum.isCode ? t(sum.text) : msg(sum.text) }) : r.confirm;
        const yes = await askConfirm([text], true);
        if (yes === null) return;
        setBusy(true);
        r = await undoAction(campaignId, revRef.current, true);
      }
      if (r.ok) {
        if (r.revision) revRef.current = r.revision;
        toast('info', t('Letzte Aktion rückgängig gemacht'));
        router.refresh();
      } else toast('error', r.error ? msg(r.error) : t('Undo fehlgeschlagen'));
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  }, [campaignId, router, toast, t, msg, offlineText, failed]);

  // Karte im Client registrieren, damit Planetennamen und Nachbarschaften nachschlagbar sind
  const mapIds = mapOf(state).planets.map((p) => p.id);
  return (
    <CommandCtx.Provider value={{ campaignId, revision, state, readOnly, diceMode, setDiceMode, busy: busy || !online, saving: busy, online, run, undo, toast }}>
      <MapIdsCtx.Provider value={mapIds}>{children}</MapIdsCtx.Provider>
      {/* Oberste Ebene (z-[100]): über Karteneditor, Präsentation und mobilen Blättern */}
      <div className="no-print pointer-events-none fixed bottom-[calc(var(--mnav)+10px)] right-3 z-[100] flex w-[min(calc(100vw-24px),420px)] flex-col gap-4 lg:bottom-4 lg:right-4">
        {!online && (
          <Notice kind="offline" plate={t('Verbindung')} role="status">
            {t('Offline – Aktionen sind gesperrt, bis die Verbindung zurück ist')}
          </Notice>
        )}
        <div className="flex flex-col gap-4 empty:hidden" role="status" aria-live="polite">
          {toasts
            .filter((x) => x.kind !== 'error')
            .map((x) => (
              <Notice key={x.id} kind={x.kind} plate={t('Meldung')}>
                {x.text}
              </Notice>
            ))}
        </div>
        <div className="flex flex-col gap-4 empty:hidden" role="alert">
          {toasts
            .filter((x) => x.kind === 'error')
            .map((x) => (
              <Notice key={x.id} kind="error" plate={t('Fehler')}>
                {x.text}
              </Notice>
            ))}
        </div>
      </div>
      {dialog && <DialogView dialog={dialog} close={() => setDialog(null)} />}
    </CommandCtx.Provider>
  );
}

/** Meldung als kleines Gehäuse mit Schild und Leuchte (Toasts, Offline-Hinweis) */
function Notice({ kind, plate, role, children }: { kind: Toast['kind'] | 'offline'; plate: string; role?: string; children: React.ReactNode }) {
  const lamp = kind === 'ok' ? 'lamp-ok' : kind === 'info' ? 'lamp-on' : 'lamp-alert';
  return (
    <div role={role} className="hud frame-lite pointer-events-auto relative flex items-start gap-3 px-3.5 pb-3 pt-4 text-[15px] leading-snug">
      <span aria-hidden className="plate plate-sm plate-head left-3">
        {plate}
      </span>
      <span aria-hidden className={`lamp ${lamp} relative z-[1] mt-1.5`} />
      <span className={`relative z-[1] flex-1 ${kind === 'error' ? 'text-[#f3a79d]' : kind === 'offline' ? 'text-warn' : 'text-ink'}`}>{children}</span>
    </div>
  );
}

function DialogView({ dialog, close }: { dialog: Dialog; close: () => void }) {
  const [text, setText] = useState('');
  const t = useT();
  const msg = useMsg();
  const done = (v: unknown) => {
    close();
    (dialog.resolve as (v: unknown) => void)(v);
  };
  const ref = useModal(() => done(null));
  const plate = dialog.kind === 'confirm' ? t('Warnung') : dialog.kind === 'reason' ? 'Override' : t('Wurf eintragen');
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 pt-8">
      <div
        ref={ref}
        tabIndex={-1}
        className="hud frame relative flex max-h-[calc(100dvh-4rem)] w-full max-w-md flex-col px-5 pb-5 pt-9 outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dlg-title"
        aria-describedby={dialog.kind === 'reason' ? undefined : 'dlg-desc'}
      >
        <span className="plate plate-head" aria-hidden>
          {dialog.kind === 'confirm' ? <WarnIcon size={15} /> : dialog.kind === 'dice' ? <DiceIcon size={15} /> : null}
          {plate}
        </span>
        <div className="relative z-[1] min-h-0 overflow-y-auto">
          {dialog.kind === 'confirm' && (
            <>
              <h2 id="dlg-title" className="hud-title mb-3 flex items-center gap-2.5 text-warn">
                <span className="lamp lamp-on" aria-hidden />
                {t('Warnung')}
              </h2>
              <ul id="dlg-desc" className="mb-4 space-y-1.5 text-[15px]">
                {dialog.warnings.map((w) => (
                  <li key={w} className="notice">
                    {msg(w)}
                  </li>
                ))}
              </ul>
              {!dialog.noReason && (
                <>
                  <label className="label" htmlFor="dlg-reason">
                    {t('Begründung (Pflicht, wird geloggt)')}
                  </label>
                  <input id="dlg-reason" className="input mb-4" value={text} onChange={(e) => setText(e.target.value)} autoFocus required aria-required="true" placeholder={t('z. B. mit den Spielern abgesprochen')} />
                </>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <button className="btn" onClick={() => done(null)}>
                  {t('Abbrechen')}
                </button>
                <button className="btn btn-primary" onClick={() => done(dialog.noReason ? '' : text.trim())} disabled={!dialog.noReason && !text.trim()} autoFocus={dialog.noReason}>
                  {dialog.noReason ? t('Bestätigen') : t('Trotzdem fortfahren')}
                </button>
              </div>
            </>
          )}
          {dialog.kind === 'reason' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) done(text.trim());
              }}
            >
              <h2 id="dlg-title" className="hud-title mb-3">
                <label htmlFor="dlg-reason">{dialog.title}</label>
              </h2>
              <p className="mb-2 text-[14px] text-dim">{t('Eingriffe des Spielleiters werden mit Begründung im Log vermerkt.')}</p>
              <input id="dlg-reason" className="input mb-4" value={text} onChange={(e) => setText(e.target.value)} autoFocus required placeholder={t('z. B. Korrektur Tippfehler')} />
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="btn" onClick={() => done(null)}>
                  {t('Abbrechen')}
                </button>
                <button className="btn btn-primary" disabled={!text.trim()}>
                  {t('Übernehmen')}
                </button>
              </div>
            </form>
          )}
          {dialog.kind === 'dice' && (
            <>
              <h2 id="dlg-title" className="hud-title mb-1">
                {t('Wurf eintragen')} · {dialog.die === 'D3' ? t('W3') : t('W6')}
              </h2>
              <p id="dlg-desc" className="mb-4 text-[15px] text-dim">
                {msg(dialog.context)}
              </p>
              <div className={`inset mb-4 grid gap-2 p-2 ${dialog.die === 'D3' ? 'grid-cols-3' : 'grid-cols-6'}`}>
                {Array.from({ length: dialog.die === 'D3' ? 3 : 6 }, (_, i) => (
                  <button key={i} className="btn h-12 px-0 font-display text-[20px]" onClick={() => done(i + 1)} autoFocus={i === 0}>
                    {i + 1}
                  </button>
                ))}
              </div>
              <div className="flex justify-end">
                <button className="btn" onClick={() => done(null)}>
                  {t('Abbrechen')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
