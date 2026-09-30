import { requireViewer } from '@/server/authz';
import { loadPublic, timelapseData } from '@/server/public';
import { Timelapse } from '@/components/public/Timelapse';
import { publicLocale, tFor } from '@/i18n/server';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { state } = loadPublic(token);
  return { title: tFor(await publicLocale(state))('Zeitraffer') };
}

/** Zeitraffer der Leseansicht: füllt die Einhausung der Hülle (ein Bildschirm) */
export default async function PublicTimelapse({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  loadPublic(token);
  const row = requireViewer(token);
  return (
    <div className="page-fill">
      <Timelapse data={timelapseData(row.id)} framed={false} />
    </div>
  );
}
