import { loadFaq } from '@/server/faq';
import { adminLocale, tFor } from '@/i18n/server';
import { FaqDoc } from '@/components/public/FaqDoc';
import { parseFaq } from '@/components/public/faqParse';
import { authorizePage } from '@/server/authz';
import { AdminShell } from '@/components/admin/AdminShell';

export async function generateMetadata() {
  return { title: tFor(await adminLocale())('Regel-FAQ') };
}

export default async function AdminFaq() {
  const admin = await authorizePage('account.self');
  const locale = await adminLocale();
  const t = tFor(locale);
  return (
    <AdminShell locale={locale} active="faq" user={t('Angemeldet als {name}', { name: admin.username })} title={t('Regel-FAQ')} icon="ui_SCROLL">
      <FaqDoc doc={parseFaq(loadFaq(locale))} locale={locale} />
    </AdminShell>
  );
}
