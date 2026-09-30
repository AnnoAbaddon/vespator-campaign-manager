import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/AuthForm';
import { AuthScreen } from '@/components/AuthScreen';
import { setupAdminAction } from '@/app/actions/auth';
import { adminExists } from '@/server/auth';
import { ensureSetupToken } from '@/server/setupToken';
import { readerLocale, tFor } from '@/i18n/server';
import { LocaleProvider } from '@/i18n/client';

export async function generateMetadata(): Promise<Metadata> {
  return { title: tFor(await readerLocale())('Ersteinrichtung'), robots: { index: false } };
}

export default async function SetupAdminPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  if (adminExists()) redirect('/login');
  // Token erzeugen (und ins Server-Log schreiben), falls es noch keinen gibt – z. B. nach der Passwort-Wiederherstellung
  ensureSetupToken();
  const q = (await searchParams).token;
  const token = (Array.isArray(q) ? q[0] : q)?.slice(0, 200) ?? '';
  const locale = await readerLocale();
  const t = tFor(locale);
  return (
    <LocaleProvider locale={locale}>
      <AuthScreen
        subtitle={t('Cogitator-Terminal des Warmasters')}
        locale={locale}
        plate={t('Ersteinrichtung')}
        title={t('Spielleiter-Konto')}
        intro={t('Lege Benutzername und Passwort für die Verwaltung fest. Den Setup-Token findest du im Server-Log.')}
        langSwitch={false}
      >
        <AuthForm action={setupAdminAction} mode="setup" setupToken={token} />
      </AuthScreen>
    </LocaleProvider>
  );
}
