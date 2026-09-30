'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { registerDiscordCommandsAction, saveDiscordBotAction } from '@/app/actions/discord';
import { Field } from '@/components/ui';
import { useIntlLocale, useLocale, useMsg, useT } from '@/i18n/client';
import { discordPlayerCmds } from '@/i18n/discordCommands';
import { BoltIcon } from '@/components/icons';
import { CopyField } from './CopyField';

/**
 * Discord-Bot mit Rückkanal (NTH2 1.2): Application ID, Public Key und Bot-Token (bleibt auf dem Server),
 * Befehle mit einem Knopf bei Discord anmelden. Die Interactions-URL trägt man im Discord-Entwicklerportal ein.
 */
export function DiscordBotForm({ current, endpoint }: { current: { appId: string; publicKey: string; hasToken: boolean; registeredAt: string | null } | null; endpoint: string }) {
  const [state, action, pending] = useActionState(saveDiscordBotAction, null);
  const [reg, setReg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const msg = useMsg();
  const il = useIntlLocale();
  const status = current ? (current.registeredAt ? t('eingerichtet, Befehle angemeldet') : t('eingerichtet, Befehle noch nicht angemeldet')) : t('nicht eingerichtet');
  return (
    <details className="fold border-t border-line/60 pt-1" open={!!state || !!reg}>
      <summary>
        <BoltIcon size={16} className="text-brass" />
        <span className="flex-1">{t('Discord-Bot (Befehle)')}</span>
        <span className="flex items-center gap-2 font-sans text-[14px] font-normal">
          <span aria-hidden className={`lamp ${current?.registeredAt ? 'lamp-ok' : current ? 'lamp-on' : ''}`} />
          <span className="max-w-[40vw] truncate">{status}</span>
        </span>
      </summary>
      <div className="space-y-3 pt-2 text-[15px]">
        <p className="text-[14px] text-dim">
          {t('Spieler verknüpfen sich auf ihrer Spielerseite mit einem Einmal-Code und nutzen dann {cmds}. Im Discord-Entwicklerportal unter „Interactions Endpoint URL“ diese Adresse eintragen:', {
            cmds: discordPlayerCmds(locale),
          })}
        </p>
        <CopyField value={endpoint} label={t('Interactions-Endpunkt')} />
        <form action={action} className="@container grid gap-3 @[24rem]:grid-cols-2">
          <Field label="Application ID">
            <input className="input" name="appId" defaultValue={current?.appId ?? ''} inputMode="numeric" autoComplete="off" />
          </Field>
          <Field label="Public Key">
            <input className="input font-mono" name="publicKey" defaultValue={current?.publicKey ?? ''} autoComplete="off" />
          </Field>
          <Field label={t('Bot-Token')}>
            <input className="input" name="token" type="password" placeholder={current?.hasToken ? t('(gespeichert – leer lassen = unverändert)') : ''} autoComplete="new-password" />
          </Field>
          <div className="flex items-end gap-3">
            <button className="btn btn-sm min-h-11" disabled={pending}>
              {t('Discord-Bot speichern')}
            </button>
          </div>
          {state && (
            <p className="text-[15px] text-dim @[24rem]:col-span-2" role="status">
              {msg(state)}
            </p>
          )}
        </form>
        <p className="text-[14px] text-faint">{t('Leere Application ID entfernt den Bot. Der Token wird nur auf dem Server gespeichert und nie angezeigt.')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-primary min-h-11"
            disabled={busy || !current?.hasToken}
            onClick={() =>
              start(async () => {
                const r = await registerDiscordCommandsAction();
                setReg({ ok: r.ok, text: msg(r.ok ? (r.message ?? 'Erledigt') : (r.error ?? 'Fehler')) });
                if (r.ok) router.refresh();
              })
            }
          >
            {t('Befehle bei Discord anmelden')}
          </button>
          {current?.registeredAt && <span className="text-[14px] text-dim">{t('zuletzt: {date}', { date: new Date(current.registeredAt).toLocaleString(il, { dateStyle: 'short', timeStyle: 'short' }) })}</span>}
          {reg && (
            <span role="status" className={`text-[14px] ${reg.ok ? 'text-ok' : 'text-danger'}`}>
              {reg.text}
            </span>
          )}
        </div>
      </div>
    </details>
  );
}
