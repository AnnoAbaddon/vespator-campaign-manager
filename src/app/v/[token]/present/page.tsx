import { requireViewer } from '@/server/authz';
import { loadPublic, timelapseData } from '@/server/public';
import { buildFeed } from '@/components/public/feed';
import { playerStats } from '@/components/stats/compute';
import { Presentation } from '@/components/public/Presentation';
import { publicLocale, tFor } from '@/i18n/server';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { state } = loadPublic(token);
  return { title: tFor(await publicLocale(state))('Präsentation') };
}

/** Präsentationsmodus (N3.3): /v/{token}/present?t=10…120 (Sekunden je Ansicht) */
export default async function PresentPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ t?: string }> }) {
  const { token } = await params;
  const { t } = await searchParams;
  const { state } = loadPublic(token);
  const row = requireViewer(token);
  const seconds = Math.min(120, Math.max(10, Number(t) || 30));
  const feed = buildFeed(state, `/v/${token}`, await publicLocale(state))
    .flatMap((g) => g.items)
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  const players = playerStats(state)
    .sort((a, b) => b.wins - a.wins || b.battles - a.battles)
    .map((p) => ({ nickname: p.nickname, wins: p.wins, battles: p.battles }));
  return <Presentation state={state} feed={feed} timelapse={timelapseData(row.id)} seconds={seconds} players={players} />;
}
