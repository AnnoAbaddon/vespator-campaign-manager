'use client';

import { useActionState, useState, useTransition } from 'react';
import { changePasswordAction, regenerateHallTokenAction } from '@/app/actions/campaign';
import { Field } from '@/components/ui';
import { CopyField } from './CopyField';
import { ExternalIcon } from '@/components/icons';
import { useT } from '@/i18n/client';
import { Sect } from './AccountSections';

/** Öffentlicher Link zur Hall of Fame (nur Admins) */
export function HallOfFameLink({ hallUrl }: { hallUrl: string }) {
  const [busy, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const t = useT();
  return (
    <Sect title={t('Hall of Fame (öffentlicher Link)')}>
      <p className="text-[15px] text-dim">{t('Zeigt alle beendeten Kampagnen, Sieger und Medaillen. Nicht in Suchmaschinen gelistet.')}</p>
      <CopyField value={hallUrl} label={t('Link zur Hall of Fame')} masked />
      <div className="flex flex-wrap gap-2">
        <a className="btn btn-sm" href={hallUrl} target="_blank" rel="noreferrer">
          {t('Öffnen')} <ExternalIcon />
        </a>
        {confirm ? (
          <button
            className="btn btn-sm btn-danger"
            disabled={busy}
            onClick={() =>
              start(async () => {
                await regenerateHallTokenAction();
                setConfirm(false);
              })
            }
          >
            {t('Wirklich neu erzeugen (alter Link ungültig)')}
          </button>
        ) : (
          <button className="btn btn-sm" onClick={() => setConfirm(true)}>
            {t('Link neu erzeugen')}
          </button>
        )}
      </div>
    </Sect>
  );
}

/** Passwort des eigenen Kontos ändern */
export function PasswordForm() {
  const [err, action, pending] = useActionState(changePasswordAction, null);
  const t = useT();
  return (
    <Sect title={t('Passwort ändern')}>
      <form action={action} className="grid max-w-md gap-3">
        <Field label={t('Altes Passwort')}>
          <input className="input" type="password" name="old" autoComplete="current-password" required />
        </Field>
        <Field label={t('Neues Passwort (min. 10 Zeichen)')}>
          <input className="input" type="password" name="new" autoComplete="new-password" required minLength={10} />
        </Field>
        <Field label={t('Neues Passwort wiederholen')}>
          <input className="input" type="password" name="new2" autoComplete="new-password" required />
        </Field>
        {err && (
          <p className="notice notice-danger" role="alert">
            {t(err)}
          </p>
        )}
        <button className="btn btn-primary justify-self-start" disabled={pending}>
          {t('Ändern (danach neu anmelden)')}
        </button>
      </form>
    </Sect>
  );
}
