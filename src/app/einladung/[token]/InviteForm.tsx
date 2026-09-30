'use client';

import { useActionState } from 'react';
import { acceptInviteAction } from '@/app/actions/accounts';
import { Field } from '@/components/ui';
import { useLocale, useT } from '@/i18n/client';

export function InviteForm({ token }: { token: string }) {
  const [err, action, pending] = useActionState(acceptInviteAction.bind(null, token), null);
  const t = useT();
  const locale = useLocale();
  return (
    <form action={action} className="space-y-4">
      {/* Kontosprache = Sprache, in der die Einladung gerade angezeigt wird */}
      <input type="hidden" name="locale" value={locale} />
      <Field label={t('Benutzername')}>
        <input className="input" name="username" autoComplete="username" required />
      </Field>
      <Field label={t('Passwort (min. 10 Zeichen)')}>
        <input className="input" type="password" name="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label={t('Passwort wiederholen')}>
        <input className="input" type="password" name="password2" autoComplete="new-password" required />
      </Field>
      {err && (
        <p className="notice notice-danger" role="alert">
          {t(err)}
        </p>
      )}
      <button className="btn btn-primary w-full" disabled={pending}>
        {t('Konto anlegen')}
      </button>
    </form>
  );
}
