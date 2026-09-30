import { notFound } from 'next/navigation';
import { currentState } from '@/server/campaigns';
import { authorizePage } from '@/server/authz';
import { adminLocale, tFor } from '@/i18n/server';
import { PrintShell } from '@/components/admin/PrintShell';
import { CrusadePrint } from '@/components/crusade/CrusadePrint';
import { CommandProvider } from '@/components/admin/CommandProvider';
import { OrderOfBattle } from '@/components/crusade/OrderOfBattle';

export const metadata = { title: 'Order of Battle' };

/** Druckansicht einer Order of Battle (NTH2 3.2) für den Warmaster */
export default async function AdminCrusadePrint({ params }: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = await params;
  await authorizePage('campaign.read', { campaignId: id });
  let data;
  try {
    data = currentState(id);
  } catch {
    notFound();
  }
  const player = data.state.players.find((p) => p.id === pid);
  if (!player) notFound();
  const locale = await adminLocale();
  const t = tFor(locale);
  // Leerzustand: erklären, wie eine Order of Battle entsteht, und sie direkt anlegen lassen (kein Drucken)
  if (!player.crusade)
    return (
      <PrintShell title="Order of Battle" backHref={`/admin/c/${id}`} backLabel={t('Zur Kampagne')} print={false}>
        <div className="space-y-3 p-4 text-[15px] sm:p-6">
          <p className="text-ink">{t('{name} hat noch keine Order of Battle.', { name: player.nickname })}</p>
          <p className="text-dim">
            {t('Spieler legen sie selbst über ihren Spielerlink an (Bereich Profil). Als Warmaster kannst du sie hier für den Spieler anlegen; die Crusade-Anbindung schaltest du unter Einstellungen → Regeln ein.')}
          </p>
          <CommandProvider campaignId={id} revision={data.row.current_rev} state={data.state} readOnly={!!data.row.archived}>
            <OrderOfBattle player={player} gm />
          </CommandProvider>
        </div>
      </PrintShell>
    );
  return (
    <PrintShell title="Order of Battle" backHref={`/admin/c/${id}`} backLabel={t('Zur Kampagne')}>
      <CrusadePrint state={data.state} player={player} locale={locale} />
    </PrintShell>
  );
}
