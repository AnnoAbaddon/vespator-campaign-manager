import Link from 'next/link';
import { authorizePage } from '@/server/authz';
import { logoutAction } from '@/app/actions/auth';
import { ImperialHeader } from '@/components/ImperialHeader';
import { LocaleProvider } from '@/i18n/client';
import { adminLocale, tFor } from '@/i18n/server';
import { LangSwitch } from '@/components/LangSwitch';
import { setLocaleAction } from '@/app/actions/accounts';
import { PlanetImagesProvider } from '@/components/map/planetImages';
import { planetArtEnabled } from '@/server/db';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await authorizePage('account.self');
  const locale = await adminLocale();
  const t = tFor(locale);
  return (
    <LocaleProvider locale={locale}>
      <PlanetImagesProvider value={planetArtEnabled()}>
        <div>
          <ImperialHeader href="/admin" subtitle={t('Strategisches Kommando')} locale={locale} lang={<LangSwitch persist={setLocaleAction} />}>
            <Link href="/admin" className="btn btn-sm btn-ghost">
              {t('Kampagnen')}
            </Link>
            <Link href="/admin/kalender" className="btn btn-sm btn-ghost xl:hidden">
              {t('Kalender')}
            </Link>
            <Link href="/admin/faq" className="btn btn-sm btn-ghost">
              {t('FAQ')}
            </Link>
            <Link href="/admin/hilfe" className="btn btn-sm btn-ghost">
              {t('Hilfe')}
            </Link>
            <Link href="/admin/settings" className="btn btn-sm btn-ghost">
              {t('Konto')}
            </Link>
            {/* P3: Liga und Betrieb – auf breiten Bildschirmen in der Navigationsleiste der Verwaltung */}
            <Link href="/admin/liga" className="btn btn-sm btn-ghost xl:hidden">
              {t('Liga')}
            </Link>
            <Link href="/admin/betrieb" className="btn btn-sm btn-ghost xl:hidden">
              {t('Betrieb')}
            </Link>
            <form action={logoutAction}>
              <button className="btn btn-sm" title={t('Angemeldet als {name}', { name: admin.username })}>
                {t('Abmelden')}
              </button>
            </form>
          </ImperialHeader>
          {children}
        </div>
      </PlanetImagesProvider>
    </LocaleProvider>
  );
}
