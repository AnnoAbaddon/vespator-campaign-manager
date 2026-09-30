import { loadGuide } from '@/server/guide';
import { adminLocale, tFor } from '@/i18n/server';
import { GuideDoc } from '@/components/public/GuideDoc';
import { parseGuide } from '@/components/public/guideParse';
import { authorizePage } from '@/server/authz';
import { AdminShell } from '@/components/admin/AdminShell';

export async function generateMetadata() {
  return { title: tFor(await adminLocale())('Hilfe') };
}

/** Hilfe zum Umgang mit der App (docs/GUIDE.de.md bzw. docs/GUIDE.md) – Aufbau wie das Regel-FAQ */
export default async function AdminHelp() {
  const admin = await authorizePage('account.self');
  const locale = await adminLocale();
  const t = tFor(locale);
  const guide = loadGuide(locale);
  return (
    <AdminShell locale={locale} active="help" user={t('Angemeldet als {name}', { name: admin.username })} title={t('Hilfe')}>
      <GuideDoc doc={parseGuide(guide.markdown)} locale={locale} fallback={guide.fallback} />
    </AdminShell>
  );
}
