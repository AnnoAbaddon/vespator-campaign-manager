'use client';

import { useMemo, useState } from 'react';
import type { CampaignState } from '@/engine/types';
import { filterPhotos, galleryPhotos, photoOfPhase, type GalleryPhoto } from '@/engine/gallery';
import { mapOf } from '@/engine/map';
import { Empty, uploadUrl, useModal } from '@/components/ui';
import { CloseIcon } from '@/components/icons';
import { GameIcon } from '@/components/icons/GameIcon';
import { useT } from '@/i18n/client';

/**
 * Galerie (NTH2 4.3): alle Schlacht- und Spielfotos (und Fotos der Bemal-Chronik) mit Filtern nach Phase,
 * Planet und Allianz; das Bild der Phase ist markiert. Große Ansicht per Klick. `actions` ergänzt je Foto
 * Bedienelemente (Warmaster: zum Bild der Phase machen, Spieler: abstimmen).
 */
export function GalleryView({ state, actions, battleBase }: { state: CampaignState; actions?: (p: GalleryPhoto) => React.ReactNode; battleBase?: string }) {
  const t = useT();
  const all = useMemo(() => galleryPhotos(state), [state]);
  const [phase, setPhase] = useState<number | null>(null);
  const [planetId, setPlanetId] = useState('');
  const [allianceId, setAllianceId] = useState('');
  const [open, setOpen] = useState<GalleryPhoto | null>(null);
  const list = filterPhotos(all, { phase, planetId: planetId || null, allianceId: allianceId || null });
  const phases = [...new Set(all.map((p) => p.phase))].sort((a, b) => a - b);
  const planets = mapOf(state).planets.filter((d) => all.some((p) => p.planetId === d.id));
  const picks = new Map(state.phases.map((ph) => [ph.number, photoOfPhase(state, ph.number)]));
  const al = (id: string) => state.alliances.find((a) => a.id === id);

  return (
    <div className="space-y-3">
      {/* Filter erst, wenn es Fotos gibt – sonst nur der erklärende Leerzustand */}
      {all.length > 0 && (
        <div className="flex flex-wrap items-end gap-2" role="group" aria-label={t('Filter')}>
          <label className="block">
            <span className="label">{t('Phase')}</span>
            <select className="select w-auto" value={phase ?? ''} onChange={(e) => setPhase(e.target.value === '' ? null : Number(e.target.value))}>
              <option value="">{t('alle')}</option>
              {phases.map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? t('Setup') : t('Phase {n}', { n })}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">{t('Planet')}</span>
            <select className="select w-auto" value={planetId} onChange={(e) => setPlanetId(e.target.value)}>
              <option value="">{t('alle')}</option>
              {planets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">{t('Allianz')}</span>
            <select className="select w-auto" value={allianceId} onChange={(e) => setAllianceId(e.target.value)}>
              <option value="">{t('alle')}</option>
              {state.alliances.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <span className="ml-auto pb-2 font-mono text-[13px] text-faint">{t('{n} von {m} Fotos', { n: list.length, m: all.length })}</span>
        </div>
      )}

      {!all.length ? (
        <Empty>{t('Noch keine Fotos. Fotos kommen mit den Schlachtberichten und der Bemal-Chronik.')}</Empty>
      ) : !list.length ? (
        <Empty>{t('Keine Fotos für diese Auswahl.')}</Empty>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {list.map((p) => {
            const pick = picks.get(p.phase);
            const star = pick?.uploadId === p.uploadId;
            return (
              <li key={p.uploadId} className={`inset relative flex flex-col overflow-hidden ${star ? 'shadow-[inset_0_0_0_2px_#dda94d]' : ''}`}>
                <button type="button" className="block" onClick={() => setOpen(p)} aria-label={t('Foto vergrößern: {label}', { label: p.label })}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={uploadUrl(p.uploadId, true)!} alt="" loading="lazy" className="block aspect-[4/3] w-full object-cover" />
                </button>
                <div className="space-y-1 p-2 text-[14px]">
                  {star && (
                    <p className="flex items-center gap-1.5 font-serif font-semibold text-accent">
                      <GameIcon name="ui_TROPHY" size={15} color="#dda94d" /> {t('Bild der Phase')}
                      {pick?.by === 'VOTE' && <span className="text-[13px] font-normal text-dim">({t('{n} Stimmen', { n: pick.votes ?? 0 })})</span>}
                    </p>
                  )}
                  <p className="leading-snug text-ink">
                    <span className="font-mono text-[13px] text-faint">{p.phase ? `P${p.phase}` : t('Setup')}</span> {p.label}
                  </p>
                  <p className="flex flex-wrap gap-x-2 text-[13px] text-dim">
                    {p.allianceIds.map((id) => (
                      <span key={id} className="inline-flex items-center gap-1">
                        <span aria-hidden className="inline-block h-2 w-2 rotate-45" style={{ background: al(id)?.color ?? '#777' }} />
                        {al(id)?.name}
                      </span>
                    ))}
                  </p>
                  {battleBase && p.battleId && (
                    <a className="link text-[13px]" href={`${battleBase}/${p.battleId}`}>
                      {t('Zum Schlachtbericht')}
                    </a>
                  )}
                  {actions?.(p)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {open && <Lightbox photo={open} caption={picks.get(open.phase)?.uploadId === open.uploadId ? picks.get(open.phase)?.caption : ''} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Lightbox({ photo, caption, onClose }: { photo: GalleryPhoto; caption?: string; onClose: () => void }) {
  const t = useT();
  const ref = useModal(onClose);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-3" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={photo.label} className="hud frame relative max-h-full max-w-5xl p-2 pt-2" onClick={(e) => e.stopPropagation()}>
        <div className="relative z-[1] flex items-center justify-between gap-2 pb-2">
          <p className="min-w-0 truncate font-serif text-[16px] font-semibold text-ink">{photo.label}</p>
          <button type="button" className="btn btn-sm" onClick={onClose} autoFocus>
            <CloseIcon /> {t('Schließen')}
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={uploadUrl(photo.uploadId)!} alt={caption || photo.label} className="relative z-[1] block max-h-[78dvh] w-auto max-w-full object-contain" />
        {caption && <p className="relative z-[1] pt-2 text-[15px] text-dim">{caption}</p>}
      </div>
    </div>
  );
}
