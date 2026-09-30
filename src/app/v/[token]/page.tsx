import Link from 'next/link';
import { loadPublic } from '@/server/public';
import { Markdown, Panel } from '@/components/ui';
import { uploadUrl } from '@/components/public/fmt';
import { PublicHome } from '@/components/public/PublicShell';
import { LageReport } from '@/components/public/Lage';
import { buildFeed } from '@/components/public/feed';
import { GameIcon } from '@/components/icons/GameIcon';
import { stageLabel } from '@/components/stageLabel';
import { intlLocale } from '@/i18n/core';
import { publicLocale, tFor } from '@/i18n/server';
import { dispatchText, introText } from '@/engine/contentLang';
import { latestPhotoOfPhase } from '@/engine/gallery';
import { LangNote } from '@/components/LangNote';

export default async function PublicHomePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ phase?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const { state, current, snapshots, viewingPhase } = loadPublic(token, sp.phase ? Number(sp.phase) : null);
  const base = `/v/${token}`;
  const locale = await publicLocale(state);
  const t = tFor(locale);
  const tz = state.meta.timezone || 'Europe/Berlin';
  const others = state.dispatches.filter((d) => !d.pinned).sort((a, b) => b.at.localeCompare(a.at));
  const feed = buildFeed(state, base, locale);
  // NTH2 7.3: Intro in der Sprache des Lesers; 4.3/D1: zuletzt gekürtes Bild der Phase
  const intro = introText(state, locale);
  const photo = latestPhotoOfPhase(current);

  return (
    <PublicHome
      state={state}
      base={base}
      stage={viewingPhase ? t('Archivansicht: Ende von Phase {n}', { n: viewingPhase }) : stageLabel(state, t)}
      head={null}
      lage={
        <div className="space-y-3">
          <LageReport
            state={state}
            current={current}
            viewingPhase={viewingPhase}
            locale={locale}
            title={state.meta.name}
            battleHref={(id) => `${base}/battles/${id}`}
            briefingHref={(id) => `${base}/battles/${id}/briefing`}
            extra={
              snapshots.length > 0 && (
                <nav className="flex flex-wrap items-center gap-1 border-t border-line/60 pt-2 text-[14px]" aria-label={t('Phasenauswahl')}>
                  <span className="text-dim">{t('Karte:')}</span>
                  <Link href={base} className={`chip touch-44 ${!viewingPhase ? 'border-accent text-accent' : ''}`} aria-current={!viewingPhase ? 'page' : undefined}>
                    {t('aktuell')}
                  </Link>
                  {snapshots.map((sn) => (
                    <Link
                      key={sn.phase}
                      href={`${base}?phase=${sn.phase}`}
                      className={`chip touch-44 ${viewingPhase === sn.phase ? 'border-accent text-accent' : ''}`}
                      aria-current={viewingPhase === sn.phase ? 'page' : undefined}
                    >
                      {t('Ende Phase {n}', { n: sn.phase })}
                    </Link>
                  ))}
                </nav>
              )
            }
          />
        </div>
      }
      chronik={
        <div className="space-y-3">
          {photo && (
            <Panel
              title={t('Bild der Phase {n}', { n: photo.phase })}
              actions={
                <Link className="link text-[15px]" href={`${base}/gallery`}>
                  {t('Galerie')}
                </Link>
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={uploadUrl(photo.photo.uploadId)!} alt={photo.photo.caption || t('Bild der Phase {n}', { n: photo.phase })} className="block max-h-72 w-full border border-line object-cover" />
              {photo.photo.caption && <p className="mt-1.5 text-[15px] italic text-dim">{photo.photo.caption}</p>}
            </Panel>
          )}
          {state.meta.intro && (
            <Panel title={t('Kampagne')}>
              {intro.fallback && <LangNote lang={intro.lang} locale={locale} className="mb-1.5" />}
              <div lang={intro.lang}>
                <Markdown text={intro.value} />
              </div>
            </Panel>
          )}

          <>
            <Panel title={t('Chronik')}>
              {feed.length === 0 && <p className="text-[15px] text-faint">{t('Noch keine Ereignisse.')}</p>}
              {feed.map((g) => (
                <div key={g.phase} className="mb-4">
                  <p className="hud-title mb-2 border-b border-line pb-1">{g.phase ? t('Phase {n}', { n: g.phase }) : t('Setup')}</p>
                  <ul className="space-y-3">
                    {g.items.map((i) => (
                      <li key={i.key} className="border-l-2 pl-3" style={{ borderColor: i.color ?? '#5a4424' }}>
                        <p className="flex items-start gap-1.5 text-[15px] font-medium">
                          {i.icon && <GameIcon name={i.icon} size={18} color={i.color ?? '#e0b95c'} className="mt-0.5" />}
                          <span>
                            {i.href ? (
                              <Link className="link" href={i.href}>
                                {i.title}
                              </Link>
                            ) : (
                              i.title
                            )}
                          </span>
                        </p>
                        {i.body && <p className="text-[14px] text-dim">{i.body}</p>}
                        {i.lines && i.lines.length > 0 && (
                          <details className="mt-1 text-[14px] text-dim">
                            <summary className="cursor-pointer">{t('Auswirkungen ({n})', { n: i.lines.length })}</summary>
                            <ul className="mt-1 list-disc pl-4">
                              {i.lines.map((l, k) => (
                                <li key={k}>{l}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                        {i.photos && i.photos.length > 0 && (
                          <div className="mt-1 flex gap-1">
                            {i.photos.map((p) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={p} src={uploadUrl(p, true)!} alt="" className="h-14 w-14 border border-line object-cover" />
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Panel>
            <Panel title={t('Depeschen')}>
              {others.length === 0 && <p className="text-[15px] text-faint">{t('Keine weiteren Nachrichten.')}</p>}
              <ul className="space-y-4">
                {others.map((d) => {
                  const tr = dispatchText(state, d, locale);
                  return (
                    <li key={d.id} lang={tr.lang}>
                      <p className="font-medium">{tr.value.title}</p>
                      <p className="font-mono text-[13px] text-faint">{new Date(d.at).toLocaleDateString(intlLocale(locale), { timeZone: tz })}</p>
                      {tr.fallback && <LangNote lang={tr.lang} locale={locale} className="my-1" />}
                      <Markdown text={tr.value.body} />
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </>
        </div>
      }
    />
  );
}
