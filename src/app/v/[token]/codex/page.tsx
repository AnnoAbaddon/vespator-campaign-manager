import { requireViewer } from '@/server/authz';
import { loadPublic, loadTimeline } from '@/server/public';
import { Codex } from '@/components/public/Codex';
import { publicLocale } from '@/i18n/server';
import { planetArtEnabled } from '@/server/db';
import { normContentMode } from '@/engine/contentLang';

export const metadata = { title: 'Codex' };

/** Codex der Leseansicht: Inhaltsverzeichnis und scrollende Lesespalte in der Einhausung der Hülle */
export default async function PublicCodex({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ inhalt?: string }> }) {
  const { token } = await params;
  // NTH2 7.4: Inhalte in einer Sprache oder beiden nebeneinander (?inhalt=de|en|both)
  const content = normContentMode((await searchParams).inhalt) ?? undefined;
  const { current } = loadPublic(token);
  const locale = await publicLocale(current);
  const row = requireViewer(token);
  return (
    <div className="page-fill">
      <Codex current={current} frames={loadTimeline(row.id)} locale={locale} planetImages={planetArtEnabled()} content={content} contentHref={(m) => `/v/${token}/codex?inhalt=${m}`} />
    </div>
  );
}
