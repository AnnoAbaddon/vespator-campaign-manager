'use client';

import { useActionState } from 'react';
import { setSmtpAction } from '@/app/actions/ops';
import { Field } from '@/components/ui';
import { useT } from '@/i18n/client';
import { NoteIcon } from '@/components/icons';

/**
 * Globaler SMTP-Server für E-Mail-Benachrichtigungen (N1.4). Leerer Host entfernt die Einstellung.
 * Eingeklappt mit kurzem Status; die Felder öffnen sich erst bei Bedarf.
 */
export function SmtpForm({
  current,
  fromEnv,
  insecureEnv = false,
}: {
  current: { host: string; port: number; secure: boolean; user: string; from: string; insecure?: boolean } | null;
  fromEnv: boolean;
  /** SMTP_ALLOW_INSECURE=1 gesetzt */
  insecureEnv?: boolean;
}) {
  const [msg, action, pending] = useActionState(setSmtpAction, null);
  const t = useT();
  const status = current ? t('eingerichtet: {host}', { host: `${current.host}:${current.port}` }) : fromEnv ? t('aus Umgebungsvariablen') : t('nicht eingerichtet');
  return (
    <details className="fold border-t border-line/60 pt-1" open={!!msg}>
      <summary>
        <NoteIcon size={16} className="text-brass" />
        <span className="flex-1">{t('E-Mail-Versand (SMTP)')}</span>
        <span className="flex items-center gap-2 font-sans text-[14px] font-normal">
          <span aria-hidden className={`lamp ${current || fromEnv ? 'lamp-ok' : ''}`} />
          <span className="max-w-[40vw] truncate">{status}</span>
        </span>
      </summary>
      <div className="space-y-3 pt-2">
        {fromEnv && !current && <p className="notice notice-muted">{t('Aktuell aus den Umgebungsvariablen (SMTP_HOST …). Hier gespeicherte Werte haben Vorrang.')}</p>}
        <form action={action} className="@container grid gap-3 @[24rem]:grid-cols-2">
          <Field label={t('Server (Host)')}>
            <input className="input" name="host" defaultValue={current?.host ?? ''} placeholder="smtp.example.org" />
          </Field>
          <Field label="Port">
            <input className="input" name="port" type="number" defaultValue={current?.port ?? 587} />
          </Field>
          <Field label={t('Benutzer')}>
            <input className="input" name="user" defaultValue={current?.user ?? ''} autoComplete="off" />
          </Field>
          <Field label={t('Passwort')}>
            <input className="input" name="pass" type="password" placeholder={current ? t('(unverändert lassen = neu eingeben)') : ''} autoComplete="new-password" />
          </Field>
          <Field label={t('Absender (From)')}>
            <input className="input" name="from" defaultValue={current?.from ?? ''} placeholder="Warmaster <kampagne@example.org>" />
          </Field>
          <label className="flex min-h-11 items-center gap-2 self-end text-[15px]">
            <input type="checkbox" className="accent-[#dda94d]" name="secure" defaultChecked={current?.secure ?? false} /> {t('TLS direkt (Port 465)')}
          </label>
          {/* Sicherer Standard: STARTTLS ist Pflicht. Opt-out nur für ein lokales Relay im selben Netz */}
          <label className="flex min-h-11 items-start gap-2 text-[15px] @[24rem]:col-span-2">
            <input type="checkbox" className="mt-1 accent-[#dda94d]" name="insecure" defaultChecked={current?.insecure ?? false} />
            <span>
              {t('Unverschlüsselt erlauben (nur lokales Relay)')}
              <span className="block text-[14px] text-dim">
                {insecureEnv ? t('SMTP_ALLOW_INSECURE=1 ist gesetzt: TLS wird für alle Verbindungen nicht erzwungen.') : t('Warnung: Zugangsdaten und E-Mails können dann im Klartext übertragen werden.')}
              </span>
            </span>
          </label>
          <div className="flex items-center gap-3 @[24rem]:col-span-2">
            <button className="btn btn-sm" disabled={pending}>
              {t('SMTP speichern')}
            </button>
            {msg && (
              <span className="text-[15px] text-dim" role="status">
                {t(msg)}
              </span>
            )}
          </div>
        </form>
      </div>
    </details>
  );
}
