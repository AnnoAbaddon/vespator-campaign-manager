import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { can, inviteAccess } from '@/server/authz';
import { AuthScreen } from '@/components/AuthScreen';
import { readerLocale, tFor } from '@/i18n/server';
import { LocaleProvider } from '@/i18n/client';
import { InviteForm } from './InviteForm';

export async function generateMetadata(): Promise<Metadata> {
  return { title: tFor(await readerLocale())('Einladung'), robots: { index: false, follow: false } };
}

/** Konto über einen Einladungslink anlegen (N5.2) */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = inviteAccess(token);
  if (!inv || can(inv, 'invite.accept')) notFound();
  const locale = await readerLocale();
  const t = tFor(locale);
  return (
    <LocaleProvider locale={locale}>
      <AuthScreen
        subtitle={t('Cogitator-Terminal des Warmasters')}
        locale={locale}
        plate={t('Einladung')}
        title={t('Einladung als {role}', { role: inv.role === 'ADMIN' ? 'Admin' : 'Co-Warmaster' })}
        intro={t('Lege deinen Benutzernamen und dein Passwort fest. Der Link gilt nur einmal.')}
      >
        <InviteForm token={token} />
      </AuthScreen>
    </LocaleProvider>
  );
}
