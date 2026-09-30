'use client';

import { useActionState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useT } from '@/i18n/client';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/i18n/core';
import { reloadWithoutLang, setLangCookie } from './LangSwitch';

export function AuthForm({ action, mode, setupToken = '' }: { action: (prev: string | null, f: FormData) => Promise<string | null>; mode: 'login' | 'setup'; setupToken?: string }) {
  const [err, formAction, pending] = useActionState(action, null);
  const t = useT();
  return (
    <form action={formAction} className="space-y-4">
      {mode === 'setup' && <DefaultLocaleField />}
      {mode === 'setup' && (
        <div>
          <label className="label" htmlFor="setupToken">
            {t('Setup-Token')}
          </label>
          {/* Einmal-Token aus dem Server-Log (docker compose logs app) bzw. SETUP_TOKEN; über ?token= vorbelegt */}
          <input className="input font-mono" id="setupToken" name="setupToken" defaultValue={setupToken} autoComplete="off" spellCheck={false} maxLength={200} required />
        </div>
      )}
      <div>
        <label className="label" htmlFor="username">
          {t('Benutzername')}
        </label>
        <input className="input" id="username" name="username" autoComplete="username" required />
      </div>
      <div>
        <label className="label" htmlFor="password">
          {t('Passwort')}
        </label>
        <input className="input" id="password" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
      </div>
      {mode === 'setup' && (
        <div>
          <label className="label" htmlFor="password2">
            {t('Passwort wiederholen')}
          </label>
          <input className="input" id="password2" name="password2" type="password" autoComplete="new-password" required />
        </div>
      )}
      {err && (
        <p className="notice notice-danger" role="alert">
          {t(err)}
        </p>
      )}
      <button className="btn btn-primary w-full" disabled={pending}>
        {mode === 'login' ? t('Anmelden') : t('Spielleiter-Konto anlegen')}
      </button>
    </form>
  );
}

/**
 * Ersteinrichtung: Standardsprache wählen (vorbelegt aus der Browsersprache). Die Wahl schaltet die Seite sofort um
 * (Cookie plus Neuladen vom Server, Eingaben bleiben erhalten) und gilt nach dem Anlegen für das Konto und als
 * globale Standardsprache.
 */
function DefaultLocaleField() {
  const locale = useLocale();
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = (l: Locale) => {
    if (l === locale) return;
    setLangCookie(l);
    start(() => reloadWithoutLang(router));
  };
  return (
    <fieldset>
      <legend className="label">{t('Standardsprache')}</legend>
      <div className={`inset grid grid-cols-3 gap-0.5 p-0.5 sm:grid-cols-5 ${pending ? 'opacity-70' : ''}`}>
        {LOCALES.map((l) => (
          <label
            key={l}
            lang={l}
            className={`flex min-h-10 cursor-pointer items-center justify-center rounded-[2px] px-1 font-serif text-[15px] font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
              l === locale ? 'bg-[#262b28] text-ink shadow-[inset_0_0_0_1px_rgba(179,151,95,0.6)]' : 'text-faint hover:text-dim'
            }`}
          >
            <input type="radio" name="locale" value={l} checked={l === locale} onChange={() => pick(l)} className="sr-only" />
            {LOCALE_NAMES[l]}
          </label>
        ))}
      </div>
      <p className="mt-1 text-[14px] text-dim">{t('Gilt für dein Konto und als Vorgabe für Anmeldung, Leseansicht, Spielerseiten und neue Kampagnen.')}</p>
    </fieldset>
  );
}
