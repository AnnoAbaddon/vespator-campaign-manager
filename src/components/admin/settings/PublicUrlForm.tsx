'use client';

import { useActionState } from 'react';
import { setPublicUrlAction } from '@/app/actions/accounts';
import { Field } from '@/components/ui';
import { useT } from '@/i18n/client';
import { NoteIcon } from '@/components/icons';

/**
 * Öffentliche Adresse der App für Links in E-Mails, Push und Discord (nur Admins). Wird nie aus Anfragen übernommen,
 * sondern nur hier ausdrücklich gespeichert – oder fest über die Umgebungsvariable APP_URL gesetzt.
 */
export function PublicUrlForm({ current, fromEnv, suggestion }: { current: string | null; fromEnv: string | null; suggestion: string }) {
  const [msg, action, pending] = useActionState(setPublicUrlAction, null);
  const t = useT();
  const status = fromEnv ?? current ?? t('nicht eingerichtet');
  return (
    <details className="fold border-t border-line/60 pt-1" open={!!msg}>
      <summary>
        <NoteIcon size={16} className="text-brass" />
        <span className="flex-1">{t('Öffentliche Adresse')}</span>
        <span className="flex items-center gap-2 font-sans text-[14px] font-normal">
          <span aria-hidden className={`lamp ${fromEnv || current ? 'lamp-ok' : ''}`} />
          <span className="max-w-[40vw] truncate">{status}</span>
        </span>
      </summary>
      <div className="space-y-3 pt-2">
        <p className="text-[14px] text-dim">{t('Basis für Links in E-Mails, Push-Nachrichten und Discord. Sie wird nie aus Anfragen übernommen.')}</p>
        {fromEnv ? (
          <p className="notice notice-muted">{t('Fest eingestellt über die Umgebungsvariable APP_URL.')}</p>
        ) : (
          <form action={action} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <Field label={t('Adresse')}>
              <input className="input sm:w-80" name="publicUrl" type="url" defaultValue={current ?? ''} placeholder={suggestion} autoComplete="off" />
            </Field>
            <button className="btn btn-sm self-start sm:self-auto" disabled={pending}>
              {t('Adresse speichern')}
            </button>
            {msg && (
              <span className="basis-full text-[15px] text-dim" role="status">
                {t(msg)}
              </span>
            )}
          </form>
        )}
      </div>
    </details>
  );
}
