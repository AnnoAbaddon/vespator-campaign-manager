'use client';

import { useActionState } from 'react';
import { saveLegalTextAction } from '@/app/actions/legal';
import { useT } from '@/i18n/client';
import { NoteIcon } from '@/components/icons';

/**
 * Datenschutzhinweis und Impressum (nur Admins): Markdown-Texte für /datenschutz und /impressum. Eingeklappt mit
 * kurzem Status; leerer Datenschutztext zeigt die neutrale Vorlage, leeres Impressum einen Hinweis.
 */
export function LegalForm({ privacy, imprint }: { privacy: string | null; imprint: string | null }) {
  const t = useT();
  const status = [privacy ? t('Datenschutz: eigener Text') : t('Datenschutz: Vorlage'), imprint ? t('Impressum: eingetragen') : t('Impressum: fehlt')].join(' · ');
  return (
    <details className="fold border-t border-line/60 pt-1">
      <summary>
        <NoteIcon size={16} className="text-brass" />
        <span className="flex-1">{t('Datenschutz und Impressum')}</span>
        <span className="flex items-center gap-2 font-sans text-[14px] font-normal">
          <span aria-hidden className={`lamp ${privacy && imprint ? 'lamp-ok' : 'lamp-alert'}`} />
          <span className="max-w-[40vw] truncate">{status}</span>
        </span>
      </summary>
      <div className="space-y-4 pt-2">
        <p className="text-[14px] text-dim">
          {t('Markdown. Trage den Verantwortlichen (Name bzw. Verein, Anschrift, E-Mail) selbst ein – die App kennt diese Angaben nicht. Leer: Datenschutz zeigt eine neutrale Vorlage.')}
        </p>
        <LegalField kind="privacy" label={t('Datenschutzhinweis')} value={privacy} href="/datenschutz" />
        <LegalField kind="imprint" label={t('Impressum')} value={imprint} href="/impressum" />
      </div>
    </details>
  );
}

function LegalField({ kind, label, value, href }: { kind: 'privacy' | 'imprint'; label: string; value: string | null; href: string }) {
  const [msg, action, pending] = useActionState(saveLegalTextAction, null);
  const t = useT();
  const id = `legal-${kind}`;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="kind" value={kind} />
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <textarea id={id} name="text" className="input min-h-32 font-mono text-[14px]" defaultValue={value ?? ''} maxLength={30_000} rows={6} />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-sm" disabled={pending}>
          {t('Text speichern')}
        </button>
        <a className="btn btn-sm btn-ghost" href={href} target="_blank" rel="noreferrer noopener">
          {t('Ansehen')}
        </a>
        {msg && (
          <span className="text-[15px] text-dim" role="status">
            {t(msg)}
          </span>
        )}
      </div>
    </form>
  );
}
