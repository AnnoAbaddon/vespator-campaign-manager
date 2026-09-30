import { notFound } from 'next/navigation';
import { currentState } from '@/server/campaigns';
import { loadTimeline } from '@/server/public';
import { toPublicView } from '@/engine/publicView';
import { Codex } from '@/components/public/Codex';
import { adminLocale } from '@/i18n/server';
import { authorizePage } from '@/server/authz';
import { normContentMode } from '@/engine/contentLang';

export const metadata = { title: 'Codex' };

export default async function AdminCodex({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ inhalt?: string }> }) {
  const { id } = await params;
  const content = normContentMode((await searchParams).inhalt) ?? undefined;
  // Zugriff hier prüfen – Layouts schützen Seiten nicht zuverlässig (RSC-Anfragen können sie überspringen)
  await authorizePage('campaign.read', { campaignId: id });
  const locale = await adminLocale();
  let state;
  try {
    state = currentState(id).state;
  } catch {
    notFound();
  }
  // Ein Bildschirm: Gehäuse mit Messingschild, nur die Lesespalte scrollt (Druck: alles untereinander)
  return (
    <main className="codex-root mx-auto h-[calc(100dvh-var(--hdr))] max-w-[1400px] px-3 pb-3 pt-[calc(var(--gap)+4px)] sm:px-4">
      <section className="codex-root hud frame relative flex h-full flex-col p-3 pt-6 print:border-0 print:p-0">
        <span className="plate plate-head no-print">Codex</span>
        <div className="codex-root relative z-[1] min-h-0 flex-1">
          <Codex current={toPublicView(state)} frames={loadTimeline(id)} locale={locale} content={content} contentHref={(m) => `/admin/c/${id}/codex?inhalt=${m}`} />
        </div>
      </section>
    </main>
  );
}
