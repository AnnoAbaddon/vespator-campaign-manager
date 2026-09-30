import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadPublic } from '@/server/public';
import { BattleView } from '@/components/public/BattleView';
import { publicLocale, tFor } from '@/i18n/server';
import { ArrowLeftIcon } from '@/components/icons';

export default async function PublicBattle({ params }: { params: Promise<{ token: string; bid: string }> }) {
  const { token, bid } = await params;
  const { state } = loadPublic(token);
  const b = state.battles.find((x) => x.id === bid);
  if (!b) notFound();
  const locale = await publicLocale(state);
  const t = tFor(locale);
  return (
    <>
      <Link className="link inline-flex items-center gap-1 text-[15px]" href={`/v/${token}`}>
        <ArrowLeftIcon size={14} />
        {t('Zur Lage')}
      </Link>
      <BattleView state={state} battle={b} base={`/v/${token}`} playerBase={`/v/${token}/players`} locale={locale} />
    </>
  );
}
