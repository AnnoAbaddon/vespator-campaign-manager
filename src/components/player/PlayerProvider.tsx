'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { runPlayerCommandAction } from '@/app/actions/player';
import type { Command } from '@/engine/commands';
import type { CampaignState, Player } from '@/engine/types';
import { mapOf } from '@/engine/map';
import { MapIdsCtx, useOnline } from '@/components/ui';
import { CommandCtx } from '@/components/admin/CommandProvider';
import { commandLabel } from '@/components/admin/log/commandLabels';
import { useMsg, useT } from '@/i18n/client';

type Toast = { id: number; kind: 'ok' | 'error' | 'info'; text: string };

/**
 * Liefert für die Spielerseite denselben Command-Kontext wie im Cockpit – Aktionen laufen aber über den
 * Spieler-Link (Berechtigung und „keine Warnungen übergehen“ prüft der Server).
 */
export function PlayerProvider({ token, state, revision, readOnly, children }: { token: string; state: CampaignState; me: Player; revision: number; readOnly: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const t = useT();
  const msg = useMsg();
  const [busy, setBusy] = useState(false);
  const online = useOnline();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    // Serienaktionen: gleiche Meldung ersetzt die alte, höchstens drei Meldungen gleichzeitig
    setToasts((t) => [...t.filter((x) => x.text !== text).slice(-2), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 9000 : 4000);
  }, []);
  const run = useCallback(
    async (cmd: Command, opts?: { silent?: boolean }) => {
      // Eingaben brauchen eine Verbindung (N5.3) – klare Meldung statt stillem Abbruch
      if (!navigator.onLine) {
        toast('error', t('Keine Verbindung – Aktion nicht ausgeführt'));
        return false;
      }
      setBusy(true);
      try {
        const r = await runPlayerCommandAction(token, cmd);
        if (!r.ok) {
          toast('error', 'error' in r ? msg(r.error) : t('Aktion nicht möglich'));
          return false;
        }
        if (!opts?.silent) toast('ok', r.log[0] ? msg(r.log[0]) : t(commandLabel(cmd.type)));
        // Hinweise der Engine (z. B. Terminüberschneidung, Raise Edifices scheitert voraussichtlich)
        if ('hints' in r && r.hints?.length) toast('info', r.hints.map(msg).join(' · '));
        router.refresh();
        return true;
      } catch (e) {
        console.error(e);
        toast('error', !navigator.onLine ? t('Keine Verbindung – Aktion nicht ausgeführt') : t('Server nicht erreichbar – Aktion nicht ausgeführt'));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [token, router, toast, t, msg],
  );
  const mapIds = mapOf(state).planets.map((p) => p.id);
  return (
    <CommandCtx.Provider value={{ campaignId: '', revision, state, readOnly, diceMode: 'DIGITAL', setDiceMode: () => undefined, busy: busy || !online, saving: busy, online, run, undo: async () => undefined, toast }}>
      <MapIdsCtx.Provider value={mapIds}>{children}</MapIdsCtx.Provider>
      <div className="no-print pointer-events-none fixed bottom-[calc(var(--mnav)+8px)] right-3 z-[100] flex w-[min(92vw,420px)] flex-col gap-2 lg:bottom-3" aria-live="polite">
        {!online && (
          <div className="hud pointer-events-auto flex items-center gap-2 border-warn p-3 text-sm text-warn" role="status">
            <span className="lamp lamp-alert" aria-hidden />
            {t('Offline – Aktionen sind gesperrt, bis die Verbindung zurück ist')}
          </div>
        )}
        {toasts.map((t) => (
          <div key={t.id} className={`hud pointer-events-auto p-3 text-sm ${t.kind === 'error' ? 'border-danger text-danger' : t.kind === 'ok' ? 'border-ok/70' : ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </CommandCtx.Provider>
  );
}
