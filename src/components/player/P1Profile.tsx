'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PushToggle, type PushApi } from '@/components/push/PushToggle';
import { playerPushStatusAction, playerPushSubscribeAction, playerPushUnsubscribeAction } from '@/app/actions/push';
import { discordCodeAction, discordUnlinkAction } from '@/app/actions/discord';
import { useLocale, useMsg, useT } from '@/i18n/client';
import { DISCORD_CMD_NAMES, discordCmd, discordPlayerCmds } from '@/i18n/discordCommands';

export interface P1ProfileData {
  /** öffentlicher VAPID-Schlüssel (Web-Push, NTH2 1.1) */
  vapidKey: string;
  /** Discord-Bot eingerichtet (NTH2 1.2)? */
  discordBot: boolean;
  /** verknüpfte Discord-Nutzer (Name oder ID) */
  discordLinked: string[];
}

/** Profil: Web-Push auf diesem Gerät und Discord-Verknüpfung per Einmal-Code */
export function P1ProfileSection({ token, data }: { token: string; data: P1ProfileData }) {
  const t = useT();
  const locale = useLocale();
  const msg = useMsg();
  const router = useRouter();
  const api: PushApi = useMemo(
    () => ({
      status: (endpoint) => playerPushStatusAction(token, endpoint),
      subscribe: (sub) => playerPushSubscribeAction(token, sub),
      unsubscribe: (endpoint) => playerPushUnsubscribeAction(token, endpoint),
    }),
    [token],
  );
  const [code, setCode] = useState<{ code: string; minutes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const newCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await discordCodeAction(token);
      if (r.ok) setCode({ code: r.code, minutes: r.minutes });
      else setError(msg(r.error));
    } finally {
      setBusy(false);
    }
  };
  const unlink = async () => {
    setBusy(true);
    try {
      await discordUnlinkAction(token);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 border-t border-line/60 pt-3">
      <PushToggle vapidKey={data.vapidKey} api={api} hint={t('Gilt für die Kategorien oben – auch ohne E-Mail-Adresse. Bei „Ergebnis bestätigen“ öffnet ein Klick direkt die Bestätigung.')} />
      {data.discordBot && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span aria-hidden className={`lamp ${data.discordLinked.length ? 'lamp-ok' : ''}`} />
            <span className="font-semibold">Discord</span>
            <span className="text-[14px] text-dim">{data.discordLinked.length ? t('verknüpft mit {names}', { names: data.discordLinked.join(', ') }) : t('nicht verknüpft')}</span>
            <span className="ml-auto flex gap-2">
              <button type="button" className="btn btn-sm min-h-11" disabled={busy} onClick={newCode}>
                {t('Discord verknüpfen')}
              </button>
              {data.discordLinked.length > 0 && (
                <button type="button" className="btn btn-sm btn-ghost min-h-11" disabled={busy} onClick={unlink}>
                  {t('Lösen')}
                </button>
              )}
            </span>
          </div>
          {code && (
            <p className="inset p-2 text-[15px]" role="status">
              {t('In Discord eingeben:')}{' '}
              <code className="select-all font-mono text-[16px] text-accent">
                {discordCmd(locale, 'verknüpfen')} {DISCORD_CMD_NAMES[locale].code}:{code.code}
              </code>
              <span className="block text-[14px] text-faint">{t('Der Code gilt {n} Minuten und nur einmal. Danach: {cmds}.', { n: code.minutes, cmds: discordPlayerCmds(locale) })}</span>
            </p>
          )}
          {error && <p className="text-[14px] text-warn">{error}</p>}
        </div>
      )}
    </div>
  );
}
