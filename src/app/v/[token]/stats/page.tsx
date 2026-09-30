import { loadPublic } from '@/server/public';
import { StatsView } from '@/components/stats/StatsView';
import { PublicDiceLog } from '@/components/public/PublicDiceLog';
import { publicLocale, tFor } from '@/i18n/server';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { state } = loadPublic(token);
  return { title: tFor(await publicLocale(state))('Statistik') };
}

/** Statistik der Leseansicht: Module in natürlicher Höhe; es scrollt nur die Einhausung der Hülle (Schild „Statistik“) */
export default async function PublicStats({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { state } = loadPublic(token);
  return (
    <>
      <StatsView state={state} playerBase={`/v/${token}/players`} />
      {/* D3: öffentliches Würfelprotokoll (nur öffentliche Würfe der Projektion) */}
      <div className="mt-4">
        <PublicDiceLog dice={state.dice} timeZone={state.meta.timezone} />
      </div>
    </>
  );
}
