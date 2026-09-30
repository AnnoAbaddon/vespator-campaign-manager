import { notFound } from 'next/navigation';
import { loadPlayer } from '@/server/authz';
import { playerLocale, tFor } from '@/i18n/server';
import { PrintShell } from '@/components/admin/PrintShell';
import { CrusadePrint } from '@/components/crusade/CrusadePrint';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = loadPlayer(token);
  return { title: s ? `Order of Battle · ${s.player.nickname}` : 'Order of Battle', robots: { index: false, follow: false } };
}

/** Druckansicht der eigenen Order of Battle (NTH2 3.2) über den Spielerlink */
export default async function PlayerCrusadePrint({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = loadPlayer(token);
  if (!s) notFound();
  const locale = await playerLocale(s.player, s.state);
  const t = tFor(locale);
  if (!s.player.crusade)
    return (
      <PrintShell title="Order of Battle" backHref={`/p/${token}`} backLabel={t('Zurück')} print={false}>
        <div className="space-y-3 p-4 text-[15px] sm:p-6">
          <p className="text-ink">{t('Du hast noch keine Order of Battle.')}</p>
          <p className="text-dim">{t('Lege sie auf deiner Spielerseite im Bereich Profil an („Order of Battle anlegen“). Danach lässt sie sich hier drucken.')}</p>
        </div>
      </PrintShell>
    );
  return (
    <PrintShell title="Order of Battle" backHref={`/p/${token}`} backLabel={t('Zurück')}>
      <CrusadePrint state={s.state} player={s.player} locale={locale} />
    </PrintShell>
  );
}
