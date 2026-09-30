'use client';

import { useEffect, useState } from 'react';
import { useMsg, useT } from '@/i18n/client';
import { SW_URL } from '@/components/Pwa';

type Res = { ok: true; active: boolean; warning?: string } | { ok: false; error: string };

export interface PushApi {
  status: (endpoint: string) => Promise<boolean>;
  subscribe: (sub: unknown) => Promise<Res>;
  unsubscribe: (endpoint: string) => Promise<Res>;
}

const b64ToBytes = (s: string) => {
  const raw = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** Service Worker holen; in der Entwicklung ist er nicht automatisch registriert (Pwa.tsx) */
async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) await navigator.serviceWorker.register(SW_URL);
  return navigator.serviceWorker.ready;
}

type Phase = 'loading' | 'unsupported' | 'denied' | 'off' | 'on';

/**
 * Web-Push auf diesem Gerät ein- oder ausschalten (NTH2 1.1). Das Abonnement des Browsers gilt je Seite;
 * gespeichert wird es beim Server je Besitzer (Spielerlink bzw. Konto), damit mehrere Links auf einem
 * Gerät getrennt bleiben.
 */
export function PushToggle({ vapidKey, api, hint }: { vapidKey: string; api: PushApi; hint?: string }) {
  const t = useT();
  const msg = useMsg();
  const [phase, setPhase] = useState<Phase>('loading');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supported()) return alive && setPhase('unsupported');
      if (Notification.permission === 'denied') return alive && setPhase('denied');
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        const on = sub ? await api.status(sub.endpoint) : false;
        if (alive) setPhase(on ? 'on' : 'off');
      } catch {
        if (alive) setPhase('off');
      }
    })();
    return () => {
      alive = false;
    };
  }, [api]);

  const enable = async () => {
    setBusy(true);
    setNote(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setPhase(perm === 'denied' ? 'denied' : 'off');
        return;
      }
      const reg = await registration();
      const key = b64ToBytes(vapidKey);
      let sub = await reg.pushManager.getSubscription();
      // Abo mit anderem Serverschlüssel (z. B. nach Neuinstallation) ersetzen
      const current = sub?.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
      if (sub && current && (current.length !== key.length || current.some((v, i) => v !== key[i]))) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const r = await api.subscribe(sub.toJSON());
      if (!r.ok) {
        setNote({ kind: 'error', text: msg(r.error) });
        return;
      }
      setPhase(r.active ? 'on' : 'off');
      setNote(r.warning ? { kind: 'error', text: `${t('Probenachricht fehlgeschlagen:')} ${msg(r.warning)}` } : { kind: 'ok', text: t('Eingeschaltet – eine Probenachricht ist unterwegs.') });
    } catch (e) {
      console.error(e);
      setNote({ kind: 'error', text: t('Push konnte nicht eingeschaltet werden.') });
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setNote(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      // Browser-Abo bleibt bestehen (andere Links auf diesem Gerät nutzen es womöglich); nur diesen Besitzer abmelden
      if (sub) await api.unsubscribe(sub.endpoint);
      setPhase('off');
    } finally {
      setBusy(false);
    }
  };

  const lamp = phase === 'on' ? 'lamp-ok' : phase === 'denied' ? 'lamp-alert' : '';
  const status =
    phase === 'loading'
      ? t('wird geprüft …')
      : phase === 'unsupported'
        ? t('von diesem Browser nicht unterstützt')
        : phase === 'denied'
          ? t('im Browser blockiert – in den Website-Einstellungen erlauben')
          : phase === 'on'
            ? t('auf diesem Gerät aktiv')
            : t('auf diesem Gerät aus');
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden className={`lamp ${lamp}`} />
        <span className="font-semibold">{t('Push-Benachrichtigungen')}</span>
        <span className="text-[14px] text-dim">{status}</span>
        {phase === 'off' && (
          <button type="button" className="btn btn-sm btn-primary ml-auto min-h-11" disabled={busy} onClick={enable}>
            {t('Einschalten')}
          </button>
        )}
        {phase === 'on' && (
          <button type="button" className="btn btn-sm ml-auto min-h-11" disabled={busy} onClick={disable}>
            {t('Ausschalten')}
          </button>
        )}
      </div>
      {hint && <p className="text-[14px] text-faint">{hint}</p>}
      {note && (
        <p role="status" className={`text-[14px] ${note.kind === 'error' ? 'text-warn' : 'text-ok'}`}>
          {note.text}
        </p>
      )}
    </div>
  );
}
