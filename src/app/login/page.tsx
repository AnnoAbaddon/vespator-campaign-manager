import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/AuthForm';
import { AuthScreen } from '@/components/AuthScreen';
import { loginAction } from '@/app/actions/auth';
import { adminExists, currentAdmin } from '@/server/auth';
import { readerLocale, tFor } from '@/i18n/server';
import { LocaleProvider } from '@/i18n/client';

export async function generateMetadata(): Promise<Metadata> {
  return { title: tFor(await readerLocale())('Anmelden'), robots: { index: false } };
}

export default async function LoginPage() {
  if (!adminExists()) redirect('/setup-admin');
  if (await currentAdmin()) redirect('/admin');
  const locale = await readerLocale();
  const t = tFor(locale);
  return (
    <LocaleProvider locale={locale}>
      <AuthScreen subtitle={t('Cogitator-Terminal des Warmasters')} locale={locale} plate={t('Identifikation erforderlich')} title={t('Anmelden')}>
        <AuthForm action={loginAction} mode="login" />
      </AuthScreen>
    </LocaleProvider>
  );
}
